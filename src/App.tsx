import { useEffect, useRef, useState } from 'react';
import { ConfirmRemoveModal } from './components/ConfirmRemoveModal';
import { DieSelectorRail } from './components/DieSelectorRail';
import { ExportModal } from './components/ExportModal';
import { FeatureTourCard } from './components/FeatureTourCard';
import { HeaderBar } from './components/HeaderBar';
import { InspectorPanel } from './components/InspectorPanel';
import { ShortcutsHelpModal } from './components/ShortcutsHelpModal';
import { StudioContextMenu } from './components/StudioContextMenu';
import { Viewport3D } from './components/Viewport3D';
import { getDieInstanceLabel, getProjectDieOrder } from './engine/presets';
import { confirmQuitClean, subscribeSaveAndQuit } from './platform/desktopBridge';
import { useDiceStore } from './store/useDiceStore';

export function App() {
  const initFonts = useDiceStore((s) => s.initFonts);
  const initThemeSync = useDiceStore((s) => s.initThemeSync);
  const statusMessage = useDiceStore((s) => s.statusMessage);
  const project = useDiceStore((s) => s.project);
  const isFocusMode = useDiceStore((s) => s.isFocusMode);
  const handleDroppedFiles = useDiceStore((s) => s.handleDroppedFiles);

  const dieOrder = getProjectDieOrder(project);
  const activeDieObj = project.dice[project.activeDie] ?? project.dice[dieOrder[0]];

  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const dragCounterRef = useRef(0);

  useEffect(() => {
    void initFonts();
    const stopThemeSync = initThemeSync();
    return () => stopThemeSync();
  }, [initFonts, initThemeSync]);

  // Desktop save-before-quit hook from Electron close guard
  useEffect(() => {
    return subscribeSaveAndQuit(async () => {
      const ok = await useDiceStore.getState().saveProjectFile(false);
      if (ok) {
        confirmQuitClean();
      }
    });
  }, []);

  // Global maker keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inEditable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.isContentEditable);

      const ctrlOrMeta = event.ctrlKey || event.metaKey;
      const state = useDiceStore.getState();

      if (ctrlOrMeta) {
        const key = event.key.toLowerCase();
        if (key === 'z' && !event.shiftKey) {
          event.preventDefault();
          state.undo();
          return;
        }
        if (key === 'y' || (key === 'z' && event.shiftKey)) {
          event.preventDefault();
          state.redo();
          return;
        }
        if (key === 's') {
          event.preventDefault();
          void state.saveProjectFile(event.shiftKey);
          return;
        }
        if (key === 'o') {
          event.preventDefault();
          void state.openProjectDialog();
          return;
        }
        if (key === 'e') {
          event.preventDefault();
          state.setExportModalOpen(true);
          return;
        }
        if (key === 'a' && !inEditable) {
          event.preventDefault();
          state.selectDiceGroup('all');
          return;
        }
        if (key === 'd' && !inEditable) {
          event.preventDefault();
          state.duplicateDieInstance(state.project.activeDie);
          return;
        }
      }

      const anyModalOpen =
        state.exportModalOpen ||
        state.shortcutsModalOpen ||
        Boolean(state.pendingRemoveDiceIds);

      if (event.key === 'Escape') {
        if (state.contextMenu) {
          return;
        }
        if (state.tourOpen) {
          event.preventDefault();
          state.closeTour();
          return;
        }
        if (!inEditable && !anyModalOpen && state.project.selectedDice.length > 1) {
          event.preventDefault();
          state.selectDiceGroup('single');
          return;
        }
      }

      if (inEditable || ctrlOrMeta || event.altKey) return;

      if (event.key === 'Delete' && !anyModalOpen) {
        event.preventDefault();
        state.requestRemoveDice(state.project.selectedDice);
        return;
      }

      if (event.key === '1') {
        state.setViewportMode('single');
      } else if (event.key === '2') {
        state.setViewportMode('tray');
      } else if (event.key === '3') {
        state.setViewportMode('xray');
      } else if (event.key === '4') {
        state.setViewportMode('supports');
      } else if (event.key === 'f' || event.key === 'F') {
        event.preventDefault();
        state.triggerCameraFit();
      } else if (event.key === '\\') {
        event.preventDefault();
        state.toggleFocusMode();
      } else if (event.key === '?' || event.key === 'F1') {
        event.preventDefault();
        state.setShortcutsModalOpen(!state.shortcutsModalOpen);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Window drag-and-drop (.dcproj / .ttf / .otf / .svg)
  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      dragCounterRef.current += 1;
      setIsDraggingFiles(true);
    };

    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
    };

    const onDragLeave = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
      if (dragCounterRef.current === 0) {
        setIsDraggingFiles(false);
      }
    };

    const onDrop = (e: DragEvent) => {
      if (!e.dataTransfer?.files || e.dataTransfer.files.length === 0) return;
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDraggingFiles(false);
      void handleDroppedFiles(e.dataTransfer.files);
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);

    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [handleDroppedFiles]);

  return (
    <div className="studio-shell">
      <HeaderBar />

      <div className={`workspace-grid ${isFocusMode ? 'focus-mode' : ''}`}>
        <DieSelectorRail />
        <Viewport3D />
        <InspectorPanel />
      </div>

      <footer className="studio-footer">
        <div className="footer-left">
          <span role="status">{statusMessage}</span>
        </div>
        <div className="footer-right">
          <span className="footer-shortcuts">
            <span>
              <kbd className="footer-kbd">Ctrl+Z</kbd> Undo
            </span>
            <span>
              <kbd className="footer-kbd">F</kbd> Fit
            </span>
            <span>
              <kbd className="footer-kbd">\</kbd> Focus
            </span>
            <span>
              <kbd className="footer-kbd">?</kbd> Shortcuts
            </span>
          </span>
          <span className="footer-summary">
            Free Open Maker Tool • {dieOrder.length} {dieOrder.length === 1 ? 'DIE' : 'DICE'}
            {activeDieObj ? ` • ${getDieInstanceLabel(activeDieObj, project)}` : ''}
          </span>
        </div>
      </footer>

      <FeatureTourCard />
      <ExportModal />
      <ConfirmRemoveModal />
      <ShortcutsHelpModal />
      <StudioContextMenu />

      {isDraggingFiles && (
        <div className="dropzone-overlay" role="status" aria-live="polite">
          <div className="dropzone-card">
            <h2>Drop to Import into Dice Chaos Masters</h2>
            <p>
              Accepts <code>.dcproj</code> projects, <code>.ttf</code> / <code>.otf</code> fonts, or{' '}
              <code>.svg</code> face emblems
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
