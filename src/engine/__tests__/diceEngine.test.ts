import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Font } from 'opentype.js';
import { buildBatchExportFiles } from '../exporters/batchExporter';
import { packProjectArchive, unpackProjectArchive } from '../exporters/projectArchive';
import { encodeBinaryStl } from '../exporters/stlExporter';
import { encodeThreeMf } from '../exporters/threeMfExporter';
import { generateDieGeometry } from '../generator';
import { getManifold } from '../manifoldInstance';
import { computeCreaseNormalsBuffer } from '../meshNormals';
import { buildDieHalfSpaces } from '../polyhedra/definitions';
import { buildManifoldFromFaces, clipHalfSpaces } from '../polyhedra/halfspace';
import { createDefaultProjectState, DIE_ORDER } from '../presets';
import { parseFontBuffer } from '../typography/glyphBuilder';
import type { D4Variant, D3Variant, DieKind } from '../../types/dice';

let defaultFont: Font;
let fontBytes: Uint8Array;

beforeAll(async () => {
  await getManifold();
  const fontPath = resolve(process.cwd(), 'public/fonts/ChakraPetch-Bold.ttf');
  const buf = readFileSync(fontPath);
  fontBytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  defaultFont = parseFontBuffer(ab);
});

describe('Dice Chaos Masters Geometry & CSG Engine', () => {
  it('generates all 9 core dice with strictly watertight manifold meshes and zero blank breaches', async () => {
    const project = createDefaultProjectState('standard');
    const wasm = await getManifold();

    for (const kind of DIE_ORDER) {
      const settings = project.dice[kind];
      const basePlanes = buildDieHalfSpaces(settings);
      for (const p of basePlanes) {
        expect(p.distance, `${kind}:${p.id} plane distance > 0`).toBeGreaterThan(0);
      }
      const baseFaces = clipHalfSpaces(basePlanes);
      const unengraved = buildManifoldFromFaces(wasm, baseFaces);
      const baseVolume = unengraved.volume();
      unengraved.delete();

      const res = await generateDieGeometry(kind, project, defaultFont, {
        includeBlank: true,
        includeSupports: false,
      });

      expect(res.masterMesh.manifoldStatus, `${kind} master status`).toBe('NoError');
      expect(res.masterMesh.triangleCount, `${kind} triangles`).toBeGreaterThan(20);
      expect(res.masterMesh.volumeMm3, `${kind} engraved volume`).toBeGreaterThan(10);
      expect(res.masterMesh.volumeMm3, `${kind} engraving removed resin`).toBeLessThan(baseVolume);

      expect(res.blankMesh).not.toBeNull();
      expect(res.blankMesh!.manifoldStatus, `${kind} blank status`).toBe('NoError');
      expect(res.blankMesh!.volumeMm3).toBeGreaterThan(5);
      expect(res.blankMesh!.volumeMm3).toBeLessThan(res.masterMesh.volumeMm3);

      expect(res.breach.hasBreach, `${kind} blank breach`).toBe(false);
      expect(res.breach.breachVolumeMm3).toBeLessThan(1e-4);
      expect(res.breach.blankFitsInsideMaster).toBe(true);
    }
  });

  it('generates all 6 D4 variants + D3 rounded_prism with watertight manifolds and matched blanks', async () => {
    const project = createDefaultProjectState('standard');
    const d4Variants: D4Variant[] = [
      'classic_vertex',
      'classic_base',
      'crystal',
      'arch',
      'pendulum',
      'truncated',
    ];

    for (const variant of d4Variants) {
      project.dice.d4.d4Variant = variant;
      const res = await generateDieGeometry('d4', project, defaultFont, {
        includeBlank: true,
        includeSupports: false,
      });
      expect(res.masterMesh.manifoldStatus, `d4:${variant} master`).toBe('NoError');
      expect(res.blankMesh!.manifoldStatus, `d4:${variant} blank`).toBe('NoError');
      expect(res.breach.hasBreach, `d4:${variant} breach`).toBe(false);
    }

    const d3Variants: D3Variant[] = ['truncated_barrel', 'rounded_prism'];
    for (const variant of d3Variants) {
      project.dice.d3.d3Variant = variant;
      const res = await generateDieGeometry('d3', project, defaultFont, {
        includeBlank: true,
        includeSupports: false,
      });
      expect(res.masterMesh.manifoldStatus, `d3:${variant} master`).toBe('NoError');
      expect(res.blankMesh!.manifoldStatus, `d3:${variant} blank`).toBe('NoError');
      expect(res.breach.hasBreach, `d3:${variant} breach`).toBe(false);
    }
  });

  it('preserves exact face-to-face offset math between Master and Matched Blank', async () => {
    const project = createDefaultProjectState('standard');
    project.typography.engravingDepthMm = 0.8;
    project.blanks.clearanceMm = 0.05;
    project.blanks.bubbleBevelMm = 0;
    project.dice.d6.sizeMm = 20.0;
    project.dice.d6.edgeChamferMm = 0;

    const res = await generateDieGeometry('d6', project, defaultFont, {
      includeBlank: true,
      includeSupports: false,
    });

    const masterSpanX = res.masterMesh.boundsMax[0] - res.masterMesh.boundsMin[0];
    const blankSpanX = res.blankMesh!.boundsMax[0] - res.blankMesh!.boundsMin[0];

    expect(masterSpanX).toBeCloseTo(20.0, 2);
    // Expected blank F2F = 20.0 - 2 * (0.8 + 0.05) = 18.30 mm
    expect(blankSpanX).toBeCloseTo(18.3, 2);
    expect(res.calipers.blankFaceToFaceMm).toBeCloseTo(18.3, 2);
  });

  it('detects shell breaches automatically when negative clearance is forced', async () => {
    const project = createDefaultProjectState('standard');
    project.typography.engravingDepthMm = 0.9;
    project.dice.d6.blankClearanceOverrideMm = -0.35;

    const res = await generateDieGeometry('d6', project, defaultFont, {
      includeBlank: true,
      includeSupports: false,
    });

    expect(res.breach.hasBreach).toBe(true);
    expect(res.breach.breachVolumeMm3).toBeGreaterThan(0.01);
  });

  it('supports high-face SVG emblem subtraction and anti-tear draft angles across all bundled fonts', async () => {
    const fontFiles = [
      'CinzelDecorative-Bold.ttf',
      'MedievalSharp-Regular.ttf',
      'UncialAntiqua-Regular.ttf',
      'ChakraPetch-Bold.ttf',
      'RussoOne-Regular.ttf',
    ];

    for (const file of fontFiles) {
      const buf = readFileSync(resolve(process.cwd(), 'public/fonts', file));
      const font = parseFontBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const project = createDefaultProjectState('standard');
      project.typography.useHighFaceEmblem = true;
      project.typography.draftAngleDeg = 18;
      project.dice.d20.d20Numbering = 'balanced';

      const res = await generateDieGeometry('d20', project, font, {
        includeBlank: true,
        includeSupports: false,
      });

      expect(res.masterMesh.manifoldStatus, `${file} D20 master`).toBe('NoError');
      expect(res.breach.hasBreach, `${file} D20 blank`).toBe(false);
    }
  });

  it('generates point-down fin & edge bumper supports sitting cleanly at Z = 0', async () => {
    const project = createDefaultProjectState('standard');
    project.supports.enabled = true;
    project.supports.pointDown = true;

    const kindsToCheck: DieKind[] = ['d4', 'd6', 'd20'];
    for (const kind of kindsToCheck) {
      const res = await generateDieGeometry(kind, project, defaultFont, {
        includeBlank: false,
        includeSupports: true,
      });
      expect(res.supportMesh).not.toBeNull();
      expect(res.supportMesh!.manifoldStatus).toBe('NoError');
      expect(res.supportMesh!.boundsMin[2]).toBeCloseTo(0, 2);
      expect(res.masterMesh.boundsMin[2]).toBeGreaterThan(project.supports.raftThicknessMm);
    }
  });

  it('exports valid binary STL, 3MF XML archive, batch bundle, and .dcproj round-trip', async () => {
    const project = createDefaultProjectState('standard');
    // Enable subset for snappy batch export test
    for (const k of DIE_ORDER) project.dice[k].enabled = k === 'd6' || k === 'd4';

    const batch = await buildBatchExportFiles(project, defaultFont, 'Chakra Petch Bold');
    expect(batch.breachedDice).toHaveLength(0);
    // 2 dice * (master STL + master 3MF + blank STL + blank 3MF) + 1 Caliper_Specs.md = 9 files
    expect(batch.files).toHaveLength(9);

    const stlFile = batch.files.find((f) => f.relativePath.endsWith('D6_Master.stl'));
    expect(stlFile).toBeDefined();
    const view = new DataView(stlFile!.bytes.buffer, stlFile!.bytes.byteOffset, stlFile!.bytes.byteLength);
    const triCount = view.getUint32(80, true);
    expect(triCount).toBeGreaterThan(100);
    expect(stlFile!.bytes.byteLength).toBe(84 + triCount * 50);

    const threeMfFile = batch.files.find((f) => f.relativePath.endsWith('D6_Master.3mf'));
    expect(threeMfFile).toBeDefined();
    const threeMfZip = await JSZip.loadAsync(threeMfFile!.bytes);
    const modelXml = await threeMfZip.file('3D/3dmodel.model')?.async('string');
    expect(modelXml).toContain('unit="millimeter"');
    expect(modelXml).toContain('<triangle ');

    expect(batch.specMarkdown).toContain('Dice Chaos Masters');
    expect(batch.specMarkdown).toContain('Blank F2F = Master F2F');

    // Also test standalone encoders + .dcproj round-trip
    const single = await generateDieGeometry('d6', project, defaultFont, {
      includeBlank: false,
      includeSupports: false,
    });
    const rawStl = encodeBinaryStl(single.masterMesh);
    expect(rawStl.byteLength).toBe(84 + single.masterMesh.triangleCount * 50);
    const raw3mf = await encodeThreeMf(single.masterMesh);
    expect(raw3mf.byteLength).toBeGreaterThan(200);

    const dcprojBytes = await packProjectArchive(project, {
      id: 'custom-test-font',
      name: 'Chakra Petch Test',
      bytes: fontBytes,
    });
    const unpacked = await unpackProjectArchive(dcprojBytes);
    expect(unpacked.setName).toBe(project.setName);
    expect(unpacked.uploadedFonts.some((f) => f.id === 'custom-test-font')).toBe(true);
  });

  it('produces watertight 0-bevel hard-edge geometry and razor-sharp crease-split normals across all dice', async () => {
    const project = createDefaultProjectState('standard');
    for (const k of DIE_ORDER) {
      project.dice[k].edgeChamferMm = 0;
    }

    const assertHardPrimaryFaceNormals = (
      kind: DieKind,
      res: Awaited<ReturnType<typeof generateDieGeometry>>,
    ) => {
      const planes = buildDieHalfSpaces(project.dice[kind]).filter((p) => p.role === 'primary');
      const { positions, normals } = computeCreaseNormalsBuffer(res.masterMesh, 15);
      const triCount = Math.floor(positions.length / 9);
      let checkedTris = 0;

      for (let t = 0; t < triCount; t++) {
        const b = t * 9;
        const ax = positions[b];
        const ay = positions[b + 1];
        const az = positions[b + 2];
        const bx = positions[b + 3];
        const by = positions[b + 4];
        const bz = positions[b + 5];
        const cx = positions[b + 6];
        const cy = positions[b + 7];
        const cz = positions[b + 8];

        const ux = bx - ax;
        const uy = by - ay;
        const uz = bz - az;
        const vx = cx - ax;
        const vy = cy - ay;
        const vz = cz - az;
        let tnx = uy * vz - uz * vy;
        let tny = uz * vx - ux * vz;
        let tnz = ux * vy - uy * vx;
        const tLen = Math.hypot(tnx, tny, tnz);
        if (tLen < 1e-9) continue;
        tnx /= tLen;
        tny /= tLen;
        tnz /= tLen;

        const mx = (ax + bx + cx) / 3;
        const my = (ay + by + cy) / 3;
        const mz = (az + bz + cz) / 3;

        const matchedFace = planes.find((p) => {
          const dist = p.normal[0] * mx + p.normal[1] * my + p.normal[2] * mz;
          const triDot = p.normal[0] * tnx + p.normal[1] * tny + p.normal[2] * tnz;
          return Math.abs(dist - p.distance) < 1e-3 && triDot > 0.999;
        });
        if (!matchedFace) continue;

        checkedTris++;
        for (let k = 0; k < 3; k++) {
          const nb = b + k * 3;
          const dotN =
            normals[nb] * matchedFace.normal[0] +
            normals[nb + 1] * matchedFace.normal[1] +
            normals[nb + 2] * matchedFace.normal[2];
          expect(dotN, `${kind} face ${matchedFace.id} tri ${t} v${k} normal dot`).toBeGreaterThan(
            0.9999,
          );
        }
      }

      expect(checkedTris, `${kind} checked primary face triangles`).toBeGreaterThan(planes.length);
    };

    let d2Res: Awaited<ReturnType<typeof generateDieGeometry>> | null = null;
    let d10Res: Awaited<ReturnType<typeof generateDieGeometry>> | null = null;
    let d20Res: Awaited<ReturnType<typeof generateDieGeometry>> | null = null;

    for (const kind of DIE_ORDER) {
      const res = await generateDieGeometry(kind, project, defaultFont, {
        includeBlank: true,
        includeSupports: false,
      });
      expect(res.masterMesh.manifoldStatus, `0-bevel ${kind} master status`).toBe('NoError');
      expect(res.blankMesh!.manifoldStatus, `0-bevel ${kind} blank status`).toBe('NoError');
      expect(res.breach.hasBreach, `0-bevel ${kind} breach`).toBe(false);

      const stlBytes = encodeBinaryStl(res.masterMesh);
      const stlView = new DataView(stlBytes.buffer, stlBytes.byteOffset, stlBytes.byteLength);
      const numTri = stlView.getUint32(80, true);
      expect(numTri).toBe(res.masterMesh.triangleCount);
      for (let t = 0; t < numTri; t++) {
        const off = 84 + t * 50;
        for (let f = 0; f < 12; f++) {
          expect(Number.isNaN(stlView.getFloat32(off + f * 4, true))).toBe(false);
        }
      }

      if (kind === 'd2') d2Res = res;
      if (kind === 'd10') d10Res = res;
      if (kind === 'd20') d20Res = res;
    }

    expect(d20Res).not.toBeNull();
    expect(d10Res).not.toBeNull();
    expect(d2Res).not.toBeNull();

    const threeMfBytes = await encodeThreeMf(d20Res!.masterMesh, 'D20_HardEdge');
    const threeMfZip = await JSZip.loadAsync(threeMfBytes);
    const modelXml = await threeMfZip.file('3D/3dmodel.model')?.async('string');
    expect(modelXml).toContain('<mesh>');
    expect(modelXml).toContain('<triangle ');

    assertHardPrimaryFaceNormals('d20', d20Res!);
    assertHardPrimaryFaceNormals('d10', d10Res!);

    // Verify D2 cylindrical rim (< 15 deg per facet) keeps smooth vertex-averaged normals
    const d2Buffers = computeCreaseNormalsBuffer(d2Res!.masterMesh, 15);
    const d2TriCount = Math.floor(d2Buffers.positions.length / 9);
    let smoothedRimVertices = 0;
    for (let t = 0; t < d2TriCount; t++) {
      const b = t * 9;
      const ux = d2Buffers.positions[b + 3] - d2Buffers.positions[b];
      const uy = d2Buffers.positions[b + 4] - d2Buffers.positions[b + 1];
      const uz = d2Buffers.positions[b + 5] - d2Buffers.positions[b + 2];
      const vx = d2Buffers.positions[b + 6] - d2Buffers.positions[b];
      const vy = d2Buffers.positions[b + 7] - d2Buffers.positions[b + 1];
      const vz = d2Buffers.positions[b + 8] - d2Buffers.positions[b + 2];
      let tnx = uy * vz - uz * vy;
      let tny = uz * vx - ux * vz;
      let tnz = ux * vy - uy * vx;
      const len = Math.hypot(tnx, tny, tnz);
      if (len < 1e-9) continue;
      tnx /= len;
      tny /= len;
      tnz /= len;
      if (Math.abs(tnz) >= 0.05) continue;

      for (let k = 0; k < 3; k++) {
        const nb = b + k * 3;
        const dotN =
          d2Buffers.normals[nb] * tnx +
          d2Buffers.normals[nb + 1] * tny +
          d2Buffers.normals[nb + 2] * tnz;
        if (dotN > 0.99 && dotN < 0.99999) {
          smoothedRimVertices++;
        }
      }
    }
    expect(smoothedRimVertices).toBeGreaterThan(20);
  });
});
