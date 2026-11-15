import JSZip from 'jszip';
import type { DiceProjectState } from '../../types/dice';

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
export async function packProjectArchive(
  project: DiceProjectState,
  activeFontExtraBytes?: { id: string; name: string; bytes: Uint8Array } | null,
): Promise<Uint8Array> {
  const zip = new JSZip();
  const stateClone: DiceProjectState = structuredClone(project);

  // If active font is an OS system font not yet bundled in uploadedFonts, embed it so .dcproj is 100% portable
  if (
    activeFontExtraBytes &&
    !stateClone.uploadedFonts.some((f) => f.id === activeFontExtraBytes.id)
  ) {
    stateClone.uploadedFonts.push({
      id: activeFontExtraBytes.id,
      name: activeFontExtraBytes.name,
      dataBase64: uint8ToBase64(activeFontExtraBytes.bytes),
    });
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
  return parsed;
}
