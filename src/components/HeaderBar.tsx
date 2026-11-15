import { useRef } from 'react';
import {
  Box,
  Download,
  ExternalLink,
  FolderOpen,
  Grid3x3,
  HelpCircle,
  Layers,
  Moon,
  Redo2,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Sun,
  Undo2,
} from 'lucide-react';
import { isDesktopRuntime, openExternalUrl } from '../platform/desktopBridge';
import { useDiceStore } from '../store/useDiceStore';
import type { ViewportMode } from '../types/dice';
import { AppLogoIcon } from './AppLogoIcon';

const VIEWPORT_MODES: Array<{ id: ViewportMode; label: string; icon: typeof Box }> = [
  { id: 'single', label: 'Single Die', icon: Box },
  { id: 'tray', label: 'Full Set Tray', icon: Grid3x3 },
  { id: 'xray', label: 'Insert X-Ray', icon: Layers },
  { id: 'supports', label: 'Supports', icon: ShieldCheck },
];

export function HeaderBar() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const project = useDiceStore((s) => s.project);
  const canUndo = useDiceStore((s) => s.canUndo);
  const canRedo = useDiceStore((s) => s.canRedo);
  const isDirty = useDiceStore((s) => s.isDirty);
  const autoSaveEnabled = useDiceStore((s) => s.autoSaveEnabled);
  const resolvedTheme = useDiceStore((s) => s.resolvedTheme);
  const tourOpen = useDiceStore((s) => s.tourOpen);

  const setSetName = useDiceStore((s) => s.setSetName);
  const setViewportMode = useDiceStore((s) => s.setViewportMode);
  const undo = useDiceStore((s) => s.undo);
  const redo = useDiceStore((s) => s.redo);
  const saveProjectFile = useDiceStore((s) => s.saveProjectFile);
  const openProjectDialog = useDiceStore((s) => s.openProjectDialog);
  const loadProjectFile = useDiceStore((s) => s.loadProjectFile);
  const resetProject = useDiceStore((s) => s.resetProject);
  const toggleAutoSave = useDiceStore((s) => s.toggleAutoSave);
  const cycleThemeToggle = useDiceStore((s) => s.cycleThemeToggle);
  const openTour = useDiceStore((s) => s.openTour);
  const closeTour = useDiceStore((s) => s.closeTour);
  const setShortcutsModalOpen = useDiceStore((s) => s.setShortcutsModalOpen);
  const setExportModalOpen = useDiceStore((s) => s.setExportModalOpen);

  const handleOpen = async () => {
    if (isDesktopRuntime()) {
      await openProjectDialog();
      return;
    }
    fileInputRef.current?.click();
  };

  return (
    <header className="studio-header">
      <div className="header-group header-brand">
        <div className="brand-mark">
          <AppLogoIcon size={30} />
          <div className="brand-title">
            <span className="brand-name">Dice Chaos Masters</span>
            <span className="brand-sub">dicechaos.com • STL / 3MF Studio</span>
          </div>
        </div>

        <input
          type="text"
          className="set-name-input"
          aria-label="Dice set project name"
          value={project.setName}
          onChange={(e) => setSetName(e.target.value)}
          placeholder="Set Name"
        />

        <div role="toolbar" aria-label="Project controls" className="header-group">
          <div role="group" aria-label="File operations" className="header-group">
            <button
              type="button"
              className="btn btn-compact"
              onClick={handleOpen}
              title="Open .dcproj archive (Ctrl+O)"
            >
              <FolderOpen size={13} aria-hidden="true" />
              Open
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".dcproj,.json,.zip"
              className="visually-hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const buf = await file.arrayBuffer();
                await loadProjectFile(new Uint8Array(buf), null);
                e.target.value = '';
              }}
            />

            <button
              type="button"
              className="btn btn-compact"
              onClick={() => void saveProjectFile(false)}
              title="Save .dcproj project (Ctrl+S)"
            >
              <Save size={13} aria-hidden="true" />
              Save
              {isDirty && <span className="dirty-dot" aria-label="Unsaved changes" />}
            </button>

            <button
              type="button"
              className="autosave-pill"
              aria-pressed={autoSaveEnabled}
              onClick={toggleAutoSave}
              title="Toggle automatic background .dcproj save once saved to disk"
            >
              <span className="autosave-dot" aria-hidden="true" />
              Auto-Save
            </button>

            <button
              type="button"
              className="btn btn-compact"
              onClick={resetProject}
              title="Reset workspace to standard 16 mm set"
            >
              <RotateCcw size={13} aria-hidden="true" />
              Reset
            </button>
          </div>

          <span role="separator" aria-orientation="vertical" className="toolbar-sep" />

          <div role="group" aria-label="Undo and redo" className="header-group">
            <button
              type="button"
              className="btn btn-icon"
              aria-label="Undo"
              aria-disabled={!canUndo}
              title="Undo last change (Ctrl+Z)"
              onClick={() => {
                if (canUndo) undo();
              }}
            >
              <Undo2 size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="btn btn-icon"
              aria-label="Redo"
              aria-disabled={!canRedo}
              title="Redo change (Ctrl+Y)"
              onClick={() => {
                if (canRedo) redo();
              }}
            >
              <Redo2 size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div
        role="toolbar"
        aria-label="Viewport view mode"
        className="header-group viewport-mode-bar"
      >
        {VIEWPORT_MODES.map((m, idx) => {
          const Icon = m.icon;
          const active = project.viewportMode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              className="viewport-mode-btn"
              aria-pressed={active}
              title={`${m.label} (${idx + 1})`}
              onClick={() => setViewportMode(m.id)}
            >
              <Icon size={13} aria-hidden="true" />
              {m.label}
            </button>
          );
        })}
      </div>

      <div role="toolbar" aria-label="Suite utilities" className="header-group">
        <button
          id="dcm-tour-trigger"
          type="button"
          className="btn btn-compact"
          aria-pressed={tourOpen}
          title="Open 5-step Maker Tour"
          onClick={() => (tourOpen ? closeTour() : openTour(0))}
        >
          <Sparkles size={13} aria-hidden="true" />
          Tour
        </button>

        <button
          type="button"
          className="btn btn-icon"
          aria-label={resolvedTheme === 'dark' ? 'Switch to Daylight theme' : 'Switch to Midnight Dark theme'}
          title={resolvedTheme === 'dark' ? 'Switch to Daylight theme' : 'Switch to Midnight Dark theme'}
          onClick={cycleThemeToggle}
        >
          {resolvedTheme === 'dark' ? (
            <Sun size={14} aria-hidden="true" />
          ) : (
            <Moon size={14} aria-hidden="true" />
          )}
        </button>

        <button
          type="button"
          className="btn btn-icon"
          aria-label="Keyboard shortcuts and Dice Chaos Suite"
          title="Keyboard shortcuts & Dice Chaos Suite (? / F1)"
          onClick={() => setShortcutsModalOpen(true)}
        >
          <HelpCircle size={14} aria-hidden="true" />
        </button>

        <button
          type="button"
          className="btn btn-link btn-compact"
          onClick={() => void openExternalUrl('https://dicechaos.com/')}
          title="Visit dicechaos.com"
        >
          dicechaos.com
          <ExternalLink size={12} aria-hidden="true" />
        </button>

        <button
          type="button"
          className="btn btn-primary btn-compact"
          onClick={() => setExportModalOpen(true)}
          title="Export STL / 3MF / Spec Sheet bundle (Ctrl+E)"
        >
          <Download size={13} aria-hidden="true" />
          Export Set
        </button>
      </div>
    </header>
  );
}
