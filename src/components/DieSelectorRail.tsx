import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { Copy, Plus, Sparkles, Trash2 } from 'lucide-react';
import { formatDieVariantLabel } from '../engine/exporters/batchExporter';
import { hasDieCustomOverrides } from '../engine/generator';
import {
  DIE_ORDER,
  SET_TEMPLATE_LIST,
  getDieInstanceLabel,
  getProjectDieOrder,
  normalizeSelectedDice,
} from '../engine/presets';
import { useDiceStore } from '../store/useDiceStore';

export function DieSelectorRail() {
  const project = useDiceStore((s) => s.project);
  const multiSelectMode = useDiceStore((s) => s.multiSelectMode);
  const selectDie = useDiceStore((s) => s.selectDie);
  const selectDiceGroup = useDiceStore((s) => s.selectDiceGroup);
  const setMultiSelectMode = useDiceStore((s) => s.setMultiSelectMode);
  const updateDieSettings = useDiceStore((s) => s.updateDieSettings);
  const addDieInstance = useDiceStore((s) => s.addDieInstance);
  const duplicateDieInstance = useDiceStore((s) => s.duplicateDieInstance);
  const requestRemoveDice = useDiceStore((s) => s.requestRemoveDice);
  const openDieContextMenu = useDiceStore((s) => s.openDieContextMenu);
  const applySetTemplate = useDiceStore((s) => s.applySetTemplate);

  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const addPopoverRef = useRef<
    (HTMLDivElement & { showPopover?: () => void; hidePopover?: () => void }) | null
  >(null);
  const [fallbackOpen, setFallbackOpen] = useState(false);

  const hasNativeFocusgroup =
    typeof HTMLElement !== 'undefined' && 'focusGroup' in HTMLElement.prototype;
  const supportsNativePopover =
    typeof HTMLElement !== 'undefined' && Object.hasOwn(HTMLElement.prototype, 'popover');

  const closeAddPopover = () => {
    setFallbackOpen(false);
    const pop = addPopoverRef.current;
    if (!pop) return;
    try {
      if (typeof pop.hidePopover === 'function' && pop.matches(':popover-open')) {
        pop.hidePopover();
      }
    } catch {
      // Ignore if already closed
    }
  };

  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    if ('focusGroup' in HTMLElement.prototype) return;

    const buttons = Array.from(toolbar.querySelectorAll<HTMLButtonElement>('button'));
    const active = toolbar.querySelector<HTMLButtonElement>('button[tabindex="0"]') ?? buttons[0];
    for (const btn of buttons) {
      btn.tabIndex = btn === active ? 0 : -1;
    }
  }, []);

  const handleToolbarKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if ('focusGroup' in HTMLElement.prototype) return;
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    const buttons = Array.from(toolbar.querySelectorAll<HTMLButtonElement>('button'));
    if (buttons.length === 0) return;

    const idx = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (idx < 0) return;

    let nextIdx = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      nextIdx = (idx + 1) % buttons.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      nextIdx = (idx - 1 + buttons.length) % buttons.length;
    } else if (e.key === 'Home') {
      nextIdx = 0;
    } else if (e.key === 'End') {
      nextIdx = buttons.length - 1;
    }
    if (nextIdx < 0) return;

    e.preventDefault();
    for (const btn of buttons) btn.tabIndex = -1;
    buttons[nextIdx].tabIndex = 0;
    buttons[nextIdx].focus();
  };

  const dieOrder = getProjectDieOrder(project);
  const selectedDice = normalizeSelectedDice(project.selectedDice, project.activeDie, dieOrder);
  const selectedSet = new Set(selectedDice);
  const selectedCount = selectedDice.length;
  const enabledCount = dieOrder.filter((id) => Boolean(project.dice[id]?.enabled)).length;
  const canRemoveAny = dieOrder.length > 1;

  const handleCreateD20LogoNumbersPair = () => {
    const activeSettings = project.dice[project.activeDie];
    const targetD20Id =
      activeSettings?.kind === 'd20'
        ? activeSettings.id
        : dieOrder.find((id) => project.dice[id]?.kind === 'd20');

    if (targetD20Id) {
      duplicateDieInstance(targetD20Id, { asLogoNumbersPair: true });
    } else {
      addDieInstance('d20');
      const newlyAddedId = useDiceStore.getState().project.activeDie;
      duplicateDieInstance(newlyAddedId, { asLogoNumbersPair: true });
    }
    closeAddPopover();
  };

  return (
    <aside className="die-rail" aria-label="Dice Set Selector">
      <div className="rail-header">
        <h2 className="rail-heading">Polyhedral Set</h2>
        <span
          className="rail-count-pill"
          title={
            selectedCount > 1
              ? `${selectedCount} dice selected for group editing`
              : `${enabledCount} of ${dieOrder.length} dice enabled for export`
          }
        >
          {selectedCount > 1 ? `${selectedCount} sel` : `${enabledCount}/${dieOrder.length}`}
        </span>
      </div>

      <div
        ref={toolbarRef}
        role="toolbar"
        aria-label="Multi-die selection tools"
        className="rail-group-toolbar"
        onKeyDown={handleToolbarKeyDown}
        {...({ focusgroup: 'toolbar wrap' } as Record<string, string>)}
      >
        <button
          type="button"
          className="btn-rail-tool"
          tabIndex={hasNativeFocusgroup ? undefined : 0}
          onClick={() => selectDiceGroup('all')}
          title={`Select all ${dieOrder.length} dice (Ctrl+A)`}
        >
          All {dieOrder.length}
        </button>
        <button
          type="button"
          className="btn-rail-tool"
          tabIndex={hasNativeFocusgroup ? undefined : -1}
          onClick={() => selectDiceGroup('rpg7')}
          title="Select RPG polyhedrals (D4–D20)"
        >
          RPG
        </button>
        <button
          type="button"
          className="btn-rail-tool"
          tabIndex={hasNativeFocusgroup ? undefined : -1}
          aria-pressed={multiSelectMode}
          onClick={() => setMultiSelectMode(!multiSelectMode)}
          title="Toggle multi-select mode (click dice without holding Ctrl)"
        >
          Multi
        </button>
        <button
          type="button"
          className="btn-rail-tool"
          tabIndex={hasNativeFocusgroup ? undefined : -1}
          aria-disabled={selectedCount <= 1 ? 'true' : undefined}
          onClick={() => {
            if (selectedCount <= 1) return;
            selectDiceGroup('single');
          }}
          title="Return to single-die editing (Esc)"
        >
          Single
        </button>
      </div>

      <div className="rail-add-bar">
        <button
          id="dcm-add-die-trigger"
          type="button"
          className="btn btn-compact btn-rail-add"
          {...(supportsNativePopover
            ? ({ popoverTarget: 'dcm-add-die-popover' } as Record<string, string>)
            : { onClick: () => setFallbackOpen((prev) => !prev) })}
          title="Add duplicate shapes or load popular tabletop game set templates"
        >
          <Plus size={13} aria-hidden="true" />
          Add Die / Sets
        </button>

        <div
          ref={addPopoverRef}
          id="dcm-add-die-popover"
          className={`add-die-popover ${!supportsNativePopover && fallbackOpen ? 'fallback-open' : ''}`}
          aria-label="Add dice or apply game set template"
          {...(supportsNativePopover
            ? ({ popover: 'auto' } as Record<string, string>)
            : { hidden: !fallbackOpen })}
        >
          <div className="add-popover-section">
            <span className="add-popover-heading">Maker Shortcuts</span>
            <div className="add-pair-grid">
              <button
                type="button"
                className="btn btn-compact btn-primary"
                onClick={handleCreateD20LogoNumbersPair}
              >
                <Sparkles size={12} aria-hidden="true" />
                Add D20 Logo &amp; Numbers Pair
              </button>
              <button
                type="button"
                className="btn btn-compact"
                onClick={() => {
                  addDieInstance('d6');
                  closeAddPopover();
                }}
              >
                <Plus size={12} aria-hidden="true" />
                Add Extra D6
              </button>
            </div>
          </div>

          <div className="add-popover-section">
            <span className="add-popover-heading">Add Single Die Shape</span>
            <div className="add-shape-grid">
              {DIE_ORDER.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className="btn btn-compact"
                  onClick={() => {
                    addDieInstance(kind);
                    closeAddPopover();
                  }}
                >
                  + {kind.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="add-popover-section">
            <span className="add-popover-heading">Popular Game Set Templates</span>
            <div className="template-list">
              {SET_TEMPLATE_LIST.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  className="template-card-btn"
                  onClick={() => {
                    applySetTemplate(tpl.id);
                    closeAddPopover();
                  }}
                >
                  <span className="template-card-top">
                    <span>{tpl.label}</span>
                    <span className="template-card-count">{tpl.shortLabel}</span>
                  </span>
                  <span className="template-card-desc">{tpl.description}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <nav className="die-list" aria-label="Die shapes">
        {dieOrder.map((dieId) => {
          const die = project.dice[dieId];
          if (!die) return null;
          const isSelected = selectedSet.has(dieId);
          const isAnchor = project.activeDie === dieId;
          const isCustom = hasDieCustomOverrides(die);
          const displayName = getDieInstanceLabel(die, project);

          const baseSubtitle =
            die.kind === 'd2'
              ? `${formatDieVariantLabel(die)} · ${die.secondarySizeMm.toFixed(1)} mm`
              : formatDieVariantLabel(die);
          const emblemNote =
            die.useHighFaceEmblemOverride === true
              ? ' · Logo'
              : die.useHighFaceEmblemOverride === false
                ? ' · Numbers'
                : '';
          const variantSubtitle = `${baseSubtitle}${emblemNote}`;

          return (
            <div
              key={dieId}
              className={`die-card ${isSelected ? 'active' : ''} ${
                isAnchor && selectedCount > 1 ? 'anchor' : ''
              }`}
              onContextMenu={(e) => {
                e.preventDefault();
                openDieContextMenu(dieId, e.clientX, e.clientY, false);
              }}
            >
              <input
                id={`enable-die-${dieId}`}
                type="checkbox"
                checked={die.enabled}
                aria-label={`Include ${displayName} in export`}
                onChange={(e) => updateDieSettings(dieId, { enabled: e.target.checked })}
              />
              <button
                type="button"
                className="die-card-btn"
                aria-pressed={isSelected}
                aria-current={isAnchor ? 'true' : undefined}
                title="Click to focus · Right-click for options · Ctrl/Cmd+Click to toggle · Shift+Click for range"
                onClick={(e) =>
                  selectDie(dieId, {
                    toggle: e.ctrlKey || e.metaKey,
                    range: e.shiftKey,
                  })
                }
                onKeyDown={(e) => {
                  if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
                    e.preventDefault();
                    const r = e.currentTarget.getBoundingClientRect();
                    openDieContextMenu(
                      dieId,
                      Math.round(r.left + r.width * 0.5),
                      Math.round(r.bottom),
                      true,
                    );
                  }
                }}
              >
                <span className="die-card-top">
                  <span className="die-name">{displayName}</span>
                  <span className="die-mm-pill">{die.sizeMm.toFixed(1)} mm</span>
                </span>
                <span className="die-card-meta">
                  <span className="die-sub" title={variantSubtitle}>
                    {variantSubtitle}
                  </span>
                  {selectedCount > 1 && isAnchor && (
                    <span className="die-tag anchor-tag">Primary</span>
                  )}
                  {isCustom && (
                    <span
                      className="die-tag custom-tag"
                      title="Has custom per-die overrides"
                    >
                      Custom
                    </span>
                  )}
                </span>
              </button>

              <div className="die-card-actions">
                <button
                  type="button"
                  className="die-card-action-btn"
                  title={`Duplicate ${displayName} (Ctrl+D)`}
                  aria-label={`Duplicate ${displayName}`}
                  onClick={() => duplicateDieInstance(dieId)}
                >
                  <Copy size={12} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="die-card-action-btn danger"
                  disabled={!canRemoveAny}
                  title={canRemoveAny ? `Remove ${displayName}` : 'At least 1 die is required'}
                  aria-label={`Remove ${displayName}`}
                  onClick={() => requestRemoveDice([dieId])}
                >
                  <Trash2 size={12} aria-hidden="true" />
                </button>
              </div>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
