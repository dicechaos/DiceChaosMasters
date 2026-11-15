import { useEffect, useMemo, useRef } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { formatDieVariantLabel } from '../engine/exporters/batchExporter';
import { hasDieCustomOverrides } from '../engine/generator';
import { getDieInstanceLabel, getProjectDieOrder } from '../engine/presets';
import { useDiceStore } from '../store/useDiceStore';
import type { DieSettings } from '../types/dice';

export function ConfirmRemoveModal() {
  const project = useDiceStore((s) => s.project);
  const pendingRemoveDiceIds = useDiceStore((s) => s.pendingRemoveDiceIds);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  const { removableIds, keeperId } = useMemo(() => {
    const order = getProjectDieOrder(project);
    const reqSet = new Set((pendingRemoveDiceIds ?? []).filter((id) => id in project.dice));
    let nextKeeperId: string | null = null;

    if (order.length > 0 && order.every((id) => reqSet.has(id))) {
      nextKeeperId = order.includes(project.activeDie) ? project.activeDie : order[0];
      reqSet.delete(nextKeeperId);
    }

    return {
      removableIds: order.filter((id) => reqSet.has(id)),
      keeperId: nextKeeperId,
    };
  }, [pendingRemoveDiceIds, project]);

  const isOpen = Boolean(pendingRemoveDiceIds && removableIds.length > 0);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;

    if (isOpen && !dlg.open) {
      dlg.returnValue = '';
      dlg.showModal();
      cancelBtnRef.current?.focus();
    } else if (!isOpen && dlg.open) {
      dlg.returnValue = '';
      dlg.close();
    }
  }, [isOpen]);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;

    const handleClose = () => {
      const choice = dlg.returnValue;
      dlg.returnValue = '';
      if (choice === 'delete') {
        useDiceStore.getState().confirmRemoveDice();
      } else {
        useDiceStore.getState().cancelRemoveDice();
      }
    };

    dlg.addEventListener('close', handleClose);
    return () => {
      dlg.removeEventListener('close', handleClose);
    };
  }, []);

  const targetDice = removableIds
    .map((id) => project.dice[id])
    .filter((d): d is DieSettings => Boolean(d));
  const anyHasCustomOverrides = targetDice.some((d) => hasDieCustomOverrides(d));
  const keeperDie = keeperId ? project.dice[keeperId] : undefined;

  const titleText =
    targetDice.length === 1
      ? `Remove "${getDieInstanceLabel(targetDice[0], project)}" from set?`
      : targetDice.length > 1
        ? `Remove ${targetDice.length} dice from set?`
        : 'Remove die from set?';

  return (
    <dialog
      ref={dialogRef}
      className="studio-dialog confirm-remove-dialog"
      aria-labelledby="confirm-remove-title"
      aria-describedby="confirm-remove-desc"
    >
      <div className="dialog-header">
        <h2 id="confirm-remove-title">{titleText}</h2>
        <button
          type="button"
          className="btn btn-icon"
          aria-label="Cancel removal"
          onClick={() => dialogRef.current?.close('cancel')}
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>

      <div className="dialog-body">
        <p id="confirm-remove-desc" className="confirm-remove-lead">
          {targetDice.length === 1
            ? 'This die and its per-die configuration will be removed from the active project set.'
            : `These ${targetDice.length} selected dice and their configurations will be removed from the active project set.`}
        </p>

        {targetDice.length > 0 && (
          <ul className="confirm-die-list" aria-label="Dice to remove">
            {targetDice.map((die) => {
              const label = getDieInstanceLabel(die, project);
              const isCustom = hasDieCustomOverrides(die);
              return (
                <li key={die.id} className="confirm-die-item">
                  <span className="confirm-die-name">
                    <strong>{label}</strong>
                    {isCustom && <span className="die-tag custom-tag">Custom</span>}
                  </span>
                  <span className="confirm-die-meta">
                    {formatDieVariantLabel(die)} · {die.sizeMm.toFixed(1)} mm
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {anyHasCustomOverrides && (
          <div className="confirm-override-warning" role="note">
            <AlertTriangle size={15} aria-hidden="true" />
            <span>
              Custom font, depth, high-face emblem, or per-face overrides exist on this selection.
            </span>
          </div>
        )}

        {keeperDie && (
          <p className="confirm-keeper-note">
            <strong>{getDieInstanceLabel(keeperDie, project)}</strong> will remain in the set
            because at least 1 die is required.
          </p>
        )}

        <p className="confirm-undo-hint">
          Tip: You can restore removed dice afterward using <strong>Undo (Ctrl+Z)</strong>.
        </p>
      </div>

      <form method="dialog" className="dialog-footer">
        <button ref={cancelBtnRef} type="submit" value="cancel" className="btn" autoFocus>
          Cancel
        </button>
        <button type="submit" value="delete" className="btn btn-danger">
          <Trash2 size={13} aria-hidden="true" />
          {targetDice.length <= 1 ? 'Remove Die' : `Remove ${targetDice.length} Dice`}
        </button>
      </form>
    </dialog>
  );
}
