import { create } from 'zustand';
import type { BatchProgressInfo } from '../engine/exporters/batchExporter';
import {
  packProjectArchive,
  uint8ToBase64,
  unpackProjectArchive,
  type EmbeddedExtraFont,
} from '../engine/exporters/projectArchive';
import {
  BUNDLED_FONTS,
  DIE_DISPLAY_NAMES,
  DIE_ORDER,
  RPG_SEVEN_DICE,
  SET_PRESETS,
  buildSetFromTemplate,
  createDefaultDieSettings,
  createDefaultProjectState,
  getDieInstanceLabel,
  getDieInstanceShortTag,
  getProjectDieOrder,
  nextDieInstanceId,
  normalizeSelectedDice,
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
  ExportScope,
  FaceOverride,
  FontEntry,
  GeneratedDieResult,
  InspectorTab,
  ResinPreviewPreset,
  SetPresetId,
  SetTemplateId,
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
let trayBuildingIds = new Set<string>();
let lastHistoryActionKey: string | null = null;
let lastHistoryAt = 0;
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
let contextMenuSeq = 0;
let inspectorFocusSeq = 0;
let activeExportBlobUrl: string | null = null;
let exportRunSeq = 0;

function replaceExportBlobUrl(
  bytes?: Uint8Array,
  mimeType = 'application/octet-stream',
): string | undefined {
  if (
    activeExportBlobUrl &&
    typeof URL !== 'undefined' &&
    typeof URL.revokeObjectURL === 'function'
  ) {
    URL.revokeObjectURL(activeExportBlobUrl);
    activeExportBlobUrl = null;
  }
  if (!bytes || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return undefined;
  }
  activeExportBlobUrl = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: mimeType }));
  return activeExportBlobUrl;
}

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

function findFontEntryById(
  id: string,
  project: DiceProjectState,
  systemFonts: FontEntry[],
): FontEntry {
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

async function loadFontsForDice(
  dieIds: readonly string[],
  project: DiceProjectState,
  systemFonts: FontEntry[],
): Promise<{
  fontsByIdBytes: Record<string, ArrayBuffer>;
  fontNamesById: Record<string, string>;
}> {
  const requestedIds = new Set<string>([project.typography.activeFontId]);
  for (const id of dieIds) {
    const die = project.dice[id];
    if (die) {
      requestedIds.add(die.fontIdOverride ?? project.typography.activeFontId);
    }
  }

  const bufferByResolvedId = new Map<string, ArrayBuffer>();
  const fontsByIdBytes: Record<string, ArrayBuffer> = {};
  const fontNamesById: Record<string, string> = {};

  for (const requestedId of requestedIds) {
    const entry = findFontEntryById(requestedId, project, systemFonts);
    let ab = bufferByResolvedId.get(entry.id);
    if (!ab) {
      ab = await loadFontArrayBuffer(entry);
      bufferByResolvedId.set(entry.id, ab);
    }
    fontsByIdBytes[requestedId] = ab;
    fontNamesById[requestedId] = entry.name;
  }

  return { fontsByIdBytes, fontNamesById };
}

async function collectExtraSystemFonts(
  project: DiceProjectState,
  systemFonts: FontEntry[],
): Promise<EmbeddedExtraFont[]> {
  const fontIds = new Set<string>([project.typography.activeFontId]);
  for (const id of getProjectDieOrder(project)) {
    const ov = project.dice[id]?.fontIdOverride;
    if (ov) fontIds.add(ov);
  }
  const seenResolved = new Set<string>();
  const extras: EmbeddedExtraFont[] = [];
  for (const fontId of fontIds) {
    const entry = findFontEntryById(fontId, project, systemFonts);
    if (
      entry.source === 'system' &&
      !seenResolved.has(entry.id) &&
      !project.uploadedFonts.some((u) => u.id === entry.id)
    ) {
      seenResolved.add(entry.id);
      const ab = await loadFontArrayBuffer(entry);
      extras.push({ id: entry.id, name: entry.name, bytes: new Uint8Array(ab) });
    }
  }
  return extras;
}

export interface ExportSummaryInfo {
  fileCount: number;
  destinationLabel: string;
  breachedDice: string[];
  downloadUrl?: string;
  downloadFilename?: string;
}

export function normalizeRotationDeg(deg: number): number {
  let d = ((((deg + 180) % 360) + 360) % 360) - 180;
  if (d === -180) d = 180;
  return Math.round(d);
}

function pruneFaceOverride(ov: FaceOverride): FaceOverride | null {
  const nextRot = normalizeRotationDeg(ov.rotationDeg ?? 0);
  const nextScale = Math.round((ov.scaleMultiplier ?? 1) * 1000) / 1000;
  const nextOffX = Math.abs(ov.offsetXMm ?? 0) < 1e-4 ? 0 : ov.offsetXMm;
  const nextOffY = Math.abs(ov.offsetYMm ?? 0) < 1e-4 ? 0 : ov.offsetYMm;
  const hasCustomText = ov.customText !== undefined;
  const hasSvg = ov.svgId !== undefined;

  if (
    !hasCustomText &&
    !hasSvg &&
    Math.abs(nextScale - 1) < 1e-4 &&
    nextOffX === 0 &&
    nextOffY === 0 &&
    nextRot === 0
  ) {
    return null;
  }

  return {
    scaleMultiplier: nextScale,
    offsetXMm: nextOffX,
    offsetYMm: nextOffY,
    rotationDeg: nextRot,
    ...(hasCustomText ? { customText: ov.customText } : {}),
    ...(hasSvg ? { svgId: ov.svgId } : {}),
  };
}

export type AllFacesBatchAction =
  | { type: 'rotate'; deltaDeg: number }
  | { type: 'reset-rotation' }
  | { type: 'scale-die'; multiplier: number }
  | { type: 'reset-scale' }
  | { type: 'center-offsets' }
  | { type: 'clear-custom-content' }
  | { type: 'reset-all' };

export type StudioContextMenuTarget =
  | {
      kind: 'die';
      dieId: string;
      clientX: number;
      clientY: number;
      openedViaKeyboard: boolean;
      seq: number;
    }
  | {
      kind: 'face';
      dieId: string;
      faceId: string;
      faceLabel: string;
      clientX: number;
      clientY: number;
      openedViaKeyboard: boolean;
      seq: number;
    }
  | {
      kind: 'all-faces';
      dieId: string;
      faceIds: string[];
      clientX: number;
      clientY: number;
      openedViaKeyboard: boolean;
      seq: number;
    };

export interface InspectorFocusRequest {
  target: 'die-label' | 'face-custom-text' | 'face-svg-upload' | 'die-font-override';
  seq: number;
}

export interface DiceStoreState {
  project: DiceProjectState;
  systemFonts: FontEntry[];
  activeResult: GeneratedDieResult | null;
  trayResults: Partial<Record<string, GeneratedDieResult>>;
  isGenerating: boolean;
  generationError: string | null;
  selectedFaceId: string | null;
  multiSelectMode: boolean;
  preGroupViewportMode: ViewportMode;
  statusMessage: string;

  pendingRemoveDiceIds: string[] | null;
  contextMenu: StudioContextMenuTarget | null;
  inspectorFocusRequest: InspectorFocusRequest | null;

  exportModalOpen: boolean;
  exportScope: ExportScope;
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
  setActiveDie: (dieId: string) => void;
  selectDie: (
    dieId: string,
    opts?: { toggle?: boolean; range?: boolean; forceSingle?: boolean },
  ) => void;
  selectDiceGroup: (preset: 'all' | 'rpg7' | 'single') => void;
  setMultiSelectMode: (enabled: boolean) => void;
  setViewportMode: (mode: ViewportMode) => void;
  setActiveTab: (tab: InspectorTab) => void;
  setSelectedFaceId: (faceId: string | null) => void;

  addDieInstance: (kind: DieKind) => void;
  duplicateDieInstance: (dieId?: string, opts?: { asLogoNumbersPair?: boolean }) => void;
  removeDieInstances: (dieIds: string[]) => void;
  requestRemoveDice: (dieIds: string[]) => void;
  confirmRemoveDice: () => void;
  cancelRemoveDice: () => void;
  applySetTemplate: (templateId: SetTemplateId) => void;

  openDieContextMenu: (
    dieId: string,
    clientX: number,
    clientY: number,
    openedViaKeyboard?: boolean,
  ) => void;
  openFaceContextMenu: (
    dieId: string,
    faceId: string,
    faceLabel: string,
    clientX: number,
    clientY: number,
    openedViaKeyboard?: boolean,
  ) => void;
  openAllFacesContextMenu: (
    dieId: string,
    faceIds: string[],
    clientX: number,
    clientY: number,
    openedViaKeyboard?: boolean,
  ) => void;
  closeContextMenu: () => void;
  requestInspectorFocus: (target: InspectorFocusRequest['target']) => void;
  clearInspectorFocusRequest: () => void;

  applyPreset: (preset: SetPresetId) => void;
  updateDieSettings: (dieId: string, patch: Partial<DieSettings>) => void;
  updateDiceSettings: (
    diceIds: string[],
    patch: Partial<DieSettings>,
    historyKeySuffix?: string | null,
  ) => void;
  batchPatchDice: (
    patches: Partial<Record<string, Partial<DieSettings>>>,
    historyKey: string | null,
  ) => void;
  resetDiceOverrides: (diceIds: string[], scope: 'typography' | 'faces' | 'all') => void;
  setD4Variant: (variant: D4Variant) => void;
  updateFaceOverride: (dieId: string, faceId: string, patch: Partial<FaceOverride> | null) => void;
  batchUpdateAllFaces: (
    dieId: string,
    faceIds: string[],
    action: AllFacesBatchAction,
  ) => void;
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
  openExportModalWithScope: (scope: ExportScope) => void;
  setExportScope: (scope: ExportScope) => void;
  runBatchExport: () => Promise<void>;
  cancelBatchExport: () => void;
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
        const extraFonts = await collectExtraSystemFonts(latest.project, latest.systemFonts);
        const packed = await packProjectArchive(latest.project, extraFonts);
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
    multiSelectMode: false,
    preGroupViewportMode: 'single',
    statusMessage: 'Initializing geometry kernel and fonts…',

    pendingRemoveDiceIds: null,
    contextMenu: null,
    inspectorFocusRequest: null,

    exportModalOpen: false,
    exportScope: 'enabled',
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
      const order = getProjectDieOrder(project);
      const dieId = project.activeDie in project.dice ? project.activeDie : (order[0] ?? 'd20');
      const dieSettings = project.dice[dieId];
      if (!dieSettings) return;
      set({ isGenerating: true, generationError: null });

      try {
        const effectiveFontId = dieSettings.fontIdOverride ?? project.typography.activeFontId;
        const fontEntry = findFontEntryById(effectiveFontId, project, systemFonts);
        const fontAb = await loadFontArrayBuffer(fontEntry);
        const includeBlank =
          project.viewportMode === 'xray' || project.blanks.includeBlanksOnExport;
        const includeSupports = project.viewportMode === 'supports';

        const result = await diceWorkerClient.generateDie(
          dieId,
          project,
          fontAb,
          includeBlank,
          includeSupports,
        );
        if (token !== activeGenToken) return;

        set((s) => ({
          activeResult: result,
          trayResults: { ...s.trayResults, [dieId]: result },
          isGenerating: false,
          generationError: null,
          statusMessage: `${getDieInstanceLabel(dieSettings, project)} ready (${result.masterMesh.triangleCount.toLocaleString()} tris, ${
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
      const { project, systemFonts, trayResults } = get();
      const order = getProjectDieOrder(project);
      const selectedSet = new Set(
        normalizeSelectedDice(project.selectedDice, project.activeDie, order),
      );
      const trayDice = order.filter(
        (id) =>
          Boolean(project.dice[id]) &&
          (project.dice[id].enabled || selectedSet.has(id) || Boolean(trayResults[id])),
      );
      trayBuildingIds = new Set(trayDice);
      set({
        isGenerating: true,
        generationError: null,
        statusMessage: `Building ${trayDice.length}-die tray…`,
      });

      try {
        const { fontsByIdBytes } = await loadFontsForDice(trayDice, project, systemFonts);

        for (const dieId of trayDice) {
          if (token !== trayGenToken) return;
          const dieSettings = project.dice[dieId];
          if (!dieSettings) continue;
          const fontId = dieSettings.fontIdOverride ?? project.typography.activeFontId;
          const fontAb = fontsByIdBytes[fontId];
          const res = await diceWorkerClient.generateDie(
            dieId,
            project,
            fontAb,
            project.blanks.includeBlanksOnExport,
            false,
          );
          if (token !== trayGenToken) return;
          set((s) => ({
            trayResults: { ...s.trayResults, [dieId]: res },
            activeResult: dieId === s.project.activeDie ? res : s.activeResult,
          }));
        }

        if (token !== trayGenToken) return;
        trayBuildingIds.clear();
        set({
          isGenerating: false,
          statusMessage: `${trayDice.length}-die tray ready.`,
        });
      } catch (err) {
        if (token !== trayGenToken) return;
        trayBuildingIds.clear();
        const msg = err instanceof Error ? err.message : String(err);
        set({ isGenerating: false, generationError: msg, statusMessage: `Tray error: ${msg}` });
      }
    },

    setSetName: (name) => {
      const s = get();
      commitProjectMutation({ ...s.project, setName: name }, 'project:setName', 'none');
    },

    setActiveDie: (dieId) => {
      get().selectDie(dieId, { forceSingle: true });
    },

    selectDie: (dieId, opts) => {
      const s = get();
      const order = getProjectDieOrder(s.project);
      if (!(dieId in s.project.dice)) return;

      const prevSelected = normalizeSelectedDice(s.project.selectedDice, s.project.activeDie, order);
      const anchor = order.includes(s.project.activeDie) ? s.project.activeDie : (order[0] ?? dieId);
      const useRange = Boolean(opts?.range) && !opts?.forceSingle;
      const useToggle = (Boolean(opts?.toggle) || s.multiSelectMode) && !opts?.forceSingle;

      let nextSelected: string[];
      let nextActive: string = anchor;

      if (useRange) {
        const aIdx = order.indexOf(anchor);
        const bIdx = order.indexOf(dieId);
        const slice = order.slice(Math.min(aIdx, bIdx), Math.max(aIdx, bIdx) + 1);
        nextSelected = normalizeSelectedDice(
          useToggle ? [...prevSelected, ...slice] : slice,
          anchor,
          order,
        );
        nextActive = nextSelected.includes(anchor) ? anchor : nextSelected[0];
      } else if (useToggle) {
        if (prevSelected.includes(dieId)) {
          if (prevSelected.length === 1) {
            nextSelected = [dieId];
            nextActive = dieId;
          } else {
            nextSelected = prevSelected.filter((id) => id !== dieId);
            nextActive = anchor === dieId ? nextSelected[0] : anchor;
          }
        } else {
          nextSelected = normalizeSelectedDice([...prevSelected, dieId], dieId, order);
          nextActive = nextSelected.includes(anchor) ? anchor : dieId;
        }
      } else {
        nextSelected = [dieId];
        nextActive = dieId;
      }

      const wasMulti = prevSelected.length > 1;
      const isMulti = nextSelected.length > 1;
      let nextPreGroup = s.preGroupViewportMode;
      let nextViewportMode = s.project.viewportMode;

      if (!wasMulti && isMulti) {
        nextPreGroup = s.project.viewportMode;
        nextViewportMode = 'tray';
      } else if (wasMulti && !isMulti) {
        nextViewportMode = s.preGroupViewportMode;
      }

      const statusMsg = isMulti
        ? `Selected ${nextSelected.length} dice (${nextSelected
            .map((id) => getDieInstanceShortTag(s.project.dice[id], s.project))
            .join(', ')}) — primary ${getDieInstanceShortTag(s.project.dice[nextActive], s.project)}.`
        : s.statusMessage;

      set({
        selectedFaceId: null,
        preGroupViewportMode: nextPreGroup,
        statusMessage: statusMsg,
        activeResult:
          nextViewportMode === 'tray'
            ? s.trayResults[nextActive] ?? s.activeResult
            : s.activeResult,
        project: {
          ...s.project,
          dieOrder: order,
          activeDie: nextActive,
          selectedDice: nextSelected,
          selectedFaceId: null,
          viewportMode: nextViewportMode,
        },
      });

      if (nextViewportMode === 'tray') {
        const switchedToTray = s.project.viewportMode !== 'tray';
        const targetTrayDice = order.filter(
          (id) => s.project.dice[id]?.enabled || nextSelected.includes(id),
        );
        const needsMissingMesh = targetTrayDice.some(
          (id) => !s.trayResults[id] && !trayBuildingIds.has(id),
        );
        if (switchedToTray || needsMissingMesh) {
          void get().regenerateTray();
        }
      } else {
        void get().regenerateActiveDie();
      }
    },

    selectDiceGroup: (preset) => {
      const s = get();
      const order = getProjectDieOrder(s.project);
      const prevSelected = normalizeSelectedDice(s.project.selectedDice, s.project.activeDie, order);
      let nextSelected: string[];
      let nextActive = order.includes(s.project.activeDie) ? s.project.activeDie : (order[0] ?? 'd20');
      let nextMultiMode = s.multiSelectMode;

      if (preset === 'all') {
        nextSelected = [...order];
      } else if (preset === 'rpg7') {
        const rpgIds = order.filter((id) => RPG_SEVEN_DICE.includes(s.project.dice[id].kind));
        nextSelected = rpgIds.length > 0 ? rpgIds : [...order];
        if (!nextSelected.includes(nextActive)) {
          nextActive =
            nextSelected.find((id) => s.project.dice[id].kind === 'd20') ?? nextSelected[0];
        }
      } else {
        nextSelected = [nextActive];
        nextMultiMode = false;
      }

      const wasMulti = prevSelected.length > 1;
      const isMulti = nextSelected.length > 1;
      let nextPreGroup = s.preGroupViewportMode;
      let nextViewportMode = s.project.viewportMode;

      if (!wasMulti && isMulti) {
        nextPreGroup = s.project.viewportMode;
        nextViewportMode = 'tray';
      } else if (wasMulti && !isMulti) {
        nextViewportMode = s.preGroupViewportMode;
      }

      const presetLabel =
        preset === 'all'
          ? `Selected all ${nextSelected.length} dice in set.`
          : preset === 'rpg7'
            ? `Selected ${nextSelected.length} RPG dice (D4–D20).`
            : `Single selection: ${getDieInstanceLabel(s.project.dice[nextActive], s.project)}.`;

      set({
        selectedFaceId: null,
        multiSelectMode: nextMultiMode,
        preGroupViewportMode: nextPreGroup,
        statusMessage: presetLabel,
        activeResult:
          nextViewportMode === 'tray'
            ? s.trayResults[nextActive] ?? s.activeResult
            : s.activeResult,
        project: {
          ...s.project,
          dieOrder: order,
          activeDie: nextActive,
          selectedDice: nextSelected,
          selectedFaceId: null,
          viewportMode: nextViewportMode,
        },
      });

      if (nextViewportMode === 'tray') {
        const switchedToTray = s.project.viewportMode !== 'tray';
        const targetTrayDice = order.filter(
          (id) => s.project.dice[id]?.enabled || nextSelected.includes(id),
        );
        const needsMissingMesh = targetTrayDice.some(
          (id) => !s.trayResults[id] && !trayBuildingIds.has(id),
        );
        if (switchedToTray || needsMissingMesh) {
          void get().regenerateTray();
        }
      } else {
        void get().regenerateActiveDie();
      }
    },

    setMultiSelectMode: (enabled) => set({ multiSelectMode: enabled }),

    setViewportMode: (mode) => {
      set((s) => ({
        preGroupViewportMode: s.project.selectedDice.length <= 1 ? mode : s.preGroupViewportMode,
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

    addDieInstance: (kind) => {
      const s = get();
      const order = getProjectDieOrder(s.project);
      const newId = nextDieInstanceId(kind, s.project.dice);
      const existingSameKindId = [...order]
        .reverse()
        .find((id) => s.project.dice[id]?.kind === kind);
      const templateSource = existingSameKindId ? s.project.dice[existingSameKindId] : undefined;

      const newDie = createDefaultDieSettings(kind, s.project.presetId, newId);
      if (templateSource) {
        newDie.sizeMm = templateSource.sizeMm;
        newDie.secondarySizeMm = templateSource.secondarySizeMm;
        newDie.edgeChamferMm = templateSource.edgeChamferMm;
        newDie.d2Variant = templateSource.d2Variant;
        newDie.d4Variant = templateSource.d4Variant;
        newDie.d3Variant = templateSource.d3Variant;
        newDie.oddVariant = templateSource.oddVariant;
        newDie.d6Variant = templateSource.d6Variant;
        newDie.d8Variant = templateSource.d8Variant;
        newDie.d10Variant = templateSource.d10Variant;
        newDie.d12Variant = templateSource.d12Variant;
        newDie.d10Numbering = templateSource.d10Numbering;
        newDie.d00Orientation = templateSource.d00Orientation;
        newDie.d20Numbering = templateSource.d20Numbering;
      }

      const nextOrder = [...order];
      if (existingSameKindId) {
        const insertIdx = nextOrder.lastIndexOf(existingSameKindId) + 1;
        nextOrder.splice(insertIdx, 0, newId);
      } else {
        const targetKindIdx = DIE_ORDER.indexOf(kind);
        const beforeIdx = nextOrder.findIndex(
          (id) => DIE_ORDER.indexOf(s.project.dice[id].kind) > targetKindIdx,
        );
        if (beforeIdx >= 0) {
          nextOrder.splice(beforeIdx, 0, newId);
        } else {
          nextOrder.push(newId);
        }
      }

      const wasMulti = s.project.selectedDice.length > 1;
      const nextViewportMode =
        wasMulti && s.project.viewportMode === 'tray' ? s.preGroupViewportMode : s.project.viewportMode;

      const nextProject: DiceProjectState = {
        ...s.project,
        dieOrder: nextOrder,
        activeDie: newId,
        selectedDice: [newId],
        selectedFaceId: null,
        viewportMode: nextViewportMode,
        dice: {
          ...s.project.dice,
          [newId]: newDie,
        },
      };

      set({ selectedFaceId: null });
      commitProjectMutation(
        nextProject,
        null,
        nextViewportMode === 'tray' ? 'tray' : 'active',
      );
      set({
        statusMessage: `Added ${getDieInstanceLabel(newDie, nextProject)} (${nextOrder.length} dice in set).`,
      });
    },

    duplicateDieInstance: (dieId, opts) => {
      const s = get();
      const order = getProjectDieOrder(s.project);
      const sourceId =
        dieId && dieId in s.project.dice
          ? dieId
          : s.project.activeDie in s.project.dice
            ? s.project.activeDie
            : order[0];
      const source = sourceId ? s.project.dice[sourceId] : undefined;
      if (!source || !sourceId) return;

      const newId = nextDieInstanceId(source.kind, s.project.dice);
      const twin = structuredClone(source);
      twin.id = newId;
      twin.enabled = true;

      const nextOrder = [...order];
      const srcIdx = nextOrder.indexOf(sourceId);
      nextOrder.splice(srcIdx >= 0 ? srcIdx + 1 : nextOrder.length, 0, newId);

      const nextDice: Record<string, DieSettings> = {
        ...s.project.dice,
        [newId]: twin,
      };

      if (opts?.asLogoNumbersPair) {
        nextDice[sourceId] = {
          ...source,
          customLabel: source.customLabel?.trim() || 'Logo',
          useHighFaceEmblemOverride: true,
        };
        twin.customLabel = 'Numbers';
        twin.useHighFaceEmblemOverride = false;

        const nextPreGroup =
          s.project.selectedDice.length <= 1 ? s.project.viewportMode : s.preGroupViewportMode;
        const nextProject: DiceProjectState = {
          ...s.project,
          dieOrder: nextOrder,
          activeDie: sourceId,
          selectedDice: [sourceId, newId],
          selectedFaceId: null,
          viewportMode: 'tray',
          dice: nextDice,
        };

        set({
          selectedFaceId: null,
          preGroupViewportMode: nextPreGroup,
        });
        commitProjectMutation(nextProject, null, 'tray');
        set({
          statusMessage: `Created ${DIE_DISPLAY_NAMES[source.kind]} Logo + Numbers pair.`,
        });
        return;
      }

      const trimmedLabel = source.customLabel?.trim() ?? '';
      twin.customLabel =
        trimmedLabel && trimmedLabel.toLowerCase() !== 'logo'
          ? `${trimmedLabel.replace(/\s+Copy$/i, '')} Copy`
          : '';

      const wasMulti = s.project.selectedDice.length > 1;
      const nextViewportMode =
        wasMulti && s.project.viewportMode === 'tray'
          ? s.preGroupViewportMode
          : s.project.viewportMode;

      const nextProject: DiceProjectState = {
        ...s.project,
        dieOrder: nextOrder,
        activeDie: newId,
        selectedDice: [newId],
        selectedFaceId: null,
        viewportMode: nextViewportMode,
        dice: nextDice,
      };

      set({ selectedFaceId: null });
      commitProjectMutation(
        nextProject,
        null,
        nextViewportMode === 'tray' ? 'tray' : 'active',
      );
      set({
        statusMessage: `Duplicated ${getDieInstanceLabel(twin, nextProject)} (${nextOrder.length} dice in set).`,
      });
    },

    removeDieInstances: (dieIds) => {
      const s = get();
      const order = getProjectDieOrder(s.project);
      if (order.length <= 1) {
        set({ statusMessage: 'At least 1 die must remain in the set.' });
        return;
      }

      const removeSet = new Set(dieIds.filter((id) => id in s.project.dice));
      if (removeSet.size === 0) return;

      let nextOrder = order.filter((id) => !removeSet.has(id));
      if (nextOrder.length === 0) {
        const keeper = order.includes(s.project.activeDie) ? s.project.activeDie : order[0];
        removeSet.delete(keeper);
        nextOrder = [keeper];
      }

      const nextDice: Record<string, DieSettings> = {};
      for (const id of nextOrder) {
        nextDice[id] = s.project.dice[id];
      }

      const nextTrayResults: Partial<Record<string, GeneratedDieResult>> = { ...s.trayResults };
      for (const id of removeSet) {
        delete nextTrayResults[id];
      }

      let nextActive = s.project.activeDie;
      if (!nextOrder.includes(nextActive)) {
        const oldIdx = order.indexOf(s.project.activeDie);
        const forward = order.slice(oldIdx + 1).find((id) => !removeSet.has(id));
        const backward = [...order.slice(0, Math.max(0, oldIdx))]
          .reverse()
          .find((id) => !removeSet.has(id));
        nextActive = forward ?? backward ?? nextOrder[0];
      }

      const prevSelectedCount = s.project.selectedDice.length;
      const nextSelected = normalizeSelectedDice(
        s.project.selectedDice.filter((id) => !removeSet.has(id)),
        nextActive,
        nextOrder,
      );
      let nextViewportMode = s.project.viewportMode;
      if (prevSelectedCount > 1 && nextSelected.length === 1) {
        nextViewportMode = s.preGroupViewportMode;
      }

      const nextProject: DiceProjectState = {
        ...s.project,
        dieOrder: nextOrder,
        activeDie: nextActive,
        selectedDice: nextSelected,
        selectedFaceId: null,
        viewportMode: nextViewportMode,
        dice: nextDice,
      };

      set({
        trayResults: nextTrayResults,
        selectedFaceId: null,
      });
      commitProjectMutation(
        nextProject,
        null,
        nextViewportMode === 'tray' ? 'tray' : 'active',
      );
      set({
        statusMessage: `Removed ${removeSet.size} ${removeSet.size === 1 ? 'die' : 'dice'} (${nextOrder.length} remaining).`,
      });
    },

    requestRemoveDice: (dieIds) => {
      const s = get();
      const order = getProjectDieOrder(s.project);
      if (order.length <= 1) {
        set({
          statusMessage: 'At least 1 die must remain in the set.',
          contextMenu: null,
        });
        return;
      }
      const requestedSet = new Set(dieIds.filter((id) => id in s.project.dice));
      const validOrdered = order.filter((id) => requestedSet.has(id));
      if (validOrdered.length === 0) return;
      set({
        pendingRemoveDiceIds: validOrdered,
        contextMenu: null,
      });
    },

    confirmRemoveDice: () => {
      const ids = get().pendingRemoveDiceIds;
      set({ pendingRemoveDiceIds: null });
      if (ids && ids.length > 0) {
        get().removeDieInstances(ids);
      }
    },

    cancelRemoveDice: () => set({ pendingRemoveDiceIds: null }),

    openDieContextMenu: (dieId, clientX, clientY, openedViaKeyboard = false) => {
      const s = get();
      if (!(dieId in s.project.dice)) return;
      const order = getProjectDieOrder(s.project);
      const selected = normalizeSelectedDice(s.project.selectedDice, s.project.activeDie, order);
      if (!selected.includes(dieId)) {
        get().selectDie(dieId, { forceSingle: true });
      }
      set({
        contextMenu: {
          kind: 'die',
          dieId,
          clientX,
          clientY,
          openedViaKeyboard,
          seq: ++contextMenuSeq,
        },
      });
    },

    openFaceContextMenu: (dieId, faceId, faceLabel, clientX, clientY, openedViaKeyboard = false) => {
      const s = get();
      if (!(dieId in s.project.dice)) return;
      if (s.project.activeDie !== dieId || s.project.selectedDice.length > 1) {
        get().selectDie(dieId, { forceSingle: true });
      }
      get().setSelectedFaceId(faceId);
      set({
        contextMenu: {
          kind: 'face',
          dieId,
          faceId,
          faceLabel,
          clientX,
          clientY,
          openedViaKeyboard,
          seq: ++contextMenuSeq,
        },
      });
    },

    openAllFacesContextMenu: (dieId, faceIds, clientX, clientY, openedViaKeyboard = false) => {
      const s = get();
      if (!(dieId in s.project.dice)) return;
      if (s.project.activeDie !== dieId || s.project.selectedDice.length > 1) {
        get().selectDie(dieId, { forceSingle: true });
      }
      get().setSelectedFaceId(null);
      set({
        contextMenu: {
          kind: 'all-faces',
          dieId,
          faceIds,
          clientX,
          clientY,
          openedViaKeyboard,
          seq: ++contextMenuSeq,
        },
      });
    },

    closeContextMenu: () => set({ contextMenu: null }),

    requestInspectorFocus: (target) => {
      const tab: InspectorTab = target === 'die-label' ? 'shape' : 'typography';
      get().setActiveTab(tab);
      set({
        isFocusMode: false,
        contextMenu: null,
        inspectorFocusRequest: { target, seq: ++inspectorFocusSeq },
      });
    },

    clearInspectorFocusRequest: () => set({ inspectorFocusRequest: null }),

    applySetTemplate: (templateId) => {
      const s = get();
      const { dieOrder, dice, activeDie, label } = buildSetFromTemplate(templateId, s.project);
      ++trayGenToken;
      trayBuildingIds.clear();
      const nextPreGroup =
        s.project.viewportMode === 'tray' ? s.preGroupViewportMode : s.project.viewportMode;

      const nextProject: DiceProjectState = {
        ...s.project,
        dieOrder,
        dice,
        activeDie,
        selectedDice: [activeDie],
        selectedFaceId: null,
        viewportMode: 'tray',
      };

      set({
        trayResults: {},
        selectedFaceId: null,
        multiSelectMode: false,
        pendingRemoveDiceIds: null,
        contextMenu: null,
        preGroupViewportMode: nextPreGroup,
      });
      commitProjectMutation(nextProject, null, 'tray');
      set({ statusMessage: `Applied ${label} template (${dieOrder.length} dice).` });
    },

    applyPreset: (preset) => {
      const def = SET_PRESETS[preset];
      const s = get();
      const order = getProjectDieOrder(s.project);
      const updatedDice: Record<string, DieSettings> = { ...s.project.dice };
      for (const id of order) {
        const cur = s.project.dice[id];
        updatedDice[id] = {
          ...cur,
          ...def.sizes[cur.kind],
        };
      }
      commitProjectMutation(
        {
          ...s.project,
          dieOrder: order,
          presetId: preset,
          dice: updatedDice,
        },
        null,
        s.project.viewportMode === 'tray' ? 'tray' : 'active',
      );
      set({ statusMessage: `Applied ${def.label} sizing preset.` });
    },

    updateDieSettings: (dieId, patch) => {
      const s = get();
      if (!(dieId in s.project.dice)) return;
      const patchKeys = Object.keys(patch).sort().join(',');
      commitProjectMutation(
        {
          ...s.project,
          dice: {
            ...s.project.dice,
            [dieId]: { ...s.project.dice[dieId], ...patch },
          },
        },
        `die:${dieId}:${patchKeys}`,
        s.project.viewportMode === 'tray' ? 'tray' : 'active',
      );
    },

    updateDiceSettings: (diceIds, patch, historyKeySuffix) => {
      const s = get();
      const order = getProjectDieOrder(s.project);
      const targets =
        diceIds.length > 0
          ? normalizeSelectedDice(diceIds, s.project.activeDie, order)
          : [s.project.activeDie];
      const nextDice: Record<string, DieSettings> = { ...s.project.dice };
      for (const id of targets) {
        if (!s.project.dice[id]) continue;
        nextDice[id] = { ...s.project.dice[id], ...patch };
      }
      const patchKeys = Object.keys(patch).sort().join(',');
      const resolvedHistoryKey =
        historyKeySuffix === null
          ? null
          : `dice:${targets.join('+')}:${historyKeySuffix ?? patchKeys}`;
      commitProjectMutation(
        {
          ...s.project,
          dice: nextDice,
        },
        resolvedHistoryKey,
        s.project.viewportMode === 'tray' ? 'tray' : 'active',
      );
    },

    batchPatchDice: (patches, historyKey) => {
      const s = get();
      const entries = Object.entries(patches);
      if (entries.length === 0) return;
      const nextDice: Record<string, DieSettings> = { ...s.project.dice };
      for (const [id, patch] of entries) {
        if (!patch || !s.project.dice[id]) continue;
        nextDice[id] = { ...s.project.dice[id], ...patch };
      }
      commitProjectMutation(
        {
          ...s.project,
          dice: nextDice,
        },
        historyKey,
        s.project.viewportMode === 'tray' ? 'tray' : 'active',
      );
    },

    resetDiceOverrides: (diceIds, scope) => {
      const s = get();
      const order = getProjectDieOrder(s.project);
      const targets =
        diceIds.length > 0
          ? normalizeSelectedDice(diceIds, s.project.activeDie, order)
          : [s.project.activeDie];
      const nextDice: Record<string, DieSettings> = { ...s.project.dice };
      for (const id of targets) {
        const cur = s.project.dice[id];
        if (!cur) continue;
        const base = { ...cur };
        if (scope === 'typography' || scope === 'all') {
          base.fontIdOverride = null;
          base.engravingDepthOverrideMm = null;
          base.useHighFaceEmblemOverride = null;
          base.highFaceSvgIdOverride = null;
          base.fontScaleMultiplier = 1.0;
        }
        if (scope === 'faces' || scope === 'all') {
          base.faceOverrides = {};
        }
        if (scope === 'all') {
          base.blankClearanceOverrideMm = null;
        }
        nextDice[id] = base;
      }
      commitProjectMutation(
        {
          ...s.project,
          dice: nextDice,
        },
        null,
        s.project.viewportMode === 'tray' ? 'tray' : 'active',
      );
      set({
        statusMessage:
          scope === 'faces'
            ? `Cleared custom face overrides on ${targets.length} ${targets.length === 1 ? 'die' : 'dice'}.`
            : `Reset overrides to global defaults on ${targets.length} ${targets.length === 1 ? 'die' : 'dice'}.`,
      });
    },

    setD4Variant: (variant) => {
      const s = get();
      const order = getProjectDieOrder(s.project);
      const selected = normalizeSelectedDice(s.project.selectedDice, s.project.activeDie, order);
      const selectedD4s = selected.filter((id) => s.project.dice[id]?.kind === 'd4');
      const targets =
        selectedD4s.length > 0
          ? selectedD4s
          : order.filter((id) => s.project.dice[id]?.kind === 'd4');
      if (targets.length === 0) return;

      const nextDice: Record<string, DieSettings> = { ...s.project.dice };
      for (const id of targets) {
        nextDice[id] = { ...s.project.dice[id], d4Variant: variant };
      }
      commitProjectMutation(
        {
          ...s.project,
          dice: nextDice,
        },
        'project:d4Variant',
        s.project.viewportMode === 'tray' ? 'tray' : 'active',
      );
    },

    updateFaceOverride: (dieId, faceId, patch) => {
      const s = get();
      const currentDie = s.project.dice[dieId];
      if (!currentDie) return;
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
            [dieId]: {
              ...currentDie,
              faceOverrides: prevOverrides,
            },
          },
        },
        `override:${dieId}:${faceId}:${patchKeys}`,
        s.project.viewportMode === 'tray' ? 'tray' : 'active',
      );
    },

    batchUpdateAllFaces: (dieId, faceIds, action) => {
      const s = get();
      const currentDie = s.project.dice[dieId];
      if (!currentDie) return;

      const resolvedFaceIds =
        faceIds.length > 0
          ? faceIds
          : s.activeResult?.dieId === dieId
            ? s.activeResult.faces.filter((f) => f.isNumbered).map((f) => f.id)
            : Object.keys(currentDie.faceOverrides);

      let nextOverrides: Record<string, FaceOverride> = { ...currentDie.faceOverrides };
      let nextFontScale = currentDie.fontScaleMultiplier;

      const applyToExisting = (updater: (ov: FaceOverride) => FaceOverride) => {
        for (const fid of Object.keys(nextOverrides)) {
          const pruned = pruneFaceOverride(updater(nextOverrides[fid]));
          if (pruned) {
            nextOverrides[fid] = pruned;
          } else {
            delete nextOverrides[fid];
          }
        }
      };

      const dieLabel = getDieInstanceLabel(currentDie, s.project);
      let statusMessage = '';

      switch (action.type) {
        case 'rotate':
          for (const fid of resolvedFaceIds) {
            const cur: FaceOverride = nextOverrides[fid] ?? {
              scaleMultiplier: 1,
              offsetXMm: 0,
              offsetYMm: 0,
              rotationDeg: 0,
            };
            const pruned = pruneFaceOverride({
              ...cur,
              rotationDeg: normalizeRotationDeg(cur.rotationDeg + action.deltaDeg),
            });
            if (pruned) {
              nextOverrides[fid] = pruned;
            } else {
              delete nextOverrides[fid];
            }
          }
          statusMessage = `Rotated all ${resolvedFaceIds.length} faces on ${dieLabel}.`;
          break;
        case 'reset-rotation':
          applyToExisting((ov) => ({ ...ov, rotationDeg: 0 }));
          statusMessage = `Reset all face rotations on ${dieLabel} to 0°.`;
          break;
        case 'scale-die': {
          const clamped = Math.max(0.5, Math.min(1.5, Math.round(action.multiplier * 100) / 100));
          nextFontScale = clamped;
          statusMessage = `Scaled faces on ${dieLabel} to ${clamped.toFixed(2)}×.`;
          break;
        }
        case 'reset-scale':
          nextFontScale = 1.0;
          applyToExisting((ov) => ({ ...ov, scaleMultiplier: 1 }));
          statusMessage = `Reset face scale on ${dieLabel} to 1.00×.`;
          break;
        case 'center-offsets':
          applyToExisting((ov) => ({ ...ov, offsetXMm: 0, offsetYMm: 0 }));
          statusMessage = `Centered all face offsets on ${dieLabel}.`;
          break;
        case 'clear-custom-content':
          applyToExisting((ov) => {
            const rest: FaceOverride = { ...ov };
            delete rest.customText;
            delete rest.svgId;
            return rest;
          });
          statusMessage = `Cleared custom face text & SVGs on ${dieLabel}.`;
          break;
        case 'reset-all':
          nextOverrides = {};
          nextFontScale = 1.0;
          statusMessage = `Reset all face overrides on ${dieLabel}.`;
          break;
      }

      commitProjectMutation(
        {
          ...s.project,
          dice: {
            ...s.project.dice,
            [dieId]: {
              ...currentDie,
              fontScaleMultiplier: nextFontScale,
              faceOverrides: nextOverrides,
            },
          },
        },
        null,
        s.project.viewportMode === 'tray' ? 'tray' : 'active',
      );
      set({ statusMessage });
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
      ++trayGenToken;
      trayBuildingIds.clear();

      const prevOrder = new Set(getProjectDieOrder(previous));
      const prunedTray: Partial<Record<string, GeneratedDieResult>> = {};
      for (const [id, res] of Object.entries(s.trayResults)) {
        if (prevOrder.has(id) && res) prunedTray[id] = res;
      }

      set({
        project: previous,
        selectedFaceId: previous.selectedFaceId,
        pendingRemoveDiceIds: null,
        contextMenu: null,
        trayResults: prunedTray,
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
      ++trayGenToken;
      trayBuildingIds.clear();

      const nextOrder = new Set(getProjectDieOrder(next));
      const prunedTray: Partial<Record<string, GeneratedDieResult>> = {};
      for (const [id, res] of Object.entries(s.trayResults)) {
        if (nextOrder.has(id) && res) prunedTray[id] = res;
      }

      set({
        project: next,
        selectedFaceId: next.selectedFaceId,
        pendingRemoveDiceIds: null,
        contextMenu: null,
        trayResults: prunedTray,
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
      const extraFonts = await collectExtraSystemFonts(project, systemFonts);

      const bytes = await packProjectArchive(project, extraFonts);
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
      ++trayGenToken;
      trayBuildingIds.clear();
      set({
        project: parsed,
        selectedFaceId: parsed.selectedFaceId ?? null,
        multiSelectMode: false,
        preGroupViewportMode: parsed.viewportMode === 'tray' ? 'single' : parsed.viewportMode,
        pendingRemoveDiceIds: null,
        contextMenu: null,
        inspectorFocusRequest: null,
        exportScope: 'enabled',
        trayResults: {},
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
      replaceExportBlobUrl();
      const next = createDefaultProjectState('standard');
      lastHistoryActionKey = null;
      ++trayGenToken;
      trayBuildingIds.clear();
      set({
        project: next,
        selectedFaceId: null,
        multiSelectMode: false,
        preGroupViewportMode: 'single',
        pendingRemoveDiceIds: null,
        contextMenu: null,
        inspectorFocusRequest: null,
        exportScope: 'enabled',
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
      set((s) => {
        if (open) replaceExportBlobUrl();
        return {
          exportModalOpen: open,
          exportScope: open ? 'enabled' : s.exportScope,
          exportSummary: open ? null : s.exportSummary,
          exportError: open ? null : s.exportError,
        };
      }),

    openExportModalWithScope: (scope) => {
      replaceExportBlobUrl();
      set({
        exportModalOpen: true,
        exportScope: scope,
        exportSummary: null,
        exportError: null,
      });
    },

    setExportScope: (scope) => set({ exportScope: scope }),

    cancelBatchExport: () => {
      exportRunSeq += 1;
      diceWorkerClient.cancelAll('Export canceled.');
      set({
        isExporting: false,
        exportProgress: null,
        exportError: null,
        statusMessage: 'Export canceled.',
      });
    },

    runBatchExport: async () => {
      const myRun = ++exportRunSeq;
      replaceExportBlobUrl();
      const { project, systemFonts, exportScope } = get();
      set({
        isExporting: true,
        exportProgress: { currentStep: 0, totalSteps: 1, label: 'Preparing batch…' },
        exportSummary: null,
        exportError: null,
      });

      try {
        const order = getProjectDieOrder(project);
        const targetDice =
          exportScope === 'selected'
            ? normalizeSelectedDice(project.selectedDice, project.activeDie, order)
            : order.filter((id) => Boolean(project.dice[id]?.enabled));
        if (targetDice.length === 0) {
          throw new Error('No dice selected for export.');
        }

        const { fontsByIdBytes, fontNamesById } = await loadFontsForDice(
          targetDice,
          project,
          systemFonts,
        );
        if (exportRunSeq !== myRun) return;

        const batch = await diceWorkerClient.exportBatch(
          project,
          fontsByIdBytes,
          fontNamesById,
          (progress) => {
            if (exportRunSeq === myRun) {
              set({ exportProgress: progress });
            }
          },
          targetDice,
        );
        if (exportRunSeq !== myRun) return;

        if (batch.files.length === 0) {
          throw new Error('No dice selected for export.');
        }

        if (
          batch.files.length === 1 &&
          project.exportConfig.exportStl !== project.exportConfig.export3mf &&
          !project.exportConfig.exportSpecSheet
        ) {
          const single = batch.files[0];
          const singleName = single.relativePath.split('/').pop()!;
          const mimeType = singleName.toLowerCase().endsWith('.3mf')
            ? 'model/3mf'
            : 'application/octet-stream';
          const saved = await saveBytesFile(singleName, single.bytes, mimeType);
          if (exportRunSeq !== myRun) return;
          const downloadUrl =
            saved && !isDesktopRuntime()
              ? replaceExportBlobUrl(single.bytes, mimeType)
              : undefined;
          set({
            isExporting: false,
            exportProgress: null,
            exportSummary: saved
              ? {
                  fileCount: 1,
                  destinationLabel: single.relativePath,
                  breachedDice: batch.breachedDice,
                  downloadUrl,
                  downloadFilename: downloadUrl ? singleName : undefined,
                }
              : null,
            statusMessage: saved ? `Saved ${single.relativePath}` : 'Export canceled.',
          });
          return;
        }

        const safeFolder =
          (project.setName.trim() || 'DiceChaosExport').replace(/[^a-zA-Z0-9._-]+/g, '_') +
          '_Masters';
        if (!isDesktopRuntime()) {
          set((s) => ({
            exportProgress: {
              currentStep: s.exportProgress?.currentStep ?? 1,
              totalSteps: s.exportProgress?.totalSteps ?? 1,
              label: `Packaging ${safeFolder}.zip…`,
            },
          }));
        }

        const result = await exportBundleToDisk(
          safeFolder,
          batch.files.map((f) => ({ relativePath: f.relativePath, bytes: f.bytes })),
        );
        if (exportRunSeq !== myRun) return;

        const downloadUrl = replaceExportBlobUrl(result.downloadBytes, result.mimeType);
        const warnNote =
          batch.breachedDice.length > 0
            ? ` Warning: engraving depth exceeds blank clearance on ${batch.breachedDice.join(', ')}.`
            : '';

        set({
          isExporting: false,
          exportProgress: null,
          exportSummary: {
            fileCount: batch.files.length,
            destinationLabel: result.message,
            breachedDice: batch.breachedDice,
            downloadUrl,
            downloadFilename: result.downloadFilename,
          },
          statusMessage: `${result.message}${warnNote}`,
        });
      } catch (err) {
        if (exportRunSeq !== myRun) return;
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
