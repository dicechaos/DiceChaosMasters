import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import type { ClippedFace, SupportConfig, Vec2, Vec3 } from '../types/dice';
import { len3, mat4RotationFromZToVector, sub3 } from './manifoldInstance';
import { extractPolyhedronEdges } from './polyhedra/halfspace';

/**
 * Computes a convex hull of 2D XY points using Andrew's monotone chain algorithm.
 */
function convexHull2D(points: Vec2[]): Vec2[] {
  if (points.length <= 3) return points;
  const sorted = [...points].sort((a, b) => (a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]));
  const cross = (o: Vec2, a: Vec2, b: Vec2) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const lower: Vec2[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

/**
 * Picks the optimal downward orientation direction (preferring the vertex farthest from origin
 * so dice orient point-down cleanly for MSLA resin printing).
 */
function findPointDownDirection(faces: ClippedFace[]): Vec3 {
  let bestVert: Vec3 = [0, 0, -1];
  let bestScore = -Infinity;

  for (const face of faces) {
    for (const v of face.vertices3D) {
      const r = len3(v);
      // Slight tie-breaker preferring vertices already near -Z so orientation feels natural
      const score = r - v[2] * 0.001;
      if (score > bestScore) {
        bestScore = score;
        bestVert = v;
      }
    }
  }
  return bestVert;
}

/**
 * Orients the die point-down and adds parametric sacrificial edge bumpers, vertical fin supports,
 * and a 45-degree beveled build-plate raft. Returns `{ combined, supportOnly }` Manifolds.
 */
export function generatePointDownSupports(
  wasm: ManifoldToplevel,
  dieManifold: Manifold,
  baseFaces: ClippedFace[],
  config: SupportConfig,
): { orientedDie: Manifold; supportOnly: Manifold; combined: Manifold } {
  const downDir = config.pointDown ? findPointDownDirection(baseFaces) : ([0, 0, -1] as Vec3);
  const { mat4, rotatePoint } = mat4RotationFromZToVector(downDir);

  const rotatedFaces = baseFaces.map((f) => ({
    ...f,
    vertices3D: f.vertices3D.map(rotatePoint),
  }));

  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const f of rotatedFaces) {
    for (const v of f.vertices3D) {
      if (v[2] < minZ) minZ = v[2];
      if (v[2] > maxZ) maxZ = v[2];
    }
  }

  const liftZ = config.raftThicknessMm + config.liftHeightMm - minZ;
  const orientedDie = dieManifold.transform(mat4).translate([0, 0, liftZ]);

  const edges = extractPolyhedronEdges(rotatedFaces);
  const lowestZAfterLift = minZ + liftZ;
  const dieHeight = Math.max(1, maxZ - minZ);
  const supportCutoffZ = lowestZAfterLift + dieHeight * 0.48;

  const supportParts: Manifold[] = [];
  const raftFootprintPts: Vec2[] = [];

  for (const edge of edges) {
    const a: Vec3 = [edge.a[0], edge.a[1], edge.a[2] + liftZ];
    const b: Vec3 = [edge.b[0], edge.b[1], edge.b[2] + liftZ];
    const zMinEdge = Math.min(a[2], b[2]);
    const zMaxEdge = Math.max(a[2], b[2]);

    // Support lower-hemisphere edges whose lowest end sits below midpoint
    if (zMinEdge > supportCutoffZ) continue;
    const edgeLen = len3(sub3(b, a));
    if (edgeLen < 0.8) continue;

    // Trim top end if edge crosses above cutoff
    let pStart = a;
    let pEnd = b;
    if (zMaxEdge > supportCutoffZ) {
      const low = a[2] <= b[2] ? a : b;
      const high = a[2] <= b[2] ? b : a;
      const t = (supportCutoffZ - low[2]) / Math.max(1e-4, high[2] - low[2]);
      pStart = low;
      pEnd = [
        low[0] + (high[0] - low[0]) * t,
        low[1] + (high[1] - low[1]) * t,
        low[2] + (high[2] - low[2]) * t,
      ];
    }

    const dx = pEnd[0] - pStart[0];
    const dy = pEnd[1] - pStart[1];
    const horizLen = Math.hypot(dx, dy);

    // Compute lateral direction perpendicular to edge in XY
    const perpXY: Vec2 =
      horizLen > 0.1
        ? [-dy / horizLen, dx / horizLen]
        : [1, 0];

    const halfContact = Math.max(0.08, config.bumperContactWidthMm * 0.5);
    const halfFin = Math.max(0.2, config.finThicknessMm * 0.5);
    const gap = Math.max(0, config.bumperGapMm);
    const bladeDrop = 0.85;
    const embed = gap > 0.01 ? -gap : 0.08;

    const addSegmentPrism = (
      p0: Vec3,
      p1: Vec3,
      bottomZ0: number,
      bottomZ1: number,
      halfWidth: number,
    ) => {
      const hullPts: Vec3[] = [
        [p0[0] + perpXY[0] * halfWidth, p0[1] + perpXY[1] * halfWidth, p0[2]],
        [p0[0] - perpXY[0] * halfWidth, p0[1] - perpXY[1] * halfWidth, p0[2]],
        [p1[0] + perpXY[0] * halfWidth, p1[1] + perpXY[1] * halfWidth, p1[2]],
        [p1[0] - perpXY[0] * halfWidth, p1[1] - perpXY[1] * halfWidth, p1[2]],
        [p0[0] + perpXY[0] * halfWidth, p0[1] + perpXY[1] * halfWidth, bottomZ0],
        [p0[0] - perpXY[0] * halfWidth, p0[1] - perpXY[1] * halfWidth, bottomZ0],
        [p1[0] + perpXY[0] * halfWidth, p1[1] + perpXY[1] * halfWidth, bottomZ1],
        [p1[0] - perpXY[0] * halfWidth, p1[1] - perpXY[1] * halfWidth, bottomZ1],
      ];
      const prism = wasm.Manifold.hull(hullPts);
      supportParts.push(prism);
    };

    // Sacrificial edge contact bumper blade hugging the ridge
    const top0: Vec3 = [pStart[0], pStart[1], pStart[2] + embed];
    const top1: Vec3 = [pEnd[0], pEnd[1], pEnd[2] + embed];
    const midZ0 = Math.max(config.raftThicknessMm + 0.2, pStart[2] - bladeDrop);
    const midZ1 = Math.max(config.raftThicknessMm + 0.2, pEnd[2] - bladeDrop);
    addSegmentPrism(top0, top1, midZ0, midZ1, halfContact);

    // Thick structural fin curtain dropping down to raft top
    addSegmentPrism(
      [pStart[0], pStart[1], midZ0 + 0.05],
      [pEnd[0], pEnd[1], midZ1 + 0.05],
      config.raftThicknessMm - 0.1,
      config.raftThicknessMm - 0.1,
      halfFin,
    );

    raftFootprintPts.push([pStart[0], pStart[1]], [pEnd[0], pEnd[1]]);
  }

  // Fallback pedestal pillar directly under lowest vertex if footprint is empty (e.g. flat Coin)
  if (raftFootprintPts.length === 0) {
    raftFootprintPts.push([-4, -4], [4, -4], [4, 4], [-4, 4]);
    const pillar = wasm.Manifold.cylinder(
      config.liftHeightMm + 0.2,
      1.2,
      0.5,
      24,
      false,
    ).translate([0, 0, config.raftThicknessMm - 0.1]);
    supportParts.push(pillar);
  }

  // Build beveled build-plate raft (minZ strictly === 0.0)
  const hull2D = convexHull2D(raftFootprintPts);
  const raftSection = new wasm.CrossSection([hull2D], 'EvenOdd').offset(2.6, 'Round', 2.0, 16);
  const innerRaftSection = raftSection.offset(-0.6, 'Round', 2.0, 16);
  const raftTopRaw = wasm.Manifold.extrude(
    raftSection,
    Math.max(0.4, config.raftThicknessMm - 0.5),
  );
  const raftTop = raftTopRaw.translate([0, 0, 0.5]);
  raftTopRaw.delete();

  const b0 = wasm.Manifold.extrude(innerRaftSection.isEmpty() ? raftSection : innerRaftSection, 0.05);
  const b1Raw = wasm.Manifold.extrude(raftSection, 0.05);
  const b1 = b1Raw.translate([0, 0, 0.5]);
  const raftBevel = wasm.Manifold.hull([b0, b1]);
  b0.delete();
  b1Raw.delete();
  b1.delete();
  raftSection.delete();
  innerRaftSection.delete();
  supportParts.push(raftTop, raftBevel);

  const supportOnly = wasm.Manifold.union(supportParts);
  for (const part of supportParts) part.delete();

  const combined = wasm.Manifold.union([orientedDie, supportOnly]);
  return { orientedDie, supportOnly, combined };
}
