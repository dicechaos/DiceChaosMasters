import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  Box,
  Download,
  ExternalLink,
  FolderOpen,
  Grid3x3,
  HelpCircle,
  Layers,
  Moon,
  MoreHorizontal,
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

const VIEWPORT_MODES: Array<{
  id: ViewportMode;
  shortLabel: string;
  fullLabel: string;
  icon: typeof Box;
}> = [
  { id: 'single', shortLabel: 'Single', fullLabel: 'Single Die', icon: Box },
  { id: 'tray', shortLabel: 'Tray', fullLabel: 'Full Set Tray', icon: Grid3x3 },
  { id: 'xray', shortLabel: 'X-Ray', fullLabel: 'Insert X-Ray', icon: Layers },
  { id: 'supports', shortLabel: 'Supports', fullLabel: 'Supports', icon: ShieldCheck },
];

function useHorizontalToolbarFallback(
  ref: React.RefObject<HTMLDivElement | null>,
): (e: ReactKeyboardEvent<HTMLDivElement>) => void {
  useEffect(() => {
    const bar = ref.current;
    if (!bar || 'focusGroup' in HTMLElement.prototype) return;

    const getItems = () =>
      Array.from(bar.querySelectorAll<HTMLButtonElement>('button:not([hidden])'));

    const sync = (active?: HTMLButtonElement) => {
      const items = getItems();
      const target =
        active ?? items.find((b) => b.getAttribute('aria-pressed') === 'true') ?? items[0];
      for (const b of items) {
        b.tabIndex = b === target ? 0 : -1;
      }
    };

    sync();
    const onFocusIn = (ev: FocusEvent) => {
      const items = getItems();
      if (ev.target instanceof HTMLButtonElement && items.includes(ev.target)) {
        sync(ev.target);
      }
    };
    bar.addEventListener('focusin', onFocusIn);
    return () => bar.removeEventListener('focusin', onFocusIn);
  }, [ref]);

  return (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if ('focusGroup' in HTMLElement.prototype) return;
    const bar = ref.current;
    if (!bar) return;
    const items = Array.from(bar.querySelectorAll<HTMLButtonElement>('button:not([hidden])'));
    if (items.length === 0) return;

    const idx = items.indexOf(document.activeElement as HTMLButtonElement);
    if (idx < 0) return;

    const rtl = getComputedStyle(bar).direction === 'rtl';
    let nextIdx = -1;
    if (e.key === 'ArrowRight') nextIdx = (idx + (rtl ? -1 : 1) + items.length) % items.length;
    else if (e.key === 'ArrowLeft') nextIdx = (idx + (rtl ? 1 : -1) + items.length) % items.length;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = items.length - 1;
    if (nextIdx < 0) return;

    e.preventDefault();
    for (const b of items) b.tabIndex = -1;
    items[nextIdx].tabIndex = 0;
    items[nextIdx].focus();
  };
}

export function HeaderBar() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectBarRef = useRef<HTMLDivElement>(null);
  const modeBarRef = useRef<HTMLDivElement>(null);
  const utilBarRef = useRef<HTMLDivElement>(null);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  const morePopoverRef = useRef<
    (HTMLDivElement & { showPopover?: () => void; hidePopover?: () => void }) | null
  >(null);
  const moreListRef = useRef<HTMLDivElement>(null);

  const [moreOpen, setMoreOpen] = useState(false);

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

  const onProjectBarKeyDown = useHorizontalToolbarFallback(projectBarRef);
  const onModeBarKeyDown = useHorizontalToolbarFallback(modeBarRef);
  const onUtilBarKeyDown = useHorizontalToolbarFallback(utilBarRef);

  const supportsNativePopover =
    typeof HTMLElement !== 'undefined' && Object.hasOwn(HTMLElement.prototype, 'popover');
  const hasNativeFocusgroup =
    typeof HTMLElement !== 'undefined' && 'focusGroup' in HTMLElement.prototype;

  const closeMoreMenu = () => {
    setMoreOpen(false);
    const pop = morePopoverRef.current;
    if (!pop) return;
    try {
      if (typeof pop.hidePopover === 'function' && pop.matches(':popover-open')) {
        pop.hidePopover();
      }
    } catch {
      // Ignore already closed
    }
  };

  useEffect(() => {
    const pop = morePopoverRef.current;
    if (!pop || !supportsNativePopover) return;

    const handleToggle = (e: Event) => {
      const toggleEvt = e as ToggleEvent;
      const isNowOpen = toggleEvt.newState === 'open';
      setMoreOpen(isNowOpen);
      if (isNowOpen) {
        if (
          moreTriggerRef.current &&
          typeof CSS !== 'undefined' &&
          !CSS.supports('position-area', 'block-end')
        ) {
          const t = moreTriggerRef.current.getBoundingClientRect();
          const m = pop.getBoundingClientRect();
          const below = t.bottom + m.height + 6 <= window.innerHeight;
          pop.style.top = `${Math.round(below ? t.bottom + 6 : Math.max(8, t.top - m.height - 6))}px`;
          pop.style.left = `${Math.round(
            Math.max(8, Math.min(t.left, window.innerWidth - m.width - 8)),
          )}px`;
        }
        requestAnimationFrame(() => {
          moreListRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
        });
      }
    };

    pop.addEventListener('toggle', handleToggle);
    return () => pop.removeEventListener('toggle', handleToggle);
  }, [supportsNativePopover]);

  const handleMoreMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Tab') {
      closeMoreMenu();
      return;
    }
    if (hasNativeFocusgroup) return;
    const list = moreListRef.current;
    if (!list) return;
    const items = Array.from(list.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const idx = items.indexOf(document.activeElement as HTMLButtonElement);
    if (idx < 0 || items.length === 0) return;

    let nextIdx = -1;
    if (e.key === 'ArrowDown') nextIdx = (idx + 1) % items.length;
    else if (e.key === 'ArrowUp') nextIdx = (idx - 1 + items.length) % items.length;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = items.length - 1;
    if (nextIdx < 0) return;

    e.preventDefault();
    items[nextIdx].focus();
  };

  const handleOpen = async () => {
    if (isDesktopRuntime()) {
      await openProjectDialog();
      return;
    }
    fileInputRef.current?.click();
  };

  return (
    <header className="studio-header">
      <div className="header-zone header-zone-left">
        <div
          className="brand-mark"
          title="Dice Chaos Masters — Free Parametric Dice Master & Insert Blank Studio (dicechaos.com)"
        >
          <AppLogoIcon size={28} />
          <div className="brand-title">
            <span className="brand-name">Dice Chaos Masters</span>
            <span className="brand-sub">dicechaos.com • STL / 3MF</span>
          </div>
        </div>

        <input
          type="text"
          className="set-name-input"
          aria-label="Dice set project name"
          title="Project & export set name"
          value={project.setName}
          onChange={(e) => setSetName(e.target.value)}
          placeholder="Set Name"
        />

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

        <div
          ref={projectBarRef}
          role="toolbar"
          aria-label="Project controls"
          className="header-group"
          onKeyDown={onProjectBarKeyDown}
          {...({ focusgroup: 'toolbar wrap' } as Record<string, string>)}
        >
          <div role="group" aria-label="File operations" className="header-group">
            <button
              type="button"
              className="btn btn-compact"
              onClick={handleOpen}
              title="Open .dcproj archive (Ctrl+O)"
            >
              <FolderOpen size={13} aria-hidden="true" />
              <span className="header-btn-label">Open</span>
            </button>

            <button
              type="button"
              className="btn btn-compact"
              onClick={() => void saveProjectFile(false)}
              title={`Save .dcproj project (Ctrl+S)${autoSaveEnabled ? ' · Auto-Save On' : ''}`}
            >
              <Save size={13} aria-hidden="true" />
              <span className="header-btn-label">Save</span>
              {isDirty ? (
                <span className="dirty-dot" aria-label="Unsaved changes" />
              ) : autoSaveEnabled ? (
                <span className="autosave-mini-dot" aria-label="Auto-Save enabled" />
              ) : null}
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

          <button
            ref={moreTriggerRef}
            id="dcm-project-menu-trigger"
            type="button"
            className="btn btn-icon"
            aria-label="More project actions"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            title="Project actions, Auto-Save & Reset"
            {...(supportsNativePopover
              ? ({ popoverTarget: 'dcm-project-menu' } as Record<string, string>)
              : { onClick: () => setMoreOpen((prev) => !prev) })}
          >
            <MoreHorizontal size={14} aria-hidden="true" />
          </button>
        </div>

        <div
          ref={morePopoverRef}
          id="dcm-project-menu"
          className={`studio-context-popover studio-overflow-popover ${
            !supportsNativePopover && moreOpen ? 'fallback-open' : ''
          }`}
          {...(supportsNativePopover
            ? ({ popover: 'auto' } as Record<string, string>)
            : { hidden: !moreOpen })}
        >
          <div
            ref={moreListRef}
            className="studio-menu-list"
            role={hasNativeFocusgroup ? undefined : 'menu'}
            aria-label="More project actions"
            onKeyDown={handleMoreMenuKeyDown}
            {...({ focusgroup: 'menu nomemory' } as Record<string, string>)}
          >
            <button
              type="button"
              role={hasNativeFocusgroup ? undefined : 'menuitem'}
              tabIndex={hasNativeFocusgroup ? undefined : -1}
              onClick={() => {
                closeMoreMenu();
                void saveProjectFile(true);
              }}
            >
              <Save size={13} aria-hidden="true" />
              Save Project As…
              <span className="hint">Ctrl+Shift+S</span>
            </button>

            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={autoSaveEnabled}
              tabIndex={hasNativeFocusgroup ? undefined : -1}
              onClick={() => {
                toggleAutoSave();
              }}
            >
              Auto-Save to Disk
              <span className="hint">{autoSaveEnabled ? 'On' : 'Off'}</span>
            </button>

            <hr />

            <button
              type="button"
              role={hasNativeFocusgroup ? undefined : 'menuitem'}
              tabIndex={hasNativeFocusgroup ? undefined : -1}
              onClick={() => {
                closeMoreMenu();
                resetProject();
              }}
            >
              <RotateCcw size={13} aria-hidden="true" />
              Reset Workspace (16 mm)
            </button>

            <hr />

            <button
              type="button"
              role={hasNativeFocusgroup ? undefined : 'menuitem'}
              tabIndex={hasNativeFocusgroup ? undefined : -1}
              onClick={() => {
                closeMoreMenu();
                if (tourOpen) closeTour();
                else openTour(0);
              }}
            >
              <Sparkles size={13} aria-hidden="true" />
              {tourOpen ? 'Close Maker Tour' : 'Open 5-Step Maker Tour'}
            </button>

            <button
              type="button"
              role={hasNativeFocusgroup ? undefined : 'menuitem'}
              tabIndex={hasNativeFocusgroup ? undefined : -1}
              onClick={() => {
                closeMoreMenu();
                void openExternalUrl('https://dicechaos.com/');
              }}
            >
              <ExternalLink size={13} aria-hidden="true" />
              Visit dicechaos.com
            </button>
          </div>
        </div>
      </div>

      <div
        ref={modeBarRef}
        role="toolbar"
        aria-label="Viewport view mode"
        className="header-group viewport-mode-bar"
        onKeyDown={onModeBarKeyDown}
        {...({ focusgroup: 'toolbar wrap' } as Record<string, string>)}
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
              title={`${m.fullLabel} (${idx + 1})`}
              onClick={() => setViewportMode(m.id)}
            >
              <Icon size={13} aria-hidden="true" />
              <span>{m.shortLabel}</span>
            </button>
          );
        })}
      </div>

      <div
        ref={utilBarRef}
        role="toolbar"
        aria-label="Suite utilities"
        className="header-zone header-zone-right"
        onKeyDown={onUtilBarKeyDown}
        {...({ focusgroup: 'toolbar wrap' } as Record<string, string>)}
      >
        <button
          id="dcm-tour-trigger"
          type="button"
          className="btn btn-icon"
          aria-label="Open 5-step Maker Tour"
          aria-pressed={tourOpen}
          title="Open 5-step Maker Tour"
          onClick={() => (tourOpen ? closeTour() : openTour(0))}
        >
          <Sparkles size={14} aria-hidden="true" />
        </button>

        <button
          type="button"
          className="btn btn-icon"
          aria-label={
            resolvedTheme === 'dark' ? 'Switch to Daylight theme' : 'Switch to Midnight Dark theme'
          }
          title={
            resolvedTheme === 'dark' ? 'Switch to Daylight theme' : 'Switch to Midnight Dark theme'
          }
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
          className="btn btn-primary btn-compact header-export-cta"
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
