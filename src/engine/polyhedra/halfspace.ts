import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import type { ClippedFace, HalfSpacePlane, Vec2, Vec3 } from '../../types/dice';
import { add3, cross3, dot3, len3, normalize3, scale3, sub3 } from '../manifoldInstance';

const EPS = 1e-6;

function buildFaceBasis(normal: Vec3, upHint?: Vec3): { u: Vec3; v: Vec3 } {
  const n = normalize3(normal);
  let ref: Vec3 = upHint ? [...upHint] : [0, 0, 1];
  if (Math.abs(dot3(n, normalize3(ref))) > 0.985) {
    ref = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  }
  const projV = sub3(ref, scale3(n, dot3(ref, n)));
  const vInit = normalize3(projV);
  const u = normalize3(cross3(vInit, n));
  const v = normalize3(cross3(n, u));
  return { u, v };
}

function clipPolygonByPlane(poly: Vec3[], plane: HalfSpacePlane): Vec3[] {
  if (poly.length === 0) return [];
  const out: Vec3[] = [];
  const n = plane.normal;
  const d = plane.distance;

  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const da = dot3(n, a) - d;
    const db = dot3(n, b) - d;
    const aIn = da <= EPS;
    const bIn = db <= EPS;

    if (aIn && bIn) {
      out.push(b);
    } else if (aIn && !bIn) {
      const t = da / (da - db);
      out.push(add3(a, scale3(sub3(b, a), t)));
    } else if (!aIn && bIn) {
      const t = da / (da - db);
      out.push(add3(a, scale3(sub3(b, a), t)));
      out.push(b);
    }
  }

  // Deduplicate adjacent vertices
  const clean: Vec3[] = [];
  for (const p of out) {
    if (clean.length === 0 || len3(sub3(p, clean[clean.length - 1])) > 1e-5) {
      clean.push(p);
    }
  }
  if (clean.length > 1 && len3(sub3(clean[0], clean[clean.length - 1])) <= 1e-5) {
    clean.pop();
  }
  return clean;
}

function computePolygonAreaCentroid2D(pts: Vec2[]): Vec2 {
  let area2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    const cross = x0 * y1 - x1 * y0;
    area2 += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  if (Math.abs(area2) < 1e-9) {
    const sx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const sy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    return [sx, sy];
  }
  return [cx / (3 * area2), cy / (3 * area2)];
}

/**
 * Computes the minimum distance from a 2D point to the edges of a CCW convex polygon.
 */
function minEdgeSignedDistance(pt: Vec2, pts: Vec2[]): number {
  let minD = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const elen = Math.hypot(ex, ey);
    if (elen < 1e-9) continue;
    // Left-hand normal points inward for CCW polygon
    const dist = (ex * (pt[1] - a[1]) - ey * (pt[0] - a[0])) / elen;
    if (dist < minD) minD = dist;
  }
  return minD;
}

/**
 * Finds the exact inscribed-circle center ("optical center") and inradius for any CCW convex polygon.
 * Uses exact formula for triangles and fast hierarchical pole-of-inaccessibility refinement for >=4 sides.
 */
function computeOpticalIncircle(pts: Vec2[]): { center: Vec2; inradius: number } {
  if (pts.length === 3) {
    const [p0, p1, p2] = pts;
    const a = Math.hypot(p1[0] - p2[0], p1[1] - p2[1]);
    const b = Math.hypot(p2[0] - p0[0], p2[1] - p0[1]);
    const c = Math.hypot(p0[0] - p1[0], p0[1] - p1[1]);
    const perim = a + b + c;
    if (perim < 1e-9) return { center: p0, inradius: 0 };
    const cx = (a * p0[0] + b * p1[0] + c * p2[0]) / perim;
    const cy = (a * p0[1] + b * p1[1] + c * p2[1]) / perim;
    const area = Math.abs(
      (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]),
    ) * 0.5;
    return { center: [cx, cy], inradius: (2 * area) / perim };
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  let best = computePolygonAreaCentroid2D(pts);
  let bestDist = minEdgeSignedDistance(best, pts);

  // Hierarchical 5x5 local search around centroid/bounds
  let spanX = (maxX - minX) * 0.45;
  let spanY = (maxY - minY) * 0.45;
  for (let iter = 0; iter < 8; iter++) {
    const center = best;
    for (let ix = -2; ix <= 2; ix++) {
      for (let iy = -2; iy <= 2; iy++) {
        const cand: Vec2 = [center[0] + (ix * spanX) / 2, center[1] + (iy * spanY) / 2];
        const d = minEdgeSignedDistance(cand, pts);
        if (d > bestDist) {
          bestDist = d;
          best = cand;
        }
      }
    }
    spanX *= 0.48;
    spanY *= 0.48;
  }

  return { center: best, inradius: Math.max(0, bestDist) };
}

/**
 * Clips all half-space planes against one another using Sutherland-Hodgman clipping
 * to produce exact 3D faces, 2D polygons, and optical inscribed centers.
 */
export function clipHalfSpaces(planes: HalfSpacePlane[]): ClippedFace[] {
  const faces: ClippedFace[] = [];
  const bigR = 500;

  for (let i = 0; i < planes.length; i++) {
    const plane = planes[i];
    const n = normalize3(plane.normal);
    const { u, v } = buildFaceBasis(n, plane.upHint);
    const p0 = scale3(n, plane.distance);

    let poly: Vec3[] = [
      add3(p0, add3(scale3(u, -bigR), scale3(v, -bigR))),
      add3(p0, add3(scale3(u, bigR), scale3(v, -bigR))),
      add3(p0, add3(scale3(u, bigR), scale3(v, bigR))),
      add3(p0, add3(scale3(u, -bigR), scale3(v, bigR))),
    ];

    for (let j = 0; j < planes.length; j++) {
      if (i === j) continue;
      poly = clipPolygonByPlane(poly, planes[j]);
      if (poly.length < 3) break;
    }

    if (poly.length < 3) continue;

    // Project to 2D (u, v) relative to p0
    const raw2D: Vec2[] = poly.map((pt) => {
      const delta = sub3(pt, p0);
      return [dot3(delta, u), dot3(delta, v)];
    });

    // Ensure CCW winding in (u, v)
    let signedArea2 = 0;
    for (let k = 0; k < raw2D.length; k++) {
      const a = raw2D[k];
      const b = raw2D[(k + 1) % raw2D.length];
      signedArea2 += a[0] * b[1] - b[0] * a[1];
    }
    if (signedArea2 < 0) {
      poly.reverse();
      raw2D.reverse();
    }

    const { center, inradius } = computeOpticalIncircle(raw2D);
    if (inradius < 1e-4) continue;

    const centered2D: Vec2[] = raw2D.map(([x, y]) => [x - center[0], y - center[1]]);
    const origin3D = add3(p0, add3(scale3(u, center[0]), scale3(v, center[1])));

    faces.push({
      id: plane.id,
      normal: n,
      distance: plane.distance,
      role: plane.role,
      vertices3D: poly,
      vertices2D: centered2D,
      tangentRight: u,
      tangentUp: v,
      origin3D,
      inradius2D: inradius,
      opticalCenter2D: center,
      isNumbered: plane.isNumbered,
      faceLabel: plane.faceLabel,
      subLabels: plane.subLabels,
    });
  }

  return faces;
}

export interface PolyEdge {
  a: Vec3;
  b: Vec3;
  faceA: ClippedFace;
  faceB: ClippedFace;
}

/**
 * Extracts unique 3D edges along with the two adjacent clipped faces.
 */
export function extractPolyhedronEdges(faces: ClippedFace[]): PolyEdge[] {
  const vertexKey = (v: Vec3) =>
    `${Math.round(v[0] * 1000)},${Math.round(v[1] * 1000)},${Math.round(v[2] * 1000)}`;

  const edgeMap = new Map<string, { a: Vec3; b: Vec3; faceA: ClippedFace; faceB?: ClippedFace }>();

  for (const face of faces) {
    const verts = face.vertices3D;
    for (let i = 0; i < verts.length; i++) {
      const va = verts[i];
      const vb = verts[(i + 1) % verts.length];
      const ka = vertexKey(va);
      const kb = vertexKey(vb);
      if (ka === kb) continue;
      const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      const existing = edgeMap.get(key);
      if (!existing) {
        edgeMap.set(key, { a: va, b: vb, faceA: face });
      } else if (!existing.faceB && existing.faceA.id !== face.id) {
        existing.faceB = face;
      }
    }
  }

  const edges: PolyEdge[] = [];
  for (const item of edgeMap.values()) {
    if (item.faceB) {
      edges.push({ a: item.a, b: item.b, faceA: item.faceA, faceB: item.faceB });
    }
  }
  return edges;
}

/**
 * Appends exact edge-bevel half-space planes for crisp edges (skipping gentle curve facets).
 */
export function applyEdgeChamfers(
  planes: HalfSpacePlane[],
  chamferMm: number,
): HalfSpacePlane[] {
  if (chamferMm <= 0.005) return planes;

  const baseFaces = clipHalfSpaces(planes);
  const edges = extractPolyhedronEdges(baseFaces);
  const chamferPlanes: HalfSpacePlane[] = [];

  for (let idx = 0; idx < edges.length; idx++) {
    const edge = edges[idx];
    const cosAngle = dot3(edge.faceA.normal, edge.faceB.normal);
    // Skip smooth cylindrical/arch seam facets (< ~12 degrees)
    if (cosAngle > 0.978) continue;

    const sum = add3(edge.faceA.normal, edge.faceB.normal);
    if (len3(sum) < 1e-6) continue;

    const nBisect = normalize3(sum);
    const mid: Vec3 = [
      (edge.a[0] + edge.b[0]) * 0.5,
      (edge.a[1] + edge.b[1]) * 0.5,
      (edge.a[2] + edge.b[2]) * 0.5,
    ];
    const edgeDist = dot3(nBisect, mid);

    // Clamp chamfer depth so faces never collapse
    const maxSafe = Math.min(edge.faceA.inradius2D, edge.faceB.inradius2D) * 0.42;
    const clampedChamfer = Math.min(chamferMm, maxSafe);
    if (clampedChamfer <= 0.005) continue;

    chamferPlanes.push({
      id: `chamfer_${idx}`,
      normal: nBisect,
      distance: edgeDist - clampedChamfer,
      isNumbered: false,
      role: 'chamfer',
    });
  }

  return [...planes, ...chamferPlanes];
}

/**
 * Builds a strictly watertight convex Manifold from clipped faces via `Manifold.hull(points)`.
 */
export function buildManifoldFromFaces(
  wasm: ManifoldToplevel,
  faces: ClippedFace[],
): Manifold {
  const seen = new Set<string>();
  const points: Vec3[] = [];

  for (const face of faces) {
    for (const v of face.vertices3D) {
      const k = `${Math.round(v[0] * 10000)},${Math.round(v[1] * 10000)},${Math.round(v[2] * 10000)}`;
      if (!seen.has(k)) {
        seen.add(k);
        points.push(v);
      }
    }
  }

  return wasm.Manifold.hull(points);
}
