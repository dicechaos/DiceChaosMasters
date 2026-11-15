import type { MeshBufferData } from '../../types/dice';

/**
 * Encodes a MeshBufferData into a compact binary little-endian STL buffer (millimeters).
 * Format: 80-byte header + uint32 triangle count + 50 bytes per triangle.
 */
export function encodeBinaryStl(mesh: MeshBufferData, headerTitle = 'Dice Chaos Masters STL'): Uint8Array {
  const numTris = mesh.triangleCount;
  const byteLength = 84 + numTris * 50;
  const buffer = new ArrayBuffer(byteLength);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  const label = `${headerTitle} | units=mm | dicechaos.com`;
  for (let i = 0; i < Math.min(79, label.length); i++) {
    bytes[i] = label.charCodeAt(i);
  }

  view.setUint32(80, numTris, true);

  const pos = mesh.positions;
  const idx = mesh.indices;

  for (let t = 0; t < numTris; t++) {
    const offset = 84 + t * 50;
    const i0 = idx[t * 3] * 3;
    const i1 = idx[t * 3 + 1] * 3;
    const i2 = idx[t * 3 + 2] * 3;

    const ax = pos[i0];
    const ay = pos[i0 + 1];
    const az = pos[i0 + 2];
    const bx = pos[i1];
    const by = pos[i1 + 1];
    const bz = pos[i1 + 2];
    const cx = pos[i2];
    const cy = pos[i2 + 1];
    const cz = pos[i2 + 2];

    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;

    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;

    view.setFloat32(offset, nx, true);
    view.setFloat32(offset + 4, ny, true);
    view.setFloat32(offset + 8, nz, true);

    view.setFloat32(offset + 12, ax, true);
    view.setFloat32(offset + 16, ay, true);
    view.setFloat32(offset + 20, az, true);

    view.setFloat32(offset + 24, bx, true);
    view.setFloat32(offset + 28, by, true);
    view.setFloat32(offset + 32, bz, true);

    view.setFloat32(offset + 36, cx, true);
    view.setFloat32(offset + 40, cy, true);
    view.setFloat32(offset + 44, cz, true);

    view.setUint16(offset + 48, 0, true);
  }

  return bytes;
}
