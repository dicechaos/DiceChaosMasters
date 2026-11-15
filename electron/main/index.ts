import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } from 'electron';
import { electronApp, is, optimizer } from '@electron-toolkit/utils';
import { existsSync, mkdirSync, promises as fs } from 'fs';
import { homedir } from 'os';
import { basename, dirname, extname, join, normalize, resolve, sep } from 'path';

interface DirtyState {
  isDirty: boolean;
  filePath?: string | null;
  setName?: string;
}

const allowedFontPaths = new Set<string>();
const knownProjectPaths = new Set<string>();
const dirtyByContentsId = new Map<number, DirtyState>();
const forceCloseIds = new Set<number>();

function toBuffer(payload: unknown): Buffer {
  if (Buffer.isBuffer(payload)) {
    return payload;
  }
  if (payload instanceof ArrayBuffer) {
    return Buffer.from(payload);
  }
  if (ArrayBuffer.isView(payload)) {
    return Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength);
  }
  throw new Error('Expected binary byte buffer payload.');
}

async function writeFileAtomic(targetPath: string, data: Buffer): Promise<void> {
  const dir = dirname(targetPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const tmpPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    await fs.writeFile(tmpPath, data);
    await fs.rename(tmpPath, targetPath);
  } catch (err) {
    try {
      await fs.unlink(tmpPath);
    } catch {
      // Ignore temporary cleanup failure
    }
    throw err;
  }
}

function sanitizeSegment(raw: string, fallback = 'export'): string {
  const cleaned = raw
    .replace(/[<>:"/\\|?*\x00-\x1f]+/g, '_')
    .replace(/^[.\s]+|[.\s]+$/g, '');
  if (!cleaned || cleaned === '.' || cleaned === '..') {
    return fallback;
  }
  return cleaned;
}

function getSystemFontRoots(): string[] {
  const roots: string[] = [];
  if (process.platform === 'win32') {
    const winDir = process.env.WINDIR || 'C:\\Windows';
    roots.push(join(winDir, 'Fonts'));
    if (process.env.LOCALAPPDATA) {
      roots.push(join(process.env.LOCALAPPDATA, 'Microsoft', 'Windows', 'Fonts'));
    }
  } else if (process.platform === 'darwin') {
    roots.push('/Library/Fonts', '/System/Library/Fonts', join(homedir(), 'Library', 'Fonts'));
  } else {
    roots.push(
      '/usr/share/fonts',
      '/usr/local/share/fonts',
      join(homedir(), '.local', 'share', 'fonts'),
      join(homedir(), '.fonts'),
    );
  }
  return roots.filter((p) => existsSync(p));
}

function formatFontDisplayName(fileName: string): string {
  const stem = basename(fileName, extname(fileName));
  return stem
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

async function walkFontsDir(
  dir: string,
  depth: number,
  seenNames: Set<string>,
  results: Array<{ id: string; name: string; family: string; filePath: string }>,
): Promise<void> {
  if (depth > 4 || results.length >= 600) return;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (results.length >= 600) break;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkFontsDir(fullPath, depth + 1, seenNames, results);
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = extname(entry.name).toLowerCase();
    if (ext !== '.ttf' && ext !== '.otf') continue;

    let realPath: string;
    try {
      realPath = await fs.realpath(fullPath);
    } catch {
      continue;
    }

    const displayName = formatFontDisplayName(entry.name);
    const dedupKey = displayName.toLowerCase();
    if (!displayName || seenNames.has(dedupKey)) continue;

    seenNames.add(dedupKey);
    allowedFontPaths.add(realPath);
    results.push({
      id: `sys-${dedupKey.replace(/[^a-z0-9]+/g, '-')}`,
      name: displayName,
      family: displayName,
      filePath: realPath,
    });
  }
}

function resolveAppIcon(): Electron.NativeImage | string | undefined {
  const ext = process.platform === 'win32' ? 'ico' : 'png';
  const candidates = [
    join(process.resourcesPath, `icon.${ext}`),
    join(process.resourcesPath, 'icon.png'),
    join(app.getAppPath(), 'resources', `icon.${ext}`),
    join(app.getAppPath(), 'build', `icon.${ext}`),
    join(app.getAppPath(), 'build', 'icon.png'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      const img = nativeImage.createFromPath(candidate);
      if (!img.isEmpty()) return img;
    }
  }
  return undefined;
}

function updateWindowTitle(win: BrowserWindow, state?: DirtyState): void {
  if (win.isDestroyed()) return;
  const label = state?.setName?.trim() || 'Dice Chaos Set';
  const fileLabel = state?.filePath ? ` — ${basename(state.filePath)}` : '';
  const dirtyMark = state?.isDirty ? ' *' : '';
  win.setTitle(`${label}${fileLabel}${dirtyMark} — Dice Chaos Masters`);
}

function createWindow(): BrowserWindow {
  const icon = resolveAppIcon();
  const mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#090d1a',
    title: 'Dice Chaos Masters',
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const wcId = mainWindow.webContents.id;

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    if (forceCloseIds.has(wcId)) {
      forceCloseIds.delete(wcId);
      dirtyByContentsId.delete(wcId);
      return;
    }

    const state = dirtyByContentsId.get(wcId);
    if (!state?.isDirty) {
      dirtyByContentsId.delete(wcId);
      return;
    }

    event.preventDefault();
    void (async () => {
      const targetName = state.filePath
        ? basename(state.filePath)
        : state.setName || 'Untitled Dice Set';
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        buttons: ['Save & Quit', "Don't Save", 'Cancel'],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
        title: 'Unsaved Changes',
        message: `Save changes to "${targetName}" before closing?`,
        detail: 'Unsaved parameter, font, or face edits will be lost if you close without saving.',
      });

      if (result.response === 0) {
        mainWindow.webContents.send('project:save-and-quit');
      } else if (result.response === 1) {
        forceCloseIds.add(wcId);
        mainWindow.close();
      }
    })();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        void shell.openExternal(url);
      }
    } catch {
      // Ignore malformed URLs
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL'];
    if (is.dev && devUrl && targetUrl.startsWith(devUrl)) {
      return;
    }
    const rendererDirUrl = `file:///${resolve(__dirname, '../renderer').replace(/\\/g, '/')}`;
    if (targetUrl.replace(/\\/g, '/').startsWith(rendererDirUrl)) {
      return;
    }
    event.preventDefault();
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return mainWindow;
}

function registerIpcHandlers(): void {
  ipcMain.handle('fonts:listSystem', async () => {
    const roots = getSystemFontRoots();
    const seenNames = new Set<string>();
    const collected: Array<{ id: string; name: string; family: string; filePath: string }> = [];
    for (const root of roots) {
      await walkFontsDir(root, 0, seenNames, collected);
    }
    collected.sort((a, b) => a.name.localeCompare(b.name));
    return collected;
  });

  ipcMain.handle('fonts:readFile', async (_event, filePath: string) => {
    if (typeof filePath !== 'string' || !filePath) {
      throw new Error('Invalid font path.');
    }
    const real = await fs.realpath(filePath);
    const ext = extname(real).toLowerCase();
    if (ext !== '.ttf' && ext !== '.otf') {
      throw new Error('Unsupported font extension.');
    }
    const roots = await Promise.all(
      getSystemFontRoots().map(async (r) => {
        try {
          return await fs.realpath(r);
        } catch {
          return r;
        }
      }),
    );
    const inRoot = roots.some((root) => {
      const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
      return real.toLowerCase().startsWith(prefix.toLowerCase());
    });
    if (!allowedFontPaths.has(real) && !inRoot) {
      throw new Error('Font path is outside allowed OS font directories.');
    }
    const buf = await fs.readFile(real);
    return Uint8Array.from(buf);
  });

  ipcMain.handle('fonts:readBundled', async (_event, fileName: string) => {
    if (typeof fileName !== 'string' || !/^[A-Za-z0-9._-]+\.(ttf|otf)$/i.test(fileName)) {
      throw new Error('Invalid bundled font filename.');
    }
    const candidates = [
      join(__dirname, '../renderer/fonts', fileName),
      join(app.getAppPath(), 'out', 'renderer', 'fonts', fileName),
      join(app.getAppPath(), 'public', 'fonts', fileName),
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        const buf = await fs.readFile(candidate);
        return Uint8Array.from(buf);
      }
    }
    throw new Error(`Bundled font not found: ${fileName}`);
  });

  ipcMain.handle('project:openDialog', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const opts: Electron.OpenDialogOptions = {
      title: 'Open Dice Chaos Project',
      filters: [{ name: 'Dice Chaos Project', extensions: ['dcproj'] }],
      properties: ['openFile'],
    };
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    if (res.canceled || res.filePaths.length === 0) {
      return { canceled: true };
    }
    const filePath = resolve(res.filePaths[0]);
    knownProjectPaths.add(filePath);
    const buf = await fs.readFile(filePath);
    return {
      canceled: false,
      filePath,
      name: basename(filePath),
      bytes: Uint8Array.from(buf),
    };
  });

  ipcMain.handle(
    'project:saveDialog',
    async (event, suggestedName: string, rawBytes: unknown, existingPath?: string | null) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const data = toBuffer(rawBytes);

      if (
        typeof existingPath === 'string' &&
        existingPath.trim().length > 0 &&
        /\.dcproj$/i.test(existingPath)
      ) {
        const target = resolve(existingPath);
        if (knownProjectPaths.has(target) && existsSync(dirname(target))) {
          await writeFileAtomic(target, data);
          return {
            canceled: false,
            filePath: target,
            name: basename(target),
          };
        }
      }

      const defaultName = `${sanitizeSegment(suggestedName.replace(/\.dcproj$/i, ''), 'DiceChaosSet')}.dcproj`;
      const saveOpts: Electron.SaveDialogOptions = {
        title: 'Save Dice Chaos Project',
        defaultPath: defaultName,
        filters: [{ name: 'Dice Chaos Project', extensions: ['dcproj'] }],
      };
      const res = win
        ? await dialog.showSaveDialog(win, saveOpts)
        : await dialog.showSaveDialog(saveOpts);
      if (res.canceled || !res.filePath) {
        return { canceled: true };
      }
      const finalPath = resolve(
        /\.dcproj$/i.test(res.filePath) ? res.filePath : `${res.filePath}.dcproj`,
      );
      await writeFileAtomic(finalPath, data);
      knownProjectPaths.add(finalPath);
      return {
        canceled: false,
        filePath: finalPath,
        name: basename(finalPath),
      };
    },
  );

  ipcMain.handle('project:autoSave', async (_event, filePath: string, rawBytes: unknown) => {
    if (typeof filePath !== 'string' || !/\.dcproj$/i.test(filePath)) {
      return false;
    }
    const resolvedPath = resolve(filePath);
    if (!knownProjectPaths.has(resolvedPath)) {
      return false;
    }
    const data = toBuffer(rawBytes);
    await writeFileAtomic(resolvedPath, data);
    return true;
  });

  ipcMain.on('project:setDirtyState', (event, state: DirtyState) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const cleanState: DirtyState = {
      isDirty: Boolean(state?.isDirty),
      filePath: typeof state?.filePath === 'string' ? state.filePath : null,
      setName: typeof state?.setName === 'string' ? state.setName : undefined,
    };
    dirtyByContentsId.set(event.sender.id, cleanState);
    updateWindowTitle(win, cleanState);
  });

  ipcMain.on('project:confirmQuitClean', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    forceCloseIds.add(event.sender.id);
    win.close();
  });

  ipcMain.handle(
    'export:writeBundle',
    async (
      event,
      folderName: string,
      files: Array<{ relativePath: string; bytes: unknown }>,
    ) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const pickOpts: Electron.OpenDialogOptions = {
        title: 'Select Export Output Folder',
        properties: ['openDirectory', 'createDirectory'],
      };
      const picked = win
        ? await dialog.showOpenDialog(win, pickOpts)
        : await dialog.showOpenDialog(pickOpts);
      if (picked.canceled || picked.filePaths.length === 0) {
        return { canceled: true };
      }

      const safeFolder = sanitizeSegment(folderName, 'DiceChaosExport');
      const outputDir = resolve(picked.filePaths[0], safeFolder);
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      let count = 0;
      for (const file of files) {
        const normalized = normalize(file.relativePath).replace(/^([/\\])+/, '');
        const segments = normalized
          .split(/[/\\]+/)
          .filter(Boolean)
          .map((seg) => sanitizeSegment(seg, 'file'));
        if (segments.length === 0) continue;

        const dest = resolve(outputDir, ...segments);
        if (dest !== outputDir && !dest.startsWith(`${outputDir}${sep}`)) {
          throw new Error(`Blocked path traversal outside export folder: ${file.relativePath}`);
        }
        await writeFileAtomic(dest, toBuffer(file.bytes));
        count++;
      }

      return { canceled: false, outputDir, count };
    },
  );

  ipcMain.handle('export:saveBytesFile', async (event, suggestedName: string, rawBytes: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const ext = extname(suggestedName).replace(/^\./, '').toLowerCase() || 'bin';
    const filterName =
      ext === '3mf'
        ? '3MF Mesh Package'
        : ext === 'stl'
          ? 'STL Mesh'
          : ext === 'zip'
            ? 'ZIP Archive'
            : ext === 'md'
              ? 'Markdown Document'
              : 'Exported File';

    const saveOpts: Electron.SaveDialogOptions = {
      title: 'Save Export File',
      defaultPath: suggestedName,
      filters: [{ name: filterName, extensions: [ext] }],
    };
    const res = win
      ? await dialog.showSaveDialog(win, saveOpts)
      : await dialog.showSaveDialog(saveOpts);
    if (res.canceled || !res.filePath) {
      return { canceled: true };
    }
    const target = resolve(res.filePath);
    await writeFileAtomic(target, toBuffer(rawBytes));
    return { canceled: false, filePath: target };
  });

  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        await shell.openExternal(url);
        return true;
      }
    } catch {
      // Ignore invalid external URLs
    }
    return false;
  });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const existing = BrowserWindow.getAllWindows()[0];
    if (existing) {
      if (existing.isMinimized()) existing.restore();
      existing.focus();
    }
  });

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.dicechaos.masters');

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window);
    });

    registerIpcHandlers();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
