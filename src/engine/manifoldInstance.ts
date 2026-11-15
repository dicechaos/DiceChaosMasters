import Module from 'manifold-3d';
import type { ManifoldToplevel } from 'manifold-3d';
import type { Mat4, Vec2, Vec3 } from '../types/dice';

let cachedWasmPromise: Promise<ManifoldToplevel> | null = null;

/**
 * Initializes the manifold-3d WASM module once per JS context (main, worker, or Node test).
 * Always invokes `wasm.setup()` before resolving.
 */
export async function getManifold(): Promise<ManifoldToplevel> {
  if (!cachedWasmPromise) {
    cachedWasmPromise = (async () => {
      const isNode =
        typeof process !== 'undefined' &&
        typeof process.versions?.node === 'string' &&
        typeof window === 'undefined';

      let wasm: ManifoldToplevel;
      if (isNode) {
        wasm = await Module();
      } else {
        const wasmModule = await import('manifold-3d/manifold.wasm?url');
        const rawUrl = wasmModule.default;
        const resolveWasmUrl = (): string => {
          if (/^(data:|blob:|https?:|file:)/i.test(rawUrl)) {
            return rawUrl;
          }
          if (typeof self !== 'undefined' && self.location) {
            const baseHref = self.location.href;
            const cleanRel = rawUrl.replace(/^\.?\//, '');
            const assetsMarker = '/assets/';
            const markerIdx = baseHref.lastIndexOf(assetsMarker);
            if (baseHref.startsWith('file:') && markerIdx !== -1 && cleanRel.startsWith('assets/')) {
              return baseHref.slice(0, markerIdx + 1) + cleanRel;
            }
            return new URL(rawUrl, baseHref).toString();
          }
          return rawUrl;
        };
        wasm = await Module({
          locateFile: () => resolveWasmUrl(),
        });
      }
      wasm.setup();
      return wasm;
    })();
  }
  return cachedWasmPromise;
}

export function add3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale3(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

export function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross3(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function len3(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

export function normalize3(v: Vec3): Vec3 {
  const l = len3(v);
  if (l < 1e-12) return [0, 0, 1];
  return [v[0] / l, v[1] / l, v[2] / l];
}

export function dist2(a: Vec2, b: Vec2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/**
 * Builds a column-major 4x4 affine matrix mapping local (u, v, n) frame + origin
 * into world 3D coordinates, matching `Manifold.transform(m)`.
 */
export function mat4FromBasis(u: Vec3, v: Vec3, n: Vec3, origin: Vec3): Mat4 {
  return [
    u[0], u[1], u[2], 0,
    v[0], v[1], v[2], 0,
    n[0], n[1], n[2], 0,
    origin[0], origin[1], origin[2], 1,
  ];
}

/**
 * Builds a column-major rotation+translation matrix from a 3x3 column basis + translation.
 */
export function mat4RotationFromZToVector(targetDownWorldDir: Vec3): {
  mat4: Mat4;
  rotatePoint: (p: Vec3) => Vec3;
} {
  // Rotate `targetDownWorldDir` to (0, 0, -1)
  const from = normalize3(targetDownWorldDir);
  const to: Vec3 = [0, 0, -1];
  const d = Math.max(-1, Math.min(1, dot3(from, to)));

  let r00 = 1, r01 = 0, r02 = 0;
  let r10 = 0, r11 = 1, r12 = 0;
  let r20 = 0, r21 = 0, r22 = 1;

  if (d < -0.999999) {
    // 180 deg rotation around X axis
    r11 = -1;
    r22 = -1;
  } else if (d < 0.999999) {
    const axis = normalize3(cross3(from, to));
    const angle = Math.acos(d);
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const t = 1 - c;
    const [x, y, z] = axis;
    r00 = t * x * x + c;
    r01 = t * x * y - z * s;
    r02 = t * x * z + y * s;
    r10 = t * x * y + z * s;
    r11 = t * y * y + c;
    r12 = t * y * z - x * s;
    r20 = t * x * z - y * s;
    r21 = t * y * z + x * s;
    r22 = t * z * z + c;
  }

  const mat4: Mat4 = [
    r00, r10, r20, 0,
    r01, r11, r21, 0,
    r02, r12, r22, 0,
    0, 0, 0, 1,
  ];

  const rotatePoint = (p: Vec3): Vec3 => [
    r00 * p[0] + r01 * p[1] + r02 * p[2],
    r10 * p[0] + r11 * p[1] + r12 * p[2],
    r20 * p[0] + r21 * p[1] + r22 * p[2],
  ];

  return { mat4, rotatePoint };
}
