import type { D2Variant, DieSettings, HalfSpacePlane, OddDieVariant, Vec3 } from '../../types/dice';
import { normalize3, scale3 } from '../manifoldInstance';

const PHI = (1 + Math.sqrt(5)) / 2;

export function hasDieSecondaryDimension(d: DieSettings): boolean {
  if (d.kind === 'd2' || d.kind === 'd3') return true;
  if (d.kind === 'd4') {
    return d.d4Variant === 'crystal' || d.d4Variant === 'arch' || d.d4Variant === 'pendulum';
  }
  if (d.kind === 'd5' || d.kind === 'd7' || d.kind === 'd9') {
    return d.oddVariant === 'crystal' || d.oddVariant === 'prism';
  }
  if (d.kind === 'd6') return d.d6Variant === 'crystal';
  if (d.kind === 'd8') return d.d8Variant === 'shard' || d.d8Variant === 'crystal';
  if (d.kind === 'd10' || d.kind === 'd00') return d.d10Variant === 'crystal';
  if (d.kind === 'd12') return d.d12Variant === 'crystal';
  return false;
}

function getD4ClassicVertexFaces(): {
  normals: Vec3[];
  vertexLabels: string[];
  faceVertexIndices: [number, number, number][];
} {
  // 4 vertices of a regular tetrahedron centered at origin:
  // v0 = apex (+Z), v1, v2, v3 = base ring (-Z)
  const rt2 = Math.SQRT2;
  const normals: Vec3[] = [
    [0, 0, -1], // Base face (opposite apex v0)
    normalize3([(2 * rt2) / 3, 0, 1 / 3]), // Opposite v1
    normalize3([-(rt2) / 3, (rt2 * Math.sqrt(3)) / 3, 1 / 3]), // Opposite v2
    normalize3([-(rt2) / 3, -(rt2 * Math.sqrt(3)) / 3, 1 / 3]), // Opposite v3
  ];
  // Vertex labels: v0="4", v1="1", v2="2", v3="3"
  const vertexLabels = ['4', '1', '2', '3'];
  // Each face i contains the 3 vertices j != i
  const faceVertexIndices: [number, number, number][] = [
    [1, 2, 3], // face 0 (base)
    [0, 2, 3], // face 1
    [0, 3, 1], // face 2
    [0, 1, 2], // face 3
  ];
  return { normals, vertexLabels, faceVertexIndices };
}

function buildD2CoinPlanes(
  variant: D2Variant,
  sizeMm: number,
  thicknessMm: number,
): HalfSpacePlane[] {
  const halfW = Math.max(4, sizeMm * 0.5);
  const halfT = Math.max(1.0, thicknessMm * 0.5);
  const planes: HalfSpacePlane[] = [];

  if (variant === 'oval') {
    // Support function of ellipse with minor X radius a = halfW and major Y radius b = 1.28 * halfW.
    // Normal-angle parameterization keeps adjacent rim normals strictly 5° apart (< 12° chamfer seam threshold).
    const segments = 72;
    const a = halfW;
    const b = halfW * 1.28;
    for (let i = 0; i < segments; i++) {
      const phi = (2 * Math.PI * i) / segments;
      const nx = Math.cos(phi);
      const ny = Math.sin(phi);
      planes.push({
        id: `rim_${i}`,
        normal: [nx, ny, 0],
        distance: Math.hypot(a * nx, b * ny),
        isNumbered: false,
        role: 'cap',
      });
    }
  } else if (variant === 'rounded_square') {
    // Minkowski sum of square half-side s and circular corner radius r = 0.20 * sizeMm (6° steps along arcs).
    const fullW = halfW * 2;
    const r = 0.2 * fullW;
    const s = 0.3 * fullW;
    let idx = 0;
    for (let q = 0; q < 4; q++) {
      const base = q * (Math.PI / 2);
      for (let k = 0; k < 15; k++) {
        const alpha = (k * Math.PI) / 30;
        const phi = base + alpha;
        planes.push({
          id: `rim_${idx++}`,
          normal: [Math.cos(phi), Math.sin(phi), 0],
          distance: s * (Math.cos(alpha) + Math.sin(alpha)) + r,
          isNumbered: false,
          role: 'cap',
        });
      }
    }
  } else if (variant === 'hexagon') {
    for (let k = 0; k < 6; k++) {
      const phi = (2 * Math.PI * k) / 6;
      planes.push({
        id: `rim_${k}`,
        normal: [Math.cos(phi), Math.sin(phi), 0],
        distance: halfW,
        isNumbered: false,
        role: 'cap',
      });
    }
  } else if (variant === 'octagon') {
    for (let k = 0; k < 8; k++) {
      const phi = (2 * Math.PI * k) / 8;
      planes.push({
        id: `rim_${k}`,
        normal: [Math.cos(phi), Math.sin(phi), 0],
        distance: halfW,
        isNumbered: false,
        role: 'cap',
      });
    }
  } else if (variant === 'shield') {
    // Convex Gothic heater shield: flat top crest + opposing circular flanks meeting cleanly at base point.
    const fullW = halfW * 2;
    planes.push({
      id: 'rim_top',
      normal: [0, 1, 0],
      distance: 0.52 * fullW,
      isNumbered: false,
      role: 'cap',
    });
    let idx = 0;
    for (const xSign of [1, -1]) {
      for (let m = 0; m <= 10; m++) {
        const alpha = (m * 6 * Math.PI) / 180;
        const cosA = Math.cos(alpha);
        const sinA = Math.sin(alpha);
        planes.push({
          id: `rim_flank_${idx++}`,
          normal: [xSign * cosA, -sinA, 0],
          distance: (1.0 - 0.5 * cosA - 0.26 * sinA) * fullW,
          isNumbered: false,
          role: 'cap',
        });
      }
    }
  } else {
    const segments = 72;
    for (let i = 0; i < segments; i++) {
      const theta = (2 * Math.PI * i) / segments;
      planes.push({
        id: `rim_${i}`,
        normal: [Math.cos(theta), Math.sin(theta), 0],
        distance: halfW,
        isNumbered: false,
        role: 'cap',
      });
    }
  }

  planes.push({
    id: 'face_2',
    normal: [0, 0, 1],
    distance: halfT,
    isNumbered: true,
    role: 'primary',
    faceLabel: '2',
    upHint: [0, 1, 0],
  });

  planes.push({
    id: 'face_1',
    normal: [0, 0, -1],
    distance: halfT,
    isNumbered: true,
    role: 'primary',
    faceLabel: '1',
    upHint: [0, 1, 0],
  });

  return planes;
}

function buildD3Planes(
  variant: DieSettings['d3Variant'],
  sizeMm: number,
  lengthMm: number,
): HalfSpacePlane[] {
  const planes: HalfSpacePlane[] = [];
  const halfLen = Math.max(4, lengthMm * 0.5);

  if (variant === 'truncated_barrel') {
    // 3 stable landing faces at 0, 120, 240 deg + 3 opposing top-reading faces at 180, 300, 60 deg
    // Total landing-to-opposite-reading F2F = sizeMm
    const dLand = sizeMm * 0.44;
    const dRead = sizeMm * 0.56;
    const labels = ['1', '2', '3'];

    for (let k = 0; k < 3; k++) {
      const phiLand = (2 * Math.PI * k) / 3;
      planes.push({
        id: `land_${k}`,
        normal: [Math.cos(phiLand), Math.sin(phiLand), 0],
        distance: dLand,
        isNumbered: false,
        role: 'cap',
      });

      const phiRead = phiLand + Math.PI;
      planes.push({
        id: `face_${labels[k]}`,
        normal: [Math.cos(phiRead), Math.sin(phiRead), 0],
        distance: dRead,
        isNumbered: true,
        role: 'primary',
        faceLabel: labels[k],
        upHint: [0, 0, 1],
      });
    }
  } else {
    // Rounded Triangular Prism: 3 numbered flat faces at 0, 120, 240 deg + 30% rounded corner arc facets
    const dSide = sizeMm * 0.5;
    const labels = ['1', '2', '3'];
    for (let k = 0; k < 3; k++) {
      const phi = (2 * Math.PI * k) / 3;
      planes.push({
        id: `face_${labels[k]}`,
        normal: [Math.cos(phi), Math.sin(phi), 0],
        distance: dSide,
        isNumbered: true,
        role: 'primary',
        faceLabel: labels[k],
        upHint: [0, 0, 1],
      });

      // Smooth 5-facet curved arch rounding each edge corner around phi + 60 deg
      const cornerCenter = phi + Math.PI / 3;
      for (let s = -2; s <= 2; s++) {
        const a = cornerCenter + (s * Math.PI) / 15;
        planes.push({
          id: `corner_${k}_${s + 2}`,
          normal: [Math.cos(a), Math.sin(a), 0],
          distance: dSide * 1.24,
          isNumbered: false,
          role: 'cap',
        });
      }
    }
  }

  // Pyramidal end caps at +Z and -Z so D3 cannot land on its ends
  const shoulderZ = halfLen * 0.72;
  const endR = sizeMm * 0.55;
  for (const zSign of [1, -1]) {
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI * k) / 3;
      const nx = (halfLen - shoulderZ) * Math.cos(a);
      const ny = (halfLen - shoulderZ) * Math.sin(a);
      const nz = zSign * endR;
      const n = normalize3([nx, ny, nz]);
      const d = n[0] * Math.cos(a) * endR + n[1] * Math.sin(a) * endR + n[2] * zSign * shoulderZ;
      planes.push({
        id: `end_${zSign > 0 ? 'top' : 'bot'}_${k}`,
        normal: n,
        distance: d,
        isNumbered: false,
        role: 'cap',
      });
    }
  }

  return planes;
}

function buildD4Planes(settings: DieSettings): HalfSpacePlane[] {
  const variant = settings.d4Variant;
  const sizeMm = settings.sizeMm;
  const lengthMm = settings.secondarySizeMm;

  if (variant === 'classic_vertex' || variant === 'classic_base') {
    const { normals, vertexLabels, faceVertexIndices } = getD4ClassicVertexFaces();
    // Regular tetrahedron height = sizeMm -> centroid-to-face = sizeMm / 4, centroid-to-vertex = 3*sizeMm / 4
    const inradius = sizeMm / 4;
    const rVert = 3 * inradius;
    // Vertex coordinates = -rVert * normals[v]
    const vertices: Vec3[] = normals.map((n) => scale3(n, -rVert));

    return normals.map((n, fIdx) => {
      const vIndices = faceVertexIndices[fIdx];
      // Face center in 3D is inradius * n
      const faceCenter = scale3(n, inradius);
      // Use vector toward first vertex on this face as initial upHint
      const v0Dir = normalize3([
        vertices[vIndices[0]][0] - faceCenter[0],
        vertices[vIndices[0]][1] - faceCenter[1],
        vertices[vIndices[0]][2] - faceCenter[2],
      ]);

      // Build orthonormal local frame matching halfspace.ts so subLabel angles align cleanly
      const u = normalize3([
        v0Dir[1] * n[2] - v0Dir[2] * n[1],
        v0Dir[2] * n[0] - v0Dir[0] * n[2],
        v0Dir[0] * n[1] - v0Dir[1] * n[0],
      ]);
      const v = normalize3([
        n[1] * u[2] - n[2] * u[1],
        n[2] * u[0] - n[0] * u[2],
        n[0] * u[1] - n[1] * u[0],
      ]);

      const subLabels = vIndices.map((vIdx, idx) => {
        if (variant === 'classic_vertex') {
          // Point from face center toward vertex vIdx; number sits near tip upright toward vertex
          const dir = normalize3([
            vertices[vIdx][0] - faceCenter[0],
            vertices[vIdx][1] - faceCenter[1],
            vertices[vIdx][2] - faceCenter[2],
          ]);
          const dx = dir[0] * u[0] + dir[1] * u[1] + dir[2] * u[2];
          const dy = dir[0] * v[0] + dir[1] * v[1] + dir[2] * v[2];
          // Rotate local +Y to align with (dx, dy): angle = atan2(-dx, dy)
          const rot = Math.atan2(-dx, dy);
          return {
            id: `v_${vertexLabels[vIdx]}`,
            text: vertexLabels[vIdx],
            offsetXFactor: dx * 0.72,
            offsetYFactor: dy * 0.72,
            rotationRad: rot,
            scaleFactor: 0.44,
          };
        } else {
          // classic_base: face fIdx shares bottom edge opposite vertex vIndices[idx] with face vIndices[idx]!
          // Wait: vertex vIndices[idx] belongs to face fIdx; the edge OPPOSITE vIndices[idx] on face fIdx
          // is shared with face index = vIndices[idx]!
          const adjFaceIdx = vIndices[idx];
          const adjLabel = vertexLabels[adjFaceIdx]; // Label of the face resting on the table
          const dirToOppVertex = normalize3([
            vertices[vIndices[idx]][0] - faceCenter[0],
            vertices[vIndices[idx]][1] - faceCenter[1],
            vertices[vIndices[idx]][2] - faceCenter[2],
          ]);
          const dx = dirToOppVertex[0] * u[0] + dirToOppVertex[1] * u[1] + dirToOppVertex[2] * u[2];
          const dy = dirToOppVertex[0] * v[0] + dirToOppVertex[1] * v[1] + dirToOppVertex[2] * v[2];
          // Edge midpoint is in direction (-dx, -dy) from center; upright points toward (+dx, +dy)!
          const rot = Math.atan2(-dx, dy);
          return {
            id: `b_${adjLabel}`,
            text: adjLabel,
            offsetXFactor: -dx * 0.44,
            offsetYFactor: -dy * 0.44,
            rotationRad: rot,
            scaleFactor: 0.44,
          };
        }
      });

      return {
        id: `face_${vertexLabels[fIdx]}`,
        normal: n,
        distance: inradius,
        isNumbered: true,
        role: 'primary',
        faceLabel: vertexLabels[fIdx],
        upHint: v0Dir,
        subLabels,
      };
    });
  }

  if (variant === 'crystal') {
    const halfW = sizeMm * 0.5;
    const halfL = Math.max(sizeMm * 1.2, lengthMm * 0.5);
    const shoulderZ = halfL * 0.52;
    const planes: HalfSpacePlane[] = [];
    const sideSpecs: Array<{ label: string; angle: number }> = [
      { label: '1', angle: 0 },
      { label: '4', angle: Math.PI },
      { label: '2', angle: Math.PI * 0.5 },
      { label: '3', angle: Math.PI * 1.5 },
    ];

    for (const spec of sideSpecs) {
      const cx = Math.cos(spec.angle);
      const cy = Math.sin(spec.angle);
      planes.push({
        id: `face_${spec.label}`,
        normal: [cx, cy, 0],
        distance: halfW,
        isNumbered: true,
        role: 'primary',
        faceLabel: spec.label,
        upHint: [0, 0, 1],
      });

      for (const zSign of [1, -1]) {
        const dz = halfL - shoulderZ;
        const n = normalize3([dz * cx, dz * cy, zSign * halfW]);
        const d = n[0] * cx * halfW + n[1] * cy * halfW + n[2] * zSign * shoulderZ;
        planes.push({
          id: `tip_${spec.label}_${zSign > 0 ? 'top' : 'bot'}`,
          normal: n,
          distance: d,
          isNumbered: false,
          role: 'cap',
        });
      }
    }
    return planes;
  }

  if (variant === 'arch') {
    const halfW = sizeMm * 0.5;
    const halfL = Math.max(sizeMm * 1.2, lengthMm * 0.5);
    const shoulderZ = halfL * 0.52;
    const planes: HalfSpacePlane[] = [];
    const sideSpecs: Array<{ label: string; angle: number }> = [
      { label: '1', angle: 0 },
      { label: '4', angle: Math.PI },
      { label: '2', angle: Math.PI * 0.5 },
      { label: '3', angle: Math.PI * 1.5 },
    ];

    for (const spec of sideSpecs) {
      planes.push({
        id: `face_${spec.label}`,
        normal: [Math.cos(spec.angle), Math.sin(spec.angle), 0],
        distance: halfW,
        isNumbered: true,
        role: 'primary',
        faceLabel: spec.label,
        upHint: [0, 0, 1],
      });
    }

    // Top arch curves smoothly along Y (wedge ridge along X); bottom arch curves orthogonally along X (wedge ridge along Y)
    const archSteps = 9;
    const archH = halfL - shoulderZ;
    for (let s = 0; s < archSteps; s++) {
      const t = (s + 0.5) / archSteps; // 0..1 from side to crown
      const theta = t * (Math.PI * 0.48); // tilt from horizontal toward vertical Z

      // Top end (+Z, Y-curving arch)
      for (const ySign of [1, -1]) {
        const py = ySign * halfW * Math.cos(theta);
        const pz = shoulderZ + archH * Math.sin(theta);
        const ny = ySign * Math.cos(theta) * archH;
        const nz = Math.sin(theta) * halfW;
        const n = normalize3([0, ny, nz]);
        planes.push({
          id: `arch_top_${ySign}_${s}`,
          normal: n,
          distance: n[1] * py + n[2] * pz,
          isNumbered: false,
          role: 'cap',
        });
      }

      // Bottom end (-Z, X-curving arch)
      for (const xSign of [1, -1]) {
        const px = xSign * halfW * Math.cos(theta);
        const pz = -(shoulderZ + archH * Math.sin(theta));
        const nx = xSign * Math.cos(theta) * archH;
        const nz = -Math.sin(theta) * halfW;
        const n = normalize3([nx, 0, nz]);
        planes.push({
          id: `arch_bot_${xSign}_${s}`,
          normal: n,
          distance: n[0] * px + n[2] * pz,
          isNumbered: false,
          role: 'cap',
        });
      }
    }

    // Flat top/bottom crown tangent cap at +-halfL so arch apex is bounded cleanly
    planes.push({ id: 'crown_top', normal: [0, 0, 1], distance: halfL, isNumbered: false, role: 'cap' });
    planes.push({ id: 'crown_bot', normal: [0, 0, -1], distance: halfL, isNumbered: false, role: 'cap' });

    return planes;
  }

  if (variant === 'pendulum') {
    // Teardrop / Pendulum bipyramid: 4 long upper sloped faces + 4 steeper lower counter-facets
    const halfW = sizeMm * 0.5;
    const topZ = lengthMm * 0.62;
    const botZ = -lengthMm * 0.38;
    const planes: HalfSpacePlane[] = [];
    const specs = [
      { label: '1', angle: 0 },
      { label: '4', angle: Math.PI },
      { label: '2', angle: Math.PI * 0.5 },
      { label: '3', angle: Math.PI * 1.5 },
    ];

    for (const s of specs) {
      const cx = Math.cos(s.angle);
      const cy = Math.sin(s.angle);
      // Long upper face connecting equatorial point (halfW*1.12, 0) to (0, topZ)
      const nTop = normalize3([topZ * cx, topZ * cy, halfW * 1.12]);
      const dTop = nTop[2] * topZ;
      planes.push({
        id: `face_${s.label}`,
        normal: nTop,
        distance: dTop,
        isNumbered: true,
        role: 'primary',
        faceLabel: s.label,
        upHint: [0, 0, 1],
      });

      // Steeper lower counter-facet connecting equatorial point (halfW*1.12, 0) to (0, botZ)
      const nBot = normalize3([Math.abs(botZ) * cx, Math.abs(botZ) * cy, -halfW * 1.12]);
      const dBot = nBot[2] * botZ;
      planes.push({
        id: `bot_${s.label}`,
        normal: nBot,
        distance: dBot,
        isNumbered: false,
        role: 'cap',
      });
    }
    return planes;
  }

  // variant === 'truncated': regular tetrahedron + 4 opposing vertex-truncation reading facets
  const { normals, vertexLabels } = getD4ClassicVertexFaces();
  // Base-to-truncation F2F = sizeMm -> r_base + d_trunc = sizeMm; r_base = sizeMm / 2.45, d_trunc = 1.45 * r_base
  const rBase = sizeMm / 2.45;
  const dTrunc = 1.45 * rBase;
  const planes: HalfSpacePlane[] = [];

  normals.forEach((n, idx) => {
    planes.push({
      id: `base_${idx}`,
      normal: n,
      distance: rBase,
      isNumbered: false,
      role: 'cap',
    });

    const oppN: Vec3 = [-n[0], -n[1], -n[2]];
    const upRef = normals[(idx + 1) % normals.length];
    planes.push({
      id: `face_${vertexLabels[idx]}`,
      normal: oppN,
      distance: dTrunc,
      isNumbered: true,
      role: 'primary',
      faceLabel: vertexLabels[idx],
      upHint: [-upRef[0], -upRef[1], -upRef[2]],
    });
  });

  return planes;
}

/**
 * Builds an even-sided pointed crystal barrel (6..18 belt faces around Z + pyramidal quartz tips)
 * so opposite belt faces k and k + M are strictly parallel at exact caliper distance sizeMm.
 */
function buildCrystalBarrelPlanes(
  beltLabels: string[],
  sizeMm: number,
  lengthMm: number,
  upHintMode: 'axial' | 'horizontal_tangent' = 'axial',
): HalfSpacePlane[] {
  const twoM = beltLabels.length;
  const halfW = Math.max(4, sizeMm * 0.5);
  const halfL = Math.max(sizeMm * 0.85, lengthMm * 0.5);
  const shoulderZ = halfL * 0.54;
  const planes: HalfSpacePlane[] = [];

  for (let k = 0; k < twoM; k++) {
    const phi = (2 * Math.PI * k) / twoM;
    const cx = Math.cos(phi);
    const cy = Math.sin(phi);
    const label = beltLabels[k];
    const upHint: Vec3 = upHintMode === 'horizontal_tangent' ? [-cy, cx, 0] : [0, 0, 1];

    planes.push({
      id: `face_${k + 1}_${label}`,
      normal: [cx, cy, 0],
      distance: halfW,
      isNumbered: true,
      role: 'primary',
      faceLabel: label,
      upHint,
    });

    for (const zSign of [1, -1]) {
      const dz = halfL - shoulderZ;
      const tn = normalize3([dz * cx, dz * cy, zSign * halfW]);
      const td = tn[0] * halfW * cx + tn[1] * halfW * cy + tn[2] * zSign * shoulderZ;
      planes.push({
        id: `cap_${zSign > 0 ? 'top' : 'bot'}_${k + 1}`,
        normal: tn,
        distance: td,
        isNumbered: false,
        role: 'cap',
      });
    }
  }

  return planes;
}

function buildBalancedOddCycle(sides: 5 | 7 | 9): number[] {
  if (sides === 5) return [1, 4, 2, 5, 3];
  if (sides === 7) return [1, 5, 3, 6, 2, 7, 4];
  return [1, 6, 3, 8, 2, 7, 4, 9, 5];
}

function buildOddTrapezohedronPlanes(sides: 5 | 7 | 9, sizeMm: number): HalfSpacePlane[] {
  const d = Math.max(4, sizeMm * 0.5);
  const c = Math.max(0.85, 1.35 - 0.05 * sides);
  const normLen = Math.hypot(1, c);
  const xyComp = 1 / normLen;
  const zComp = c / normLen;
  const cycle = buildBalancedOddCycle(sides);
  const halfShift = (sides - 1) / 2;

  const upperLabels = new Array<string>(sides);
  const lowerLabels = new Array<string>(sides);
  for (let k = 0; k < sides; k++) {
    const val = cycle[k];
    const oppBotIdx = (k + halfShift) % sides;
    upperLabels[k] = String(val);
    lowerLabels[oppBotIdx] = String(sides + 1 - val);
  }

  const planes: HalfSpacePlane[] = [];
  for (let k = 0; k < sides; k++) {
    const phiTop = (2 * Math.PI * k) / sides;
    planes.push({
      id: `face_top_${upperLabels[k]}`,
      normal: [xyComp * Math.cos(phiTop), xyComp * Math.sin(phiTop), zComp],
      distance: d,
      isNumbered: true,
      role: 'primary',
      faceLabel: upperLabels[k],
      upHint: [0, 0, 1],
    });

    const phiBot = phiTop + Math.PI / sides;
    planes.push({
      id: `face_bot_${lowerLabels[k]}`,
      normal: [xyComp * Math.cos(phiBot), xyComp * Math.sin(phiBot), -zComp],
      distance: d,
      isNumbered: true,
      role: 'primary',
      faceLabel: lowerLabels[k],
      upHint: [0, 0, -1],
    });
  }

  return planes;
}

function buildOddCrystalPlanes(
  sides: 5 | 7 | 9,
  sizeMm: number,
  lengthMm: number,
): HalfSpacePlane[] {
  const cycle = buildBalancedOddCycle(sides);
  const beltLabels: string[] = new Array(sides * 2);
  for (let k = 0; k < sides; k++) {
    const v = cycle[k];
    beltLabels[k] = String(v);
    beltLabels[k + sides] = String(sides + 1 - v);
  }
  return buildCrystalBarrelPlanes(beltLabels, sizeMm, lengthMm, 'axial');
}

function buildOddZocchiPrismPlanes(
  sides: 5 | 7 | 9,
  sizeMm: number,
  lengthMm: number,
): HalfSpacePlane[] {
  const beltSides = sides - 2; // 3 for D5, 5 for D7, 7 for D9
  const r = sizeMm / (1 + 1 / Math.cos(Math.PI / beltSides));
  const halfH = Math.max(4.0, lengthMm * 0.5);
  const planes: HalfSpacePlane[] = [];

  planes.push({
    id: 'face_1',
    normal: [0, 0, -1],
    distance: halfH,
    isNumbered: true,
    role: 'primary',
    faceLabel: '1',
    upHint: [-1, 0, 0],
  });

  for (let k = 0; k < beltSides; k++) {
    const phi = (2 * Math.PI * k) / beltSides;
    const label = String(k + 2);
    planes.push({
      id: `face_${label}`,
      normal: [Math.cos(phi), Math.sin(phi), 0],
      distance: r,
      isNumbered: true,
      role: 'primary',
      faceLabel: label,
      upHint: [0, 0, 1],
    });
  }

  planes.push({
    id: `face_${sides}`,
    normal: [0, 0, 1],
    distance: halfH,
    isNumbered: true,
    role: 'primary',
    faceLabel: String(sides),
    upHint: [-1, 0, 0],
  });

  return planes;
}

function buildOddDiePlanes(
  sides: 5 | 7 | 9,
  variant: OddDieVariant,
  sizeMm: number,
  secondarySizeMm: number,
): HalfSpacePlane[] {
  if (variant === 'crystal') {
    return buildOddCrystalPlanes(sides, sizeMm, secondarySizeMm);
  }
  if (variant === 'prism') {
    return buildOddZocchiPrismPlanes(sides, sizeMm, secondarySizeMm);
  }
  return buildOddTrapezohedronPlanes(sides, sizeMm);
}

function buildD6Planes(settings: DieSettings): HalfSpacePlane[] {
  const sizeMm = settings.sizeMm;
  const variant = settings.d6Variant;

  if (variant === 'crystal') {
    return buildCrystalBarrelPlanes(
      ['1', '5', '3', '6', '2', '4'],
      sizeMm,
      settings.secondarySizeMm,
      'axial',
    );
  }

  if (variant === 'rhombic') {
    // Trigonal trapezohedron (skewed diamond cube): 6 congruent rhombic faces at polar angle 63 deg.
    const d = sizeMm * 0.5;
    const theta = (63 * Math.PI) / 180;
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    const pairs: Array<{ posLabel: string; negLabel: string; phi: number }> = [
      { posLabel: '6', negLabel: '1', phi: 0 },
      { posLabel: '4', negLabel: '3', phi: (2 * Math.PI) / 3 },
      { posLabel: '5', negLabel: '2', phi: (4 * Math.PI) / 3 },
    ];
    const planes: HalfSpacePlane[] = [];
    for (const pair of pairs) {
      const nPos: Vec3 = [sinT * Math.cos(pair.phi), sinT * Math.sin(pair.phi), cosT];
      const nNeg: Vec3 = [-nPos[0], -nPos[1], -nPos[2]];
      planes.push({
        id: `face_${pair.posLabel}`,
        normal: nPos,
        distance: d,
        isNumbered: true,
        role: 'primary',
        faceLabel: pair.posLabel,
        upHint: [0, 0, 1],
      });
      planes.push({
        id: `face_${pair.negLabel}`,
        normal: nNeg,
        distance: d,
        isNumbered: true,
        role: 'primary',
        faceLabel: pair.negLabel,
        upHint: [0, 0, 1],
      });
    }
    return planes;
  }

  const d = sizeMm * 0.5;
  const cubePlanes: HalfSpacePlane[] = [
    { id: 'face_1', normal: [0, 0, 1], distance: d, isNumbered: true, role: 'primary', faceLabel: '1', upHint: [0, 1, 0] },
    { id: 'face_6', normal: [0, 0, -1], distance: d, isNumbered: true, role: 'primary', faceLabel: '6', upHint: [0, 1, 0] },
    { id: 'face_2', normal: [0, 1, 0], distance: d, isNumbered: true, role: 'primary', faceLabel: '2', upHint: [0, 0, 1] },
    { id: 'face_5', normal: [0, -1, 0], distance: d, isNumbered: true, role: 'primary', faceLabel: '5', upHint: [0, 0, 1] },
    { id: 'face_3', normal: [1, 0, 0], distance: d, isNumbered: true, role: 'primary', faceLabel: '3', upHint: [0, 0, 1] },
    { id: 'face_4', normal: [-1, 0, 0], distance: d, isNumbered: true, role: 'primary', faceLabel: '4', upHint: [0, 0, 1] },
  ];

  if (variant === 'truncated') {
    const cornerDist = 0.7 * sizeMm;
    let idx = 1;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          cubePlanes.push({
            id: `trunc_corner_${idx++}`,
            normal: normalize3([sx, sy, sz]),
            distance: cornerDist,
            isNumbered: false,
            role: 'cap',
          });
        }
      }
    }
  }

  return cubePlanes;
}

function buildD8Planes(settings: DieSettings): HalfSpacePlane[] {
  const sizeMm = settings.sizeMm;
  const variant = settings.d8Variant;

  if (variant === 'crystal') {
    return buildCrystalBarrelPlanes(
      ['1', '6', '4', '7', '8', '3', '5', '2'],
      sizeMm,
      settings.secondarySizeMm,
      'axial',
    );
  }

  const d = sizeMm * 0.5;
  let xyComp = 1 / Math.sqrt(3);
  let zComp = 1 / Math.sqrt(3);

  if (variant === 'shard') {
    const halfH = Math.max(sizeMm * 0.62, settings.secondarySizeMm * 0.5);
    zComp = Math.min(0.75, Math.max(0.22, d / halfH));
    xyComp = Math.sqrt((1 - zComp * zComp) * 0.5);
  }

  const specs: Array<{ label: string; sx: number; sy: number; sz: number }> = [
    { label: '1', sx: 1, sy: 1, sz: 1 },
    { label: '8', sx: -1, sy: -1, sz: -1 },
    { label: '2', sx: -1, sy: 1, sz: 1 },
    { label: '7', sx: 1, sy: -1, sz: -1 },
    { label: '3', sx: -1, sy: -1, sz: 1 },
    { label: '6', sx: 1, sy: 1, sz: -1 },
    { label: '4', sx: 1, sy: -1, sz: 1 },
    { label: '5', sx: -1, sy: 1, sz: -1 },
  ];

  return specs.map((sp) => {
    const n: Vec3 = [sp.sx * xyComp, sp.sy * xyComp, sp.sz * zComp];
    const up: Vec3 = [0, 0, sp.sz];
    return {
      id: `face_${sp.label}`,
      normal: n,
      distance: d,
      isNumbered: true,
      role: 'primary',
      faceLabel: sp.label,
      upHint: up,
    };
  });
}

function buildD10Planes(settings: DieSettings, isPercentile: boolean): HalfSpacePlane[] {
  const formatLabel = (digit: string): string => {
    if (isPercentile) return `${digit}0`;
    if (settings.d10Numbering === '1_10' && digit === '0') return '10';
    return digit;
  };

  if (settings.d10Variant === 'crystal') {
    // Opposite indices (k, k + 5) sum to 9: 0↔9, 7↔2, 4↔5, 1↔8, 6↔3.
    const beltDigits = ['0', '7', '4', '1', '6', '9', '2', '5', '8', '3'];
    return buildCrystalBarrelPlanes(
      beltDigits.map(formatLabel),
      settings.sizeMm,
      settings.secondarySizeMm,
      isPercentile && settings.d00Orientation === 'horizontal' ? 'horizontal_tangent' : 'axial',
    );
  }

  const d = settings.sizeMm * 0.5;
  const alpha = (51 * Math.PI) / 180;
  const sinA = Math.sin(alpha);
  const cosA = Math.cos(alpha);

  // Lower face (k + 2) mod 5 is exact parallel opposite of upper face k -> opposite sums = 9
  const upperDigits = ['1', '7', '5', '3', '9'];
  const lowerDigits = ['6', '0', '8', '2', '4'];

  const planes: HalfSpacePlane[] = [];
  for (let k = 0; k < 5; k++) {
    const phiTop = (2 * Math.PI * k) / 5;
    const labelTop = formatLabel(upperDigits[k]);
    const tangentPhiTop: Vec3 = [-Math.sin(phiTop), Math.cos(phiTop), 0];
    planes.push({
      id: `face_${labelTop}`,
      normal: [sinA * Math.cos(phiTop), sinA * Math.sin(phiTop), cosA],
      distance: d,
      isNumbered: true,
      role: 'primary',
      faceLabel: labelTop,
      upHint: isPercentile && settings.d00Orientation === 'vertical' ? tangentPhiTop : [0, 0, 1],
    });

    const phiBot = phiTop + Math.PI / 5;
    const labelBot = formatLabel(lowerDigits[k]);
    const tangentPhiBot: Vec3 = [Math.sin(phiBot), -Math.cos(phiBot), 0];
    planes.push({
      id: `face_${labelBot}`,
      normal: [sinA * Math.cos(phiBot), sinA * Math.sin(phiBot), -cosA],
      distance: d,
      isNumbered: true,
      role: 'primary',
      faceLabel: labelBot,
      upHint: isPercentile && settings.d00Orientation === 'vertical' ? tangentPhiBot : [0, 0, -1],
    });
  }
  return planes;
}

function buildRhombicD12Planes(sizeMm: number): HalfSpacePlane[] {
  const d = sizeMm * 0.5;
  const s = Math.SQRT1_2;
  // Catalan rhombic dodecahedron: 6 opposite pairs summing to 13 with 4-way octahedral vertex balance.
  // Each upHint aligns with the rhombus's short diagonal so two-digit labels sit across the wide axis.
  const pairs: Array<{ posLabel: string; negLabel: string; n: Vec3; up: Vec3 }> = [
    { posLabel: '1', negLabel: '12', n: [s, s, 0], up: [0, 0, 1] },
    { posLabel: '9', negLabel: '4', n: [s, -s, 0], up: [0, 0, 1] },
    { posLabel: '11', negLabel: '2', n: [s, 0, s], up: [0, 1, 0] },
    { posLabel: '6', negLabel: '7', n: [s, 0, -s], up: [0, 1, 0] },
    { posLabel: '8', negLabel: '5', n: [0, s, s], up: [1, 0, 0] },
    { posLabel: '10', negLabel: '3', n: [0, s, -s], up: [1, 0, 0] },
  ];

  const planes: HalfSpacePlane[] = [];
  for (const p of pairs) {
    planes.push({
      id: `face_${p.posLabel}`,
      normal: p.n,
      distance: d,
      isNumbered: true,
      role: 'primary',
      faceLabel: p.posLabel,
      upHint: p.up,
    });
    planes.push({
      id: `face_${p.negLabel}`,
      normal: [-p.n[0], -p.n[1], -p.n[2]],
      distance: d,
      isNumbered: true,
      role: 'primary',
      faceLabel: p.negLabel,
      upHint: p.up,
    });
  }
  return planes;
}

function buildD12Planes(settings: DieSettings): HalfSpacePlane[] {
  if (settings.d12Variant === 'rhombic') {
    return buildRhombicD12Planes(settings.sizeMm);
  }
  if (settings.d12Variant === 'crystal') {
    // Opposite indices (k, k + 6) sum to 13: 1↔12, 11↔2, 4↔9, 10↔3, 6↔7, 8↔5.
    return buildCrystalBarrelPlanes(
      ['1', '11', '4', '10', '6', '8', '12', '2', '9', '3', '7', '5'],
      settings.sizeMm,
      settings.secondarySizeMm,
      'axial',
    );
  }

  const d = settings.sizeMm * 0.5;
  // 6 opposite pairs summing to 13
  const pairs: Array<{ posLabel: string; negLabel: string; raw: Vec3 }> = [
    { posLabel: '12', negLabel: '1', raw: [0, 1, PHI] },
    { posLabel: '2', negLabel: '11', raw: [0, -1, PHI] },
    { posLabel: '10', negLabel: '3', raw: [PHI, 0, 1] },
    { posLabel: '4', negLabel: '9', raw: [-PHI, 0, 1] },
    { posLabel: '8', negLabel: '5', raw: [1, PHI, 0] },
    { posLabel: '6', negLabel: '7', raw: [-1, PHI, 0] },
  ];

  const allNormals = pairs.flatMap((p) => [
    normalize3(p.raw),
    normalize3([-p.raw[0], -p.raw[1], -p.raw[2]]),
  ]);
  const pickNeighborUp = (n: Vec3): Vec3 => {
    // Point away from an adjacent dodecahedron face normal (toward the opposite pentagon apex)
    // closest to +Z so every pentagon stands upright with its flat base edge horizontal at -Y.
    let best: Vec3 = [0, 0, 1];
    let bestScore = -Infinity;
    for (const cand of allNormals) {
      const dot = n[0] * cand[0] + n[1] * cand[1] + n[2] * cand[2];
      if (dot > 0.3 && dot < 0.9) {
        const opp: Vec3 = [-cand[0], -cand[1], -cand[2]];
        const zScore = opp[2] - Math.abs(opp[0]) * 0.05;
        if (zScore > bestScore) {
          bestScore = zScore;
          best = opp;
        }
      }
    }
    return best;
  };

  const planes: HalfSpacePlane[] = [];
  for (const p of pairs) {
    const nPos = normalize3(p.raw);
    const nNeg: Vec3 = [-nPos[0], -nPos[1], -nPos[2]];
    planes.push({
      id: `face_${p.posLabel}`,
      normal: nPos,
      distance: d,
      isNumbered: true,
      role: 'primary',
      faceLabel: p.posLabel,
      upHint: pickNeighborUp(nPos),
    });
    planes.push({
      id: `face_${p.negLabel}`,
      normal: nNeg,
      distance: d,
      isNumbered: true,
      role: 'primary',
      faceLabel: p.negLabel,
      upHint: pickNeighborUp(nNeg),
    });
  }
  return planes;
}

function buildD20Planes(sizeMm: number, mode: DieSettings['d20Numbering']): HalfSpacePlane[] {
  const d = sizeMm * 0.5;
  const invPhi = PHI - 1;

  // 20 face normals of regular icosahedron = vertices of dual dodecahedron
  const rawDirections: Vec3[] = [
    // 8 (+/-1, +/-1, +/-1)
    [1, 1, 1], [-1, -1, -1],
    [1, 1, -1], [-1, -1, 1],
    [1, -1, 1], [-1, 1, -1],
    [-1, 1, 1], [1, -1, -1],
    // 4 (0, +/-invPhi, +/-phi)
    [0, invPhi, PHI], [0, -invPhi, -PHI],
    [0, -invPhi, PHI], [0, invPhi, -PHI],
    // 4 (+/-invPhi, +/-phi, 0)
    [invPhi, PHI, 0], [-invPhi, -PHI, 0],
    [-invPhi, PHI, 0], [invPhi, -PHI, 0],
    // 4 (+/-phi, 0, +/-invPhi)
    [PHI, 0, invPhi], [-PHI, 0, -invPhi],
    [PHI, 0, -invPhi], [-PHI, 0, invPhi],
  ];
  const normals = rawDirections.map(normalize3);

  // Compute adjacency graph (neighbor dot product for regular icosahedron is ~0.79465)
  const neighbors: number[][] = normals.map((ni, i) => {
    const list: number[] = [];
    for (let j = 0; j < normals.length; j++) {
      if (i === j) continue;
      const dot = ni[0] * normals[j][0] + ni[1] * normals[j][1] + ni[2] * normals[j][2];
      if (dot > 0.7 && dot < 0.9) list.push(j);
    }
    return list;
  });

  // Opposite face index: index i^1 is always exact negation (-rawDirections[i])
  let labelsByFace: string[];

  if (mode === 'spindown') {
    // Walk concentric/spiral path starting at face 0 ("20") so consecutive numbers share an edge
    const order: number[] = [0];
    const visited = new Set<number>([0]);
    while (order.length < 20) {
      const curr = order[order.length - 1];
      let next = neighbors[curr].find((n) => !visited.has(n));
      if (next === undefined) {
        // Fallback to closest unvisited face by normal dot product
        let bestDot = -Infinity;
        for (let k = 0; k < 20; k++) {
          if (visited.has(k)) continue;
          const dot =
            normals[curr][0] * normals[k][0] +
            normals[curr][1] * normals[k][1] +
            normals[curr][2] * normals[k][2];
          if (dot > bestDot) {
            bestDot = dot;
            next = k;
          }
        }
      }
      if (next === undefined) break;
      visited.add(next);
      order.push(next);
    }
    labelsByFace = new Array(20).fill('1');
    order.forEach((faceIdx, step) => {
      labelsByFace[faceIdx] = String(20 - step);
    });
  } else {
    // Classic opposite-sum-21 RPG D20 layout where 20 is surrounded by 2, 8, 14 and high/low alternate
    // Using exact dual icosahedral face graph:
    // Face 8 = [0, invPhi, PHI] (top-front) is "20", opposite Face 9 is "1"
    // Its 3 neighbors: Face 0 ([1,1,1]), Face 6 ([-1,1,1]), Face 10 ([0,-invPhi,PHI]) -> 2, 8, 14
    const assigned = new Map<number, number>();
    const pairNumbers = [20, 2, 8, 14, 18, 12, 6, 4, 10, 16];
    // Assign BFS around face 8 while enforcing opposite-sum-21 and balanced spread
    assigned.set(8, 20);
    assigned.set(9, 1);
    const n8 = neighbors[8];
    const firstRing = [2, 8, 14];
    n8.forEach((fIdx, k) => {
      assigned.set(fIdx, firstRing[k]);
      assigned.set(fIdx ^ 1, 21 - firstRing[k]);
    });

    const remainingPool = pairNumbers
      .flatMap((v) => [v, 21 - v])
      .filter((v) => !Array.from(assigned.values()).includes(v));

    // Deterministic greedy assignment maximizing neighbor label contrast
    for (let i = 0; i < 20; i += 2) {
      if (assigned.has(i)) continue;
      let bestVal = remainingPool[0];
      let bestScore = -Infinity;
      for (const cand of remainingPool) {
        const opp = 21 - cand;
        let score = 0;
        for (const nb of neighbors[i]) {
          const nbVal = assigned.get(nb);
          if (nbVal !== undefined) score += Math.abs(cand - nbVal);
        }
        for (const nb of neighbors[i ^ 1]) {
          const nbVal = assigned.get(nb);
          if (nbVal !== undefined) score += Math.abs(opp - nbVal);
        }
        if (score > bestScore) {
          bestScore = score;
          bestVal = cand;
        }
      }
      assigned.set(i, bestVal);
      assigned.set(i ^ 1, 21 - bestVal);
      const oppVal = 21 - bestVal;
      remainingPool.splice(remainingPool.indexOf(bestVal), 1);
      const oppIdx = remainingPool.indexOf(oppVal);
      if (oppIdx !== -1) remainingPool.splice(oppIdx, 1);
    }

    labelsByFace = Array.from({ length: 20 }, (_, idx) => String(assigned.get(idx) ?? idx + 1));
  }

  return normals.map((n, idx) => {
    // Point away from an adjacent face's normal (toward the opposite triangle apex)
    // closest to world +Z so every triangle stands upright with its base edge horizontal at -Y.
    let bestUp: Vec3 = [0, 0, 1];
    let bestZ = -Infinity;
    for (const nbIdx of neighbors[idx]) {
      const opp = scale3(normals[nbIdx], -1);
      if (opp[2] > bestZ) {
        bestZ = opp[2];
        bestUp = opp;
      }
    }
    return {
      id: `face_${labelsByFace[idx]}`,
      normal: n,
      distance: d,
      isNumbered: true,
      role: 'primary',
      faceLabel: labelsByFace[idx],
      upHint: bestUp,
    };
  });
}

/**
 * Generates exact outward-facing half-space planes for any die configuration.
 */
export function buildDieHalfSpaces(settings: DieSettings): HalfSpacePlane[] {
  switch (settings.kind) {
    case 'd2':
      return buildD2CoinPlanes(settings.d2Variant, settings.sizeMm, settings.secondarySizeMm);
    case 'd3':
      return buildD3Planes(settings.d3Variant, settings.sizeMm, settings.secondarySizeMm);
    case 'd4':
      return buildD4Planes(settings);
    case 'd5':
      return buildOddDiePlanes(5, settings.oddVariant, settings.sizeMm, settings.secondarySizeMm);
    case 'd6':
      return buildD6Planes(settings);
    case 'd7':
      return buildOddDiePlanes(7, settings.oddVariant, settings.sizeMm, settings.secondarySizeMm);
    case 'd8':
      return buildD8Planes(settings);
    case 'd9':
      return buildOddDiePlanes(9, settings.oddVariant, settings.sizeMm, settings.secondarySizeMm);
    case 'd10':
      return buildD10Planes(settings, false);
    case 'd00':
      return buildD10Planes(settings, true);
    case 'd12':
      return buildD12Planes(settings);
    case 'd20':
      return buildD20Planes(settings.sizeMm, settings.d20Numbering);
  }
}

/**
 * Computes exact physical caliper reference measurements (F2F & Height in mm) from DieSettings.
 */
export function computeNominalCalipers(settings: DieSettings): {
  faceToFaceMm: number;
  heightMm: number;
} {
  const s = settings.sizeMm;
  switch (settings.kind) {
    case 'd2': {
      let spanMm = s;
      if (settings.d2Variant === 'oval') spanMm = s * 1.28;
      else if (settings.d2Variant === 'hexagon') spanMm = s / Math.cos(Math.PI / 6);
      else if (settings.d2Variant === 'shield') spanMm = s * 1.126;
      return { faceToFaceMm: settings.secondarySizeMm, heightMm: spanMm };
    }
    case 'd3':
      return { faceToFaceMm: s, heightMm: settings.secondarySizeMm };
    case 'd4':
      if (
        settings.d4Variant === 'crystal' ||
        settings.d4Variant === 'arch' ||
        settings.d4Variant === 'pendulum'
      ) {
        return { faceToFaceMm: s, heightMm: settings.secondarySizeMm };
      }
      return { faceToFaceMm: s, heightMm: s };
    case 'd5':
    case 'd7':
    case 'd9':
      if (settings.oddVariant === 'crystal') {
        return { faceToFaceMm: s, heightMm: Math.max(s * 1.7, settings.secondarySizeMm) };
      }
      if (settings.oddVariant === 'prism') {
        return { faceToFaceMm: s, heightMm: Math.max(8, settings.secondarySizeMm) };
      }
      return { faceToFaceMm: s, heightMm: s * 1.18 };
    case 'd6':
      if (settings.d6Variant === 'crystal') {
        return { faceToFaceMm: s, heightMm: Math.max(s * 1.7, settings.secondarySizeMm) };
      }
      if (settings.d6Variant === 'rhombic') return { faceToFaceMm: s, heightMm: s * 1.48 };
      if (settings.d6Variant === 'truncated') return { faceToFaceMm: s, heightMm: s * 1.4 };
      return { faceToFaceMm: s, heightMm: s * Math.sqrt(3) };
    case 'd8':
      if (settings.d8Variant === 'crystal') {
        return { faceToFaceMm: s, heightMm: Math.max(s * 1.7, settings.secondarySizeMm) };
      }
      if (settings.d8Variant === 'shard') {
        return { faceToFaceMm: s, heightMm: Math.max(s * 1.24, settings.secondarySizeMm) };
      }
      return { faceToFaceMm: s, heightMm: s * Math.sqrt(3) };
    case 'd10':
    case 'd00':
      if (settings.d10Variant === 'crystal') {
        return { faceToFaceMm: s, heightMm: Math.max(s * 1.7, settings.secondarySizeMm) };
      }
      return { faceToFaceMm: s, heightMm: s * 1.22 };
    case 'd12':
      if (settings.d12Variant === 'crystal') {
        return { faceToFaceMm: s, heightMm: Math.max(s * 1.7, settings.secondarySizeMm) };
      }
      if (settings.d12Variant === 'rhombic') {
        return { faceToFaceMm: s, heightMm: s * Math.SQRT2 };
      }
      return { faceToFaceMm: s, heightMm: s * 1.258 };
    case 'd20':
      return { faceToFaceMm: s, heightMm: s * 1.26 };
  }
}
