import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import type { Font } from 'opentype.js';
import type {
  ClippedFace,
  DieSettings,
  SvgAsset,
  TypographyConfig,
  Vec2,
} from '../../types/dice';
import { mat4FromBasis } from '../manifoldInstance';
import { textToPolygonsMm } from './glyphBuilder';
import { parseSvgToNormalizedPolygons } from './svgParser';

const SURFACE_PROTRUSION_MM = 0.06;

function rotateAndTranslatePolygons(
  polys: Vec2[][],
  scale: number,
  rotRad: number,
  tx: number,
  ty: number,
): Vec2[][] {
  const c = Math.cos(rotRad);
  const s = Math.sin(rotRad);
  return polys.map((poly) =>
    poly.map(([x, y]) => {
      const sx = x * scale;
      const sy = y * scale;
      return [sx * c - sy * s + tx, sx * s + sy * c + ty] as Vec2;
    }),
  );
}

/**
 * Generates an anti-tear drafted 3D engraving cutter in local face coordinates
 * where Z=0 is the outer die face, Z=-depthMm is the inner pit floor, and Z=+0.06 protrudes
 * cleanly past the outer surface for watertight CSG subtraction.
 */
export function buildDraftedCutter(
  wasm: ManifoldToplevel,
  contours: Vec2[][],
  depthMm: number,
  draftAngleDeg: number,
  fillRule: 'NonZero' | 'EvenOdd' = 'EvenOdd',
): Manifold | null {
  if (contours.length === 0 || depthMm <= 0.05) return null;

  const baseSection: CrossSection = new wasm.CrossSection(contours, fillRule);
  if (baseSection.isEmpty()) {
    baseSection.delete();
    return null;
  }

  if (draftAngleDeg <= 0.2) {
    const solid = wasm.Manifold.extrude(baseSection, depthMm + SURFACE_PROTRUSION_MM);
    baseSection.delete();
    const shifted = solid.translate([0, 0, -depthMm]);
    solid.delete();
    return shifted;
  }

  const tanTheta = Math.tan((Math.min(25, draftAngleDeg) * Math.PI) / 180);
  const maxStepHorizMm = 0.018;
  const numSteps = Math.max(6, Math.min(24, Math.ceil((depthMm * tanTheta) / maxStepHorizMm)));
  const dz = depthMm / numSteps;
  const slabs: Manifold[] = [];

  // Surface cap slab [-0.01, +SURFACE_PROTRUSION_MM]
  const cap = wasm.Manifold.extrude(baseSection, SURFACE_PROTRUSION_MM + 0.01).translate([
    0,
    0,
    -0.01,
  ]);
  slabs.push(cap);

  for (let step = 0; step < numSteps; step++) {
    // Midpoint inward inset depth from surface
    const zFromSurface = (step + 0.5) * dz;
    const insetDelta = -(zFromSurface * tanTheta);
    const offsetSection = baseSection.offset(insetDelta, 'Round', 2.0, 32);
    if (offsetSection.isEmpty()) {
      offsetSection.delete();
      continue;
    }

    const slabBottomZ = -(step + 1) * dz;
    const overlap = 0.008;
    const slab = wasm.Manifold.extrude(offsetSection, dz + overlap).translate([
      0,
      0,
      slabBottomZ,
    ]);
    offsetSection.delete();
    slabs.push(slab);
  }

  baseSection.delete();
  if (slabs.length === 0) return null;

  const unioned = slabs.length === 1 ? slabs[0] : wasm.Manifold.union(slabs);
  if (slabs.length > 1) {
    for (const s of slabs) s.delete();
  }
  return unioned;
}

function getHighFaceNumber(settings: DieSettings): string {
  switch (settings.kind) {
    case 'd2':
      return '2';
    case 'd3':
      return '3';
    case 'd4':
      return '4';
    case 'd5':
      return '5';
    case 'd6':
      return '6';
    case 'd7':
      return '7';
    case 'd8':
      return '8';
    case 'd9':
      return '9';
    case 'd10':
      return settings.d10Numbering === '1_10' ? '10' : '9';
    case 'd00':
      return '00';
    case 'd12':
      return '12';
    case 'd20':
      return '20';
  }
}

/**
 * Generates and positions all face engraving cutters for an entire die in world coordinates.
 * Returns the unioned cutter Manifold (caller owns and must `.delete()` it).
 */
export function buildDieEngravingCutters(
  wasm: ManifoldToplevel,
  faces: ClippedFace[],
  settings: DieSettings,
  typography: TypographyConfig,
  font: Font,
  svgAssets: SvgAsset[],
): Manifold | null {
  const highFaceText = getHighFaceNumber(settings);
  const svgPolysCache = new Map<string, Vec2[][]>();

  const getSvgPolys = (svgId: string): Vec2[][] => {
    let cached = svgPolysCache.get(svgId);
    if (!cached) {
      const asset = svgAssets.find((a) => a.id === svgId);
      cached = asset ? parseSvgToNormalizedPolygons(asset.svgContent) : [];
      svgPolysCache.set(svgId, cached);
    }
    return cached;
  };

  const cutters: Manifold[] = [];
  const scaleRatio = (typography.fontScalePct / 100) * settings.fontScaleMultiplier;

  for (const face of faces) {
    if (!face.isNumbered) continue;

    // Classic Vertex/Base D4 carries 3 sub-labels per face
    if (face.subLabels && face.subLabels.length > 0) {
      const baseHeight = face.inradius2D * 1.15 * scaleRatio;
      for (const sub of face.subLabels) {
        const override = settings.faceOverrides[face.id];
        const labelText = sub.text;
        const heightMm = baseHeight * sub.scaleFactor * (override?.scaleMultiplier ?? 1);
        const rawPolys = textToPolygonsMm(
          font,
          labelText,
          heightMm,
          typography.twoDigitTrackingEm,
          typography.sixNineIndicator,
        );
        const tx = sub.offsetXFactor * face.inradius2D + (override?.offsetXMm ?? 0);
        const ty = sub.offsetYFactor * face.inradius2D + (override?.offsetYMm ?? 0);
        const rot = sub.rotationRad + ((override?.rotationDeg ?? 0) * Math.PI) / 180;
        const placedPolys = rotateAndTranslatePolygons(rawPolys, 1.0, rot, tx, ty);

        const localCutter = buildDraftedCutter(
          wasm,
          placedPolys,
          typography.engravingDepthMm,
          typography.draftAngleDeg,
          'NonZero',
        );
        if (localCutter) {
          const m = mat4FromBasis(
            face.tangentRight,
            face.tangentUp,
            face.normal,
            face.origin3D,
          );
          const worldCutter = localCutter.transform(m);
          localCutter.delete();
          cutters.push(worldCutter);
        }
      }
      continue;
    }

    const override = settings.faceOverrides[face.id];
    const labelText = override?.customText ?? face.faceLabel ?? '';
    const useHighSvg =
      !override?.svgId &&
      typography.useHighFaceEmblem &&
      face.faceLabel === highFaceText &&
      Boolean(typography.highFaceSvgId);

    const activeSvgId =
      override?.svgId === null ? null : override?.svgId ?? (useHighSvg ? typography.highFaceSvgId : null);

    const userScale = override?.scaleMultiplier ?? 1.0;
    const rotRad = ((override?.rotationDeg ?? 0) * Math.PI) / 180;
    const tx = override?.offsetXMm ?? 0;
    const ty = override?.offsetYMm ?? 0;

    let facePolys: Vec2[][] = [];
    let fillRule: 'NonZero' | 'EvenOdd' = 'NonZero';

    if (activeSvgId) {
      const unitSvg = getSvgPolys(activeSvgId);
      if (unitSvg.length > 0) {
        const targetSpan = face.inradius2D * 1.48 * scaleRatio * userScale;
        facePolys = rotateAndTranslatePolygons(unitSvg, targetSpan, rotRad, tx, ty);
        fillRule = 'EvenOdd';
      }
    }

    if (facePolys.length === 0 && labelText) {
      // Slightly scale down multi-character numbers ("10".."20", "00".."90") to sit comfortably inside kites/triangles
      const multiCharShrink = labelText.length >= 2 ? 0.82 : 1.0;
      const targetHeight = face.inradius2D * 1.25 * scaleRatio * multiCharShrink * userScale;
      const glyphPolys = textToPolygonsMm(
        font,
        labelText,
        targetHeight,
        typography.twoDigitTrackingEm,
        typography.sixNineIndicator,
      );
      facePolys = rotateAndTranslatePolygons(glyphPolys, 1.0, rotRad, tx, ty);
      fillRule = 'NonZero';
    }

    if (facePolys.length === 0) continue;

    const localCutter = buildDraftedCutter(
      wasm,
      facePolys,
      typography.engravingDepthMm,
      typography.draftAngleDeg,
      fillRule,
    );
    if (localCutter) {
      const m = mat4FromBasis(face.tangentRight, face.tangentUp, face.normal, face.origin3D);
      const worldCutter = localCutter.transform(m);
      localCutter.delete();
      cutters.push(worldCutter);
    }
  }

  if (cutters.length === 0) return null;
  if (cutters.length === 1) return cutters[0];
  const unioned = wasm.Manifold.union(cutters);
  for (const c of cutters) c.delete();
  return unioned;
}
