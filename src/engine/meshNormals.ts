import type { MeshBufferData } from '../types/dice';

/**
 * Dihedral angle threshold (degrees) for separating sharp polyhedral edges and
 * engraving rims from smoothly curved barrel/arch facets (`<= 12 deg` in definitions.ts).
 */
export const DEFAULT_CREASE_ANGLE_DEG = 15;

/**
 * Expands a welded indexed mesh into a non-indexed display buffer with crease-split normals.
 * Preserves welded `MeshBufferData` for watertight `.3mf`/`.stl` exports while ensuring `0 mm`
 * hard edges, bevel seams, and engraved pockets render crisply in Three.js without Gouraud bleed.
 */
export function computeCreaseNormalsBuffer(
  mesh: Pick<MeshBufferData, 'positions' | 'indices' | 'triangleCount'>,
  creaseAngleDeg = DEFAULT_CREASE_ANGLE_DEG,
): { positions: Float32Array; normals: Float32Array } {
  const numTri = mesh.triangleCount;
  if (numTri <= 0 || mesh.positions.length < 9 || mesh.indices.length < 3) {
    return {
      positions: new Float32Array(0),
      normals: new Float32Array(0),
    };
  }

  const pos = mesh.positions;
  const idx = mesh.indices;
  const numVert = Math.floor(pos.length / 3);
  const cosCrease = Math.cos((creaseAngleDeg * Math.PI) / 180);

  const triUnitNormals = new Float32Array(numTri * 3);
  const triAreaNormals = new Float32Array(numTri * 3);
  const vertHead = new Int32Array(numVert).fill(-1);
  const cornerNext = new Int32Array(numTri * 3).fill(-1);

  // Pass 1: compute per-triangle area-weighted + unit normals and build vertex->corner adjacency
  for (let t = 0; t < numTri; t++) {
    const c0 = t * 3;
    const i0 = idx[c0];
    const i1 = idx[c0 + 1];
    const i2 = idx[c0 + 2];

    const p0x = pos[i0 * 3];
    const p0y = pos[i0 * 3 + 1];
    const p0z = pos[i0 * 3 + 2];

    const ux = pos[i1 * 3] - p0x;
    const uy = pos[i1 * 3 + 1] - p0y;
    const uz = pos[i1 * 3 + 2] - p0z;

    const vx = pos[i2 * 3] - p0x;
    const vy = pos[i2 * 3 + 1] - p0y;
    const vz = pos[i2 * 3 + 2] - p0z;

    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;

    const len = Math.hypot(nx, ny, nz);
    if (len > 1e-12) {
      triAreaNormals[c0] = nx;
      triAreaNormals[c0 + 1] = ny;
      triAreaNormals[c0 + 2] = nz;
      triUnitNormals[c0] = nx / len;
      triUnitNormals[c0 + 1] = ny / len;
      triUnitNormals[c0 + 2] = nz / len;
    } else {
      triUnitNormals[c0 + 2] = 1;
    }

    if (i0 < numVert) {
      cornerNext[c0] = vertHead[i0];
      vertHead[i0] = c0;
    }
    if (i1 < numVert) {
      cornerNext[c0 + 1] = vertHead[i1];
      vertHead[i1] = c0 + 1;
    }
    if (i2 < numVert) {
      cornerNext[c0 + 2] = vertHead[i2];
      vertHead[i2] = c0 + 2;
    }
  }

  // Pass 2: emit unrolled display positions and accumulate incident normals within crease threshold
  const outPositions = new Float32Array(numTri * 9);
  const outNormals = new Float32Array(numTri * 9);

  for (let t = 0; t < numTri; t++) {
    const tBase = t * 3;
    const ntx = triUnitNormals[tBase];
    const nty = triUnitNormals[tBase + 1];
    const ntz = triUnitNormals[tBase + 2];

    for (let k = 0; k < 3; k++) {
      const vIdx = idx[tBase + k];
      const outBase = (tBase + k) * 3;
      const vBase = vIdx * 3;

      outPositions[outBase] = pos[vBase];
      outPositions[outBase + 1] = pos[vBase + 1];
      outPositions[outBase + 2] = pos[vBase + 2];

      let accX = 0;
      let accY = 0;
      let accZ = 0;
      let cursor = vIdx < numVert ? vertHead[vIdx] : -1;

      while (cursor !== -1) {
        const otherTriBase = Math.floor(cursor / 3) * 3;
        const dot =
          ntx * triUnitNormals[otherTriBase] +
          nty * triUnitNormals[otherTriBase + 1] +
          ntz * triUnitNormals[otherTriBase + 2];

        if (dot >= cosCrease) {
          accX += triAreaNormals[otherTriBase];
          accY += triAreaNormals[otherTriBase + 1];
          accZ += triAreaNormals[otherTriBase + 2];
        }
        cursor = cornerNext[cursor];
      }

      const accLen = Math.hypot(accX, accY, accZ);
      if (accLen > 1e-12) {
        outNormals[outBase] = accX / accLen;
        outNormals[outBase + 1] = accY / accLen;
        outNormals[outBase + 2] = accZ / accLen;
      } else {
        outNormals[outBase] = ntx;
        outNormals[outBase + 1] = nty;
        outNormals[outBase + 2] = ntz;
      }
    }
  }

  return { positions: outPositions, normals: outNormals };
}
