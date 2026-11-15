import { contextBridge, ipcRenderer } from 'electron';
import type { BundleExportFile, DesktopBridgeAPI, DesktopFontInfo } from '../../src/types/desktop';

const api: DesktopBridgeAPI = {
  platform: process.platform,
  isDesktop: true,
  fonts: {
    listSystem: () => ipcRenderer.invoke('fonts:listSystem') as Promise<DesktopFontInfo[]>,
    readFile: (filePath: string) => ipcRenderer.invoke('fonts:readFile', filePath) as Promise<Uint8Array>,
    readBundled: (fileName: string) =>
      ipcRenderer.invoke('fonts:readBundled', fileName) as Promise<Uint8Array>,
  },
  project: {
    openDialog: () => ipcRenderer.invoke('project:openDialog'),
    saveDialog: (suggestedName: string, bytes: Uint8Array, existingPath?: string | null) =>
      ipcRenderer.invoke('project:saveDialog', suggestedName, bytes, existingPath),
    autoSave: (filePath: string, bytes: Uint8Array) =>
      ipcRenderer.invoke('project:autoSave', filePath, bytes),
    setDirtyState: (state) => ipcRenderer.send('project:setDirtyState', state),
    onSaveAndQuit: (cb: () => void) => {
      const listener = () => cb();
      ipcRenderer.on('project:save-and-quit', listener);
      return () => {
        ipcRenderer.removeListener('project:save-and-quit', listener);
      };
    },
    confirmQuitClean: () => ipcRenderer.send('project:confirmQuitClean'),
  },
  export: {
    writeBundle: (folderName: string, files: BundleExportFile[]) =>
      ipcRenderer.invoke('export:writeBundle', folderName, files),
    saveBytesFile: (suggestedName: string, bytes: Uint8Array) =>
      ipcRenderer.invoke('export:saveBytesFile', suggestedName, bytes),
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  },
};

contextBridge.exposeInMainWorld('api', api);
