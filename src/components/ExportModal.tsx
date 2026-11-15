import { useEffect, useRef } from 'react';
import { AlertTriangle, CheckCircle2, Download, ExternalLink, X } from 'lucide-react';
import {
  getDieInstanceShortTag,
  getProjectDieOrder,
  normalizeSelectedDice,
} from '../engine/presets';
import { isDesktopRuntime, openExternalUrl } from '../platform/desktopBridge';
import { useDiceStore } from '../store/useDiceStore';

export function ExportModal() {
  const project = useDiceStore((s) => s.project);
  const exportModalOpen = useDiceStore((s) => s.exportModalOpen);
  const exportScope = useDiceStore((s) => s.exportScope);
  const isExporting = useDiceStore((s) => s.isExporting);
  const exportProgress = useDiceStore((s) => s.exportProgress);
  const exportSummary = useDiceStore((s) => s.exportSummary);
  const exportError = useDiceStore((s) => s.exportError);
  const setExportModalOpen = useDiceStore((s) => s.setExportModalOpen);
  const setExportScope = useDiceStore((s) => s.setExportScope);
  const runBatchExport = useDiceStore((s) => s.runBatchExport);
  const cancelBatchExport = useDiceStore((s) => s.cancelBatchExport);

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

  const dieOrder = getProjectDieOrder(project);
  const enabledDice = dieOrder.filter((id) => project.dice[id]?.enabled);
  const selectedDice = normalizeSelectedDice(project.selectedDice, project.activeDie, dieOrder);
  const targetDice = exportScope === 'selected' ? selectedDice : enabledDice;
  const targetCount = targetDice.length;
  const hasPerDieOverrides = targetDice.some((id) => {
    const d = project.dice[id];
    if (!d) return false;
    return (
      d.fontIdOverride !== null ||
      d.engravingDepthOverrideMm !== null ||
      d.useHighFaceEmblemOverride !== null ||
      d.blankClearanceOverrideMm !== null
    );
  });
  const hasAnyFormat =
    project.exportConfig.exportStl ||
    project.exportConfig.export3mf ||
    project.exportConfig.exportSpecSheet;

  return (
    <dialog
      ref={dialogRef}
      className="studio-dialog"
      {...({ closedby: isExporting ? 'closerequest' : 'any' } as Record<string, string>)}
      aria-labelledby="export-modal-title"
      onClose={(e) => {
        e.currentTarget.returnValue = '';
        if (!exportModalOpen) return;
        if (isExporting) cancelBatchExport();
        setExportModalOpen(false);
      }}
      onCancel={(e) => {
        if (isExporting) {
          e.preventDefault();
          cancelBatchExport();
        }
      }}
    >
      <div className="dialog-header">
        <h2 id="export-modal-title">Export Master Set &amp; Matched Blanks</h2>
        <button
          type="button"
          className="btn"
          aria-label={isExporting ? 'Cancel export and close dialog' : 'Close export dialog'}
          onClick={() => {
            if (isExporting) cancelBatchExport();
            setExportModalOpen(false);
          }}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>

      <div className="dialog-body">
        <div className="field-row">
          <span className="control-label">Export Scope</span>
          <div className="theme-segment" role="group" aria-label="Batch export scope">
            <button
              type="button"
              className="btn btn-compact"
              aria-pressed={exportScope === 'enabled'}
              disabled={isExporting}
              onClick={() => setExportScope('enabled')}
            >
              Active Set ({enabledDice.length})
            </button>
            <button
              type="button"
              className="btn btn-compact"
              aria-pressed={exportScope === 'selected'}
              disabled={isExporting}
              onClick={() => setExportScope('selected')}
            >
              Selected Group ({selectedDice.length})
            </button>
          </div>
        </div>

        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
          Exporting <strong>{targetCount}</strong>{' '}
          {exportScope === 'selected' ? 'selected' : 'active'} {targetCount === 1 ? 'die' : 'dice'} (
          {targetDice
            .map((id) => {
              const d = project.dice[id];
              return d ? getDieInstanceShortTag(d, project) : id.toUpperCase();
            })
            .join(', ')}
          ) in set <strong>{project.setName}</strong>
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
            Engraving: {project.typography.engravingDepthMm.toFixed(2)} mm base depth ·{' '}
            {project.typography.draftAngleDeg}° anti-tear draft
            {hasPerDieOverrides ? ' (+ per-die overrides applied)' : ''}
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
                {exportSummary.fileCount} {exportSummary.fileCount === 1 ? 'file' : 'files'} ready:{' '}
                {exportSummary.destinationLabel}
              </span>
            </div>
            {exportSummary.downloadUrl && exportSummary.downloadFilename && (
              <a
                href={exportSummary.downloadUrl}
                download={exportSummary.downloadFilename}
                className="btn btn-compact"
                style={{ alignSelf: 'flex-start', textDecoration: 'none' }}
              >
                <Download size={13} aria-hidden="true" />
                Download {exportSummary.downloadFilename}
              </a>
            )}
            {exportSummary.breachedDice.length > 0 && (
              <div className="status-badge warn">
                <AlertTriangle size={15} aria-hidden="true" />
                <span>
                  Warning: blank clearance breaches numbers on:{' '}
                  {exportSummary.breachedDice.join(', ')}
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
          onClick={() => {
            if (isExporting) {
              cancelBatchExport();
            } else {
              setExportModalOpen(false);
            }
          }}
        >
          {isExporting ? 'Cancel Export' : 'Close'}
        </button>

        <button
          type="button"
          className="btn btn-primary"
          autoFocus
          disabled={isExporting || targetCount === 0 || !hasAnyFormat}
          onClick={() => void runBatchExport()}
        >
          <Download size={14} aria-hidden="true" />
          {isExporting
            ? exportProgress?.label.startsWith('Packaging')
              ? 'Packaging ZIP…'
              : 'Generating Meshes…'
            : isDesktopRuntime()
              ? 'Start Batch Export'
              : 'Export & Download .ZIP'}
        </button>
      </div>
    </dialog>
  );
}
