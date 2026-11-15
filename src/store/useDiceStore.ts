import { create } from 'zustand';
import type { BatchProgressInfo } from '../engine/exporters/batchExporter';
import {
  packProjectArchive,
  uint8ToBase64,
  unpackProjectArchive,
} from '../engine/exporters/projectArchive';
import {
  BUNDLED_FONTS,
  DIE_DISPLAY_NAMES,
  DIE_ORDER,
  SET_PRESETS,
  createDefaultProjectState,
} from '../engine/presets';
import { diceWorkerClient } from '../engine/workerClient';
import {
  autoSaveProjectToDisk,
  cacheFontBytes,
  discoverSystemFonts,
  exportBundleToDisk,
  isDesktopRuntime,
  loadFontArrayBuffer,
  openProjectFromDisk,
  saveBytesFile,
  saveProjectToDisk,
  syncWindowDirtyState,
} from '../platform/desktopBridge';
import type {
  BlankConfig,
  D4Variant,
  DiceProjectState,
  DieKind,
  DieSettings,
  ExportConfig,
  FaceOverride,
  FontEntry,
  GeneratedDieResult,
  InspectorTab,
  ResinPreviewPreset,
  SetPresetId,
  SupportConfig,
  ThemePreference,
  TypographyConfig,
  ViewportMode,
} from '../types/dice';

const MAX_HISTORY = 50;
const COALESCE_WINDOW_MS = 650;
const AUTOSAVE_DELAY_MS = 1500;
const THEME_STORAGE_KEY = 'dcm-theme';
const AUTOSAVE_STORAGE_KEY = 'dcm-autosave';
const RESIN_STORAGE_KEY = 'dcm-resin-preset';

let activeGenToken = 0;
let trayGenToken = 0;
let lastHistoryActionKey: string | null = null;
let lastHistoryAt = 0;
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

function readInitialThemePreference(): ThemePreference {
  try {
    const val = localStorage.getItem(THEME_STORAGE_KEY);
    if (val === 'light' || val === 'dark') return val;
  } catch {
    // Ignore storage access errors
  }
  return 'system';
}

function getSystemIsDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolveThemeValue(pref: ThemePreference): 'dark' | 'light' {
  if (pref === 'dark' || pref === 'light') return pref;
  return getSystemIsDark() ? 'dark' : 'light';
}

function applyThemeMeta(pref: ThemePreference): void {
  if (typeof document === 'undefined') return;
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) {
    meta.setAttribute('content', pref === 'system' ? 'light dark' : pref);
  }
}

function readInitialAutoSave(): boolean {
  try {
    const raw = localStorage.getItem(AUTOSAVE_STORAGE_KEY);
    return raw === null ? true : raw === 'true';
  } catch {
    return true;
  }
}

function readInitialResinPreset(): ResinPreviewPreset {
  try {
    const raw = localStorage.getItem(RESIN_STORAGE_KEY);
    if (
      raw === 'master_grey' ||
      raw === 'arcane_sapphire' ||
      raw === 'cure_clear' ||
      raw === 'obsidian_cyan'
    ) {
      return raw;
    }
  } catch {
    // Ignore
  }
  return 'master_grey';
}

function findActiveFontEntry(project: DiceProjectState, systemFonts: FontEntry[]): FontEntry {
  const id = project.typography.activeFontId;
  const bundled = BUNDLED_FONTS.find((f) => f.id === id);
  if (bundled) return bundled;

  const uploaded = project.uploadedFonts.find((u) => u.id === id);
  if (uploaded) {
    return {
      id: uploaded.id,
      name: uploaded.name,
      family: uploaded.name,
      source: 'uploaded',
      dataBase64: uploaded.dataBase64,
    };
  }

  const sys = systemFonts.find((f) => f.id === id);
  if (sys) return sys;

  return BUNDLED_FONTS[0];
}

export interface ExportSummaryInfo {
  fileCount: number;
  destinationLabel: string;
  breachedDice: DieKind[];
}

export interface DiceStoreState {
  project: DiceProjectState;
  systemFonts: FontEntry[];
  activeResult: GeneratedDieResult | null;
  trayResults: Partial<Record<DieKind, GeneratedDieResult>>;
  isGenerating: boolean;
  generationError: string | null;
  selectedFaceId: string | null;
  statusMessage: string;

  exportModalOpen: boolean;
  isExporting: boolean;
  exportProgress: BatchProgressInfo | null;
  exportSummary: ExportSummaryInfo | null;
  exportError: string | null;

  historyPast: DiceProjectState[];
  historyFuture: DiceProjectState[];
  canUndo: boolean;
  canRedo: boolean;

  isDirty: boolean;
  currentProjectPath: string | null;
  lastSavedAt: number | null;
  autoSaveEnabled: boolean;

  theme: ThemePreference;
  resolvedTheme: 'dark' | 'light';
  resinPreset: ResinPreviewPreset;
  isFocusMode: boolean;
  cameraResetSeq: number;
  shortcutsModalOpen: boolean;
  tourOpen: boolean;
  tourStep: number;

  initFonts: () => Promise<void>;
  initThemeSync: () => () => void;
  regenerateActiveDie: () => Promise<void>;
  regenerateTray: () => Promise<void>;

  setSetName: (name: string) => void;
  setActiveDie: (die: DieKind) => void;
  setViewportMode: (mode: ViewportMode) => void;
  setActiveTab: (tab: InspectorTab) => void;
  setSelectedFaceId: (faceId: string | null) => void;

  applyPreset: (preset: SetPresetId) => void;
  updateDieSettings: (die: DieKind, patch: Partial<DieSettings>) => void;
  setD4Variant: (variant: D4Variant) => void;
  updateFaceOverride: (die: DieKind, faceId: string, patch: Partial<FaceOverride> | null) => void;
  updateTypography: (patch: Partial<TypographyConfig>) => void;
  updateBlanks: (patch: Partial<BlankConfig>) => void;
  updateSupports: (patch: Partial<SupportConfig>) => void;
  updateExportConfig: (patch: Partial<ExportConfig>) => void;

  uploadFontFile: (file: File) => Promise<void>;
  uploadSvgFile: (file: File, assignToFaceId?: string | null) => Promise<string>;
  handleDroppedFiles: (files: FileList | File[]) => Promise<void>;

  undo: () => void;
  redo: () => void;

  saveProjectFile: (saveAs?: boolean) => Promise<boolean>;
  openProjectDialog: () => Promise<void>;
  loadProjectFile: (bytes: Uint8Array, filePath?: string | null) => Promise<void>;
  resetProject: () => void;
  toggleAutoSave: () => void;

  setThemePreference: (pref: ThemePreference) => void;
  cycleThemeToggle: () => void;
  setResinPreset: (preset: ResinPreviewPreset) => void;
  toggleFocusMode: () => void;
  setFocusMode: (focus: boolean) => void;
  triggerCameraFit: () => void;
  setShortcutsModalOpen: (open: boolean) => void;
  openTour: (step?: number) => void;
  closeTour: () => void;
  setTourStep: (step: number) => void;
  setStatusMessage: (msg: string) => void;

  setExportModalOpen: (open: boolean) => void;
  runBatchExport: () => Promise<void>;
}

const initialTheme = readInitialThemePreference();

export const useDiceStore = create<DiceStoreState>((set, get) => {
  const scheduleAutoSaveIfNeeded = () => {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }
    const s = get();
    if (!s.autoSaveEnabled || !s.currentProjectPath || !isDesktopRuntime()) return;

    autoSaveTimer = setTimeout(async () => {
      autoSaveTimer = null;
      const latest = get();
      if (!latest.isDirty || !latest.currentProjectPath || !latest.autoSaveEnabled) return;
      try {
        const fontEntry = findActiveFontEntry(latest.project, latest.systemFonts);
        let extraFont: { id: string; name: string; bytes: Uint8Array } | null = null;
        if (fontEntry.source === 'system') {
          const ab = await loadFontArrayBuffer(fontEntry);
          extraFont = { id: fontEntry.id, name: fontEntry.name, bytes: new Uint8Array(ab) };
        }
        const packed = await packProjectArchive(latest.project, extraFont);
        const ok = await autoSaveProjectToDisk(latest.currentProjectPath, packed);
        if (ok) {
          set({
            isDirty: false,
            lastSavedAt: Date.now(),
            statusMessage: `Auto-saved "${latest.project.setName}"`,
          });
          syncWindowDirtyState({
            isDirty: false,
            filePath: latest.currentProjectPath,
            setName: latest.project.setName,
          });
        }
      } catch (err) {
        console.warn('Auto-save failed:', err);
      }
    }, AUTOSAVE_DELAY_MS);
  };

  const commitProjectMutation = (
    nextProject: DiceProjectState,
    historyKey: string | null,
    regenMode: 'active' | 'tray' | 'both' | 'none' = 'active',
  ) => {
    const state = get();
    const now = Date.now();
    const canCoalesce =
      historyKey !== null &&
      historyKey === lastHistoryActionKey &&
      now - lastHistoryAt < COALESCE_WINDOW_MS;

    let nextPast = state.historyPast;
    if (!canCoalesce) {
      nextPast = [...state.historyPast, state.project];
      if (nextPast.length > MAX_HISTORY) {
        nextPast = nextPast.slice(nextPast.length - MAX_HISTORY);
      }
      lastHistoryActionKey = historyKey;
    }
    lastHistoryAt = now;

    set({
      project: nextProject,
      historyPast: nextPast,
      historyFuture: [],
      canUndo: nextPast.length > 0,
      canRedo: false,
      isDirty: true,
    });

    syncWindowDirtyState({
      isDirty: true,
      filePath: state.currentProjectPath,
      setName: nextProject.setName,
    });
    scheduleAutoSaveIfNeeded();

    if (regenMode === 'tray' || (regenMode === 'active' && nextProject.viewportMode === 'tray')) {
      void get().regenerateTray();
    } else if (regenMode === 'both') {
      void get().regenerateActiveDie();
      if (nextProject.viewportMode === 'tray') {
        void get().regenerateTray();
      }
    } else if (regenMode === 'active') {
      void get().regenerateActiveDie();
    }
  };

  return {
    project: createDefaultProjectState('standard'),
    systemFonts: [],
    activeResult: null,
    trayResults: {},
    isGenerating: false,
    generationError: null,
    selectedFaceId: null,
    statusMessage: 'Initializing geometry kernel and fonts…',

    exportModalOpen: false,
    isExporting: false,
    exportProgress: null,
    exportSummary: null,
    exportError: null,

    historyPast: [],
    historyFuture: [],
    canUndo: false,
    canRedo: false,

    isDirty: false,
    currentProjectPath: null,
    lastSavedAt: null,
    autoSaveEnabled: readInitialAutoSave(),

    theme: initialTheme,
    resolvedTheme: resolveThemeValue(initialTheme),
    resinPreset: readInitialResinPreset(),
    isFocusMode: false,
    cameraResetSeq: 0,
    shortcutsModalOpen: false,
    tourOpen: false,
    tourStep: 0,

    initFonts: async () => {
      const sysFonts = await discoverSystemFonts();
      set({ systemFonts: sysFonts });
      await get().regenerateActiveDie();
      syncWindowDirtyState({
        isDirty: get().isDirty,
        filePath: get().currentProjectPath,
        setName: get().project.setName,
      });
    },

    initThemeSync: () => {
      applyThemeMeta(get().theme);
      set({ resolvedTheme: resolveThemeValue(get().theme) });

      if (typeof window === 'undefined') return () => {};
      const media = window.matchMedia?.('(prefers-color-scheme: dark)');

      const onMediaChange = () => {
        if (get().theme === 'system') {
          set({ resolvedTheme: resolveThemeValue('system') });
        }
      };

      const onStorage = (event: StorageEvent) => {
        if (event.key === THEME_STORAGE_KEY) {
          const next = readInitialThemePreference();
          applyThemeMeta(next);
          set({ theme: next, resolvedTheme: resolveThemeValue(next) });
        }
      };

      media?.addEventListener('change', onMediaChange);
      window.addEventListener('storage', onStorage);
      return () => {
        media?.removeEventListener('change', onMediaChange);
        window.removeEventListener('storage', onStorage);
      };
    },

    regenerateActiveDie: async () => {
      const token = ++activeGenToken;
      const { project, systemFonts } = get();
      const kind = project.activeDie;
      set({ isGenerating: true, generationError: null });

      try {
        const fontEntry = findActiveFontEntry(project, systemFonts);
        const fontAb = await loadFontArrayBuffer(fontEntry);
        const includeBlank =
          project.viewportMode === 'xray' || project.blanks.includeBlanksOnExport;
        const includeSupports = project.viewportMode === 'supports';

        const result = await diceWorkerClient.generateDie(
          kind,
          project,
          fontAb,
          includeBlank,
          includeSupports,
        );
        if (token !== activeGenToken) return;

        set((s) => ({
          activeResult: result,
          trayResults: { ...s.trayResults, [kind]: result },
          isGenerating: false,
          generationError: null,
          statusMessage: `${DIE_DISPLAY_NAMES[kind]} ready (${result.masterMesh.triangleCount.toLocaleString()} tris, ${
            result.breach.hasBreach ? 'depth warning' : 'caliper verified'
          })`,
        }));
      } catch (err) {
        if (token !== activeGenToken) return;
        const msg = err instanceof Error ? err.message : String(err);
        set({
          isGenerating: false,
          generationError: msg,
          statusMessage: `Build warning: ${msg}`,
        });
      }
    },

    regenerateTray: async () => {
      const token = ++trayGenToken;
      const { project, systemFonts } = get();
      set({
        isGenerating: true,
        generationError: null,
        statusMessage: 'Building full 9-die tray…',
      });

      try {
        const fontEntry = findActiveFontEntry(project, systemFonts);
        const fontAb = await loadFontArrayBuffer(fontEntry);
        const nextTray: Partial<Record<DieKind, GeneratedDieResult>> = {};

        for (const kind of DIE_ORDER) {
          if (token !== trayGenToken) return;
          if (!project.dice[kind].enabled) continue;
          const res = await diceWorkerClient.generateDie(
            kind,
            project,
            fontAb,
            project.blanks.includeBlanksOnExport,
            false,
          );
          if (token !== trayGenToken) return;
          nextTray[kind] = res;
        }

        if (token !== trayGenToken) return;
        set({
          trayResults: nextTray,
          activeResult: nextTray[project.activeDie] ?? get().activeResult,
          isGenerating: false,
          statusMessage: 'Full polyhedral tray ready.',
        });
      } catch (err) {
        if (token !== trayGenToken) return;
        const msg = err instanceof Error ? err.message : String(err);
        set({ isGenerating: false, generationError: msg, statusMessage: `Tray error: ${msg}` });
      }
    },

    setSetName: (name) => {
      const s = get();
      commitProjectMutation({ ...s.project, setName: name }, 'project:setName', 'none');
    },

    setActiveDie: (die) => {
      set((s) => ({
        selectedFaceId: null,
        project: { ...s.project, activeDie: die, selectedFaceId: null },
      }));
      void get().regenerateActiveDie();
    },

    setViewportMode: (mode) => {
      set((s) => ({
        project: { ...s.project, viewportMode: mode },
      }));
      if (mode === 'tray') {
        void get().regenerateTray();
      } else {
        void get().regenerateActiveDie();
      }
    },

    setActiveTab: (tab) => {
      set((s) => ({
        project: { ...s.project, activeTab: tab },
      }));
    },

    setSelectedFaceId: (faceId) =>
      set((s) => ({
        selectedFaceId: faceId,
        project: { ...s.project, selectedFaceId: faceId },
      })),

    applyPreset: (preset) => {
      const def = SET_PRESETS[preset];
      const s = get();
      const updatedDice: Record<DieKind, DieSettings> = { ...s.project.dice };
      for (const kind of DIE_ORDER) {
        updatedDice[kind] = {
          ...s.project.dice[kind],
          ...def.sizes[kind],
        };
      }
      commitProjectMutation(
        {
          ...s.project,
          presetId: preset,
          dice: updatedDice,
        },
        null,
        s.project.viewportMode === 'tray' ? 'tray' : 'active',
      );
      set({ statusMessage: `Applied ${def.label} sizing preset.` });
    },

    updateDieSettings: (die, patch) => {
      const s = get();
      const patchKeys = Object.keys(patch).sort().join(',');
      commitProjectMutation(
        {
          ...s.project,
          dice: {
            ...s.project.dice,
            [die]: { ...s.project.dice[die], ...patch },
          },
        },
        `die:${die}:${patchKeys}`,
        'active',
      );
    },

    setD4Variant: (variant) => {
      const s = get();
      commitProjectMutation(
        {
          ...s.project,
          dice: {
            ...s.project.dice,
            d4: { ...s.project.dice.d4, d4Variant: variant },
          },
        },
        'project:d4Variant',
        'active',
      );
    },

    updateFaceOverride: (die, faceId, patch) => {
      const s = get();
      const currentDie = s.project.dice[die];
      const prevOverrides = { ...currentDie.faceOverrides };

      if (patch === null) {
        delete prevOverrides[faceId];
      } else {
        const existing: FaceOverride = prevOverrides[faceId] ?? {
          scaleMultiplier: 1,
          offsetXMm: 0,
          offsetYMm: 0,
          rotationDeg: 0,
        };
        prevOverrides[faceId] = { ...existing, ...patch };
      }

      const patchKeys = patch ? Object.keys(patch).sort().join(',') : 'reset';
      commitProjectMutation(
        {
          ...s.project,
          dice: {
            ...s.project.dice,
            [die]: {
              ...currentDie,
              faceOverrides: prevOverrides,
            },
          },
        },
        `override:${die}:${faceId}:${patchKeys}`,
        'active',
      );
    },

    updateTypography: (patch) => {
      const s = get();
      const patchKeys = Object.keys(patch).sort().join(',');
      commitProjectMutation(
        {
          ...s.project,
          typography: { ...s.project.typography, ...patch },
        },
        `typography:${patchKeys}`,
        'active',
      );
    },

    updateBlanks: (patch) => {
      const s = get();
      const patchKeys = Object.keys(patch).sort().join(',');
      commitProjectMutation(
        {
          ...s.project,
          blanks: { ...s.project.blanks, ...patch },
        },
        `blanks:${patchKeys}`,
        'active',
      );
    },

    updateSupports: (patch) => {
      const s = get();
      const patchKeys = Object.keys(patch).sort().join(',');
      commitProjectMutation(
        {
          ...s.project,
          supports: { ...s.project.supports, ...patch },
        },
        `supports:${patchKeys}`,
        'active',
      );
    },

    updateExportConfig: (patch) => {
      const s = get();
      const patchKeys = Object.keys(patch).sort().join(',');
      commitProjectMutation(
        {
          ...s.project,
          exportConfig: { ...s.project.exportConfig, ...patch },
        },
        `exportConfig:${patchKeys}`,
        'none',
      );
    },

    uploadFontFile: async (file) => {
      const ab = await file.arrayBuffer();
      const id = `upload-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9_-]/g, '')}`;
      const displayName = file.name.replace(/\.(ttf|otf|woff)$/i, '');
      const dataBase64 = uint8ToBase64(new Uint8Array(ab));
      cacheFontBytes(id, ab);

      const s = get();
      commitProjectMutation(
        {
          ...s.project,
          uploadedFonts: [...s.project.uploadedFonts, { id, name: displayName, dataBase64 }],
          typography: {
            ...s.project.typography,
            activeFontId: id,
          },
        },
        null,
        'active',
      );
      set({ statusMessage: `Loaded custom font "${displayName}".` });
    },

    uploadSvgFile: async (file, assignToFaceId) => {
      const svgContent = await file.text();
      const id = `svg-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9_-]/g, '')}`;
      const name = file.name.replace(/\.svg$/i, '');
      const s = get();
      const activeDie = s.project.activeDie;
      const curDie = s.project.dice[activeDie];
      const nextOverrides = { ...curDie.faceOverrides };

      if (typeof assignToFaceId === 'string' && assignToFaceId) {
        const existing = nextOverrides[assignToFaceId] ?? {
          scaleMultiplier: 1,
          offsetXMm: 0,
          offsetYMm: 0,
          rotationDeg: 0,
        };
        nextOverrides[assignToFaceId] = { ...existing, svgId: id };
      }

      const nextTypography =
        assignToFaceId === null
          ? {
              ...s.project.typography,
              useHighFaceEmblem: true,
              highFaceSvgId: id,
            }
          : s.project.typography;

      commitProjectMutation(
        {
          ...s.project,
          svgAssets: [...s.project.svgAssets, { id, name, svgContent, builtIn: false }],
          typography: nextTypography,
          dice: {
            ...s.project.dice,
            [activeDie]: { ...curDie, faceOverrides: nextOverrides },
          },
        },
        null,
        assignToFaceId !== undefined ? 'active' : 'none',
      );
      set({ statusMessage: `Imported SVG emblem "${name}".` });
      return id;
    },

    handleDroppedFiles: async (fileList) => {
      const files = Array.from(fileList);
      if (files.length === 0) return;

      for (const file of files) {
        const lower = file.name.toLowerCase();
        if (lower.endsWith('.dcproj')) {
          const buf = await file.arrayBuffer();
          await get().loadProjectFile(new Uint8Array(buf), null);
        } else if (lower.endsWith('.ttf') || lower.endsWith('.otf')) {
          await get().uploadFontFile(file);
        } else if (lower.endsWith('.svg')) {
          await get().uploadSvgFile(file, get().project.selectedFaceId ?? null);
        } else {
          set({
            statusMessage: `Unsupported dropped file "${file.name}". Supported: .dcproj, .ttf, .otf, .svg`,
          });
        }
      }
    },

    undo: () => {
      const s = get();
      if (s.historyPast.length === 0) return;
      const previous = s.historyPast[s.historyPast.length - 1];
      const nextPast = s.historyPast.slice(0, -1);
      const nextFuture = [s.project, ...s.historyFuture].slice(0, MAX_HISTORY);
      lastHistoryActionKey = null;

      set({
        project: previous,
        selectedFaceId: previous.selectedFaceId,
        historyPast: nextPast,
        historyFuture: nextFuture,
        canUndo: nextPast.length > 0,
        canRedo: nextFuture.length > 0,
        isDirty: true,
        statusMessage: 'Undid last change.',
      });

      syncWindowDirtyState({
        isDirty: true,
        filePath: s.currentProjectPath,
        setName: previous.setName,
      });
      scheduleAutoSaveIfNeeded();

      if (previous.viewportMode === 'tray') {
        void get().regenerateTray();
      } else {
        void get().regenerateActiveDie();
      }
    },

    redo: () => {
      const s = get();
      if (s.historyFuture.length === 0) return;
      const next = s.historyFuture[0];
      const nextFuture = s.historyFuture.slice(1);
      const nextPast = [...s.historyPast, s.project].slice(-MAX_HISTORY);
      lastHistoryActionKey = null;

      set({
        project: next,
        selectedFaceId: next.selectedFaceId,
        historyPast: nextPast,
        historyFuture: nextFuture,
        canUndo: nextPast.length > 0,
        canRedo: nextFuture.length > 0,
        isDirty: true,
        statusMessage: 'Redid change.',
      });

      syncWindowDirtyState({
        isDirty: true,
        filePath: s.currentProjectPath,
        setName: next.setName,
      });
      scheduleAutoSaveIfNeeded();

      if (next.viewportMode === 'tray') {
        void get().regenerateTray();
      } else {
        void get().regenerateActiveDie();
      }
    },

    saveProjectFile: async (saveAs = false) => {
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
      }
      const { project, systemFonts, currentProjectPath } = get();
      const fontEntry = findActiveFontEntry(project, systemFonts);
      let extraFont: { id: string; name: string; bytes: Uint8Array } | null = null;
      if (fontEntry.source === 'system') {
        const ab = await loadFontArrayBuffer(fontEntry);
        extraFont = { id: fontEntry.id, name: fontEntry.name, bytes: new Uint8Array(ab) };
      }

      const bytes = await packProjectArchive(project, extraFont);
      const safeName = (project.setName.trim() || 'DiceChaosSet').replace(/[^a-zA-Z0-9._-]+/g, '_');
      const res = await saveProjectToDisk(
        `${safeName}.dcproj`,
        bytes,
        saveAs ? null : currentProjectPath,
      );
      if (res.canceled) {
        return false;
      }

      const nextPath = res.filePath ?? currentProjectPath;
      set({
        isDirty: false,
        currentProjectPath: nextPath,
        lastSavedAt: Date.now(),
        statusMessage: `Saved ${res.name ?? `${safeName}.dcproj`}`,
      });
      syncWindowDirtyState({
        isDirty: false,
        filePath: nextPath,
        setName: project.setName,
      });
      return true;
    },

    openProjectDialog: async () => {
      const res = await openProjectFromDisk();
      if (res.canceled || !res.bytes) return;
      await get().loadProjectFile(res.bytes, res.filePath ?? null);
    },

    loadProjectFile: async (bytes, filePath = null) => {
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
      }
      const parsed = await unpackProjectArchive(bytes);
      for (const f of parsed.uploadedFonts) {
        const bin = atob(f.dataBase64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        cacheFontBytes(f.id, arr.buffer);
      }

      lastHistoryActionKey = null;
      set({
        project: parsed,
        selectedFaceId: parsed.selectedFaceId ?? null,
        historyPast: [],
        historyFuture: [],
        canUndo: false,
        canRedo: false,
        isDirty: false,
        currentProjectPath: filePath,
        lastSavedAt: Date.now(),
        statusMessage: `Loaded project "${parsed.setName}".`,
      });
      syncWindowDirtyState({
        isDirty: false,
        filePath,
        setName: parsed.setName,
      });

      if (parsed.viewportMode === 'tray') {
        await get().regenerateTray();
      } else {
        await get().regenerateActiveDie();
      }
    },

    resetProject: () => {
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
      }
      const next = createDefaultProjectState('standard');
      lastHistoryActionKey = null;
      set({
        project: next,
        selectedFaceId: null,
        trayResults: {},
        historyPast: [],
        historyFuture: [],
        canUndo: false,
        canRedo: false,
        isDirty: false,
        currentProjectPath: null,
        lastSavedAt: null,
        statusMessage: 'Started new standard dice project.',
      });
      syncWindowDirtyState({
        isDirty: false,
        filePath: null,
        setName: next.setName,
      });
      void get().regenerateActiveDie();
    },

    toggleAutoSave: () => {
      const next = !get().autoSaveEnabled;
      try {
        localStorage.setItem(AUTOSAVE_STORAGE_KEY, String(next));
      } catch {
        // Ignore storage restriction
      }
      set({
        autoSaveEnabled: next,
        statusMessage: next ? 'Auto-Save enabled.' : 'Auto-Save paused.',
      });
      if (next && get().isDirty && get().currentProjectPath) {
        scheduleAutoSaveIfNeeded();
      }
    },

    setThemePreference: (pref) => {
      try {
        if (pref === 'system') {
          localStorage.removeItem(THEME_STORAGE_KEY);
        } else {
          localStorage.setItem(THEME_STORAGE_KEY, pref);
        }
      } catch {
        // Ignore storage failure
      }
      applyThemeMeta(pref);
      set({
        theme: pref,
        resolvedTheme: resolveThemeValue(pref),
      });
    },

    cycleThemeToggle: () => {
      const sysScheme: 'dark' | 'light' = getSystemIsDark() ? 'dark' : 'light';
      const target: 'dark' | 'light' = get().resolvedTheme === 'dark' ? 'light' : 'dark';
      if (target === sysScheme) {
        get().setThemePreference('system');
      } else {
        get().setThemePreference(target);
      }
    },

    setResinPreset: (preset) => {
      try {
        localStorage.setItem(RESIN_STORAGE_KEY, preset);
      } catch {
        // Ignore
      }
      set({ resinPreset: preset });
    },

    toggleFocusMode: () => {
      set((s) => ({
        isFocusMode: !s.isFocusMode,
        statusMessage: !s.isFocusMode
          ? 'Focus Mode on (press \\ to restore panels)'
          : 'Panels restored.',
      }));
    },

    setFocusMode: (focus) => set({ isFocusMode: focus }),

    triggerCameraFit: () => set((s) => ({ cameraResetSeq: s.cameraResetSeq + 1 })),

    setShortcutsModalOpen: (open) => set({ shortcutsModalOpen: open }),

    openTour: (step = 0) => set({ tourOpen: true, tourStep: step }),

    closeTour: () => set({ tourOpen: false }),

    setTourStep: (step) => set({ tourStep: step }),

    setStatusMessage: (msg) => set({ statusMessage: msg }),

    setExportModalOpen: (open) =>
      set({
        exportModalOpen: open,
        exportSummary: open ? null : get().exportSummary,
        exportError: open ? null : get().exportError,
      }),

    runBatchExport: async () => {
      const { project, systemFonts } = get();
      set({
        isExporting: true,
        exportProgress: { currentStep: 0, totalSteps: 1, label: 'Preparing batch…' },
        exportSummary: null,
        exportError: null,
      });

      try {
        const fontEntry = findActiveFontEntry(project, systemFonts);
        const fontAb = await loadFontArrayBuffer(fontEntry);
        const batch = await diceWorkerClient.exportBatch(
          project,
          fontAb,
          fontEntry.name,
          (progress) => set({ exportProgress: progress }),
        );

        if (batch.files.length === 0) {
          throw new Error('No dice selected for export.');
        }

        if (
          batch.files.length === 1 &&
          project.exportConfig.exportStl !== project.exportConfig.export3mf &&
          !project.exportConfig.exportSpecSheet
        ) {
          const single = batch.files[0];
          const saved = await saveBytesFile(single.relativePath.split('/').pop()!, single.bytes);
          set({
            isExporting: false,
            exportProgress: null,
            exportSummary: saved
              ? {
                  fileCount: 1,
                  destinationLabel: single.relativePath,
                  breachedDice: batch.breachedDice,
                }
              : null,
            statusMessage: saved ? `Saved ${single.relativePath}` : 'Export canceled.',
          });
          return;
        }

        const safeFolder =
          (project.setName.trim() || 'DiceChaosExport').replace(/[^a-zA-Z0-9._-]+/g, '_') +
          '_Masters';
        const message = await exportBundleToDisk(
          safeFolder,
          batch.files.map((f) => ({ relativePath: f.relativePath, bytes: f.bytes })),
        );

        const warnNote =
          batch.breachedDice.length > 0
            ? ` Warning: engraving depth exceeds blank clearance on ${batch.breachedDice.join(', ').toUpperCase()}.`
            : '';

        set({
          isExporting: false,
          exportProgress: null,
          exportSummary: {
            fileCount: batch.files.length,
            destinationLabel: message,
            breachedDice: batch.breachedDice,
          },
          statusMessage: `${message}${warnNote}`,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        set({
          isExporting: false,
          exportProgress: null,
          exportError: msg,
        });
      }
    },
  };
});
