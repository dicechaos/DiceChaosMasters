import JSZip from 'jszip';
import type { FontEntry } from '../types/dice';

const inMemoryFontCache = new Map<string, ArrayBuffer>();

export function isDesktopRuntime(): boolean {
  return typeof window !== 'undefined' && Boolean(window.api?.isDesktop);
}

/**
 * Discovers installed system TrueType/OpenType fonts via Electron main process.
 * Returns empty in browser mode (where bundled + drag/dropped fonts are used).
 */
export async function discoverSystemFonts(): Promise<FontEntry[]> {
  if (!isDesktopRuntime() || !window.api) {
    return [];
  }
  try {
    const fonts = await window.api.fonts.listSystem();
    return fonts.map((font) => ({
      id: font.id,
      name: font.name,
      family: font.family,
      source: 'system' as const,
      systemPath: font.filePath,
    }));
  } catch (err) {
    console.warn('System font discovery unavailable:', err);
    return [];
  }
}

export async function loadFontArrayBuffer(font: FontEntry): Promise<ArrayBuffer> {
  const cached = inMemoryFontCache.get(font.id);
  if (cached) return cached;

  if (font.dataBase64) {
    const binary = atob(font.dataBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    inMemoryFontCache.set(font.id, bytes.buffer);
    return bytes.buffer;
  }

  if (font.source === 'system' && font.systemPath && window.api) {
    const bytes = await window.api.fonts.readFile(font.systemPath);
    const ab = bytes.slice().buffer;
    inMemoryFontCache.set(font.id, ab);
    return ab;
  }

  if (font.url) {
    try {
      const resp = await fetch(font.url);
      if (resp.ok) {
        const ab = await resp.arrayBuffer();
        inMemoryFontCache.set(font.id, ab);
        return ab;
      }
    } catch {
      // Fallback to Electron bundled font IPC on restricted file:// environments
    }

    if (window.api) {
      const fileName = font.url.split('/').pop();
      if (fileName) {
        const bytes = await window.api.fonts.readBundled(fileName);
        const ab = bytes.slice().buffer;
        inMemoryFontCache.set(font.id, ab);
        return ab;
      }
    }

    throw new Error(`Failed to fetch bundled font "${font.name}" from ${font.url}.`);
  }

  throw new Error(`Font "${font.name}" has no loadable source.`);
}

export function cacheFontBytes(fontId: string, ab: ArrayBuffer): void {
  inMemoryFontCache.set(fontId, ab);
}

export async function openExternalUrl(url: string): Promise<void> {
  if (window.api) {
    await window.api.shell.openExternal(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export interface BundleFilePayload {
  relativePath: string;
  bytes: Uint8Array;
}

export async function openProjectFromDisk(): Promise<{
  canceled: boolean;
  filePath?: string;
  name?: string;
  bytes?: Uint8Array;
}> {
  if (window.api) {
    return window.api.project.openDialog();
  }
  return { canceled: true };
}

export async function saveProjectToDisk(
  suggestedName: string,
  bytes: Uint8Array,
  existingPath?: string | null,
): Promise<{
  canceled: boolean;
  filePath?: string;
  name?: string;
}> {
  if (window.api) {
    return window.api.project.saveDialog(suggestedName, bytes, existingPath);
  }
  triggerBrowserDownload(suggestedName, bytes, 'application/zip');
  return { canceled: false, name: suggestedName };
}

export async function autoSaveProjectToDisk(
  filePath: string,
  bytes: Uint8Array,
): Promise<boolean> {
  if (!window.api) return false;
  try {
    return await window.api.project.autoSave(filePath, bytes);
  } catch {
    return false;
  }
}

export function syncWindowDirtyState(state: {
  isDirty: boolean;
  filePath?: string | null;
  setName?: string;
}): void {
  if (window.api) {
    window.api.project.setDirtyState(state);
  }
}

export function subscribeSaveAndQuit(cb: () => void): () => void {
  if (window.api) {
    return window.api.project.onSaveAndQuit(cb);
  }
  return () => {};
}

export function confirmQuitClean(): void {
  if (window.api) {
    window.api.project.confirmQuitClean();
  }
}

export async function exportBundleToDisk(
  folderName: string,
  files: BundleFilePayload[],
): Promise<string> {
  if (window.api) {
    const res = await window.api.export.writeBundle(folderName, files);
    if (res.canceled || !res.outputDir) {
      throw new Error('Export canceled by user.');
    }
    return `Saved ${res.count ?? files.length} files to ${res.outputDir}`;
  }

  const anyWin = window as unknown as {
    showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
  };

  if (typeof anyWin.showDirectoryPicker === 'function') {
    const root = await anyWin.showDirectoryPicker({ mode: 'readwrite' });
    const bundleRoot = await root.getDirectoryHandle(folderName, { create: true });

    for (const file of files) {
      const parts = file.relativePath.split('/').filter(Boolean);
      let cursor = bundleRoot;
      for (let i = 0; i < parts.length - 1; i++) {
        cursor = await cursor.getDirectoryHandle(parts[i], { create: true });
      }
      const fileHandle = await cursor.getFileHandle(parts[parts.length - 1], { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(new Blob([Uint8Array.from(file.bytes)]));
      await writable.close();
    }
    return `Saved ${files.length} files into "${folderName}" folder.`;
  }

  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.relativePath, file.bytes);
  }
  const zipBytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  triggerBrowserDownload(`${folderName}.zip`, zipBytes, 'application/zip');
  return `Downloaded ${folderName}.zip (${files.length} files).`;
}

export async function saveBytesFile(
  suggestedName: string,
  bytes: Uint8Array,
  mimeType = 'application/octet-stream',
): Promise<boolean> {
  if (window.api) {
    const res = await window.api.export.saveBytesFile(suggestedName, bytes);
    return !res.canceled;
  }
  triggerBrowserDownload(suggestedName, bytes, mimeType);
  return true;
}

function triggerBrowserDownload(filename: string, bytes: Uint8Array, mimeType: string): void {
  const blob = new Blob([Uint8Array.from(bytes)], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
