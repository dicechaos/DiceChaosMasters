import JSZip from 'jszip';
import type { DiceProjectState } from '../../types/dice';
import { getProjectDieOrder, normalizeSelectedDice } from '../presets';

export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

/**
 * Serializes a complete DiceProjectState (including embedded custom fonts & SVGs)
 * into a self-contained `.dcproj` ZIP archive.
 */
export interface EmbeddedExtraFont {
  id: string;
  name: string;
  bytes: Uint8Array;
}

export async function packProjectArchive(
  project: DiceProjectState,
  activeFontExtraBytes?: EmbeddedExtraFont | EmbeddedExtraFont[] | null,
): Promise<Uint8Array> {
  const zip = new JSZip();
  const stateClone: DiceProjectState = structuredClone(project);

  // If active or per-die overridden font(s) are OS system fonts not yet bundled in uploadedFonts, embed them so .dcproj is 100% portable
  const extras = Array.isArray(activeFontExtraBytes)
    ? activeFontExtraBytes
    : activeFontExtraBytes
      ? [activeFontExtraBytes]
      : [];
  for (const extra of extras) {
    if (!stateClone.uploadedFonts.some((f) => f.id === extra.id)) {
      stateClone.uploadedFonts.push({
        id: extra.id,
        name: extra.name,
        dataBase64: uint8ToBase64(extra.bytes),
      });
    }
  }

  zip.file('manifest.json', JSON.stringify(stateClone, null, 2));

  for (const font of stateClone.uploadedFonts) {
    zip.file(`fonts/${font.id}.ttf`, base64ToUint8(font.dataBase64));
  }

  for (const svg of stateClone.svgAssets) {
    if (!svg.builtIn) {
      zip.file(`svgs/${svg.id}.svg`, svg.svgContent);
    }
  }

  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

/**
 * Unpacks a `.dcproj` archive into a validated DiceProjectState.
 */
export async function unpackProjectArchive(bytes: Uint8Array): Promise<DiceProjectState> {
  const zip = await JSZip.loadAsync(bytes);
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) {
    throw new Error('Invalid .dcproj archive: manifest.json is missing.');
  }
  const rawJson = await manifestFile.async('string');
  const parsed = JSON.parse(rawJson) as DiceProjectState;
  if (!parsed || typeof parsed !== 'object' || !parsed.dice || !parsed.typography) {
    throw new Error('Invalid .dcproj manifest schema.');
  }
  // Normalize instance order, multi-select & backfill fields for legacy v1 .dcproj archives
  const dieOrder = getProjectDieOrder(parsed);
  parsed.dieOrder = dieOrder;
  for (const id of dieOrder) {
    const d = parsed.dice[id];
    if (!d) continue;
    if (!d.id) d.id = id;
    if (d.customLabel === undefined) d.customLabel = '';
    if (d.fontIdOverride === undefined) d.fontIdOverride = null;
    if (d.engravingDepthOverrideMm === undefined) d.engravingDepthOverrideMm = null;
    if (d.useHighFaceEmblemOverride === undefined) d.useHighFaceEmblemOverride = null;
    if (d.highFaceSvgIdOverride === undefined) d.highFaceSvgIdOverride = null;
    if (d.blankClearanceOverrideMm === undefined) d.blankClearanceOverrideMm = null;
    if (d.d2Variant === undefined) d.d2Variant = 'round';
    if (d.oddVariant === undefined) d.oddVariant = 'trapezohedron';
    if (d.d6Variant === undefined) d.d6Variant = 'cube';
    if (d.d8Variant === undefined) d.d8Variant = 'octahedron';
    if (d.d10Variant === undefined) d.d10Variant = 'trapezohedron';
    if (d.d12Variant === undefined) d.d12Variant = 'pentagonal';
    if (!d.faceOverrides) d.faceOverrides = {};
  }
  if (!parsed.activeDie || !(parsed.activeDie in parsed.dice)) {
    parsed.activeDie = 'd20' in parsed.dice ? 'd20' : (dieOrder[0] ?? 'd20');
  }
  parsed.selectedDice = normalizeSelectedDice(parsed.selectedDice, parsed.activeDie, dieOrder);
  return parsed;
}
