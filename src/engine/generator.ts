import type { Manifold } from 'manifold-3d';
import type { Font } from 'opentype.js';
import type {
  BlankConfig,
  CaliperMetrics,
  DiceProjectState,
  DieSettings,
  FacePreviewInfo,
  GeneratedDieResult,
  MeshBufferData,
} from '../types/dice';
import { getManifold } from './manifoldInstance';
import {
  generateMatchedBlank,
  getEffectiveBlankClearance,
} from './polyhedra/blankGenerator';
import { buildDieHalfSpaces, computeNominalCalipers } from './polyhedra/definitions';
import {
  applyEdgeChamfers,
  buildManifoldFromFaces,
  clipHalfSpaces,
} from './polyhedra/halfspace';
import { generatePointDownSupports } from './supports';
import { buildDieEngravingCutters } from './typography/draftExtruder';

export function manifoldToMeshBufferData(manifold: Manifold): MeshBufferData {
  const mesh = manifold.getMesh();
  const numVert = mesh.numVert;
  const numProp = mesh.numProp || 3;
  const positions = new Float32Array(numVert * 3);

  for (let i = 0; i < numVert; i++) {
    positions[i * 3] = mesh.vertProperties[i * numProp];
    positions[i * 3 + 1] = mesh.vertProperties[i * numProp + 1];
    positions[i * 3 + 2] = mesh.vertProperties[i * numProp + 2];
  }

  const indices = new Uint32Array(mesh.triVerts);
  const numTri = mesh.numTri;
  const normals = new Float32Array(numVert * 3);

  // Accumulate flat-weighted vertex normals (smooth per-triangle normal for crisp faceted preview)
  for (let t = 0; t < numTri; t++) {
    const i0 = indices[t * 3];
    const i1 = indices[t * 3 + 1];
    const i2 = indices[t * 3 + 2];

    const ax = positions[i0 * 3];
    const ay = positions[i0 * 3 + 1];
    const az = positions[i0 * 3 + 2];
    const bx = positions[i1 * 3] - ax;
    const by = positions[i1 * 3 + 1] - ay;
    const bz = positions[i1 * 3 + 2] - az;
    const cx = positions[i2 * 3] - ax;
    const cy = positions[i2 * 3 + 1] - ay;
    const cz = positions[i2 * 3 + 2] - az;

    const nx = by * cz - bz * cy;
    const ny = bz * cx - bx * cz;
    const nz = bx * cy - by * cx;

    normals[i0 * 3] += nx;
    normals[i0 * 3 + 1] += ny;
    normals[i0 * 3 + 2] += nz;
    normals[i1 * 3] += nx;
    normals[i1 * 3 + 1] += ny;
    normals[i1 * 3 + 2] += nz;
    normals[i2 * 3] += nx;
    normals[i2 * 3 + 1] += ny;
    normals[i2 * 3 + 2] += nz;
  }

  for (let i = 0; i < numVert; i++) {
    const nx = normals[i * 3];
    const ny = normals[i * 3 + 1];
    const nz = normals[i * 3 + 2];
    const l = Math.hypot(nx, ny, nz) || 1;
    normals[i * 3] = nx / l;
    normals[i * 3 + 1] = ny / l;
    normals[i * 3 + 2] = nz / l;
  }

  const bbox = manifold.boundingBox();
  return {
    positions,
    indices,
    normals,
    boundsMin: [bbox.min[0], bbox.min[1], bbox.min[2]],
    boundsMax: [bbox.max[0], bbox.max[1], bbox.max[2]],
    triangleCount: numTri,
    volumeMm3: manifold.volume(),
    manifoldStatus: String(manifold.status()),
  };
}

export interface GenerateDieOptions {
  includeBlank: boolean;
  includeSupports: boolean;
  applyShrinkageOnMesh?: boolean;
}

/**
 * Resolves effective typography & high-face emblem settings for a specific die,
 * applying any per-die overrides on top of global project typography defaults.
 */
export function resolveDieTypography(
  globalTypography: DiceProjectState['typography'],
  settings: DieSettings,
): DiceProjectState['typography'] {
  return {
    ...globalTypography,
    activeFontId: settings.fontIdOverride ?? globalTypography.activeFontId,
    engravingDepthMm: settings.engravingDepthOverrideMm ?? globalTypography.engravingDepthMm,
    useHighFaceEmblem:
      settings.useHighFaceEmblemOverride ?? globalTypography.useHighFaceEmblem,
    highFaceSvgId: settings.highFaceSvgIdOverride ?? globalTypography.highFaceSvgId,
  };
}

/**
 * Returns true if a die carries any per-die overrides (font, depth, emblem,
 * font scale, blank clearance, or face-level engraving tweaks).
 */
export function hasDieCustomOverrides(settings: DieSettings): boolean {
  return (
    settings.fontIdOverride !== null ||
    settings.engravingDepthOverrideMm !== null ||
    settings.useHighFaceEmblemOverride !== null ||
    settings.highFaceSvgIdOverride !== null ||
    settings.blankClearanceOverrideMm !== null ||
    Math.abs(settings.fontScaleMultiplier - 1.0) > 0.001 ||
    Object.keys(settings.faceOverrides).length > 0
  );
}

/**
 * Generates watertight Manifold meshes, matched insert blank, breach check,
 * optional point-down supports, and caliper measurements for a single die.
 */
export async function generateDieGeometry(
  dieId: string,
  project: DiceProjectState,
  font: Font,
  options: GenerateDieOptions = {
    includeBlank: true,
    includeSupports: project.supports.enabled,
    applyShrinkageOnMesh: false,
  },
): Promise<GeneratedDieResult> {
  const t0 = performance.now();
  const wasm = await getManifold();
  const settings: DieSettings | undefined = project.dice[dieId];
  if (!settings) {
    throw new Error(`Die instance "${dieId}" does not exist in project.`);
  }
  const effectiveTypography = resolveDieTypography(project.typography, settings);

  const basePlanes = buildDieHalfSpaces(settings);
  const chamferedPlanes = applyEdgeChamfers(basePlanes, settings.edgeChamferMm);
  const baseFaces = clipHalfSpaces(basePlanes);
  const chamferedFaces = clipHalfSpaces(chamferedPlanes);

  const solidBase = buildManifoldFromFaces(wasm, chamferedFaces);
  const cutters = buildDieEngravingCutters(
    wasm,
    baseFaces,
    settings,
    effectiveTypography,
    font,
    project.svgAssets,
  );

  let masterManifold = cutters ? solidBase.subtract(cutters) : solidBase;
  if (cutters) {
    solidBase.delete();
  }

  const shrinkScale = options.applyShrinkageOnMesh
    ? 1 + project.exportConfig.shrinkageCompensationPct / 100
    : 1;

  if (Math.abs(shrinkScale - 1) > 1e-6) {
    const scaled = masterManifold.scale([shrinkScale, shrinkScale, shrinkScale]);
    masterManifold.delete();
    masterManifold = scaled;
  }

  const effectiveClearance = getEffectiveBlankClearance(settings, project.blanks);

  let blankMesh: MeshBufferData | null = null;
  let breach = {
    hasBreach: false,
    breachVolumeMm3: 0,
    minimumWallClearanceMm: effectiveClearance,
    blankFitsInsideMaster: true,
  };

  if (options.includeBlank) {
    const blankRes = generateMatchedBlank(
      wasm,
      basePlanes,
      cutters,
      effectiveTypography.engravingDepthMm,
      effectiveClearance,
      project.blanks.bubbleBevelMm,
    );
    breach = blankRes.breach;
    let finalBlank = blankRes.blankManifold;
    if (Math.abs(shrinkScale - 1) > 1e-6) {
      const scaledBlank = finalBlank.scale([shrinkScale, shrinkScale, shrinkScale]);
      finalBlank.delete();
      finalBlank = scaledBlank;
    }
    blankMesh = manifoldToMeshBufferData(finalBlank);
    finalBlank.delete();
  }

  let supportMesh: MeshBufferData | null = null;
  let exportMasterManifold = masterManifold;

  if (options.includeSupports) {
    const supRes = generatePointDownSupports(
      wasm,
      masterManifold,
      baseFaces,
      project.supports,
    );
    // Replace displayed master with oriented die so supports line up in the same frame
    exportMasterManifold = supRes.orientedDie;
    masterManifold.delete();
    supportMesh = manifoldToMeshBufferData(supRes.supportOnly);
    supRes.supportOnly.delete();
    supRes.combined.delete();
  }

  if (cutters) {
    cutters.delete();
  }

  const masterMesh = manifoldToMeshBufferData(exportMasterManifold);
  exportMasterManifold.delete();

  const nominal = computeNominalCalipers(settings);
  const delta2 = 2 * (effectiveTypography.engravingDepthMm + effectiveClearance);
  const slicerFactor = 1 + project.exportConfig.shrinkageCompensationPct / 100;

  const calipers: CaliperMetrics = {
    masterFaceToFaceMm: nominal.faceToFaceMm,
    masterHeightMm: nominal.heightMm,
    blankFaceToFaceMm: Math.max(0.8, nominal.faceToFaceMm - delta2),
    blankHeightMm: Math.max(0.8, nominal.heightMm - delta2),
    masterSlicerF2FMm: nominal.faceToFaceMm * slicerFactor,
    blankSlicerF2FMm: Math.max(0.8, nominal.faceToFaceMm - delta2) * slicerFactor,
    effectiveClearanceMm: effectiveClearance,
  };

  const faces: FacePreviewInfo[] = baseFaces.map((f) => ({
    id: f.id,
    label: f.faceLabel ?? f.id,
    origin3D: f.origin3D,
    normal: f.normal,
    inradius2D: f.inradius2D,
    isNumbered: f.isNumbered,
  }));

  return {
    dieId: settings.id ?? dieId,
    kind: settings.kind,
    masterMesh,
    blankMesh,
    supportMesh,
    faces,
    calipers,
    breach,
    generationMs: Math.round(performance.now() - t0),
  };
}

/**
 * Generates export-ready binary manifold (optionally unioned with supports and shrinkage-scaled).
 */
export async function generateExportManifold(
  dieId: string,
  project: DiceProjectState,
  font: Font,
  mode: 'master' | 'blank',
): Promise<{
  mesh: MeshBufferData;
  breach: GeneratedDieResult['breach'];
  calipers: CaliperMetrics;
}> {
  const wasm = await getManifold();
  const settings = project.dice[dieId];
  if (!settings) {
    throw new Error(`Die instance "${dieId}" does not exist in project.`);
  }
  const effectiveTypography = resolveDieTypography(project.typography, settings);
  const basePlanes = buildDieHalfSpaces(settings);
  const chamferedPlanes = applyEdgeChamfers(basePlanes, settings.edgeChamferMm);
  const baseFaces = clipHalfSpaces(basePlanes);
  const chamferedFaces = clipHalfSpaces(chamferedPlanes);

  const solidBase = buildManifoldFromFaces(wasm, chamferedFaces);
  const cutters = buildDieEngravingCutters(
    wasm,
    baseFaces,
    settings,
    effectiveTypography,
    font,
    project.svgAssets,
  );

  const effectiveClearance = getEffectiveBlankClearance(settings, project.blanks);
  const shrinkScale = 1 + project.exportConfig.shrinkageCompensationPct / 100;

  let targetManifold: Manifold;
  let breach: GeneratedDieResult['breach'] = {
    hasBreach: false,
    breachVolumeMm3: 0,
    minimumWallClearanceMm: effectiveClearance,
    blankFitsInsideMaster: true,
  };

  if (mode === 'master') {
    targetManifold = cutters ? solidBase.subtract(cutters) : solidBase;
    if (cutters) solidBase.delete();
  } else {
    solidBase.delete();
    const blankRes = generateMatchedBlank(
      wasm,
      basePlanes,
      cutters,
      effectiveTypography.engravingDepthMm,
      effectiveClearance,
      project.blanks.bubbleBevelMm,
    );
    targetManifold = blankRes.blankManifold;
    breach = blankRes.breach;
  }

  if (cutters) cutters.delete();

  if (project.supports.enabled) {
    const supRes = generatePointDownSupports(
      wasm,
      targetManifold,
      baseFaces,
      project.supports,
    );
    targetManifold.delete();
    supRes.orientedDie.delete();
    supRes.supportOnly.delete();
    targetManifold = supRes.combined;
  }

  if (Math.abs(shrinkScale - 1) > 1e-6) {
    const scaled = targetManifold.scale([shrinkScale, shrinkScale, shrinkScale]);
    targetManifold.delete();
    targetManifold = scaled;
  }

  const mesh = manifoldToMeshBufferData(targetManifold);
  targetManifold.delete();

  const nominal = computeNominalCalipers(settings);
  const delta2 = 2 * (effectiveTypography.engravingDepthMm + effectiveClearance);
  const calipers: CaliperMetrics = {
    masterFaceToFaceMm: nominal.faceToFaceMm,
    masterHeightMm: nominal.heightMm,
    blankFaceToFaceMm: Math.max(0.8, nominal.faceToFaceMm - delta2),
    blankHeightMm: Math.max(0.8, nominal.heightMm - delta2),
    masterSlicerF2FMm: nominal.faceToFaceMm * shrinkScale,
    blankSlicerF2FMm: Math.max(0.8, nominal.faceToFaceMm - delta2) * shrinkScale,
    effectiveClearanceMm: effectiveClearance,
  };

  return { mesh, breach, calipers };
}

export function getShrinkageFactor(blankConfig: BlankConfig, shrinkagePct: number): number {
  void blankConfig;
  return 1 + shrinkagePct / 100;
}
