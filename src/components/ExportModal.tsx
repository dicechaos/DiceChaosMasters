import { useEffect, useRef } from 'react';
import { AlertTriangle, CheckCircle2, Download, ExternalLink, X } from 'lucide-react';
import { DIE_ORDER } from '../engine/presets';
import { openExternalUrl } from '../platform/desktopBridge';
import { useDiceStore } from '../store/useDiceStore';

export function ExportModal() {
  const project = useDiceStore((s) => s.project);
  const exportModalOpen = useDiceStore((s) => s.exportModalOpen);
  const isExporting = useDiceStore((s) => s.isExporting);
  const exportProgress = useDiceStore((s) => s.exportProgress);
  const exportSummary = useDiceStore((s) => s.exportSummary);
  const exportError = useDiceStore((s) => s.exportError);
  const setExportModalOpen = useDiceStore((s) => s.setExportModalOpen);
  const runBatchExport = useDiceStore((s) => s.runBatchExport);

  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (exportModalOpen && !dialog.open) {
      dialog.showModal();
    } else if (!exportModalOpen && dialog.open) {
      dialog.close();
    }
  }, [exportModalOpen]);

  const enabledCount = DIE_ORDER.filter((k) => project.dice[k].enabled).length;
  const hasAnyFormat =
    project.exportConfig.exportStl ||
    project.exportConfig.export3mf ||
    project.exportConfig.exportSpecSheet;

  return (
    <dialog
      ref={dialogRef}
      className="studio-dialog"
      {...({ closedby: isExporting ? 'none' : 'any' } as Record<string, string>)}
      aria-labelledby="export-modal-title"
      onClose={(e) => {
        e.currentTarget.returnValue = '';
        if (exportModalOpen && !isExporting) setExportModalOpen(false);
      }}
      onCancel={(e) => {
        if (isExporting) e.preventDefault();
      }}
    >
      <div className="dialog-header">
        <h2 id="export-modal-title">Export Master Set &amp; Matched Blanks</h2>
        <button
          type="button"
          className="btn"
          aria-label="Close export dialog"
          disabled={isExporting}
          onClick={() => setExportModalOpen(false)}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>

      <div className="dialog-body">
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
          Exporting <strong>{enabledCount}</strong> active dice in set{' '}
          <strong>{project.setName}</strong>
          {project.blanks.includeBlanksOnExport
            ? ' with matched insert blanks in Masters/ and Blanks/ folders.'
            : ' (Masters only).'}
        </p>

        <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-secondary)' }}>
          <li>
            Formats:{' '}
            {[
              project.exportConfig.exportStl ? 'Binary .STL' : null,
              project.exportConfig.export3mf ? '.3MF' : null,
              project.exportConfig.exportSpecSheet ? 'Caliper_Specs.md' : null,
            ]
              .filter(Boolean)
              .join(' + ') || 'None selected'}
          </li>
          <li>
            Engraving: {project.typography.engravingDepthMm.toFixed(2)} mm deep ·{' '}
            {project.typography.draftAngleDeg}° anti-tear draft
          </li>
          <li>
            Blank Clearance: {project.blanks.clearanceMm.toFixed(2)} mm/side · Shrinkage: +
            {project.exportConfig.shrinkageCompensationPct.toFixed(2)}%
          </li>
          <li>
            Pre-Supports:{' '}
            {project.supports.enabled ? 'Point-Down Edge Bumpers & Fins Included' : 'Clean Unsupported Meshes'}
          </li>
        </ul>

        {isExporting && exportProgress && (
          <div className="field-row">
            <div className="field-label-line">
              <span>{exportProgress.label}</span>
              <span className="field-value">
                {exportProgress.currentStep}/{exportProgress.totalSteps}
              </span>
            </div>
            <progress
              className="export-progress"
              max={exportProgress.totalSteps}
              value={exportProgress.currentStep}
            />
          </div>
        )}

        {exportError && (
          <div className="status-badge warn" role="alert">
            <AlertTriangle size={15} aria-hidden="true" />
            <span>{exportError}</span>
          </div>
        )}

        {exportSummary && (
          <div className="panel-section">
            <div className="status-badge ok">
              <CheckCircle2 size={16} aria-hidden="true" />
              <span>
                Exported {exportSummary.fileCount} files to {exportSummary.destinationLabel}
              </span>
            </div>
            {exportSummary.breachedDice.length > 0 && (
              <div className="status-badge warn">
                <AlertTriangle size={15} aria-hidden="true" />
                <span>
                  Warning: blank clearance breaches numbers on:{' '}
                  {exportSummary.breachedDice.map((d) => d.toUpperCase()).join(', ')}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="dialog-footer">
        <button
          type="button"
          className="btn btn-link"
          onClick={() => void openExternalUrl('https://dicechaos.com/')}
        >
          Visit dicechaos.com
          <ExternalLink size={12} aria-hidden="true" />
        </button>

        <button
          type="button"
          className="btn"
          disabled={isExporting}
          onClick={() => setExportModalOpen(false)}
        >
          Close
        </button>

        <button
          type="button"
          className="btn btn-primary"
          autoFocus
          disabled={isExporting || enabledCount === 0 || !hasAnyFormat}
          onClick={() => void runBatchExport()}
        >
          <Download size={14} aria-hidden="true" />
          {isExporting ? 'Generating Meshes…' : 'Start Batch Export'}
        </button>
      </div>
    </dialog>
  );
}
