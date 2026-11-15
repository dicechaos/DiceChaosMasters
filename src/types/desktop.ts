export interface DesktopFontInfo {
  id: string;
  name: string;
  family: string;
  filePath: string;
}

export interface BundleExportFile {
  relativePath: string;
  bytes: Uint8Array;
}

export interface DesktopBridgeAPI {
  platform: string;
  isDesktop: boolean;
  fonts: {
    listSystem: () => Promise<DesktopFontInfo[]>;
    readFile: (filePath: string) => Promise<Uint8Array>;
    readBundled: (fileName: string) => Promise<Uint8Array>;
  };
  project: {
    openDialog: () => Promise<{
      canceled: boolean;
      filePath?: string;
      name?: string;
      bytes?: Uint8Array;
    }>;
    saveDialog: (
      suggestedName: string,
      bytes: Uint8Array,
      existingPath?: string | null,
    ) => Promise<{
      canceled: boolean;
      filePath?: string;
      name?: string;
    }>;
    autoSave: (filePath: string, bytes: Uint8Array) => Promise<boolean>;
    setDirtyState: (state: {
      isDirty: boolean;
      filePath?: string | null;
      setName?: string;
    }) => void;
    onSaveAndQuit: (cb: () => void) => () => void;
    confirmQuitClean: () => void;
  };
  export: {
    writeBundle: (
      folderName: string,
      files: BundleExportFile[],
    ) => Promise<{ canceled: boolean; outputDir?: string; count?: number }>;
    saveBytesFile: (
      suggestedName: string,
      bytes: Uint8Array,
    ) => Promise<{ canceled: boolean; filePath?: string }>;
  };
  shell: {
    openExternal: (url: string) => Promise<boolean>;
  };
}
