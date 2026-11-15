import { useEffect, useRef } from 'react';
import { ExternalLink, Monitor, Moon, Sun, X } from 'lucide-react';
import { openExternalUrl } from '../platform/desktopBridge';
import { useDiceStore } from '../store/useDiceStore';
import type { ThemePreference } from '../types/dice';

const SHORTCUTS: Array<{ label: string; keys: string }> = [
  { label: 'Select all dice in set (group edit)', keys: 'Ctrl + A' },
  { label: 'Toggle / range multi-select dice', keys: 'Ctrl / Shift + Click' },
  { label: 'Duplicate active die', keys: 'Ctrl + D' },
  { label: 'Die / Face editing context menu', keys: 'Right-Click or Shift + F10' },
  { label: 'Remove selected die(s) (with confirm)', keys: 'Delete' },
  { label: 'Return to single-die editing', keys: 'Esc' },
  { label: 'Undo parameter or edit', keys: 'Ctrl + Z' },
  { label: 'Redo edit', keys: 'Ctrl + Y' },
  { label: 'Save .dcproj project', keys: 'Ctrl + S' },
  { label: 'Save .dcproj As…', keys: 'Ctrl + Shift + S' },
  { label: 'Open .dcproj archive', keys: 'Ctrl + O' },
  { label: 'Open Batch Export modal', keys: 'Ctrl + E' },
  { label: 'Single / Tray / X-Ray / Supports', keys: '1 / 2 / 3 / 4' },
  { label: 'Fit & Reset 3D Camera', keys: 'F' },
  { label: 'Toggle Focus Mode (hide rails)', keys: '\\' },
  { label: 'Shortcuts & Dice Chaos Suite', keys: '? or F1' },
];

export function ShortcutsHelpModal() {
  const open = useDiceStore((s) => s.shortcutsModalOpen);
  const setOpen = useDiceStore((s) => s.setShortcutsModalOpen);
  const theme = useDiceStore((s) => s.theme);
  const setThemePreference = useDiceStore((s) => s.setThemePreference);

  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;

    if (open && !dlg.open) {
      dlg.showModal();
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open]);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;

    const handleClose = () => setOpen(false);
    dlg.addEventListener('close', handleClose);

    // Mandatory fallback for browsers without native dialog closedby support
    const handleBackdropClick = (event: MouseEvent) => {
      if ('closedBy' in HTMLDialogElement.prototype) return;
      if (event.target !== dlg) return;
      const rect = dlg.getBoundingClientRect();
      const inside =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;
      if (!inside) {
        dlg.close();
      }
    };

    dlg.addEventListener('click', handleBackdropClick);
    return () => {
      dlg.removeEventListener('close', handleClose);
      dlg.removeEventListener('click', handleBackdropClick);
    };
  }, [setOpen]);

  const setTheme = (pref: ThemePreference) => setThemePreference(pref);

  return (
    <dialog
      ref={dialogRef}
      className="studio-dialog wide-dialog"
      aria-labelledby="shortcuts-dialog-title"
      {...({ closedby: 'any' } as Record<string, string>)}
    >
      <div className="dialog-header">
        <h2 id="shortcuts-dialog-title">Keyboard Shortcuts &amp; Dice Chaos Suite</h2>
        <button
          type="button"
          className="btn btn-icon"
          aria-label="Close shortcuts dialog"
          onClick={() => setOpen(false)}
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>

      <div className="dialog-body">
        <section className="panel-section">
          <div className="field-label-line">
            <h3 className="section-heading">Appearance &amp; Theme Override</h3>
            <div className="theme-segment" role="group" aria-label="Color scheme preference">
              <button
                type="button"
                className="btn btn-compact"
                aria-pressed={theme === 'system'}
                onClick={() => setTheme('system')}
              >
                <Monitor size={13} aria-hidden="true" />
                System
              </button>
              <button
                type="button"
                className="btn btn-compact"
                aria-pressed={theme === 'dark'}
                onClick={() => setTheme('dark')}
              >
                <Moon size={13} aria-hidden="true" />
                Midnight Dark
              </button>
              <button
                type="button"
                className="btn btn-compact"
                aria-pressed={theme === 'light'}
                onClick={() => setTheme('light')}
              >
                <Sun size={13} aria-hidden="true" />
                Daylight
              </button>
            </div>
          </div>
        </section>

        <section className="panel-section">
          <h3 className="section-heading">Studio Shortcuts &amp; Drag-and-Drop</h3>
          <div className="shortcuts-grid">
            {SHORTCUTS.map((item) => (
              <div key={item.label} className="shortcut-item">
                <span>{item.label}</span>
                <kbd className="shortcut-keys">{item.keys}</kbd>
              </div>
            ))}
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
            Tip: Drag and drop <code>.dcproj</code> projects, custom <code>.ttf</code>/<code>.otf</code> fonts, or{' '}
            <code>.svg</code> emblems anywhere onto the window.
          </p>
        </section>

        <section className="panel-section">
          <h3 className="section-heading">Dice Chaos Ecosystem</h3>
          <div className="suite-grid">
            <button
              type="button"
              className="suite-card"
              onClick={() => void openExternalUrl('https://dicechaos.com/')}
            >
              <strong style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                dicechaos.com <ExternalLink size={12} aria-hidden="true" />
              </strong>
              <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                Handmade dice, suite downloads, and maker guides.
              </span>
            </button>

            <button
              type="button"
              className="suite-card"
              onClick={() =>
                void openExternalUrl('https://github.com/dicechaos/DiceChaosConnections')
              }
            >
              <strong style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                Dice Chaos Connections <ExternalLink size={12} aria-hidden="true" />
              </strong>
              <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                Sister Electron suite app for lore, NPCs, and campaign graphs.
              </span>
            </button>

            <button
              type="button"
              className="suite-card"
              onClick={() => void openExternalUrl('https://github.com/dicechaos/DiceChaosDisplay')}
            >
              <strong style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                Dice Chaos Display <ExternalLink size={12} aria-hidden="true" />
              </strong>
              <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                Sister app &amp; 3D modular display tools for makers and tables.
              </span>
            </button>
          </div>
        </section>
      </div>

      <div className="dialog-footer">
        <button
          type="button"
          className="btn btn-link"
          onClick={() =>
            void openExternalUrl('https://github.com/dicechaos/DiceChaosMasters/issues')
          }
        >
          Report Issue / Feedback <ExternalLink size={12} aria-hidden="true" />
        </button>
        <button type="button" className="btn btn-primary" onClick={() => setOpen(false)}>
          Done
        </button>
      </div>
    </dialog>
  );
}
