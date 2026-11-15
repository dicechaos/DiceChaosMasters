import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Font } from 'opentype.js';
import { buildBatchExportFiles } from '../exporters/batchExporter';
import { packProjectArchive, unpackProjectArchive } from '../exporters/projectArchive';
import { encodeBinaryStl } from '../exporters/stlExporter';
import { encodeThreeMf } from '../exporters/threeMfExporter';
import { generateDieGeometry, resolveDieTypography } from '../generator';
import { getManifold } from '../manifoldInstance';
import { computeCreaseNormalsBuffer } from '../meshNormals';
import { buildDieHalfSpaces } from '../polyhedra/definitions';
import { buildManifoldFromFaces, clipHalfSpaces } from '../polyhedra/halfspace';
import {
  buildSetFromTemplate,
  createDefaultDieSettings,
  createDefaultProjectState,
  DEFAULT_STUDIO_DICE,
  DIE_ORDER,
  getProjectDieOrder,
  nextDieInstanceId,
  normalizeSelectedDice,
  RPG_SEVEN_DICE,
} from '../presets';
import { parseFontBuffer } from '../typography/glyphBuilder';
import { exportBundleToDisk } from '../../platform/desktopBridge';
import { useDiceStore } from '../../store/useDiceStore';
import type {
  D10Variant,
  D12Variant,
  D2Variant,
  D3Variant,
  D4Variant,
  D6Variant,
  D8Variant,
  DieKind,
  OddDieVariant,
} from '../../types/dice';

let defaultFont: Font;
let fontBytes: Uint8Array;

beforeAll(async () => {
  await getManifold();
  const fontPath = resolve(process.cwd(), 'public/fonts/ChakraPetch-Bold.ttf');
  const buf = readFileSync(fontPath);
  fontBytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  defaultFont = parseFontBuffer(ab);
});

describe('Dice Chaos Masters Geometry & CSG Engine', () => {
  it('generates all 12 core dice (D2..D20 including D5/D7/D9) with strictly watertight manifold meshes and zero blank breaches', async () => {
    const project = createDefaultProjectState('standard');
    const continuum = buildSetFromTemplate('continuum_12', project);
    project.dieOrder = continuum.dieOrder;
    project.dice = continuum.dice;
    const wasm = await getManifold();

    for (const kind of DIE_ORDER) {
      const settings = project.dice[kind];
      expect(settings, `${kind} present in continuum_12`).toBeDefined();
      const basePlanes = buildDieHalfSpaces(settings);
      for (const p of basePlanes) {
        expect(p.distance, `${kind}:${p.id} plane distance > 0`).toBeGreaterThan(0);
      }
      const baseFaces = clipHalfSpaces(basePlanes);
      const unengraved = buildManifoldFromFaces(wasm, baseFaces);
      const baseVolume = unengraved.volume();
      unengraved.delete();

      const res = await generateDieGeometry(kind, project, defaultFont, {
        includeBlank: true,
        includeSupports: false,
      });

      expect(res.masterMesh.manifoldStatus, `${kind} master status`).toBe('NoError');
      expect(res.masterMesh.triangleCount, `${kind} triangles`).toBeGreaterThan(20);
      expect(res.masterMesh.volumeMm3, `${kind} engraved volume`).toBeGreaterThan(10);
      expect(res.masterMesh.volumeMm3, `${kind} engraving removed resin`).toBeLessThan(baseVolume);

      expect(res.blankMesh).not.toBeNull();
      expect(res.blankMesh!.manifoldStatus, `${kind} blank status`).toBe('NoError');
      expect(res.blankMesh!.volumeMm3).toBeGreaterThan(5);
      expect(res.blankMesh!.volumeMm3).toBeLessThan(res.masterMesh.volumeMm3);

      expect(res.breach.hasBreach, `${kind} blank breach`).toBe(false);
      expect(res.breach.breachVolumeMm3).toBeLessThan(1e-4);
      expect(res.breach.blankFitsInsideMaster).toBe(true);
    }
  });

  it('generates all 6 D4 variants + D3 rounded_prism with watertight manifolds and matched blanks', async () => {
    const project = createDefaultProjectState('standard');
    const d4Variants: D4Variant[] = [
      'classic_vertex',
      'classic_base',
      'crystal',
      'arch',
      'pendulum',
      'truncated',
    ];

    for (const variant of d4Variants) {
      project.dice.d4.d4Variant = variant;
      const res = await generateDieGeometry('d4', project, defaultFont, {
        includeBlank: true,
        includeSupports: false,
      });
      expect(res.masterMesh.manifoldStatus, `d4:${variant} master`).toBe('NoError');
      expect(res.blankMesh!.manifoldStatus, `d4:${variant} blank`).toBe('NoError');
      expect(res.breach.hasBreach, `d4:${variant} breach`).toBe(false);
    }

    const d3Variants: D3Variant[] = ['truncated_barrel', 'rounded_prism'];
    for (const variant of d3Variants) {
      project.dice.d3.d3Variant = variant;
      const res = await generateDieGeometry('d3', project, defaultFont, {
        includeBlank: true,
        includeSupports: false,
      });
      expect(res.masterMesh.manifoldStatus, `d3:${variant} master`).toBe('NoError');
      expect(res.blankMesh!.manifoldStatus, `d3:${variant} blank`).toBe('NoError');
      expect(res.breach.hasBreach, `d3:${variant} breach`).toBe(false);
    }
  });

  it('preserves exact face-to-face offset math between Master and Matched Blank', async () => {
    const project = createDefaultProjectState('standard');
    project.typography.engravingDepthMm = 0.8;
    project.blanks.clearanceMm = 0.05;
    project.blanks.bubbleBevelMm = 0;
    project.dice.d6.sizeMm = 20.0;
    project.dice.d6.edgeChamferMm = 0;

    const res = await generateDieGeometry('d6', project, defaultFont, {
      includeBlank: true,
      includeSupports: false,
    });

    const masterSpanX = res.masterMesh.boundsMax[0] - res.masterMesh.boundsMin[0];
    const blankSpanX = res.blankMesh!.boundsMax[0] - res.blankMesh!.boundsMin[0];

    expect(masterSpanX).toBeCloseTo(20.0, 2);
    // Expected blank F2F = 20.0 - 2 * (0.8 + 0.05) = 18.30 mm
    expect(blankSpanX).toBeCloseTo(18.3, 2);
    expect(res.calipers.blankFaceToFaceMm).toBeCloseTo(18.3, 2);
  });

  it('detects shell breaches automatically when negative clearance is forced', async () => {
    const project = createDefaultProjectState('standard');
    project.typography.engravingDepthMm = 0.9;
    project.dice.d6.blankClearanceOverrideMm = -0.35;

    const res = await generateDieGeometry('d6', project, defaultFont, {
      includeBlank: true,
      includeSupports: false,
    });

    expect(res.breach.hasBreach).toBe(true);
    expect(res.breach.breachVolumeMm3).toBeGreaterThan(0.01);
  });

  it('supports high-face SVG emblem subtraction and anti-tear draft angles across all bundled fonts', async () => {
    const fontFiles = [
      'CinzelDecorative-Bold.ttf',
      'MedievalSharp-Regular.ttf',
      'UncialAntiqua-Regular.ttf',
      'ChakraPetch-Bold.ttf',
      'RussoOne-Regular.ttf',
    ];

    for (const file of fontFiles) {
      const buf = readFileSync(resolve(process.cwd(), 'public/fonts', file));
      const font = parseFontBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const project = createDefaultProjectState('standard');
      project.typography.useHighFaceEmblem = true;
      project.typography.draftAngleDeg = 18;
      project.dice.d20.d20Numbering = 'balanced';

      const res = await generateDieGeometry('d20', project, font, {
        includeBlank: true,
        includeSupports: false,
      });

      expect(res.masterMesh.manifoldStatus, `${file} D20 master`).toBe('NoError');
      expect(res.breach.hasBreach, `${file} D20 blank`).toBe(false);
    }
  });

  it('generates point-down fin & edge bumper supports sitting cleanly at Z = 0', async () => {
    const project = createDefaultProjectState('standard');
    project.supports.enabled = true;
    project.supports.pointDown = true;

    const kindsToCheck: DieKind[] = ['d4', 'd6', 'd20'];
    for (const kind of kindsToCheck) {
      const res = await generateDieGeometry(kind, project, defaultFont, {
        includeBlank: false,
        includeSupports: true,
      });
      expect(res.supportMesh).not.toBeNull();
      expect(res.supportMesh!.manifoldStatus).toBe('NoError');
      expect(res.supportMesh!.boundsMin[2]).toBeCloseTo(0, 2);
      expect(res.masterMesh.boundsMin[2]).toBeGreaterThan(project.supports.raftThicknessMm);
    }
  });

  it('exports valid binary STL, 3MF XML archive, batch bundle, and .dcproj round-trip', async () => {
    const project = createDefaultProjectState('standard');
    // Enable subset for snappy batch export test
    for (const k of getProjectDieOrder(project)) project.dice[k].enabled = k === 'd6' || k === 'd4';

    const batch = await buildBatchExportFiles(project, defaultFont, 'Chakra Petch Bold');
    expect(batch.breachedDice).toHaveLength(0);
    // 2 dice * (master STL + master 3MF + blank STL + blank 3MF) + 1 Caliper_Specs.md = 9 files
    expect(batch.files).toHaveLength(9);

    const stlFile = batch.files.find((f) => f.relativePath.endsWith('D6_Master.stl'));
    expect(stlFile).toBeDefined();
    const view = new DataView(stlFile!.bytes.buffer, stlFile!.bytes.byteOffset, stlFile!.bytes.byteLength);
    const triCount = view.getUint32(80, true);
    expect(triCount).toBeGreaterThan(100);
    expect(stlFile!.bytes.byteLength).toBe(84 + triCount * 50);

    const threeMfFile = batch.files.find((f) => f.relativePath.endsWith('D6_Master.3mf'));
    expect(threeMfFile).toBeDefined();
    const threeMfZip = await JSZip.loadAsync(threeMfFile!.bytes);
    const modelXml = await threeMfZip.file('3D/3dmodel.model')?.async('string');
    expect(modelXml).toContain('unit="millimeter"');
    expect(modelXml).toContain('<triangle ');

    expect(batch.specMarkdown).toContain('Dice Chaos Masters');
    expect(batch.specMarkdown).toContain('Blank F2F = Master F2F');

    // Also test standalone encoders + .dcproj round-trip
    const single = await generateDieGeometry('d6', project, defaultFont, {
      includeBlank: false,
      includeSupports: false,
    });
    const rawStl = encodeBinaryStl(single.masterMesh);
    expect(rawStl.byteLength).toBe(84 + single.masterMesh.triangleCount * 50);
    const raw3mf = await encodeThreeMf(single.masterMesh);
    expect(raw3mf.byteLength).toBeGreaterThan(200);

    const dcprojBytes = await packProjectArchive(project, {
      id: 'custom-test-font',
      name: 'Chakra Petch Test',
      bytes: fontBytes,
    });
    const unpacked = await unpackProjectArchive(dcprojBytes);
    expect(unpacked.setName).toBe(project.setName);
    expect(unpacked.uploadedFonts.some((f) => f.id === 'custom-test-font')).toBe(true);
  });

  it('produces watertight 0-bevel hard-edge geometry and razor-sharp crease-split normals across all dice', async () => {
    const project = createDefaultProjectState('standard');
    const continuum = buildSetFromTemplate('continuum_12', project);
    project.dieOrder = continuum.dieOrder;
    project.dice = continuum.dice;
    for (const k of DIE_ORDER) {
      project.dice[k].edgeChamferMm = 0;
    }

    const assertHardPrimaryFaceNormals = (
      kind: DieKind,
      res: Awaited<ReturnType<typeof generateDieGeometry>>,
    ) => {
      const planes = buildDieHalfSpaces(project.dice[kind]).filter((p) => p.role === 'primary');
      const { positions, normals } = computeCreaseNormalsBuffer(res.masterMesh, 15);
      const triCount = Math.floor(positions.length / 9);
      let checkedTris = 0;
      let minDot = Infinity;
      let worstLabel = '';

      for (let t = 0; t < triCount; t++) {
        const b = t * 9;
        const ax = positions[b];
        const ay = positions[b + 1];
        const az = positions[b + 2];
        const bx = positions[b + 3];
        const by = positions[b + 4];
        const bz = positions[b + 5];
        const cx = positions[b + 6];
        const cy = positions[b + 7];
        const cz = positions[b + 8];

        const ux = bx - ax;
        const uy = by - ay;
        const uz = bz - az;
        const vx = cx - ax;
        const vy = cy - ay;
        const vz = cz - az;
        let tnx = uy * vz - uz * vy;
        let tny = uz * vx - ux * vz;
        let tnz = ux * vy - uy * vx;
        const tLen = Math.hypot(tnx, tny, tnz);
        if (tLen < 1e-9) continue;
        tnx /= tLen;
        tny /= tLen;
        tnz /= tLen;

        const mx = (ax + bx + cx) / 3;
        const my = (ay + by + cy) / 3;
        const mz = (az + bz + cz) / 3;

        const matchedFace = planes.find((p) => {
          const dist = p.normal[0] * mx + p.normal[1] * my + p.normal[2] * mz;
          const triDot = p.normal[0] * tnx + p.normal[1] * tny + p.normal[2] * tnz;
          return Math.abs(dist - p.distance) < 1e-3 && triDot > 0.999;
        });
        if (!matchedFace) continue;

        checkedTris++;
        for (let k = 0; k < 3; k++) {
          const nb = b + k * 3;
          const dotN =
            normals[nb] * matchedFace.normal[0] +
            normals[nb + 1] * matchedFace.normal[1] +
            normals[nb + 2] * matchedFace.normal[2];
          if (dotN < minDot) {
            minDot = dotN;
            if (dotN <= 0.9999) {
              worstLabel = `${kind} face ${matchedFace.id} tri ${t} v${k} normal dot`;
            }
          }
        }
      }

      expect(minDot, worstLabel || `${kind} primary face normal dot`).toBeGreaterThan(0.9999);
      expect(checkedTris, `${kind} checked primary face triangles`).toBeGreaterThan(planes.length);
    };

    let d2Res: Awaited<ReturnType<typeof generateDieGeometry>> | null = null;
    let d10Res: Awaited<ReturnType<typeof generateDieGeometry>> | null = null;
    let d20Res: Awaited<ReturnType<typeof generateDieGeometry>> | null = null;

    for (const kind of DIE_ORDER) {
      const res = await generateDieGeometry(kind, project, defaultFont, {
        includeBlank: true,
        includeSupports: false,
      });
      expect(res.masterMesh.manifoldStatus, `0-bevel ${kind} master status`).toBe('NoError');
      expect(res.blankMesh!.manifoldStatus, `0-bevel ${kind} blank status`).toBe('NoError');
      expect(res.breach.hasBreach, `0-bevel ${kind} breach`).toBe(false);

      const stlBytes = encodeBinaryStl(res.masterMesh);
      const stlView = new DataView(stlBytes.buffer, stlBytes.byteOffset, stlBytes.byteLength);
      const numTri = stlView.getUint32(80, true);
      expect(numTri).toBe(res.masterMesh.triangleCount);
      let nanCount = 0;
      for (let t = 0; t < numTri; t++) {
        const off = 84 + t * 50;
        for (let f = 0; f < 12; f++) {
          if (Number.isNaN(stlView.getFloat32(off + f * 4, true))) nanCount++;
        }
      }
      expect(nanCount, `0-bevel ${kind} STL NaN floats`).toBe(0);

      if (kind === 'd2') d2Res = res;
      if (kind === 'd10') d10Res = res;
      if (kind === 'd20') d20Res = res;
    }

    expect(d20Res).not.toBeNull();
    expect(d10Res).not.toBeNull();
    expect(d2Res).not.toBeNull();

    const threeMfBytes = await encodeThreeMf(d20Res!.masterMesh, 'D20_HardEdge');
    const threeMfZip = await JSZip.loadAsync(threeMfBytes);
    const modelXml = await threeMfZip.file('3D/3dmodel.model')?.async('string');
    expect(modelXml).toContain('<mesh>');
    expect(modelXml).toContain('<triangle ');

    assertHardPrimaryFaceNormals('d20', d20Res!);
    assertHardPrimaryFaceNormals('d10', d10Res!);

    // Verify D2 cylindrical rim (< 15 deg per facet) keeps smooth vertex-averaged normals
    const d2Buffers = computeCreaseNormalsBuffer(d2Res!.masterMesh, 15);
    const d2TriCount = Math.floor(d2Buffers.positions.length / 9);
    let smoothedRimVertices = 0;
    for (let t = 0; t < d2TriCount; t++) {
      const b = t * 9;
      const ux = d2Buffers.positions[b + 3] - d2Buffers.positions[b];
      const uy = d2Buffers.positions[b + 4] - d2Buffers.positions[b + 1];
      const uz = d2Buffers.positions[b + 5] - d2Buffers.positions[b + 2];
      const vx = d2Buffers.positions[b + 6] - d2Buffers.positions[b];
      const vy = d2Buffers.positions[b + 7] - d2Buffers.positions[b + 1];
      const vz = d2Buffers.positions[b + 8] - d2Buffers.positions[b + 2];
      let tnx = uy * vz - uz * vy;
      let tny = uz * vx - ux * vz;
      let tnz = ux * vy - uy * vx;
      const len = Math.hypot(tnx, tny, tnz);
      if (len < 1e-9) continue;
      tnx /= len;
      tny /= len;
      tnz /= len;
      if (Math.abs(tnz) >= 0.05) continue;

      for (let k = 0; k < 3; k++) {
        const nb = b + k * 3;
        const dotN =
          d2Buffers.normals[nb] * tnx +
          d2Buffers.normals[nb + 1] * tny +
          d2Buffers.normals[nb + 2] * tnz;
        if (dotN > 0.99 && dotN < 0.99999) {
          smoothedRimVertices++;
        }
      }
    }
    expect(smoothedRimVertices).toBeGreaterThan(20);
  });

  it('applies per-die font, engraving depth, and high-face emblem overrides to geometry & blank calipers', async () => {
    const altBuf = readFileSync(resolve(process.cwd(), 'public/fonts/CinzelDecorative-Bold.ttf'));
    const altFont = parseFontBuffer(
      altBuf.buffer.slice(altBuf.byteOffset, altBuf.byteOffset + altBuf.byteLength),
    );

    const project = createDefaultProjectState('standard');
    project.typography.activeFontId = 'chakra-petch';
    project.typography.engravingDepthMm = 0.75;
    project.typography.useHighFaceEmblem = false;
    project.blanks.clearanceMm = 0.05;

    // Override D6 to 20.00 mm cube, 1.05 mm engraving depth, alternate font, and custom emblem
    project.dice.d6.sizeMm = 20.0;
    project.dice.d6.fontIdOverride = 'cinzel-decorative';
    project.dice.d6.engravingDepthOverrideMm = 1.05;
    project.dice.d6.useHighFaceEmblemOverride = true;

    const effD6 = resolveDieTypography(project.typography, project.dice.d6);
    expect(effD6.activeFontId).toBe('cinzel-decorative');
    expect(effD6.engravingDepthMm).toBeCloseTo(1.05, 5);
    expect(effD6.useHighFaceEmblem).toBe(true);

    // Non-overridden die (D8) keeps global typography
    const effD8 = resolveDieTypography(project.typography, project.dice.d8);
    expect(effD8.activeFontId).toBe('chakra-petch');
    expect(effD8.engravingDepthMm).toBeCloseTo(0.75, 5);
    expect(effD8.useHighFaceEmblem).toBe(false);

    const d6Res = await generateDieGeometry('d6', project, altFont, {
      includeBlank: true,
      includeSupports: false,
      applyShrinkageOnMesh: false,
    });

    expect(d6Res.masterMesh.manifoldStatus).toBe('NoError');
    expect(d6Res.blankMesh?.manifoldStatus).toBe('NoError');
    expect(d6Res.breach.hasBreach).toBe(false);
    // 20.00 - 2 * (1.05 + 0.05) = 17.80 mm matched blank
    expect(d6Res.calipers.blankFaceToFaceMm).toBeCloseTo(17.8, 2);
  });

  it('supports multi-font maps and targetDice subset filtering in buildBatchExportFiles', async () => {
    const altBuf = readFileSync(resolve(process.cwd(), 'public/fonts/CinzelDecorative-Bold.ttf'));
    const altFont = parseFontBuffer(
      altBuf.buffer.slice(altBuf.byteOffset, altBuf.byteOffset + altBuf.byteLength),
    );

    const project = createDefaultProjectState('standard');
    project.exportConfig.export3mf = false;
    project.exportConfig.exportStl = true;
    project.exportConfig.exportSpecSheet = true;
    project.blanks.includeBlanksOnExport = true;
    project.dice.d10.fontIdOverride = 'cinzel-decorative';
    project.dice.d00.engravingDepthOverrideMm = 0.9;

    const fontMap = {
      'chakra-petch': defaultFont,
      'cinzel-decorative': altFont,
    };
    const fontNameMap = {
      'chakra-petch': 'Chakra Petch Bold',
      'cinzel-decorative': 'Cinzel Decorative Bold',
    };

    const batch = await buildBatchExportFiles(
      project,
      fontMap,
      fontNameMap,
      undefined,
      ['d10', 'd00'],
    );

    const paths = batch.files.map((f) => f.relativePath);
    expect(paths).toContain('Masters/DiceChaos_Master_Set_D10_Master.stl');
    expect(paths).toContain('Blanks/DiceChaos_Master_Set_D10_Blank.stl');
    expect(paths).toContain('Masters/DiceChaos_Master_Set_D00_Master.stl');
    expect(paths).toContain('Blanks/DiceChaos_Master_Set_D00_Blank.stl');
    expect(paths).toContain('Caliper_Specs.md');
    expect(paths.some((p) => p.includes('D20'))).toBe(false);
    expect(batch.specMarkdown).toContain('Cinzel Decorative Bold');
    expect(batch.specMarkdown).toContain('0.90');
  });

  it('preserves multi-select group state, per-die overrides, and multiple system fonts in .dcproj round-trip & legacy backfill', async () => {
    const project = createDefaultProjectState('standard');
    project.selectedDice = normalizeSelectedDice(RPG_SEVEN_DICE, 'd20');
    project.activeDie = 'd20';
    project.dice.d4.fontIdOverride = 'sys-font-1';
    project.dice.d12.fontIdOverride = 'sys-font-2';
    project.dice.d20.engravingDepthOverrideMm = 0.85;
    project.dice.d6.useHighFaceEmblemOverride = true;

    const altBytes = new Uint8Array(
      readFileSync(resolve(process.cwd(), 'public/fonts/CinzelDecorative-Bold.ttf')),
    );
    const bytes = await packProjectArchive(project, [
      { id: 'sys-font-1', name: 'System Display One', bytes: fontBytes },
      { id: 'sys-font-2', name: 'System Display Two', bytes: altBytes },
    ]);

    const restored = await unpackProjectArchive(bytes);
    expect(restored.selectedDice).toEqual(RPG_SEVEN_DICE);
    expect(restored.dice.d4.fontIdOverride).toBe('sys-font-1');
    expect(restored.dice.d12.fontIdOverride).toBe('sys-font-2');
    expect(restored.dice.d20.engravingDepthOverrideMm).toBeCloseTo(0.85, 5);
    expect(restored.dice.d6.useHighFaceEmblemOverride).toBe(true);
    expect(restored.uploadedFonts.some((f) => f.id === 'sys-font-1')).toBe(true);
    expect(restored.uploadedFonts.some((f) => f.id === 'sys-font-2')).toBe(true);

    // Legacy v1 manifest compatibility (missing selectedDice & override keys)
    const legacy = createDefaultProjectState('mini') as unknown as Record<string, unknown>;
    delete legacy.selectedDice;
    const legacyD6 = (legacy.dice as Record<string, Record<string, unknown>>).d6;
    delete legacyD6.fontIdOverride;
    delete legacyD6.engravingDepthOverrideMm;
    delete legacyD6.useHighFaceEmblemOverride;
    delete legacyD6.highFaceSvgIdOverride;

    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify(legacy));
    const legacyArchiveBytes = await zip.generateAsync({ type: 'uint8array' });
    const unpackedLegacy = await unpackProjectArchive(legacyArchiveBytes);

    expect(unpackedLegacy.selectedDice).toEqual(['d20']);
    expect(unpackedLegacy.dice.d6.fontIdOverride).toBeNull();
    expect(unpackedLegacy.dice.d6.engravingDepthOverrideMm).toBeNull();
    expect(unpackedLegacy.dice.d6.useHighFaceEmblemOverride).toBeNull();
    expect(unpackedLegacy.dice.d6.highFaceSvgIdOverride).toBeNull();
    expect(getProjectDieOrder(unpackedLegacy)).toEqual(DEFAULT_STUDIO_DICE);
    expect(unpackedLegacy.dice.d6.id).toBe('d6');
    expect(unpackedLegacy.dice.d6.customLabel).toBe('');
    expect(unpackedLegacy.dice.d6.d6Variant).toBe('cube');
    expect(unpackedLegacy.dice.d12.d12Variant).toBe('pentagonal');
    expect(unpackedLegacy.dice.d2.d2Variant).toBe('round');
  });

  it('builds Quick Game Set Templates with expected instances, labels, and preserved settings', () => {
    const current = createDefaultProjectState('mini');
    current.dice.d4.d4Variant = 'truncated';
    current.dice.d6.edgeChamferMm = 0.25;

    const adv = buildSetFromTemplate('advantage_8', current);
    expect(adv.dieOrder).toEqual(['d4', 'd6', 'd8', 'd10', 'd00', 'd12', 'd20', 'd20-2']);
    expect(adv.dice.d4.d4Variant).toBe('truncated');
    expect(adv.dice.d6.edgeChamferMm).toBeCloseTo(0.25, 5);
    expect(adv.dice.d20.customLabel).toBe('Logo');
    expect(adv.dice.d20.useHighFaceEmblemOverride).toBe(true);
    expect(adv.dice['d20-2'].customLabel).toBe('Numbers');
    expect(adv.dice['d20-2'].useHighFaceEmblemOverride).toBe(false);
    expect(adv.activeDie).toBe('d20');

    const maker11 = buildSetFromTemplate('maker_11', current);
    expect(maker11.dieOrder).toHaveLength(11);
    expect(maker11.dieOrder.filter((id) => maker11.dice[id].kind === 'd6')).toHaveLength(4);
    expect(maker11.dieOrder.filter((id) => maker11.dice[id].kind === 'd20')).toHaveLength(2);
    expect(maker11.dice.d20.customLabel).toBe('Logo');
    expect(maker11.dice['d20-2'].customLabel).toBe('Numbers');

    const duality = buildSetFromTemplate('duality_9', current);
    expect(duality.dieOrder).toHaveLength(9);
    expect(duality.dice.d12.customLabel).toBe('Hope');
    expect(duality.dice['d12-2'].customLabel).toBe('Fear');
    expect(duality.dice.d20.customLabel).toBe('Logo');
    expect(duality.dice['d20-2'].customLabel).toBe('Numbers');

    const d6Pool = buildSetFromTemplate('d6_pool_6', current);
    expect(d6Pool.dieOrder).toEqual(['d6', 'd6-2', 'd6-3', 'd6-4', 'd6-5', 'd6-6']);
    expect(d6Pool.activeDie).toBe('d6');

    const d10Pool = buildSetFromTemplate('d10_pool_10', current);
    expect(d10Pool.dieOrder).toHaveLength(10);
    expect(d10Pool.dieOrder.every((id) => d10Pool.dice[id].kind === 'd10')).toBe(true);
  });

  it('generates watertight duplicate instances (D20 Logo vs Numbers) and emits collision-free batch export paths', async () => {
    const project = createDefaultProjectState('standard');
    project.setName = 'TwinPool';
    project.exportConfig.exportStl = true;
    project.exportConfig.export3mf = false;
    project.exportConfig.exportSpecSheet = true;
    project.blanks.includeBlanksOnExport = false;

    const d20TwinId = nextDieInstanceId('d20', project.dice);
    const d20Logo = {
      ...project.dice.d20,
      customLabel: 'Logo',
      useHighFaceEmblemOverride: true,
    };
    const d20Numbers = {
      ...createDefaultDieSettings('d20', 'standard', d20TwinId, 'Numbers'),
      useHighFaceEmblemOverride: false,
    };

    const d6TwinId = nextDieInstanceId('d6', project.dice);
    const d6One = { ...project.dice.d6, customLabel: '' };
    const d6Two = createDefaultDieSettings('d6', 'standard', d6TwinId, '');

    project.dieOrder = ['d6', d6TwinId, 'd20', d20TwinId];
    project.dice = {
      d6: d6One,
      [d6TwinId]: d6Two,
      d20: d20Logo,
      [d20TwinId]: d20Numbers,
    };
    project.activeDie = 'd20';
    project.selectedDice = ['d20'];

    const logoRes = await generateDieGeometry('d20', project, defaultFont, {
      includeBlank: false,
      includeSupports: false,
    });
    const numbersRes = await generateDieGeometry(d20TwinId, project, defaultFont, {
      includeBlank: false,
      includeSupports: false,
    });

    expect(logoRes.dieId).toBe('d20');
    expect(numbersRes.dieId).toBe(d20TwinId);
    expect(logoRes.masterMesh.manifoldStatus).toBe('NoError');
    expect(numbersRes.masterMesh.manifoldStatus).toBe('NoError');
    expect(logoRes.masterMesh.volumeMm3).not.toBeCloseTo(numbersRes.masterMesh.volumeMm3, 1);

    const exported = await buildBatchExportFiles(
      project,
      defaultFont,
      'Chakra Petch Bold',
    );
    const paths = exported.files.map((f) => f.relativePath);

    expect(paths).toContain('Masters/TwinPool_D20_Logo_Master.stl');
    expect(paths).toContain('Masters/TwinPool_D20_Numbers_Master.stl');
    expect(paths).toContain('Masters/TwinPool_D6_1_Master.stl');
    expect(paths).toContain('Masters/TwinPool_D6_2_Master.stl');
    expect(exported.specMarkdown).toContain('D20 · Logo');
    expect(exported.specMarkdown).toContain('D20 · Numbers');
    expect(exported.specMarkdown).toContain('D6 #1');
    expect(exported.specMarkdown).toContain('D6 #2');
  });

  it('round-trips multi-instance sets in .dcproj archives and normalizes legacy manifests missing dieOrder', async () => {
    const project = createDefaultProjectState('standard');
    const applied = buildSetFromTemplate('advantage_8', project);
    project.dieOrder = applied.dieOrder;
    project.dice = applied.dice;
    project.activeDie = 'd20';
    project.selectedDice = ['d20', 'd20-2'];

    const bytes = await packProjectArchive(project, []);
    const restored = await unpackProjectArchive(bytes);

    expect(restored.dieOrder).toEqual(applied.dieOrder);
    expect(restored.dice['d20-2'].kind).toBe('d20');
    expect(restored.dice['d20-2'].customLabel).toBe('Numbers');
    expect(restored.dice['d20'].customLabel).toBe('Logo');
    expect(restored.selectedDice).toEqual(['d20', 'd20-2']);

    // Legacy v1 manifest lacking dieOrder, id, and customLabel
    const legacy = createDefaultProjectState('standard') as unknown as Record<string, unknown>;
    delete legacy.dieOrder;
    for (const val of Object.values(legacy.dice as Record<string, Record<string, unknown>>)) {
      delete val.id;
      delete val.customLabel;
    }

    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify(legacy));
    const legacyBytes = await zip.generateAsync({ type: 'uint8array' });
    const unpacked = await unpackProjectArchive(legacyBytes);

    expect(getProjectDieOrder(unpacked)).toEqual(DEFAULT_STUDIO_DICE);
    expect(unpacked.dice.d20.id).toBe('d20');
    expect(unpacked.dice.d20.customLabel).toBe('');
  });

  it('generates all 6 D2 coin silhouettes with watertight manifolds, matched blanks, and accurate spans', async () => {
    const project = createDefaultProjectState('standard');
    const variants: D2Variant[] = [
      'round',
      'oval',
      'rounded_square',
      'hexagon',
      'octagon',
      'shield',
    ];
    const heights: Partial<Record<D2Variant, number>> = {};

    for (const variant of variants) {
      project.dice.d2.d2Variant = variant;
      const res = await generateDieGeometry('d2', project, defaultFont, {
        includeBlank: true,
        includeSupports: false,
      });

      expect(res.masterMesh.manifoldStatus, `d2:${variant} master`).toBe('NoError');
      expect(res.blankMesh?.manifoldStatus, `d2:${variant} blank`).toBe('NoError');
      expect(res.breach.hasBreach, `d2:${variant} breach`).toBe(false);
      expect(res.faces.filter((f) => f.isNumbered)).toHaveLength(2);
      heights[variant] = res.calipers.masterHeightMm;
    }

    expect(heights.oval!).toBeGreaterThan(heights.round! * 1.2);
    expect(heights.rounded_square!).toBeCloseTo(26.0, 2);
  });

  it('generates Catalan Rhombic D12 with 12 congruent diamond faces summing opposites to 13 and clean SVG emblem', async () => {
    const project = createDefaultProjectState('standard');
    project.dice.d12.d12Variant = 'rhombic';
    project.typography.useHighFaceEmblem = true;

    const basePlanes = buildDieHalfSpaces(project.dice.d12);
    const baseFaces = clipHalfSpaces(basePlanes);
    expect(baseFaces).toHaveLength(12);
    for (const f of baseFaces) {
      expect(f.vertices3D).toHaveLength(4);
    }

    // Verify all 6 antipodal pairs sum to 13
    for (let i = 0; i < baseFaces.length; i++) {
      const a = baseFaces[i];
      const opp = baseFaces.find(
        (b) =>
          b.normal[0] * a.normal[0] + b.normal[1] * a.normal[1] + b.normal[2] * a.normal[2] < -0.99,
      );
      expect(opp, `antipodal face for ${a.faceLabel}`).toBeDefined();
      expect(Number(a.faceLabel) + Number(opp!.faceLabel)).toBe(13);
    }

    const res = await generateDieGeometry('d12', project, defaultFont, {
      includeBlank: true,
      includeSupports: true,
    });
    expect(res.masterMesh.manifoldStatus).toBe('NoError');
    expect(res.blankMesh?.manifoldStatus).toBe('NoError');
    expect(res.supportMesh?.manifoldStatus).toBe('NoError');
    expect(res.breach.hasBreach).toBe(false);
  });

  it('generates odd-sided D5, D7 & D9 across Trapezohedron, Crystal Barrel, and Zocchi Prism styles with emblem support', async () => {
    const project = createDefaultProjectState('standard');
    const continuum = buildSetFromTemplate('continuum_12', project);
    project.dieOrder = continuum.dieOrder;
    project.dice = continuum.dice;
    project.typography.useHighFaceEmblem = true;

    const variants: OddDieVariant[] = ['trapezohedron', 'crystal', 'prism'];
    const oddKinds: Array<{ kind: 'd5' | 'd7' | 'd9'; n: number }> = [
      { kind: 'd5', n: 5 },
      { kind: 'd7', n: 7 },
      { kind: 'd9', n: 9 },
    ];

    for (const { kind, n } of oddKinds) {
      for (const variant of variants) {
        project.dice[kind].oddVariant = variant;
        const planes = buildDieHalfSpaces(project.dice[kind]);
        const faces = clipHalfSpaces(planes);
        const numbered = faces.filter((f) => f.isNumbered);
        expect(numbered, `${kind}:${variant} numbered face count`).toHaveLength(
          variant === 'prism' ? n : 2 * n,
        );

        if (variant !== 'prism') {
          for (const f of numbered) {
            const opp = numbered.find(
              (o) => o.normal[0] * f.normal[0] + o.normal[1] * f.normal[1] + o.normal[2] * f.normal[2] < -0.99,
            );
            expect(opp, `${kind}:${variant} opposite for ${f.faceLabel}`).toBeDefined();
            expect(Number(f.faceLabel) + Number(opp!.faceLabel)).toBe(n + 1);
          }
        }

        const res = await generateDieGeometry(kind, project, defaultFont, {
          includeBlank: true,
          includeSupports: false,
        });
        expect(res.masterMesh.manifoldStatus, `${kind}:${variant} master`).toBe('NoError');
        expect(res.blankMesh?.manifoldStatus, `${kind}:${variant} blank`).toBe('NoError');
        expect(res.breach.hasBreach, `${kind}:${variant} breach`).toBe(false);
      }
    }
  });

  it('generates D6, D8, D10/D00, and D12 additional shape variants with watertight CSG', async () => {
    const project = createDefaultProjectState('standard');

    const d6Variants: D6Variant[] = ['cube', 'rhombic', 'truncated', 'crystal'];
    for (const v of d6Variants) {
      project.dice.d6.d6Variant = v;
      const res = await generateDieGeometry('d6', project, defaultFont, {
        includeBlank: true,
        includeSupports: false,
      });
      expect(res.masterMesh.manifoldStatus, `d6:${v}`).toBe('NoError');
      expect(res.blankMesh?.manifoldStatus, `d6:${v} blank`).toBe('NoError');
      expect(res.breach.hasBreach, `d6:${v} breach`).toBe(false);
    }

    const d8Variants: D8Variant[] = ['octahedron', 'shard', 'crystal'];
    for (const v of d8Variants) {
      project.dice.d8.d8Variant = v;
      const res = await generateDieGeometry('d8', project, defaultFont, {
        includeBlank: true,
        includeSupports: false,
      });
      expect(res.masterMesh.manifoldStatus, `d8:${v}`).toBe('NoError');
      expect(res.blankMesh?.manifoldStatus, `d8:${v} blank`).toBe('NoError');
      expect(res.breach.hasBreach, `d8:${v} breach`).toBe(false);
    }

    const d10Variants: D10Variant[] = ['trapezohedron', 'crystal'];
    for (const v of d10Variants) {
      project.dice.d10.d10Variant = v;
      project.dice.d00.d10Variant = v;
      const res10 = await generateDieGeometry('d10', project, defaultFont, {
        includeBlank: true,
        includeSupports: false,
      });
      const res00 = await generateDieGeometry('d00', project, defaultFont, {
        includeBlank: true,
        includeSupports: false,
      });
      expect(res10.masterMesh.manifoldStatus, `d10:${v}`).toBe('NoError');
      expect(res00.masterMesh.manifoldStatus, `d00:${v}`).toBe('NoError');
      expect(res10.breach.hasBreach, `d10:${v} breach`).toBe(false);
      expect(res00.breach.hasBreach, `d00:${v} breach`).toBe(false);
    }

    const d12Variants: D12Variant[] = ['pentagonal', 'rhombic', 'crystal'];
    for (const v of d12Variants) {
      project.dice.d12.d12Variant = v;
      const res = await generateDieGeometry('d12', project, defaultFont, {
        includeBlank: true,
        includeSupports: false,
      });
      expect(res.masterMesh.manifoldStatus, `d12:${v}`).toBe('NoError');
      expect(res.blankMesh?.manifoldStatus, `d12:${v} blank`).toBe('NoError');
      expect(res.breach.hasBreach, `d12:${v} breach`).toBe(false);
    }
  });

  it('builds Coin + Twin D6/D20 10-Set, Rhombic 7-Set, Crystal 7-Set, DCC Odd-Chain, and 12-Shape Continuum templates', () => {
    const base = createDefaultProjectState('standard');

    const coinTwin = buildSetFromTemplate('coin_twin_10', base);
    expect(coinTwin.dieOrder).toEqual([
      'd2',
      'd4',
      'd6',
      'd6-2',
      'd8',
      'd10',
      'd00',
      'd12',
      'd20',
      'd20-2',
    ]);
    expect(coinTwin.dice.d6.customLabel).toBe('Logo');
    expect(coinTwin.dice.d6.useHighFaceEmblemOverride).toBe(true);
    expect(coinTwin.dice['d6-2'].customLabel).toBe('Numbers');
    expect(coinTwin.dice['d6-2'].useHighFaceEmblemOverride).toBe(false);
    expect(coinTwin.dice.d20.customLabel).toBe('Logo');
    expect(coinTwin.dice.d20.useHighFaceEmblemOverride).toBe(true);
    expect(coinTwin.dice['d20-2'].customLabel).toBe('Numbers');
    expect(coinTwin.dice['d20-2'].useHighFaceEmblemOverride).toBe(false);

    const rhombic = buildSetFromTemplate('rhombic_7', base);
    expect(rhombic.dice.d4.d4Variant).toBe('truncated');
    expect(rhombic.dice.d6.d6Variant).toBe('rhombic');
    expect(rhombic.dice.d12.d12Variant).toBe('rhombic');

    const crystal = buildSetFromTemplate('crystal_7', base);
    expect(crystal.dice.d4.d4Variant).toBe('crystal');
    expect(crystal.dice.d6.d6Variant).toBe('crystal');
    expect(crystal.dice.d8.d8Variant).toBe('crystal');
    expect(crystal.dice.d10.d10Variant).toBe('crystal');
    expect(crystal.dice.d00.d10Variant).toBe('crystal');
    expect(crystal.dice.d12.d12Variant).toBe('crystal');

    const dcc = buildSetFromTemplate('dcc_chain_10', base);
    expect(dcc.dieOrder).toEqual(['d3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd10', 'd00', 'd12', 'd20']);

    const continuum = buildSetFromTemplate('continuum_12', base);
    expect(continuum.dieOrder).toEqual(DIE_ORDER);
  });

  it('gates die deletions through requestRemoveDice / confirmRemoveDice / cancelRemoveDice and enforces 1-die minimum', async () => {
    const store = useDiceStore.getState();
    store.resetProject();
    await new Promise((r) => setTimeout(r, 20));

    expect(useDiceStore.getState().pendingRemoveDiceIds).toBeNull();
    expect(Object.keys(useDiceStore.getState().project.dice)).toContain('d6');

    useDiceStore.getState().requestRemoveDice(['d6']);
    expect(useDiceStore.getState().pendingRemoveDiceIds).toEqual(['d6']);
    expect(useDiceStore.getState().project.dice.d6).toBeDefined();

    useDiceStore.getState().cancelRemoveDice();
    expect(useDiceStore.getState().pendingRemoveDiceIds).toBeNull();
    expect(useDiceStore.getState().project.dice.d6).toBeDefined();

    useDiceStore.getState().requestRemoveDice(['d6', 'd8']);
    useDiceStore.getState().confirmRemoveDice();
    await new Promise((r) => setTimeout(r, 20));

    let afterConfirm = useDiceStore.getState();
    expect(afterConfirm.pendingRemoveDiceIds).toBeNull();
    expect(afterConfirm.project.dice.d6).toBeUndefined();
    expect(afterConfirm.project.dice.d8).toBeUndefined();
    expect(afterConfirm.canUndo).toBe(true);

    afterConfirm.undo();
    await new Promise((r) => setTimeout(r, 20));
    expect(useDiceStore.getState().project.dice.d6).toBeDefined();
    expect(useDiceStore.getState().project.dice.d8).toBeDefined();

    // Selecting every die and confirming leaves the primary active die in place
    const allIds = getProjectDieOrder(useDiceStore.getState().project);
    const activeKeeper = useDiceStore.getState().project.activeDie;
    useDiceStore.getState().requestRemoveDice(allIds);
    useDiceStore.getState().confirmRemoveDice();
    await new Promise((r) => setTimeout(r, 20));

    afterConfirm = useDiceStore.getState();
    const remaining = getProjectDieOrder(afterConfirm.project);
    expect(remaining).toEqual([activeKeeper]);

    // Attempting to remove the last remaining die does not open confirmation modal
    useDiceStore.getState().requestRemoveDice([activeKeeper]);
    expect(useDiceStore.getState().pendingRemoveDiceIds).toBeNull();
    expect(useDiceStore.getState().statusMessage).toBe('At least 1 die must remain in the set.');
  });

  it('aligns number placements around the equator on D4 prism, arch, D3 prism, and crystal barrel dice', async () => {
    for (const preset of ['standard', 'mini', 'chonk'] as const) {
      const d4 = createDefaultDieSettings('d4', preset);
      d4.d4Variant = 'crystal';
      const faces = clipHalfSpaces(buildDieHalfSpaces(d4)).filter((f) => f.isNumbered);
      expect(faces).toHaveLength(4);
      for (const f of faces) {
        expect(Math.abs(f.origin3D[2])).toBeLessThan(1e-6);
        expect(f.inradius2D).toBeCloseTo(d4.sizeMm * 0.5, 4);
      }
    }

    for (let tenths = 170; tenths <= 210; tenths++) {
      const d4 = createDefaultDieSettings('d4', 'standard');
      d4.d4Variant = 'crystal';
      d4.sizeMm = tenths / 10;
      const faces = clipHalfSpaces(buildDieHalfSpaces(d4)).filter((f) => f.isNumbered);
      expect(faces).toHaveLength(4);
      for (const f of faces) {
        expect(Math.abs(f.origin3D[2]), `d4 crystal ${d4.sizeMm}mm ${f.id}`).toBeLessThan(1e-6);
        expect(f.inradius2D).toBeCloseTo(d4.sizeMm * 0.5, 4);
      }
    }

    const equatorialBeltChecks: Array<{ label: string; die: ReturnType<typeof createDefaultDieSettings> }> = [
      { label: 'd4 arch', die: { ...createDefaultDieSettings('d4', 'standard'), d4Variant: 'arch' } },
      { label: 'd3 truncated_barrel', die: { ...createDefaultDieSettings('d3', 'standard'), d3Variant: 'truncated_barrel' } },
      { label: 'd3 rounded_prism', die: { ...createDefaultDieSettings('d3', 'standard'), d3Variant: 'rounded_prism' } },
      { label: 'd6 crystal', die: { ...createDefaultDieSettings('d6', 'standard'), d6Variant: 'crystal' } },
      { label: 'd7 crystal', die: { ...createDefaultDieSettings('d7', 'standard'), oddVariant: 'crystal' } },
      { label: 'd8 crystal', die: { ...createDefaultDieSettings('d8', 'standard'), d8Variant: 'crystal' } },
      { label: 'd10 crystal', die: { ...createDefaultDieSettings('d10', 'standard'), d10Variant: 'crystal' } },
      { label: 'd12 crystal', die: { ...createDefaultDieSettings('d12', 'standard'), d12Variant: 'crystal' } },
    ];

    for (const check of equatorialBeltChecks) {
      const faces = clipHalfSpaces(buildDieHalfSpaces(check.die)).filter((f) => f.isNumbered);
      expect(faces.length, check.label).toBeGreaterThanOrEqual(3);
      for (const f of faces) {
        expect(Math.abs(f.origin3D[2]), `${check.label} ${f.id}`).toBeLessThan(1e-6);
      }
    }

    const d4Pendulum = { ...createDefaultDieSettings('d4', 'standard'), d4Variant: 'pendulum' as const };
    const pendulumFaces = clipHalfSpaces(buildDieHalfSpaces(d4Pendulum)).filter((f) => f.isNumbered);
    expect(pendulumFaces).toHaveLength(4);
    for (const f of pendulumFaces) {
      expect(Math.abs(f.origin3D[2] - pendulumFaces[0].origin3D[2])).toBeLessThan(1e-4);
    }

    const d10Trap = { ...createDefaultDieSettings('d10', 'standard'), d10Variant: 'trapezohedron' as const };
    const d10Faces = clipHalfSpaces(buildDieHalfSpaces(d10Trap)).filter((f) => f.isNumbered);
    expect(d10Faces).toHaveLength(10);
    const refAbsZ = Math.abs(d10Faces[0].origin3D[2]);
    for (const f of d10Faces) {
      expect(Math.abs(Math.abs(f.origin3D[2]) - refAbsZ)).toBeLessThan(1e-4);
    }

    for (const variant of ['crystal', 'arch'] as const) {
      const project = createDefaultProjectState('standard');
      project.dice.d4.d4Variant = variant;
      const res = await generateDieGeometry('d4', project, defaultFont, {
        includeBlank: true,
        includeSupports: false,
      });
      expect(res.masterMesh.manifoldStatus, `d4:${variant} master`).toBe('NoError');
      expect(res.breach.hasBreach, `d4:${variant} breach`).toBe(false);
    }
  });

  it('orients and centers numbers symmetrically across all 12 dice and polyhedral variants', () => {
    const mirrorErrX = (pts: [number, number][]): number =>
      Math.max(
        ...pts.map(([x, y]) =>
          Math.min(...pts.map(([vx, vy]) => Math.hypot(vx + x, vy - y))),
        ),
      );
    const mirrorErrY = (pts: [number, number][]): number =>
      Math.max(
        ...pts.map(([x, y]) =>
          Math.min(...pts.map(([vx, vy]) => Math.hypot(vx - x, vy + y))),
        ),
      );

    const checkFacesXSymmetric = (label: string, settings: ReturnType<typeof createDefaultDieSettings>, requireUprightApex = false) => {
      const faces = clipHalfSpaces(buildDieHalfSpaces(settings)).filter((f) => f.isNumbered);
      expect(faces.length, `${label} has numbered faces`).toBeGreaterThan(0);
      for (const f of faces) {
        expect(mirrorErrX(f.vertices2D), `${label} ${f.id} X-mirror`).toBeLessThanOrEqual(0.02);
        expect(Math.abs(f.opticalCenter2D[0]), `${label} ${f.id} opticalCenter X`).toBeLessThanOrEqual(0.02);
        if (requireUprightApex) {
          const ys = f.vertices2D.map(([, y]) => y);
          const minY = Math.min(...ys);
          const maxY = Math.max(...ys);
          expect(maxY, `${label} ${f.id} upright apex`).toBeGreaterThan(Math.abs(minY) + 0.5);
        }
      }
    };

    for (const v of ['round', 'oval', 'rounded_square', 'hexagon', 'octagon', 'shield'] as const) {
      const s = createDefaultDieSettings('d2');
      s.d2Variant = v;
      checkFacesXSymmetric(`d2:${v}`, s);
    }

    for (const v of ['truncated_barrel', 'rounded_prism'] as const) {
      const s = createDefaultDieSettings('d3');
      s.d3Variant = v;
      checkFacesXSymmetric(`d3:${v}`, s);
    }

    for (const v of ['classic_vertex', 'classic_base', 'crystal', 'arch', 'pendulum', 'truncated'] as const) {
      const s = createDefaultDieSettings('d4');
      s.d4Variant = v;
      const upright = v === 'classic_vertex' || v === 'classic_base' || v === 'truncated';
      checkFacesXSymmetric(`d4:${v}`, s, upright);
    }

    for (const kind of ['d5', 'd7', 'd9'] as const) {
      for (const v of ['trapezohedron', 'crystal', 'prism'] as const) {
        const s = createDefaultDieSettings(kind);
        s.oddVariant = v;
        if (v === 'prism') {
          const faces = clipHalfSpaces(buildDieHalfSpaces(s)).filter((f) => f.isNumbered);
          const capSide = String(Number(kind.slice(1)));
          for (const f of faces) {
            expect(mirrorErrX(f.vertices2D), `${kind}:prism ${f.id} X-mirror`).toBeLessThanOrEqual(0.02);
            expect(Math.abs(f.opticalCenter2D[0]), `${kind}:prism ${f.id} opticalCenter X`).toBeLessThanOrEqual(0.02);
            if (f.id === 'face_1' || f.id === `face_${capSide}`) {
              const ys = f.vertices2D.map(([, y]) => y);
              expect(Math.max(...ys), `${kind}:prism ${f.id} upright cap`).toBeGreaterThan(
                Math.abs(Math.min(...ys)) + 0.5,
              );
            }
          }
        } else {
          checkFacesXSymmetric(`${kind}:${v}`, s);
        }
      }
    }

    for (const v of ['cube', 'rhombic', 'truncated', 'crystal'] as const) {
      const s = createDefaultDieSettings('d6');
      s.d6Variant = v;
      checkFacesXSymmetric(`d6:${v}`, s);
    }

    for (const v of ['octahedron', 'shard', 'crystal'] as const) {
      const s = createDefaultDieSettings('d8');
      s.d8Variant = v;
      checkFacesXSymmetric(`d8:${v}`, s, v === 'octahedron' || v === 'shard');
    }

    for (const v of ['trapezohedron', 'crystal'] as const) {
      const s10 = createDefaultDieSettings('d10');
      s10.d10Variant = v;
      checkFacesXSymmetric(`d10:${v}`, s10);

      const s00h = createDefaultDieSettings('d00');
      s00h.d10Variant = v;
      s00h.d00Orientation = 'horizontal';
      checkFacesXSymmetric(`d00:h:${v}`, s00h);
    }

    {
      const s00v = createDefaultDieSettings('d00');
      s00v.d10Variant = 'trapezohedron';
      s00v.d00Orientation = 'vertical';
      const faces = clipHalfSpaces(buildDieHalfSpaces(s00v)).filter((f) => f.isNumbered);
      expect(faces.length).toBe(10);
      const refXs = faces[0].vertices2D.map(([x]) => x);
      const refMinX = Math.min(...refXs);
      const refMaxX = Math.max(...refXs);
      for (const f of faces) {
        expect(mirrorErrY(f.vertices2D), `d00:v ${f.id} Y-mirror`).toBeLessThanOrEqual(0.02);
        expect(Math.abs(f.opticalCenter2D[1]), `d00:v ${f.id} opticalCenter Y`).toBeLessThanOrEqual(0.02);
        const xs = f.vertices2D.map(([x]) => x);
        expect(Math.min(...xs), `d00:v ${f.id} minX`).toBeCloseTo(refMinX, 1);
        expect(Math.max(...xs), `d00:v ${f.id} maxX`).toBeCloseTo(refMaxX, 1);
      }
    }

    for (const v of ['pentagonal', 'rhombic', 'crystal'] as const) {
      const s = createDefaultDieSettings('d12');
      s.d12Variant = v;
      checkFacesXSymmetric(`d12:${v}`, s, v === 'pentagonal');
    }

    for (const layout of ['balanced', 'spindown'] as const) {
      const s = createDefaultDieSettings('d20');
      s.d20Numbering = layout;
      checkFacesXSymmetric(`d20:${layout}`, s, true);
    }
  });

  it('supports All-Faces context menu state and batch face rotation, scale, offset, and content actions', () => {
    useDiceStore.getState().resetProject();
    useDiceStore.getState().selectDie('d6', { forceSingle: true });
    useDiceStore.getState().setSelectedFaceId('face_1');

    const d6FaceIds = ['face_1', 'face_2', 'face_3', 'face_4', 'face_5', 'face_6'];
    useDiceStore.getState().openAllFacesContextMenu('d6', d6FaceIds, 180, 96, false);

    let state = useDiceStore.getState();
    expect(state.project.selectedFaceId).toBeNull();
    expect(state.selectedFaceId).toBeNull();
    expect(state.contextMenu).toMatchObject({
      kind: 'all-faces',
      dieId: 'd6',
      faceIds: d6FaceIds,
      clientX: 180,
      clientY: 96,
      openedViaKeyboard: false,
    });

    // Rotate all faces +90°, then another +90° (180°), then reset-rotation (prunes no-op overrides)
    useDiceStore.getState().batchUpdateAllFaces('d6', d6FaceIds, { type: 'rotate', deltaDeg: 90 });
    expect(useDiceStore.getState().project.dice.d6.faceOverrides.face_1?.rotationDeg).toBe(90);
    expect(Object.keys(useDiceStore.getState().project.dice.d6.faceOverrides)).toHaveLength(6);

    useDiceStore.getState().batchUpdateAllFaces('d6', d6FaceIds, { type: 'reset-rotation' });
    expect(useDiceStore.getState().project.dice.d6.faceOverrides).toEqual({});

    // Undo restores the 90° rotation snapshot
    useDiceStore.getState().undo();
    expect(useDiceStore.getState().project.dice.d6.faceOverrides.face_6?.rotationDeg).toBe(90);

    // Scale die clamping + reset-scale clearing both die fontScaleMultiplier and face scaleMultiplier
    useDiceStore.getState().updateFaceOverride('d6', 'face_2', { scaleMultiplier: 1.35 });
    useDiceStore.getState().batchUpdateAllFaces('d6', d6FaceIds, { type: 'scale-die', multiplier: 2.0 });
    expect(useDiceStore.getState().project.dice.d6.fontScaleMultiplier).toBe(1.5);
    useDiceStore.getState().batchUpdateAllFaces('d6', d6FaceIds, { type: 'scale-die', multiplier: 0.1 });
    expect(useDiceStore.getState().project.dice.d6.fontScaleMultiplier).toBe(0.5);
    useDiceStore.getState().batchUpdateAllFaces('d6', d6FaceIds, { type: 'reset-scale' });
    state = useDiceStore.getState();
    expect(state.project.dice.d6.fontScaleMultiplier).toBe(1.0);
    expect(state.project.dice.d6.faceOverrides.face_2?.scaleMultiplier).toBe(1);

    // Center offsets across faces & clear custom content (svgId omitted / undefined, never null)
    useDiceStore.getState().updateFaceOverride('d6', 'face_3', {
      offsetXMm: 1.5,
      offsetYMm: -0.75,
    });
    useDiceStore.getState().updateFaceOverride('d6', 'face_6', {
      customText: 'CRIT',
      svgId: 'dice-chaos-emblem',
    });
    useDiceStore.getState().batchUpdateAllFaces('d6', d6FaceIds, { type: 'center-offsets' });
    expect(useDiceStore.getState().project.dice.d6.faceOverrides.face_3).toEqual({
      scaleMultiplier: 1,
      offsetXMm: 0,
      offsetYMm: 0,
      rotationDeg: 90,
    });

    useDiceStore.getState().batchUpdateAllFaces('d6', d6FaceIds, { type: 'clear-custom-content' });
    state = useDiceStore.getState();
    expect(state.project.dice.d6.faceOverrides.face_6).toBeDefined();
    expect(state.project.dice.d6.faceOverrides.face_6?.customText).toBeUndefined();
    expect(state.project.dice.d6.faceOverrides.face_6?.svgId).toBeUndefined();
    expect('svgId' in (state.project.dice.d6.faceOverrides.face_6 ?? {})).toBe(false);

    // Reset all face overrides
    useDiceStore.getState().batchUpdateAllFaces('d6', d6FaceIds, { type: 'scale-die', multiplier: 1.2 });
    useDiceStore.getState().batchUpdateAllFaces('d6', d6FaceIds, { type: 'reset-all' });
    state = useDiceStore.getState();
    expect(state.project.dice.d6.fontScaleMultiplier).toBe(1.0);
    expect(state.project.dice.d6.faceOverrides).toEqual({});
  });

  it('packages web/preview exports as a .zip without invoking showDirectoryPicker and supports cancelBatchExport', async () => {
    const winDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
    let pickerCalled = false;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: {
        showDirectoryPicker: async () => {
          pickerCalled = true;
          throw new Error('showDirectoryPicker should not be called in web/preview mode');
        },
      },
    });

    try {
      const result = await exportBundleToDisk('PreviewSet_Masters', [
        { relativePath: 'Masters/D20_Master.stl', bytes: new Uint8Array([1, 2, 3, 4]) },
        { relativePath: 'Caliper_Specs.md', bytes: new TextEncoder().encode('# Specs') },
      ]);
      expect(pickerCalled).toBe(false);
      expect(result.downloadFilename).toBe('PreviewSet_Masters.zip');
      expect(result.mimeType).toBe('application/zip');
      expect(result.downloadBytes).toBeDefined();

      const zip = await JSZip.loadAsync(result.downloadBytes!);
      expect(zip.file('Masters/D20_Master.stl')).not.toBeNull();
      expect(zip.file('Caliper_Specs.md')).not.toBeNull();
      const extractedBytes = await zip.file('Masters/D20_Master.stl')!.async('uint8array');
      expect(Array.from(extractedBytes)).toEqual([1, 2, 3, 4]);
      const extractedSpec = await zip.file('Caliper_Specs.md')!.async('string');
      expect(extractedSpec).toBe('# Specs');
    } finally {
      if (winDescriptor) {
        Object.defineProperty(globalThis, 'window', winDescriptor);
      } else {
        delete (globalThis as Record<string, unknown>).window;
      }
    }

    useDiceStore.getState().resetProject();
    useDiceStore.setState({
      isExporting: true,
      exportProgress: {
        currentStep: 3,
        totalSteps: 3,
        label: 'Writing Caliper Specs & packaging...',
      },
      exportError: 'stale',
    });
    useDiceStore.getState().cancelBatchExport();
    const afterCancel = useDiceStore.getState();
    expect(afterCancel.isExporting).toBe(false);
    expect(afterCancel.exportProgress).toBeNull();
    expect(afterCancel.exportError).toBeNull();
    expect(afterCancel.statusMessage).toBe('Export canceled.');
  });
});
