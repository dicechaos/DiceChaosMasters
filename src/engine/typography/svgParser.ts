import type { Vec2 } from '../../types/dice';

type Mat2D = [number, number, number, number, number, number]; // [a, b, c, d, e, f]

const IDENTITY: Mat2D = [1, 0, 0, 1, 0, 0];

function mulMat2D(m1: Mat2D, m2: Mat2D): Mat2D {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function applyMat2D(m: Mat2D, pt: Vec2): Vec2 {
  return [m[0] * pt[0] + m[2] * pt[1] + m[4], m[1] * pt[0] + m[3] * pt[1] + m[5]];
}

function parseTransformAttr(attr?: string): Mat2D {
  if (!attr) return IDENTITY;
  let result: Mat2D = [...IDENTITY];
  const fnRegex = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = fnRegex.exec(attr)) !== null) {
    const fn = match[1].toLowerCase();
    const nums = match[2]
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);

    let m: Mat2D = IDENTITY;
    if (fn === 'translate') {
      m = [1, 0, 0, 1, nums[0] ?? 0, nums[1] ?? 0];
    } else if (fn === 'scale') {
      const sx = nums[0] ?? 1;
      const sy = nums[1] ?? sx;
      m = [sx, 0, 0, sy, 0, 0];
    } else if (fn === 'rotate') {
      const a = ((nums[0] ?? 0) * Math.PI) / 180;
      const cx = nums[1] ?? 0;
      const cy = nums[2] ?? 0;
      const c = Math.cos(a);
      const s = Math.sin(a);
      m = mulMat2D(
        [1, 0, 0, 1, cx, cy],
        mulMat2D([c, s, -s, c, 0, 0], [1, 0, 0, 1, -cx, -cy]),
      );
    } else if (fn === 'matrix' && nums.length >= 6) {
      m = [nums[0], nums[1], nums[2], nums[3], nums[4], nums[5]];
    }
    result = mulMat2D(result, m);
  }
  return result;
}

function flattenQuad(p0: Vec2, p1: Vec2, p2: Vec2, out: Vec2[], tol = 0.25, depth = 0): void {
  const mx = 0.25 * p0[0] + 0.5 * p1[0] + 0.25 * p2[0];
  const my = 0.25 * p0[1] + 0.5 * p1[1] + 0.25 * p2[1];
  const lx = 0.5 * (p0[0] + p2[0]);
  const ly = 0.5 * (p0[1] + p2[1]);
  if (depth >= 8 || Math.hypot(mx - lx, my - ly) <= tol) {
    out.push(p2);
    return;
  }
  const p01: Vec2 = [0.5 * (p0[0] + p1[0]), 0.5 * (p0[1] + p1[1])];
  const p12: Vec2 = [0.5 * (p1[0] + p2[0]), 0.5 * (p1[1] + p2[1])];
  const p012: Vec2 = [0.5 * (p01[0] + p12[0]), 0.5 * (p01[1] + p12[1])];
  flattenQuad(p0, p01, p012, out, tol, depth + 1);
  flattenQuad(p012, p12, p2, out, tol, depth + 1);
}

function flattenCubic(
  p0: Vec2,
  p1: Vec2,
  p2: Vec2,
  p3: Vec2,
  out: Vec2[],
  tol = 0.25,
  depth = 0,
): void {
  const dx = p3[0] - p0[0];
  const dy = p3[1] - p0[1];
  const len = Math.hypot(dx, dy) || 1;
  const d1 = Math.abs((p1[0] - p3[0]) * dy - (p1[1] - p3[1]) * dx) / len;
  const d2 = Math.abs((p2[0] - p3[0]) * dy - (p2[1] - p3[1]) * dx) / len;
  if (depth >= 8 || (d1 <= tol && d2 <= tol)) {
    out.push(p3);
    return;
  }
  const p01: Vec2 = [0.5 * (p0[0] + p1[0]), 0.5 * (p0[1] + p1[1])];
  const p12: Vec2 = [0.5 * (p1[0] + p2[0]), 0.5 * (p1[1] + p2[1])];
  const p23: Vec2 = [0.5 * (p2[0] + p3[0]), 0.5 * (p2[1] + p3[1])];
  const p012: Vec2 = [0.5 * (p01[0] + p12[0]), 0.5 * (p01[1] + p12[1])];
  const p123: Vec2 = [0.5 * (p12[0] + p23[0]), 0.5 * (p12[1] + p23[1])];
  const p0123: Vec2 = [0.5 * (p012[0] + p123[0]), 0.5 * (p012[1] + p123[1])];
  flattenCubic(p0, p01, p012, p0123, out, tol, depth + 1);
  flattenCubic(p0123, p123, p23, p3, out, tol, depth + 1);
}

function flattenSvgArc(
  p0: Vec2,
  rxIn: number,
  ryIn: number,
  xAxisRotDeg: number,
  largeArc: number,
  sweep: number,
  p1: Vec2,
  out: Vec2[],
): void {
  if (Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) < 1e-6) return;
  if (rxIn === 0 || ryIn === 0) {
    out.push(p1);
    return;
  }
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  const phi = (xAxisRotDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx2 = (p0[0] - p1[0]) * 0.5;
  const dy2 = (p0[1] - p1[1]) * 0.5;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) {
    const s = Math.sqrt(lam);
    rx *= s;
    ry *= s;
  }

  const rx2 = rx * rx;
  const ry2 = ry * ry;
  const num = Math.max(0, rx2 * ry2 - rx2 * y1p * y1p - ry2 * x1p * x1p);
  const den = rx2 * y1p * y1p + ry2 * x1p * x1p;
  const factor = (largeArc === sweep ? -1 : 1) * Math.sqrt(den > 1e-12 ? num / den : 0);
  const cxp = (factor * rx * y1p) / ry;
  const cyp = (-factor * ry * x1p) / rx;

  const cx = cosPhi * cxp - sinPhi * cyp + (p0[0] + p1[0]) * 0.5;
  const cy = sinPhi * cxp + cosPhi * cyp + (p0[1] + p1[1]) * 0.5;

  const vecAngle = (ux: number, uy: number, vx: number, vy: number) => {
    const sign = ux * vy - uy * vx < 0 ? -1 : 1;
    const dot = Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1)));
    return sign * Math.acos(dot);
  };

  const theta1 = vecAngle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = vecAngle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweep && dTheta < 0) dTheta += 2 * Math.PI;

  const steps = Math.max(8, Math.ceil((Math.abs(dTheta) / (Math.PI * 2)) * 48));
  for (let i = 1; i <= steps; i++) {
    const t = theta1 + (dTheta * i) / steps;
    const xp = rx * Math.cos(t);
    const yp = ry * Math.sin(t);
    out.push([cosPhi * xp - sinPhi * yp + cx, sinPhi * xp + cosPhi * yp + cy]);
  }
}

function parseSvgPathData(d: string, tol: number): Vec2[][] {
  const polygons: Vec2[][] = [];
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];

  let i = 0;
  let cmd = '';
  let curr: Vec2 = [0, 0];
  let start: Vec2 = [0, 0];
  let lastCtrl: Vec2 | null = null;
  let lastCmd = '';
  let activePoly: Vec2[] = [];

  const nextNum = () => Number(tokens[i++] ?? 0);
  const hasNum = () => i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i]);

  const flushPoly = () => {
    if (activePoly.length >= 3) {
      polygons.push(activePoly);
    }
    activePoly = [];
  };

  while (i < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[i])) {
      cmd = tokens[i++];
    } else if (cmd === 'M') {
      cmd = 'L';
    } else if (cmd === 'm') {
      cmd = 'l';
    }

    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();

    if (C === 'Z') {
      flushPoly();
      curr = [...start];
      lastCtrl = null;
      lastCmd = C;
      continue;
    }

    if (!hasNum()) break;

    switch (C) {
      case 'M': {
        flushPoly();
        const x = nextNum() + (rel ? curr[0] : 0);
        const y = nextNum() + (rel ? curr[1] : 0);
        curr = [x, y];
        start = [x, y];
        activePoly.push([x, y]);
        lastCtrl = null;
        cmd = rel ? 'l' : 'L';
        break;
      }
      case 'L': {
        const x = nextNum() + (rel ? curr[0] : 0);
        const y = nextNum() + (rel ? curr[1] : 0);
        curr = [x, y];
        activePoly.push([x, y]);
        lastCtrl = null;
        break;
      }
      case 'H': {
        const x = nextNum() + (rel ? curr[0] : 0);
        curr = [x, curr[1]];
        activePoly.push([...curr]);
        lastCtrl = null;
        break;
      }
      case 'V': {
        const y = nextNum() + (rel ? curr[1] : 0);
        curr = [curr[0], y];
        activePoly.push([...curr]);
        lastCtrl = null;
        break;
      }
      case 'C': {
        const x1 = nextNum() + (rel ? curr[0] : 0);
        const y1 = nextNum() + (rel ? curr[1] : 0);
        const x2 = nextNum() + (rel ? curr[0] : 0);
        const y2 = nextNum() + (rel ? curr[1] : 0);
        const x = nextNum() + (rel ? curr[0] : 0);
        const y = nextNum() + (rel ? curr[1] : 0);
        flattenCubic(curr, [x1, y1], [x2, y2], [x, y], activePoly, tol);
        lastCtrl = [x2, y2];
        curr = [x, y];
        break;
      }
      case 'S': {
        const x1: number = (lastCmd === 'C' || lastCmd === 'S') && lastCtrl
          ? 2 * curr[0] - lastCtrl[0]
          : curr[0];
        const y1: number = (lastCmd === 'C' || lastCmd === 'S') && lastCtrl
          ? 2 * curr[1] - lastCtrl[1]
          : curr[1];
        const x2: number = nextNum() + (rel ? curr[0] : 0);
        const y2: number = nextNum() + (rel ? curr[1] : 0);
        const x: number = nextNum() + (rel ? curr[0] : 0);
        const y: number = nextNum() + (rel ? curr[1] : 0);
        flattenCubic(curr, [x1, y1], [x2, y2], [x, y], activePoly, tol);
        lastCtrl = [x2, y2];
        curr = [x, y];
        break;
      }
      case 'Q': {
        const x1 = nextNum() + (rel ? curr[0] : 0);
        const y1 = nextNum() + (rel ? curr[1] : 0);
        const x = nextNum() + (rel ? curr[0] : 0);
        const y = nextNum() + (rel ? curr[1] : 0);
        flattenQuad(curr, [x1, y1], [x, y], activePoly, tol);
        lastCtrl = [x1, y1];
        curr = [x, y];
        break;
      }
      case 'T': {
        const x1: number = (lastCmd === 'Q' || lastCmd === 'T') && lastCtrl
          ? 2 * curr[0] - lastCtrl[0]
          : curr[0];
        const y1: number = (lastCmd === 'Q' || lastCmd === 'T') && lastCtrl
          ? 2 * curr[1] - lastCtrl[1]
          : curr[1];
        const x = nextNum() + (rel ? curr[0] : 0);
        const y = nextNum() + (rel ? curr[1] : 0);
        flattenQuad(curr, [x1, y1], [x, y], activePoly, tol);
        lastCtrl = [x1, y1];
        curr = [x, y];
        break;
      }
      case 'A': {
        const rx = nextNum();
        const ry = nextNum();
        const rot = nextNum();
        const large = nextNum();
        const sweep = nextNum();
        const x = nextNum() + (rel ? curr[0] : 0);
        const y = nextNum() + (rel ? curr[1] : 0);
        flattenSvgArc(curr, rx, ry, rot, large, sweep, [x, y], activePoly);
        curr = [x, y];
        lastCtrl = null;
        break;
      }
      default:
        i++;
        break;
    }
    lastCmd = C;
  }

  flushPoly();
  return polygons;
}

function getAttr(attrs: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(attrs);
  return m ? (m[1] ?? m[2]) : undefined;
}

function parsePointsAttr(pointsStr: string): Vec2[] {
  const nums = pointsStr
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);
  const pts: Vec2[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    pts.push([nums[i], nums[i + 1]]);
  }
  return pts;
}

/**
 * Parses an SVG string into normalized, centered 2D polygons (max extent = 1.0, +Y up).
 * Pure TypeScript implementation (safe in Web Workers and Node).
 */
export function parseSvgToNormalizedPolygons(svgText: string): Vec2[][] {
  const viewBoxMatch = /viewBox\s*=\s*["']([^"']+)["']/i.exec(svgText);
  let tol = 0.2;
  if (viewBoxMatch) {
    const vb = viewBoxMatch[1].trim().split(/[\s,]+/).map(Number);
    if (vb.length >= 4 && vb[2] > 0) {
      tol = Math.max(0.005, Math.max(vb[2], vb[3]) / 250);
    }
  }

  const rawPolygons: Vec2[][] = [];
  const transformStack: Mat2D[] = [IDENTITY];
  const tagRegex = /<\/?([a-zA-Z0-9:_-]+)([^>]*?)(\/?)>/g;

  let m: RegExpExecArray | null;
  while ((m = tagRegex.exec(svgText)) !== null) {
    const full = m[0];
    const tag = m[1].toLowerCase();
    const attrs = m[2];
    const selfClosing = m[3] === '/';
    const isClosing = full.startsWith('</');

    if (isClosing) {
      if (tag === 'g' && transformStack.length > 1) {
        transformStack.pop();
      }
      continue;
    }

    const localMat = parseTransformAttr(getAttr(attrs, 'transform'));
    const curMat = mulMat2D(transformStack[transformStack.length - 1], localMat);

    if (tag === 'g') {
      if (!selfClosing) transformStack.push(curMat);
      continue;
    }

    const pushTransformed = (poly: Vec2[]) => {
      if (poly.length >= 3) {
        rawPolygons.push(poly.map((p) => applyMat2D(curMat, p)));
      }
    };

    if (tag === 'path') {
      const d = getAttr(attrs, 'd');
      if (d) {
        for (const p of parseSvgPathData(d, tol)) {
          pushTransformed(p);
        }
      }
    } else if (tag === 'polygon' || tag === 'polyline') {
      const ptsAttr = getAttr(attrs, 'points');
      if (ptsAttr) pushTransformed(parsePointsAttr(ptsAttr));
    } else if (tag === 'rect') {
      const x = Number(getAttr(attrs, 'x') ?? 0);
      const y = Number(getAttr(attrs, 'y') ?? 0);
      const w = Number(getAttr(attrs, 'width') ?? 0);
      const h = Number(getAttr(attrs, 'height') ?? 0);
      if (w > 0 && h > 0) {
        pushTransformed([
          [x, y],
          [x + w, y],
          [x + w, y + h],
          [x, y + h],
        ]);
      }
    } else if (tag === 'circle' || tag === 'ellipse') {
      const cx = Number(getAttr(attrs, 'cx') ?? 0);
      const cy = Number(getAttr(attrs, 'cy') ?? 0);
      const rx = Number(getAttr(attrs, tag === 'circle' ? 'r' : 'rx') ?? 0);
      const ry = Number(getAttr(attrs, tag === 'circle' ? 'r' : 'ry') ?? 0);
      if (rx > 0 && ry > 0) {
        const pts: Vec2[] = [];
        const steps = 40;
        for (let s = 0; s < steps; s++) {
          const a = (2 * Math.PI * s) / steps;
          pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
        }
        pushTransformed(pts);
      }
    }
  }

  if (rawPolygons.length === 0) return [];

  // Normalize to centered unit square (max span = 1.0) and flip SVG Y-down -> CAD Y-up
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const poly of rawPolygons) {
    for (const [x, y] of poly) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  const span = Math.max(maxX - minX, maxY - minY, 1e-6);

  return rawPolygons.map((poly) =>
    poly.map(([x, y]) => [(x - cx) / span, -(y - cy) / span] as Vec2),
  );
}
