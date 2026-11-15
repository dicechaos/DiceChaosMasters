import { parse } from 'opentype.js';
import type { Font } from 'opentype.js';
import type { SixNineIndicator, Vec2 } from '../../types/dice';

export function parseFontBuffer(buffer: ArrayBuffer): Font {
  return parse(buffer);
}

function flattenQuad(p0: Vec2, p1: Vec2, p2: Vec2, out: Vec2[], tol: number, depth = 0): void {
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
  tol: number,
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

function makeCirclePolygon(cx: number, cy: number, r: number, segs = 24): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < segs; i++) {
    const a = (2 * Math.PI * i) / segs;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

function makeRectPolygon(x1: number, y1: number, x2: number, y2: number): Vec2[] {
  return [
    [x1, y1],
    [x2, y1],
    [x2, y2],
    [x1, y2],
  ];
}

function signedPolygonArea2(poly: Vec2[]): number {
  let area2 = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    area2 += x0 * y1 - x1 * y0;
  }
  return area2;
}

/**
 * Converts a string label into centered 2D millimeter polygons (+Y up)
 * with optional two-digit kerning and 6/9 orientation indicator (dot or bar).
 */
export function textToPolygonsMm(
  font: Font,
  text: string,
  targetHeightMm: number,
  trackingEm: number,
  sixNineIndicator: SixNineIndicator,
): Vec2[][] {
  const cleanText = text.trim();
  if (!cleanText) return [];

  const glyphs = font.stringToGlyphs(cleanText);
  const unitsPerEm = font.unitsPerEm || 1000;
  // Measure canonical cap-height using '0' or actual glyph bounds for consistent sizing across faces
  const refPath = font.getPath('0', 0, 0, 100);
  const refBox = refPath.getBoundingBox();
  const refSpan = Math.max(20, refBox.y2 - refBox.y1);
  const fontSize = (targetHeightMm * 100) / refSpan;
  const tol = Math.max(0.005, targetHeightMm * 0.0015);

  const contours: Vec2[][] = [];
  let cursorX = 0;

  for (let idx = 0; idx < glyphs.length; idx++) {
    const glyph = glyphs[idx];
    const path = glyph.getPath(cursorX, 0, fontSize);
    let current: Vec2 = [0, 0];
    let poly: Vec2[] = [];

    const flush = () => {
      if (poly.length >= 3) {
        // Flip OpenType Y-down coordinates -> CAD Y-up coordinates
        contours.push(poly.map(([x, y]) => [x, -y] as Vec2));
      }
      poly = [];
    };

    for (const c of path.commands) {
      if (c.type === 'M') {
        flush();
        current = [c.x, c.y];
        poly.push([...current]);
      } else if (c.type === 'L') {
        current = [c.x, c.y];
        poly.push([...current]);
      } else if (c.type === 'Q') {
        flattenQuad(current, [c.x1, c.y1], [c.x, c.y], poly, tol);
        current = [c.x, c.y];
      } else if (c.type === 'C') {
        flattenCubic(current, [c.x1, c.y1], [c.x2, c.y2], [c.x, c.y], poly, tol);
        current = [c.x, c.y];
      } else if (c.type === 'Z') {
        flush();
      }
    }
    flush();

    const advance = ((glyph.advanceWidth ?? unitsPerEm * 0.5) / unitsPerEm) * fontSize;
    const kern =
      idx + 1 < glyphs.length
        ? (font.getKerningValue(glyph, glyphs[idx + 1]) / unitsPerEm) * fontSize
        : 0;
    const extraTrack = glyphs.length > 1 ? trackingEm * fontSize : 0;
    cursorX += advance + kern + extraTrack;
  }

  if (contours.length === 0) return [];

  // Compute glyph bounding box in CAD Y-up coordinates before adding 6/9 indicator
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const poly of contours) {
    for (const [x, y] of poly) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  const glyphHeight = Math.max(0.5, maxY - minY);
  const glyphWidth = Math.max(0.5, maxX - minX);

  // Add orientation indicator ONLY on standalone "6" or "9"
  if ((cleanText === '6' || cleanText === '9') && sixNineIndicator !== 'none') {
    let dominantArea2 = 0;
    for (const poly of contours) {
      const a2 = signedPolygonArea2(poly);
      if (Math.abs(a2) > Math.abs(dominantArea2)) dominantArea2 = a2;
    }

    let indicator: Vec2[] | null = null;
    if (sixNineIndicator === 'dot') {
      const r = Math.max(0.24, glyphHeight * 0.085);
      const dotCx = maxX + r * 1.45;
      const dotCy = minY + r;
      indicator = makeCirclePolygon(dotCx, dotCy, r, 24);
    } else if (sixNineIndicator === 'bar') {
      const barH = Math.max(0.24, glyphHeight * 0.11);
      const gap = Math.max(0.22, glyphHeight * 0.09);
      const barW = Math.max(glyphWidth * 0.88, glyphHeight * 0.45);
      const cx = (minX + maxX) * 0.5;
      indicator = makeRectPolygon(
        cx - barW * 0.5,
        minY - gap - barH,
        cx + barW * 0.5,
        minY - gap,
      );
    }

    if (indicator) {
      if (dominantArea2 < 0) indicator.reverse();
      contours.push(indicator);
    }
  }

  // Re-compute full bounds (including indicator) and center at (0, 0)
  minX = Infinity;
  maxX = -Infinity;
  minY = Infinity;
  maxY = -Infinity;
  for (const poly of contours) {
    for (const [x, y] of poly) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;

  return contours.map((poly) => poly.map(([x, y]) => [x - cx, y - cy] as Vec2));
}
