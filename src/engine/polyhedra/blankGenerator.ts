import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import type {
  BlankBreachReport,
  BlankConfig,
  DieSettings,
  HalfSpacePlane,
} from '../../types/dice';
import { applyEdgeChamfers, buildManifoldFromFaces, clipHalfSpaces } from './halfspace';

/**
 * Offsets every non-chamfer half-space plane inward along its normal by:
 *   offset = engravingDepthMm + clearanceMm
 * Preserves exact shell wall thickness on asymmetric shapes (Coins, Prisms, Crystal/Arch D4s).
 */
export function buildBlankHalfSpaces(
  masterBasePlanes: HalfSpacePlane[],
  engravingDepthMm: number,
  clearanceMm: number,
  bubbleBevelMm: number,
): HalfSpacePlane[] {
  const totalInset = Math.max(0.05, engravingDepthMm + clearanceMm);

  const insetPlanes: HalfSpacePlane[] = masterBasePlanes
    .filter((p) => p.role !== 'chamfer')
    .map((plane) => ({
      ...plane,
      distance: Math.max(0.4, plane.distance - totalInset),
      isNumbered: false,
    }));

  if (bubbleBevelMm > 0.005) {
    return applyEdgeChamfers(insetPlanes, bubbleBevelMm);
  }
  return insetPlanes;
}

export function getEffectiveBlankClearance(
  settings: DieSettings,
  blankConfig: BlankConfig,
): number {
  return settings.blankClearanceOverrideMm ?? blankConfig.clearanceMm;
}

/**
 * Builds the matched insert blank Manifold and performs a 3D boolean intersection check
 * against the master's engraving cutters to guarantee zero shell breaches.
 */
export function generateMatchedBlank(
  wasm: ManifoldToplevel,
  masterBasePlanes: HalfSpacePlane[],
  engravingCutterUnion: Manifold | null,
  engravingDepthMm: number,
  clearanceMm: number,
  bubbleBevelMm: number,
): { blankManifold: Manifold; breach: BlankBreachReport } {
  const blankPlanes = buildBlankHalfSpaces(
    masterBasePlanes,
    engravingDepthMm,
    clearanceMm,
    bubbleBevelMm,
  );
  const blankFaces = clipHalfSpaces(blankPlanes);
  const blankManifold = buildManifoldFromFaces(wasm, blankFaces);

  let breachVolumeMm3 = 0;
  let hasBreach = false;

  if (engravingCutterUnion && !engravingCutterUnion.isEmpty()) {
    const intersection = blankManifold.intersect(engravingCutterUnion);
    breachVolumeMm3 = intersection.volume();
    intersection.delete();
    hasBreach = breachVolumeMm3 > 1e-4;
  }

  return {
    blankManifold,
    breach: {
      hasBreach,
      breachVolumeMm3,
      minimumWallClearanceMm: clearanceMm,
      blankFitsInsideMaster: !hasBreach && clearanceMm >= 0,
    },
  };
}
