import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  BoxSelect,
  Copy,
  Download,
  Layers,
  RotateCcw,
  ShieldCheck,
  Sliders,
  Sparkles,
  Trash2,
  Type,
  Upload,
} from 'lucide-react';
import { resolveDieTypography } from '../engine/generator';
import { hasDieSecondaryDimension } from '../engine/polyhedra/definitions';
import {
  BUNDLED_FONTS,
  SET_PRESETS,
  SET_TEMPLATE_LIST,
  getDieInstanceLabel,
  getDieInstanceShortTag,
  getProjectDieOrder,
  normalizeSelectedDice,
} from '../engine/presets';
import { useDiceStore } from '../store/useDiceStore';
import { StudioSlider } from './StudioSlider';
import type {
  D10Variant,
  D12Variant,
  D2Variant,
  D3Variant,
  D4Variant,
  D6Variant,
  D8Variant,
  DieSettings,
  InspectorTab,
  OddDieVariant,
  SetPresetId,
  SetTemplateId,
  SixNineIndicator,
} from '../types/dice';

function summarizeNumber(
  values: number[],
  eps = 0.005,
): { mixed: boolean; value: number; min: number; max: number } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { mixed: max - min > eps, value: values[0], min, max };
}

function summarizeNullable<T>(
  values: Array<T | null>,
  isEqual?: (a: T | null, b: T | null) => boolean,
): { mixed: boolean; value: T | null } {
  const first = values[0] ?? null;
  const eq = isEqual ?? ((a: T | null, b: T | null) => a === b);
  const mixed = values.some((v) => !eq(v ?? null, first));
  return { mixed, value: mixed ? null : first };
}

const TABS: Array<{ id: InspectorTab; label: string; icon: typeof Sliders }> = [
  { id: 'shape', label: 'Shape', icon: Sliders },
  { id: 'typography', label: 'Fonts & SVG', icon: Type },
  { id: 'blanks', label: 'Blanks', icon: Layers },
  { id: 'export', label: 'Supports', icon: ShieldCheck },
];

const PRESET_TILE_COPY: Record<SetPresetId, { title: string; sub: string }> = {
  standard: { title: 'Standard', sub: '16 mm RPG' },
  mini: { title: 'Mini Set', sub: '0.7× scale' },
  chonk: { title: 'Chonk', sub: '1.5× scale' },
};

const D4_VARIANT_CARDS: Array<{ id: D4Variant; title: string; desc: string }> = [
  { id: 'crystal', title: 'Crystal Shard', desc: 'Elongated 4-sided obelisk' },
  { id: 'arch', title: 'Arch / Barrel', desc: 'Curved rolling ends' },
  { id: 'pendulum', title: 'Pendulum Drop', desc: 'Teardrop bipyramid' },
  { id: 'truncated', title: 'Truncated Tet', desc: 'Top-read flat corners' },
  { id: 'classic_vertex', title: 'Classic Vertex', desc: '3 numbers at top tips' },
  { id: 'classic_base', title: 'Classic Base', desc: '3 numbers at base edges' },
];

export function InspectorPanel() {
  const project = useDiceStore((s) => s.project);
  const systemFonts = useDiceStore((s) => s.systemFonts);
  const activeResult = useDiceStore((s) => s.activeResult);

  const setActiveTab = useDiceStore((s) => s.setActiveTab);
  const applyPreset = useDiceStore((s) => s.applyPreset);
  const applySetTemplate = useDiceStore((s) => s.applySetTemplate);
  const duplicateDieInstance = useDiceStore((s) => s.duplicateDieInstance);
  const requestRemoveDice = useDiceStore((s) => s.requestRemoveDice);
  const inspectorFocusRequest = useDiceStore((s) => s.inspectorFocusRequest);
  const clearInspectorFocusRequest = useDiceStore((s) => s.clearInspectorFocusRequest);
  const selectDiceGroup = useDiceStore((s) => s.selectDiceGroup);
  const updateDieSettings = useDiceStore((s) => s.updateDieSettings);
  const updateDiceSettings = useDiceStore((s) => s.updateDiceSettings);
  const batchPatchDice = useDiceStore((s) => s.batchPatchDice);
  const resetDiceOverrides = useDiceStore((s) => s.resetDiceOverrides);
  const setD4Variant = useDiceStore((s) => s.setD4Variant);
  const updateFaceOverride = useDiceStore((s) => s.updateFaceOverride);
  const updateTypography = useDiceStore((s) => s.updateTypography);
  const updateBlanks = useDiceStore((s) => s.updateBlanks);
  const updateSupports = useDiceStore((s) => s.updateSupports);
  const updateExportConfig = useDiceStore((s) => s.updateExportConfig);
  const uploadFontFile = useDiceStore((s) => s.uploadFontFile);
  const uploadSvgFile = useDiceStore((s) => s.uploadSvgFile);
  const setViewportMode = useDiceStore((s) => s.setViewportMode);
  const setExportModalOpen = useDiceStore((s) => s.setExportModalOpen);
  const openExportModalWithScope = useDiceStore((s) => s.openExportModalWithScope);

  const fontUploadRef = useRef<HTMLInputElement>(null);
  const highSvgUploadRef = useRef<HTMLInputElement>(null);
  const faceSvgUploadRef = useRef<HTMLInputElement>(null);
  const groupEnableRef = useRef<HTMLInputElement>(null);
  const relBaseRef = useRef<Partial<
    Record<string, { sizeMm: number; secondarySizeMm: number }>
  > | null>(null);

  const [groupSizingMode, setGroupSizingMode] = useState<'relative' | 'uniform'>('relative');
  const [relPct, setRelPct] = useState<number>(100);
  const [selectedTemplateId, setSelectedTemplateId] = useState<SetTemplateId>('coin_twin_10');

  const dieOrder = getProjectDieOrder(project);
  const selectedDice = normalizeSelectedDice(project.selectedDice, project.activeDie, dieOrder);
  const selectedCount = selectedDice.length;
  const isGroupMode = selectedCount > 1;
  const selectedSettings = selectedDice
    .map((id) => project.dice[id])
    .filter((d): d is DieSettings => Boolean(d));
  const die = project.dice[project.activeDie] ?? project.dice[dieOrder[0]];
  const activeDieLabel = getDieInstanceLabel(die, project);
  const targetDice: string[] = isGroupMode ? selectedDice : [die.id];
  const resolvedActiveTypo = resolveDieTypography(project.typography, die);
  const selectedFaceId = project.selectedFaceId;
  const selectedFace = activeResult?.faces.find((f) => f.id === selectedFaceId) ?? null;
  const faceOverride = selectedFaceId ? die.faceOverrides[selectedFaceId] : undefined;

  const allSelectedEnabled = selectedSettings.every((d) => d.enabled);
  const someSelectedEnabled = selectedSettings.some((d) => d.enabled);
  const mixedSelectedEnabled = someSelectedEnabled && !allSelectedEnabled;

  useEffect(() => {
    if (groupEnableRef.current) {
      groupEnableRef.current.indeterminate = isGroupMode && mixedSelectedEnabled;
    }
  }, [isGroupMode, mixedSelectedEnabled]);

  useEffect(() => {
    relBaseRef.current = null;
    setRelPct(100);
  }, [selectedDice.join(',')]);

  useEffect(() => {
    if (!inspectorFocusRequest) return;
    const { target } = inspectorFocusRequest;
    clearInspectorFocusRequest();
    requestAnimationFrame(() => {
      if (target === 'die-label') {
        const el = document.getElementById('die-instance-label-input') as HTMLInputElement | null;
        el?.focus();
        el?.select();
      } else if (target === 'face-custom-text') {
        const el = document.getElementById('face-custom-text') as HTMLInputElement | null;
        el?.focus();
        el?.select();
      } else if (target === 'face-svg-upload') {
        faceSvgUploadRef.current?.click();
      } else if (target === 'die-font-override') {
        const el = document.getElementById('die-font-override-select') as HTMLSelectElement | null;
        el?.focus();
      }
    });
  }, [inspectorFocusRequest, clearInspectorFocusRequest]);

  const sizeSummary = summarizeNumber(selectedSettings.map((d) => d.sizeMm), 0.05);
  const chamferSummary = summarizeNumber(selectedSettings.map((d) => d.edgeChamferMm), 0.005);
  const fontMultSummary = summarizeNumber(
    selectedSettings.map((d) => d.fontScaleMultiplier),
    0.005,
  );
  const secDice = selectedDice.filter((id) => {
    const d = project.dice[id];
    return d ? hasDieSecondaryDimension(d) : false;
  });
  const secSummary =
    secDice.length > 0
      ? summarizeNumber(
          secDice.map((id) => project.dice[id].secondarySizeMm),
          0.05,
        )
      : null;
  const clearanceSummary = summarizeNullable(
    selectedSettings.map((d) => d.blankClearanceOverrideMm),
    (a, b) => (a === null && b === null) || (a !== null && b !== null && Math.abs(a - b) < 0.005),
  );
  const fontOvSummary = summarizeNullable(selectedSettings.map((d) => d.fontIdOverride));
  const depthOvSummary = summarizeNullable(
    selectedSettings.map((d) => d.engravingDepthOverrideMm),
    (a, b) => (a === null && b === null) || (a !== null && b !== null && Math.abs(a - b) < 0.005),
  );
  const emblemBoolSummary = summarizeNullable(
    selectedSettings.map((d) => d.useHighFaceEmblemOverride),
  );
  const emblemSvgSummary = summarizeNullable(
    selectedSettings.map((d) => d.highFaceSvgIdOverride),
  );
  const diceWithFaceOverrides = selectedSettings.filter(
    (d) => Object.keys(d.faceOverrides).length > 0,
  ).length;
  const diceWithCustomOverrides = selectedSettings.filter(
    (d) =>
      d.fontIdOverride !== null ||
      d.engravingDepthOverrideMm !== null ||
      d.useHighFaceEmblemOverride !== null ||
      d.highFaceSvgIdOverride !== null ||
      Math.abs(d.fontScaleMultiplier - 1.0) > 0.001,
  ).length;

  const startRelativeBaseline = () => {
    if (relBaseRef.current) return;
    const snap: Partial<Record<string, { sizeMm: number; secondarySizeMm: number }>> = {};
    for (const id of selectedDice) {
      const cur = project.dice[id];
      if (!cur) continue;
      snap[id] = {
        sizeMm: cur.sizeMm,
        secondarySizeMm: cur.secondarySizeMm,
      };
    }
    relBaseRef.current = snap;
  };

  const applyRelativeFactor = (pct: number) => {
    startRelativeBaseline();
    const baseMap = relBaseRef.current!;
    const factor = pct / 100;
    const patches: Partial<Record<string, Partial<DieSettings>>> = {};
    for (const id of selectedDice) {
      const base = baseMap[id];
      const cur = project.dice[id];
      if (!base || !cur) continue;
      const nextSize = Math.max(8, Math.min(45, Math.round(base.sizeMm * factor * 2) / 2));
      const p: Partial<DieSettings> = { sizeMm: nextSize };
      if (hasDieSecondaryDimension(cur)) {
        const minSec = cur.kind === 'd2' ? 2.0 : 14;
        const maxSec = cur.kind === 'd2' ? 8.0 : 50;
        const nextSec = Math.max(
          minSec,
          Math.min(maxSec, Math.round(base.secondarySizeMm * factor * 5) / 5),
        );
        p.secondarySizeMm = nextSec;
      }
      patches[id] = p;
    }
    setRelPct(pct);
    batchPatchDice(patches, `dice-group:rel-size:${selectedDice.join('+')}`);
  };

  const commitRelativeBaseline = () => {
    if (!relBaseRef.current) return;
    relBaseRef.current = null;
    setRelPct(100);
  };

  const nudgeGroupSizeMm = (deltaMm: number) => {
    const patches: Partial<Record<string, Partial<DieSettings>>> = {};
    for (const id of selectedDice) {
      const cur = project.dice[id];
      if (!cur) continue;
      const nextSize = Math.max(8, Math.min(45, Math.round((cur.sizeMm + deltaMm) * 2) / 2));
      patches[id] = { sizeMm: nextSize };
    }
    batchPatchDice(patches, null);
  };

  const scaleGroupPercentQuick = (pct: number) => {
    const factor = pct / 100;
    const patches: Partial<Record<string, Partial<DieSettings>>> = {};
    for (const id of selectedDice) {
      const cur = project.dice[id];
      if (!cur) continue;
      const nextSize = Math.max(8, Math.min(45, Math.round(cur.sizeMm * factor * 2) / 2));
      const p: Partial<DieSettings> = { sizeMm: nextSize };
      if (hasDieSecondaryDimension(cur)) {
        const minSec = cur.kind === 'd2' ? 2.0 : 14;
        const maxSec = cur.kind === 'd2' ? 8.0 : 50;
        p.secondarySizeMm = Math.max(
          minSec,
          Math.min(maxSec, Math.round(cur.secondarySizeMm * factor * 5) / 5),
        );
      }
      patches[id] = p;
    }
    batchPatchDice(patches, null);
  };

  const hasSecondaryDim = hasDieSecondaryDimension(die);

  const primaryDimLabel =
    die.kind === 'd2'
      ? die.d2Variant === 'round'
        ? 'Coin Diameter'
        : 'Coin Width'
      : (die.kind === 'd4' &&
            (die.d4Variant === 'crystal' ||
              die.d4Variant === 'arch' ||
              die.d4Variant === 'pendulum')) ||
          ((die.kind === 'd5' || die.kind === 'd7' || die.kind === 'd9') &&
            die.oddVariant !== 'trapezohedron') ||
          (die.kind === 'd6' && die.d6Variant === 'crystal') ||
          (die.kind === 'd8' && (die.d8Variant === 'crystal' || die.d8Variant === 'shard')) ||
          ((die.kind === 'd10' || die.kind === 'd00') && die.d10Variant === 'crystal') ||
          (die.kind === 'd12' && die.d12Variant === 'crystal')
        ? 'Body Width (F2F)'
        : 'Face-to-Face Size';

  const allSecD2 =
    secDice.length > 0 && secDice.every((id) => project.dice[id]?.kind === 'd2');
  const allSecPrism =
    secDice.length > 0 &&
    secDice.every((id) => {
      const d = project.dice[id];
      return (
        d &&
        (d.kind === 'd3' ||
          ((d.kind === 'd5' || d.kind === 'd7' || d.kind === 'd9') && d.oddVariant === 'prism'))
      );
    });
  const someSecD2 = secDice.some((id) => project.dice[id]?.kind === 'd2');
  const secondaryDimLabel = allSecD2
    ? 'Coin Thickness'
    : allSecPrism
      ? 'Prism Height'
      : someSecD2
        ? 'Thickness / Length'
        : 'Tip-to-Tip Length';

  const d2Ids = targetDice.filter((id) => project.dice[id]?.kind === 'd2');
  const d4Ids = targetDice.filter((id) => project.dice[id]?.kind === 'd4');
  const d3Ids = targetDice.filter((id) => project.dice[id]?.kind === 'd3');
  const oddIds = targetDice.filter((id) => {
    const k = project.dice[id]?.kind;
    return k === 'd5' || k === 'd7' || k === 'd9';
  });
  const d6Ids = targetDice.filter((id) => project.dice[id]?.kind === 'd6');
  const d8Ids = targetDice.filter((id) => project.dice[id]?.kind === 'd8');
  const d10ShapeIds = targetDice.filter((id) => {
    const k = project.dice[id]?.kind;
    return k === 'd10' || k === 'd00';
  });
  const d12Ids = targetDice.filter((id) => project.dice[id]?.kind === 'd12');
  const d10Ids = targetDice.filter((id) => project.dice[id]?.kind === 'd10');
  const d00Ids = targetDice.filter((id) => project.dice[id]?.kind === 'd00');
  const d20Ids = targetDice.filter((id) => project.dice[id]?.kind === 'd20');

  const d2Summary = summarizeNullable(d2Ids.map((id) => project.dice[id]?.d2Variant ?? null));
  const d4Summary = summarizeNullable(d4Ids.map((id) => project.dice[id]?.d4Variant ?? null));
  const d3Summary = summarizeNullable(d3Ids.map((id) => project.dice[id]?.d3Variant ?? null));
  const oddSummary = summarizeNullable(oddIds.map((id) => project.dice[id]?.oddVariant ?? null));
  const d6Summary = summarizeNullable(d6Ids.map((id) => project.dice[id]?.d6Variant ?? null));
  const d8Summary = summarizeNullable(d8Ids.map((id) => project.dice[id]?.d8Variant ?? null));
  const d10ShapeSummary = summarizeNullable(
    d10ShapeIds.map((id) => project.dice[id]?.d10Variant ?? null),
  );
  const d12Summary = summarizeNullable(d12Ids.map((id) => project.dice[id]?.d12Variant ?? null));
  const d10Summary = summarizeNullable(d10Ids.map((id) => project.dice[id]?.d10Numbering ?? null));
  const d00Summary = summarizeNullable(d00Ids.map((id) => project.dice[id]?.d00Orientation ?? null));
  const d20Summary = summarizeNullable(d20Ids.map((id) => project.dice[id]?.d20Numbering ?? null));

  const applyElongatedVariantPatch = (
    ids: string[],
    patch: Partial<DieSettings>,
    needsElongation: boolean,
    historySuffix: string,
  ) => {
    const patches: Partial<Record<string, Partial<DieSettings>>> = {};
    for (const id of ids) {
      const cur = project.dice[id];
      if (!cur) continue;
      const itemPatch: Partial<DieSettings> = { ...patch };
      if (needsElongation && cur.secondarySizeMm <= cur.sizeMm * 1.08) {
        itemPatch.secondarySizeMm = Math.round(cur.sizeMm * 1.5 * 2) / 2;
      }
      patches[id] = itemPatch;
    }
    batchPatchDice(patches, `dice:${ids.join('+')}:${historySuffix}`);
  };

  const handleTabKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = TABS.findIndex((t) => t.id === project.activeTab);
    let nextIdx = idx;
    if (e.key === 'ArrowRight') nextIdx = (idx + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = TABS.length - 1;
    else return;

    e.preventDefault();
    const nextTab = TABS[nextIdx].id;
    setActiveTab(nextTab);
    document.getElementById(`inspector-tab-${nextTab}`)?.focus();
  };

  return (
    <aside className="inspector-pane" aria-label="Die Inspector">
      <div
        className="inspector-tablist"
        role="tablist"
        aria-label="Die Configuration Tabs"
        onKeyDown={handleTabKeyDown}
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const isSelected = project.activeTab === t.id;
          return (
            <button
              key={t.id}
              id={`inspector-tab-${t.id}`}
              type="button"
              role="tab"
              className="inspector-tab"
              aria-selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => setActiveTab(t.id)}
            >
              <Icon size={13} aria-hidden="true" />
              {t.label}
            </button>
          );
        })}
      </div>

      {isGroupMode && (
        <div className="group-banner" role="region" aria-label="Active multi-die group selection">
          <div className="group-banner-top">
            <span className="group-banner-title">
              Group Editing ({selectedCount} Dice)
            </span>
            <button
              type="button"
              className="btn btn-compact"
              onClick={() => selectDiceGroup('single')}
              title="Exit group editing (Esc)"
            >
              Single (Esc)
            </button>
          </div>
          <div className="group-chip-list">
            {selectedDice.map((id) => {
              const d = project.dice[id];
              return (
                <span
                  key={id}
                  className={`group-die-pill ${id === die.id ? 'primary' : ''}`}
                >
                  {d ? getDieInstanceShortTag(d, project) : id.toUpperCase()}
                </span>
              );
            })}
          </div>
          <label className="checkbox-label">
            <input
              ref={groupEnableRef}
              id="group-include-export-checkbox"
              type="checkbox"
              checked={allSelectedEnabled}
              onChange={(e) =>
                updateDiceSettings(selectedDice, { enabled: e.target.checked })
              }
            />
            <span>
              Include selected in export
              {mixedSelectedEnabled && (
                <span className="mixed-badge" style={{ marginLeft: 6 }}>
                  Mixed
                </span>
              )}
            </span>
          </label>
          <div className="nudge-row">
            <button
              type="button"
              className="btn btn-primary btn-compact"
              onClick={() => openExportModalWithScope('selected')}
            >
              <Download size={13} aria-hidden="true" />
              Export Selected ({selectedCount})…
            </button>
            <button
              type="button"
              className="btn btn-compact"
              disabled={dieOrder.length <= 1}
              onClick={() => requestRemoveDice(selectedDice)}
              title="Remove selected dice from set (Delete)"
            >
              <Trash2 size={13} aria-hidden="true" />
              Remove
            </button>
          </div>
        </div>
      )}

      <div className="inspector-scroll">
        {/* TAB 1: SHAPE & SIZING */}
        <div
          role="tabpanel"
          aria-labelledby="inspector-tab-shape"
          hidden={project.activeTab !== 'shape'}
        >
          <div className="inspector-body">
            <section className="panel-section">
              <h2 className="section-heading">Global Set Scale</h2>
              <div className="preset-grid" role="group" aria-label="Set Sizing Presets">
                {(Object.keys(SET_PRESETS) as SetPresetId[]).map((pid) => {
                  const copy = PRESET_TILE_COPY[pid];
                  return (
                    <button
                      key={pid}
                      type="button"
                      className="choice-tile preset-tile"
                      aria-pressed={project.presetId === pid}
                      onClick={() => applyPreset(pid)}
                    >
                      <span className="choice-tile-title">{copy.title}</span>
                      <span className="choice-tile-desc">{copy.sub}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <details className="panel-section panel-accordion">
              <summary className="accordion-summary">
                <span className="accordion-title">Quick Game Set Templates</span>
                <span className="field-value">{dieOrder.length} dice</span>
              </summary>
              <div className="accordion-body">
                <div className="control-pair" style={{ gridTemplateColumns: '1fr auto' }}>
                  <select
                    id="quick-set-template-select"
                    name="quick-set-template"
                    aria-label="Quick game set template"
                    className="select-input"
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value as SetTemplateId)}
                  >
                    {SET_TEMPLATE_LIST.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.label} ({tpl.shortLabel})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-compact"
                    onClick={() => applySetTemplate(selectedTemplateId)}
                  >
                    Apply Set
                  </button>
                </div>
                <p className="field-hint">
                  {SET_TEMPLATE_LIST.find((t) => t.id === selectedTemplateId)?.description}
                </p>
              </div>
            </details>

            <section className="panel-section">
              <h2 className="section-heading">
                <span>
                  {isGroupMode
                    ? `Group Geometry (${selectedCount} dice)`
                    : `${activeDieLabel} Geometry`}
                </span>
                {sizeSummary.mixed ? (
                  <span className="mixed-badge">
                    Mixed {sizeSummary.min.toFixed(1)}–{sizeSummary.max.toFixed(1)} mm
                  </span>
                ) : (
                  <span className="section-metric-amber">
                    {sizeSummary.value.toFixed(1)} mm
                  </span>
                )}
              </h2>

              {!isGroupMode && (
                <div className="field-row">
                  <label htmlFor="die-instance-label-input" className="field-label-line">
                    <span>Die Instance Label</span>
                    <span className="field-value">{die.id}</span>
                  </label>
                  <input
                    id="die-instance-label-input"
                    type="text"
                    className="text-input"
                    placeholder="e.g. Logo, Numbers, Hope, Fear…"
                    value={die.customLabel ?? ''}
                    onChange={(e) => updateDieSettings(die.id, { customLabel: e.target.value })}
                  />
                  <div className="die-action-row">
                    <button
                      type="button"
                      className="btn btn-compact"
                      onClick={() => duplicateDieInstance(die.id)}
                      title="Duplicate active die (Ctrl+D)"
                    >
                      <Copy size={12} aria-hidden="true" />
                      Duplicate
                    </button>
                    <button
                      type="button"
                      className="btn btn-compact"
                      onClick={() =>
                        duplicateDieInstance(die.id, { asLogoNumbersPair: true })
                      }
                      title="Create twin Logo + Numbers Only pair"
                    >
                      <Sparkles size={12} aria-hidden="true" />
                      Logo + Pair
                    </button>
                    <button
                      type="button"
                      className="btn btn-compact btn-subtle-danger"
                      disabled={dieOrder.length <= 1}
                      onClick={() => requestRemoveDice([die.id])}
                      title="Remove this die from set (Delete)"
                      aria-label={`Remove ${activeDieLabel}`}
                    >
                      <Trash2 size={12} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}

              {d2Ids.length > 0 && (
                <div className="field-row">
                  <span className="field-label-line">
                    <span>D2 Coin Silhouette (6 Styles)</span>
                    {d2Summary.mixed && <span className="mixed-badge">Mixed</span>}
                  </span>
                  <div className="variant-grid">
                    {(
                      [
                        { id: 'round', title: 'Round Coin', desc: 'Classic 360° circle' },
                        { id: 'oval', title: 'Oval Coin', desc: '1.28:1 elliptical medallion' },
                        { id: 'rounded_square', title: 'Rounded Square', desc: 'Cushion squircle coin' },
                        { id: 'hexagon', title: 'Hex Medallion', desc: '6-sided flat guild token' },
                        { id: 'octagon', title: 'Octagon Coin', desc: '8-sided beveled token' },
                        { id: 'shield', title: 'Shield Crest', desc: 'Gothic heater shield' },
                      ] as Array<{ id: D2Variant; title: string; desc: string }>
                    ).map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        className="choice-tile"
                        aria-pressed={!d2Summary.mixed && d2Summary.value === v.id}
                        onClick={() => updateDiceSettings(d2Ids, { d2Variant: v.id }, 'd2Variant')}
                      >
                        <span className="choice-tile-title">{v.title}</span>
                        <span className="choice-tile-desc">{v.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {d4Ids.length > 0 && (
                <div className="field-row">
                  <span className="field-label-line">
                    <span>D4 Shape Variant (6 Styles)</span>
                    {d4Summary.mixed && <span className="mixed-badge">Mixed</span>}
                  </span>
                  <div className="variant-grid">
                    {D4_VARIANT_CARDS.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        className="choice-tile"
                        aria-pressed={!d4Summary.mixed && d4Summary.value === v.id}
                        onClick={() => setD4Variant(v.id)}
                      >
                        <span className="choice-tile-title">{v.title}</span>
                        <span className="choice-tile-desc">{v.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {d3Ids.length > 0 && (
                <div className="field-row">
                  <span className="field-label-line">
                    <span>D3 Shape Style</span>
                    {d3Summary.mixed && <span className="mixed-badge">Mixed</span>}
                  </span>
                  <div className="variant-grid">
                    {(
                      [
                        { id: 'truncated_barrel', title: 'Truncated Barrel', desc: 'Flat top-read facets' },
                        { id: 'rounded_prism', title: 'Rounded Prism', desc: 'Arched 3-face body' },
                      ] as Array<{ id: D3Variant; title: string; desc: string }>
                    ).map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        className="choice-tile"
                        aria-pressed={!d3Summary.mixed && d3Summary.value === v.id}
                        onClick={() => updateDiceSettings(d3Ids, { d3Variant: v.id }, 'd3Variant')}
                      >
                        <span className="choice-tile-title">{v.title}</span>
                        <span className="choice-tile-desc">{v.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {oddIds.length > 0 && (
                <div className="field-row">
                  <span className="field-label-line">
                    <span>Odd-Sided Shape Style</span>
                    {oddSummary.mixed && <span className="mixed-badge">Mixed</span>}
                  </span>
                  <div className="variant-grid">
                    {(
                      [
                        { id: 'trapezohedron', title: 'Trapezohedron (2×)', desc: 'Isohedral 2N-kite polyhedron' },
                        { id: 'crystal', title: 'Crystal Barrel (2×)', desc: 'Pointed 2N-facet crystal' },
                        { id: 'prism', title: 'Zocchi Prism (1×)', desc: 'Single-numbered N-face prism' },
                      ] as Array<{ id: OddDieVariant; title: string; desc: string }>
                    ).map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        className="choice-tile"
                        aria-pressed={!oddSummary.mixed && oddSummary.value === v.id}
                        onClick={() =>
                          applyElongatedVariantPatch(
                            oddIds,
                            { oddVariant: v.id },
                            v.id === 'crystal' || v.id === 'prism',
                            'oddVariant',
                          )
                        }
                      >
                        <span className="choice-tile-title">{v.title}</span>
                        <span className="choice-tile-desc">{v.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {d6Ids.length > 0 && (
                <div className="field-row">
                  <span className="field-label-line">
                    <span>D6 Shape Style</span>
                    {d6Summary.mixed && <span className="mixed-badge">Mixed</span>}
                  </span>
                  <div className="variant-grid">
                    {(
                      [
                        { id: 'cube', title: 'Standard Cube', desc: 'Classic 6-face cube' },
                        { id: 'rhombic', title: 'Rhombic Diamond', desc: '63° skewed diamond cube' },
                        { id: 'truncated', title: 'Truncated Cube', desc: 'Corner-chamfered cube' },
                        { id: 'crystal', title: 'Crystal Barrel', desc: '6-sided pointed crystal' },
                      ] as Array<{ id: D6Variant; title: string; desc: string }>
                    ).map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        className="choice-tile"
                        aria-pressed={!d6Summary.mixed && d6Summary.value === v.id}
                        onClick={() =>
                          applyElongatedVariantPatch(
                            d6Ids,
                            { d6Variant: v.id },
                            v.id === 'crystal',
                            'd6Variant',
                          )
                        }
                      >
                        <span className="choice-tile-title">{v.title}</span>
                        <span className="choice-tile-desc">{v.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {d8Ids.length > 0 && (
                <div className="field-row">
                  <span className="field-label-line">
                    <span>D8 Shape Style</span>
                    {d8Summary.mixed && <span className="mixed-badge">Mixed</span>}
                  </span>
                  <div className="variant-grid">
                    {(
                      [
                        { id: 'octahedron', title: 'Standard Octahedron', desc: 'Regular 8-triangle solid' },
                        { id: 'shard', title: 'Gem Shard', desc: 'Elongated diamond bipyramid' },
                        { id: 'crystal', title: 'Crystal Barrel', desc: '8-sided pointed crystal' },
                      ] as Array<{ id: D8Variant; title: string; desc: string }>
                    ).map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        className="choice-tile"
                        aria-pressed={!d8Summary.mixed && d8Summary.value === v.id}
                        onClick={() =>
                          applyElongatedVariantPatch(
                            d8Ids,
                            { d8Variant: v.id },
                            v.id === 'crystal' || v.id === 'shard',
                            'd8Variant',
                          )
                        }
                      >
                        <span className="choice-tile-title">{v.title}</span>
                        <span className="choice-tile-desc">{v.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {d10ShapeIds.length > 0 && (
                <div className="field-row">
                  <span className="field-label-line">
                    <span>D10 / D00 Shape Style</span>
                    {d10ShapeSummary.mixed && <span className="mixed-badge">Mixed</span>}
                  </span>
                  <div className="variant-grid">
                    {(
                      [
                        { id: 'trapezohedron', title: 'Standard Kite', desc: 'Pentagonal trapezohedron' },
                        { id: 'crystal', title: 'Crystal Barrel', desc: '10-sided pointed crystal' },
                      ] as Array<{ id: D10Variant; title: string; desc: string }>
                    ).map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        className="choice-tile"
                        aria-pressed={!d10ShapeSummary.mixed && d10ShapeSummary.value === v.id}
                        onClick={() =>
                          applyElongatedVariantPatch(
                            d10ShapeIds,
                            { d10Variant: v.id },
                            v.id === 'crystal',
                            'd10Variant',
                          )
                        }
                      >
                        <span className="choice-tile-title">{v.title}</span>
                        <span className="choice-tile-desc">{v.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {d12Ids.length > 0 && (
                <div className="field-row">
                  <span className="field-label-line">
                    <span>D12 Shape Style</span>
                    {d12Summary.mixed && <span className="mixed-badge">Mixed</span>}
                  </span>
                  <div className="variant-grid">
                    {(
                      [
                        { id: 'pentagonal', title: 'Pentagonal D12', desc: 'Regular dodecahedron' },
                        { id: 'rhombic', title: 'Rhombic D12', desc: 'Catalan diamond dodecahedron' },
                        { id: 'crystal', title: 'Crystal Barrel', desc: '12-sided pointed crystal' },
                      ] as Array<{ id: D12Variant; title: string; desc: string }>
                    ).map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        className="choice-tile"
                        aria-pressed={!d12Summary.mixed && d12Summary.value === v.id}
                        onClick={() =>
                          applyElongatedVariantPatch(
                            d12Ids,
                            { d12Variant: v.id },
                            v.id === 'crystal',
                            'd12Variant',
                          )
                        }
                      >
                        <span className="choice-tile-title">{v.title}</span>
                        <span className="choice-tile-desc">{v.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {d10Ids.length > 0 && (
                <div className="field-row">
                  <label htmlFor="d10-numbering-select" className="field-label-line">
                    <span>D10 Numbering Range</span>
                    {d10Summary.mixed && <span className="mixed-badge">Mixed</span>}
                  </label>
                  <select
                    id="d10-numbering-select"
                    name="d10-numbering"
                    className="select-input"
                    value={d10Summary.mixed ? '__mixed__' : (d10Summary.value ?? '0_9')}
                    onChange={(e) => {
                      if (e.target.value === '__mixed__') return;
                      updateDiceSettings(
                        d10Ids,
                        { d10Numbering: e.target.value as '0_9' | '1_10' },
                        'd10Numbering',
                      );
                    }}
                  >
                    {d10Summary.mixed && (
                      <option value="__mixed__" disabled>
                        Mixed numbering ranges…
                      </option>
                    )}
                    <option value="0_9">Standard RPG (0 – 9)</option>
                    <option value="1_10">Sequential (1 – 10)</option>
                  </select>
                </div>
              )}

              {d00Ids.length > 0 && (
                <div className="field-row">
                  <label htmlFor="d00-orient-select" className="field-label-line">
                    <span>Percentile Orientation</span>
                    {d00Summary.mixed && <span className="mixed-badge">Mixed</span>}
                  </label>
                  <select
                    id="d00-orient-select"
                    name="d00-orientation"
                    className="select-input"
                    value={d00Summary.mixed ? '__mixed__' : (d00Summary.value ?? 'horizontal')}
                    onChange={(e) => {
                      if (e.target.value === '__mixed__') return;
                      updateDiceSettings(
                        d00Ids,
                        { d00Orientation: e.target.value as 'horizontal' | 'vertical' },
                        'd00Orientation',
                      );
                    }}
                  >
                    {d00Summary.mixed && (
                      <option value="__mixed__" disabled>
                        Mixed orientations…
                      </option>
                    )}
                    <option value="horizontal">Horizontal (Across Wide Kite)</option>
                    <option value="vertical">Vertical (Along Kite Axis)</option>
                  </select>
                </div>
              )}

              {d20Ids.length > 0 && (
                <div className="field-row">
                  <label htmlFor="d20-layout-select" className="field-label-line">
                    <span>D20 Face Layout</span>
                    {d20Summary.mixed && <span className="mixed-badge">Mixed</span>}
                  </label>
                  <select
                    id="d20-layout-select"
                    name="d20-layout"
                    className="select-input"
                    value={d20Summary.mixed ? '__mixed__' : (d20Summary.value ?? 'balanced')}
                    onChange={(e) => {
                      if (e.target.value === '__mixed__') return;
                      updateDiceSettings(
                        d20Ids,
                        { d20Numbering: e.target.value as 'balanced' | 'spindown' },
                        'd20Numbering',
                      );
                    }}
                  >
                    {d20Summary.mixed && (
                      <option value="__mixed__" disabled>
                        Mixed face layouts…
                      </option>
                    )}
                    <option value="balanced">Balanced RPG (Opposite Sum = 21)</option>
                    <option value="spindown">Spindown Counter (Sequential Path)</option>
                  </select>
                </div>
              )}

              {isGroupMode && (
                <div className="field-row">
                  <div className="field-label-line">
                    <span>Group Sizing Mode</span>
                  </div>
                  <div className="theme-segment" role="group" aria-label="Group sizing mode">
                    <button
                      type="button"
                      className="btn btn-compact"
                      aria-pressed={groupSizingMode === 'relative'}
                      onClick={() => setGroupSizingMode('relative')}
                    >
                      Relative Scale (%)
                    </button>
                    <button
                      type="button"
                      className="btn btn-compact"
                      aria-pressed={groupSizingMode === 'uniform'}
                      onClick={() => setGroupSizingMode('uniform')}
                    >
                      Exact Uniform (mm)
                    </button>
                  </div>
                </div>
              )}

              {isGroupMode && groupSizingMode === 'relative' ? (
                <div className="field-row">
                  <label htmlFor="group-rel-scale-range" className="field-label-line">
                    <span>Proportional Scale</span>
                    <span className="field-value">
                      {relPct}% ·{' '}
                      {sizeSummary.mixed
                        ? `${sizeSummary.min.toFixed(1)}–${sizeSummary.max.toFixed(1)} mm`
                        : `${sizeSummary.value.toFixed(1)} mm`}
                    </span>
                  </label>
                  <StudioSlider
                    id="group-rel-scale-range"
                    min={50}
                    max={150}
                    step={1}
                    value={relPct}
                    numberAriaLabel="Relative group scale percentage"
                    ariaValueText={`${relPct}%`}
                    onPointerDown={startRelativeBaseline}
                    onChange={applyRelativeFactor}
                    onPointerUp={commitRelativeBaseline}
                    onPointerCancel={commitRelativeBaseline}
                    onBlur={commitRelativeBaseline}
                    onNumberFocus={startRelativeBaseline}
                    onNumberBlur={commitRelativeBaseline}
                    onNumberChange={(raw) => {
                      const v = Math.max(50, Math.min(150, Number(raw) || 100));
                      applyRelativeFactor(v);
                    }}
                  />
                  <div className="nudge-row" role="group" aria-label="Quick size nudges">
                    <button
                      type="button"
                      className="btn btn-compact"
                      onClick={() => nudgeGroupSizeMm(-1)}
                    >
                      -1 mm
                    </button>
                    <button
                      type="button"
                      className="btn btn-compact"
                      onClick={() => nudgeGroupSizeMm(-0.5)}
                    >
                      -0.5 mm
                    </button>
                    <button
                      type="button"
                      className="btn btn-compact"
                      onClick={() => nudgeGroupSizeMm(0.5)}
                    >
                      +0.5 mm
                    </button>
                    <button
                      type="button"
                      className="btn btn-compact"
                      onClick={() => nudgeGroupSizeMm(1)}
                    >
                      +1 mm
                    </button>
                    <button
                      type="button"
                      className="btn btn-compact"
                      onClick={() => scaleGroupPercentQuick(90)}
                    >
                      90%
                    </button>
                    <button
                      type="button"
                      className="btn btn-compact"
                      onClick={() => scaleGroupPercentQuick(110)}
                    >
                      110%
                    </button>
                  </div>
                </div>
              ) : (
                <div className="field-row">
                  <label htmlFor="die-size-range" className="field-label-line">
                    <span>{isGroupMode ? 'Uniform Size (All Selected)' : primaryDimLabel}</span>
                    {isGroupMode && sizeSummary.mixed ? (
                      <span className="mixed-badge">
                        Mixed ({sizeSummary.min.toFixed(1)}–{sizeSummary.max.toFixed(1)} mm)
                      </span>
                    ) : (
                      <span className="field-value">{sizeSummary.value.toFixed(1)} mm</span>
                    )}
                  </label>
                  <StudioSlider
                    id="die-size-range"
                    min={8}
                    max={45}
                    step={0.5}
                    value={sizeSummary.value}
                    numberValue={sizeSummary.mixed ? '' : sizeSummary.value}
                    placeholder={sizeSummary.mixed ? 'Mix' : undefined}
                    numberAriaLabel={`${isGroupMode ? 'Uniform size' : primaryDimLabel} in millimeters`}
                    ariaValueText={`${sizeSummary.value.toFixed(1)} mm`}
                    onChange={(val) => updateDiceSettings(targetDice, { sizeMm: val })}
                    onNumberChange={(raw) =>
                      updateDiceSettings(targetDice, {
                        sizeMm: Math.max(8, Math.min(45, Number(raw) || 8)),
                      })
                    }
                  />
                </div>
              )}

              {(isGroupMode ? secDice.length > 0 && secSummary !== null : hasSecondaryDim) && (
                <div className="field-row">
                  <label htmlFor="die-sec-range" className="field-label-line">
                    <span>
                      {isGroupMode
                        ? `${secondaryDimLabel} (${secDice
                            .map((id) =>
                              project.dice[id]
                                ? getDieInstanceShortTag(project.dice[id], project)
                                : id.toUpperCase(),
                            )
                            .join(', ')})`
                        : secondaryDimLabel}
                    </span>
                    {isGroupMode && secSummary?.mixed ? (
                      <span className="mixed-badge">
                        Mixed ({secSummary.min.toFixed(1)}–{secSummary.max.toFixed(1)} mm)
                      </span>
                    ) : (
                      <span className="field-value">
                        {(secSummary?.value ?? die.secondarySizeMm).toFixed(1)} mm
                      </span>
                    )}
                  </label>
                  <StudioSlider
                    id="die-sec-range"
                    min={(secDice.length > 0 ? allSecD2 : die.kind === 'd2') ? 2.0 : 14}
                    max={(secDice.length > 0 ? allSecD2 : die.kind === 'd2') ? 8.0 : 50}
                    step={0.2}
                    value={secSummary?.value ?? die.secondarySizeMm}
                    numberValue={secSummary?.mixed ? '' : (secSummary?.value ?? die.secondarySizeMm)}
                    placeholder={secSummary?.mixed ? 'Mix' : undefined}
                    numberAriaLabel={`${secondaryDimLabel} in millimeters`}
                    ariaValueText={`${(secSummary?.value ?? die.secondarySizeMm).toFixed(1)} mm`}
                    onChange={(val) =>
                      updateDiceSettings(
                        secDice.length > 0 ? secDice : [die.id],
                        { secondarySizeMm: val },
                        'secondarySizeMm',
                      )
                    }
                    onNumberChange={(raw) =>
                      updateDiceSettings(
                        secDice.length > 0 ? secDice : [die.id],
                        { secondarySizeMm: Number(raw) || 3.6 },
                        'secondarySizeMm',
                      )
                    }
                  />
                </div>
              )}

              <div className="field-row">
                <label htmlFor="edge-chamfer-range" className="field-label-line">
                  <span>Edge Chamfer / Bevel</span>
                  {chamferSummary.mixed ? (
                    <span className="mixed-badge">
                      Mixed ({chamferSummary.min.toFixed(2)}–{chamferSummary.max.toFixed(2)} mm)
                    </span>
                  ) : (
                    <span className="field-value">
                      {chamferSummary.value <= 0.005
                        ? '0.00 mm (Hard Edge)'
                        : `${chamferSummary.value.toFixed(2)} mm`}
                    </span>
                  )}
                </label>
                <StudioSlider
                  id="edge-chamfer-range"
                  min={0}
                  max={1.0}
                  step={0.05}
                  value={chamferSummary.value}
                  numberValue={chamferSummary.mixed ? '' : chamferSummary.value}
                  placeholder={chamferSummary.mixed ? 'Mix' : undefined}
                  numberAriaLabel="Edge chamfer in millimeters"
                  ariaValueText={
                    chamferSummary.value <= 0.005
                      ? '0.00 mm hard edge'
                      : `${chamferSummary.value.toFixed(2)} mm`
                  }
                  onChange={(val) => updateDiceSettings(targetDice, { edgeChamferMm: val })}
                  onNumberChange={(raw) => {
                    const v = Number(raw);
                    updateDiceSettings(targetDice, {
                      edgeChamferMm: Number.isNaN(v) ? 0 : Math.max(0, Math.min(1.0, v)),
                    });
                  }}
                />
              </div>
            </section>
          </div>
        </div>

        {/* TAB 2: TYPOGRAPHY & LOGOS */}
        <div
          role="tabpanel"
          aria-labelledby="inspector-tab-typography"
          hidden={project.activeTab !== 'typography'}
        >
          <div className="inspector-body">
            <section className="panel-section">
              <h2 className="section-heading">Font &amp; Engraving Geometry</h2>

              <div className="field-row">
                <label htmlFor="font-family-select" className="field-label-line">
                  Active Die Font
                </label>
                <select
                  id="font-family-select"
                  name="active-font"
                  className="select-input"
                  value={project.typography.activeFontId}
                  onChange={(e) => updateTypography({ activeFontId: e.target.value })}
                >
                  <optgroup label="Bundled RPG Fonts (SIL OFL Free)">
                    {BUNDLED_FONTS.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </optgroup>
                  {project.uploadedFonts.length > 0 && (
                    <optgroup label="Uploaded Custom Fonts">
                      {project.uploadedFonts.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {systemFonts.length > 0 && (
                    <optgroup label={`Installed OS Fonts (${systemFonts.length})`}>
                      {systemFonts.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>

                <input
                  ref={fontUploadRef}
                  type="file"
                  accept=".ttf,.otf"
                  className="visually-hidden"
                  aria-label="Upload custom .ttf or .otf font"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadFontFile(file);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  className="btn"
                  onClick={() => fontUploadRef.current?.click()}
                >
                  <Upload size={13} aria-hidden="true" />
                  Load Custom .TTF / .OTF Font
                </button>
              </div>

              <div className="field-row">
                <label htmlFor="font-scale-range" className="field-label-line">
                  <span>Global Font Scale</span>
                  <span className="field-value">{project.typography.fontScalePct}%</span>
                </label>
                <StudioSlider
                  id="font-scale-range"
                  min={30}
                  max={90}
                  step={1}
                  value={project.typography.fontScalePct}
                  numberAriaLabel="Global font scale percentage"
                  ariaValueText={`${project.typography.fontScalePct}%`}
                  onChange={(val) => updateTypography({ fontScalePct: val })}
                  onNumberChange={(raw) =>
                    updateTypography({
                      fontScalePct: Math.max(30, Math.min(90, Number(raw) || 58)),
                    })
                  }
                />
              </div>

              <div className="field-row">
                <label htmlFor="die-font-mult" className="field-label-line">
                  <span>
                    {isGroupMode
                      ? `Group Font Multiplier (${selectedCount} dice)`
                      : `${activeDieLabel} Font Multiplier`}
                  </span>
                  {fontMultSummary.mixed ? (
                    <span className="mixed-badge">
                      Mixed ({fontMultSummary.min.toFixed(2)}–{fontMultSummary.max.toFixed(2)}×)
                    </span>
                  ) : (
                    <span className="field-value">{fontMultSummary.value.toFixed(2)}×</span>
                  )}
                </label>
                <StudioSlider
                  id="die-font-mult"
                  min={0.5}
                  max={1.5}
                  step={0.05}
                  value={fontMultSummary.value}
                  numberValue={fontMultSummary.mixed ? '' : fontMultSummary.value}
                  placeholder={fontMultSummary.mixed ? 'Mix' : undefined}
                  numberAriaLabel="Per-die font multiplier"
                  ariaValueText={`${fontMultSummary.value.toFixed(2)}×`}
                  onChange={(val) => updateDiceSettings(targetDice, { fontScaleMultiplier: val })}
                  onNumberChange={(raw) =>
                    updateDiceSettings(targetDice, {
                      fontScaleMultiplier: Number(raw) || 1.0,
                    })
                  }
                />
              </div>

              <div className="field-row">
                <label htmlFor="engrave-depth-range" className="field-label-line">
                  <span>Engraving Depth</span>
                  <span className="field-value">
                    {project.typography.engravingDepthMm.toFixed(2)} mm
                  </span>
                </label>
                <StudioSlider
                  id="engrave-depth-range"
                  min={0.3}
                  max={1.4}
                  step={0.05}
                  value={project.typography.engravingDepthMm}
                  numberAriaLabel="Engraving depth in mm"
                  ariaValueText={`${project.typography.engravingDepthMm.toFixed(2)} mm`}
                  onChange={(val) => updateTypography({ engravingDepthMm: val })}
                  onNumberChange={(raw) =>
                    updateTypography({
                      engravingDepthMm: Math.max(0.3, Math.min(1.4, Number(raw) || 0.75)),
                    })
                  }
                />
              </div>

              <div className="field-row">
                <label htmlFor="draft-angle-range" className="field-label-line">
                  <span>Anti-Tear Draft Angle</span>
                  <span className="field-value">{project.typography.draftAngleDeg}°</span>
                </label>
                <StudioSlider
                  id="draft-angle-range"
                  min={0}
                  max={25}
                  step={1}
                  value={project.typography.draftAngleDeg}
                  numberAriaLabel="Anti-tear draft angle in degrees"
                  ariaValueText={`${project.typography.draftAngleDeg} degrees`}
                  onChange={(val) => updateTypography({ draftAngleDeg: val })}
                  onNumberChange={(raw) =>
                    updateTypography({
                      draftAngleDeg: Math.max(0, Math.min(25, Number(raw) || 0)),
                    })
                  }
                />
                <div className="draft-diagram">
                  <svg width="46" height="24" viewBox="0 0 46 24" aria-hidden="true">
                    <path
                      d="M2,4 L12,4 L16,20 L30,20 L34,4 L44,4"
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="2.2"
                    />
                  </svg>
                  <span>
                    Tapers number walls outward ({project.typography.draftAngleDeg}°) so silicone
                    islands inside 0, 4, 6, 8, 9 release cleanly.
                  </span>
                </div>
              </div>

              <div className="field-row">
                <label htmlFor="six-nine-select" className="field-label-line">
                  6 &amp; 9 Orientation Indicator
                </label>
                <select
                  id="six-nine-select"
                  name="six-nine-indicator"
                  className="select-input"
                  value={project.typography.sixNineIndicator}
                  onChange={(e) =>
                    updateTypography({
                      sixNineIndicator: e.target.value as SixNineIndicator,
                    })
                  }
                >
                  <option value="dot">Bottom Right Dot (6. / 9.)</option>
                  <option value="bar">Underline Bar (6_ / 9_)</option>
                  <option value="none">None</option>
                </select>
              </div>

              <div className="field-row">
                <label htmlFor="tracking-range" className="field-label-line">
                  <span>Two-Digit Kerning</span>
                  <span className="field-value">
                    {project.typography.twoDigitTrackingEm.toFixed(2)} em
                  </span>
                </label>
                <StudioSlider
                  id="tracking-range"
                  min={-0.16}
                  max={0.12}
                  step={0.01}
                  value={project.typography.twoDigitTrackingEm}
                  numberAriaLabel="Two-digit kerning in em"
                  ariaValueText={`${project.typography.twoDigitTrackingEm.toFixed(2)} em`}
                  onChange={(val) => updateTypography({ twoDigitTrackingEm: val })}
                />
              </div>
            </section>

            <section className="panel-section">
              <h2 className="section-heading">High-Face SVG Emblem</h2>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={project.typography.useHighFaceEmblem}
                  onChange={(e) =>
                    updateTypography({ useHighFaceEmblem: e.target.checked })
                  }
                />
                <span>Use SVG emblem on high face (20, 6, 2…)</span>
              </label>

              {project.typography.useHighFaceEmblem && (
                <div className="field-row">
                  <label htmlFor="high-svg-select" className="field-label-line">
                    Selected High-Face Graphic
                  </label>
                  <select
                    id="high-svg-select"
                    name="high-face-svg"
                    className="select-input"
                    value={project.typography.highFaceSvgId}
                    onChange={(e) => updateTypography({ highFaceSvgId: e.target.value })}
                  >
                    {project.svgAssets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <input
                ref={highSvgUploadRef}
                type="file"
                accept=".svg"
                className="visually-hidden"
                aria-label="Import SVG file"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const id = await uploadSvgFile(file);
                    updateTypography({ highFaceSvgId: id, useHighFaceEmblem: true });
                  }
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                className="btn"
                onClick={() => highSvgUploadRef.current?.click()}
              >
                <Upload size={13} aria-hidden="true" />
                Upload Custom .SVG Logo
              </button>
            </section>

            <section className="panel-section">
              <h2 className="section-heading">
                <span>
                  {isGroupMode
                    ? `Group Overrides (${selectedCount} dice)`
                    : `${activeDieLabel} Overrides`}
                </span>
                {diceWithCustomOverrides > 0 && (
                  <span className="mixed-badge">
                    {isGroupMode ? `${diceWithCustomOverrides} Custom` : 'Custom'}
                  </span>
                )}
              </h2>

              <div className="field-row">
                <label htmlFor="die-font-override-select" className="field-label-line">
                  <span>Font Override</span>
                  <span className="field-value">
                    {fontOvSummary.mixed
                      ? 'Mixed'
                      : fontOvSummary.value === null
                        ? 'Global Default'
                        : 'Overridden'}
                  </span>
                </label>
                <select
                  id="die-font-override-select"
                  name="die-font-override"
                  className="select-input"
                  value={fontOvSummary.mixed ? '__mixed__' : (fontOvSummary.value ?? '')}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '__mixed__') return;
                    updateDiceSettings(
                      targetDice,
                      { fontIdOverride: val === '' ? null : val },
                      'fontIdOverride',
                    );
                  }}
                >
                  {fontOvSummary.mixed && (
                    <option value="__mixed__" disabled>
                      Mixed font overrides across selection…
                    </option>
                  )}
                  <option value="">Inherit Global Font</option>
                  <optgroup label="Bundled RPG Fonts (SIL OFL Free)">
                    {BUNDLED_FONTS.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </optgroup>
                  {project.uploadedFonts.length > 0 && (
                    <optgroup label="Uploaded Custom Fonts">
                      {project.uploadedFonts.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {systemFonts.length > 0 && (
                    <optgroup label={`Installed OS Fonts (${systemFonts.length})`}>
                      {systemFonts.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              <div className="field-row">
                <label htmlFor="die-depth-override-range" className="field-label-line">
                  <span>Engraving Depth Override</span>
                  {depthOvSummary.mixed ? (
                    <span className="mixed-badge">Mixed</span>
                  ) : (
                    <span className="field-value">
                      {depthOvSummary.value === null
                        ? `Global (${project.typography.engravingDepthMm.toFixed(2)} mm)`
                        : `${depthOvSummary.value.toFixed(2)} mm`}
                    </span>
                  )}
                </label>
                <StudioSlider
                  id="die-depth-override-range"
                  min={0.3}
                  max={1.4}
                  step={0.05}
                  value={depthOvSummary.value ?? project.typography.engravingDepthMm}
                  numberValue={depthOvSummary.mixed ? '' : (depthOvSummary.value ?? '')}
                  placeholder={depthOvSummary.mixed ? 'Mix' : 'Auto'}
                  numberAriaLabel="Engraving depth override in mm"
                  ariaValueText={`${(depthOvSummary.value ?? project.typography.engravingDepthMm).toFixed(2)} mm`}
                  onChange={(val) =>
                    updateDiceSettings(
                      targetDice,
                      { engravingDepthOverrideMm: val },
                      'engravingDepthOverrideMm',
                    )
                  }
                  onNumberChange={(raw) =>
                    updateDiceSettings(
                      targetDice,
                      {
                        engravingDepthOverrideMm:
                          raw === ''
                            ? null
                            : Math.max(0.3, Math.min(1.4, Number(raw) || 0.75)),
                      },
                      'engravingDepthOverrideMm',
                    )
                  }
                />
                <button
                  type="button"
                  className="btn btn-compact"
                  onClick={() =>
                    updateDiceSettings(
                      targetDice,
                      { engravingDepthOverrideMm: null },
                      'engravingDepthOverrideMm',
                    )
                  }
                >
                  Use Global Depth ({project.typography.engravingDepthMm.toFixed(2)} mm)
                </button>
              </div>

              <div className="field-row">
                <label htmlFor="die-emblem-override-select" className="field-label-line">
                  <span>High-Face Emblem Override</span>
                  <span className="field-value">
                    {emblemBoolSummary.mixed
                      ? 'Mixed'
                      : emblemBoolSummary.value === null
                        ? 'Global'
                        : emblemBoolSummary.value
                          ? 'On'
                          : 'Off'}
                  </span>
                </label>
                <select
                  id="die-emblem-override-select"
                  name="die-emblem-override"
                  className="select-input"
                  value={
                    emblemBoolSummary.mixed
                      ? '__mixed__'
                      : emblemBoolSummary.value === null
                        ? 'inherit'
                        : emblemBoolSummary.value
                          ? 'on'
                          : 'off'
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '__mixed__') return;
                    if (v === 'inherit') {
                      updateDiceSettings(
                        targetDice,
                        { useHighFaceEmblemOverride: null, highFaceSvgIdOverride: null },
                        'emblemOverride',
                      );
                    } else {
                      updateDiceSettings(
                        targetDice,
                        { useHighFaceEmblemOverride: v === 'on' },
                        'emblemOverride',
                      );
                    }
                  }}
                >
                  {emblemBoolSummary.mixed && (
                    <option value="__mixed__" disabled>
                      Mixed emblem overrides…
                    </option>
                  )}
                  <option value="inherit">
                    Inherit Global ({project.typography.useHighFaceEmblem ? 'Enabled' : 'Disabled'})
                  </option>
                  <option value="on">Enable Emblem on High Face</option>
                  <option value="off">Disable Emblem (Numbers Only)</option>
                </select>
              </div>

              {selectedDice.some(
                (id) =>
                  project.dice[id]?.useHighFaceEmblemOverride ??
                  project.typography.useHighFaceEmblem,
              ) && (
                <div className="field-row">
                  <label htmlFor="die-emblem-svg-select" className="field-label-line">
                    <span>High-Face Graphic Override</span>
                  </label>
                  <select
                    id="die-emblem-svg-select"
                    name="die-emblem-svg-override"
                    className="select-input"
                    value={emblemSvgSummary.mixed ? '__mixed__' : (emblemSvgSummary.value ?? '')}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '__mixed__') return;
                      updateDiceSettings(
                        targetDice,
                        {
                          highFaceSvgIdOverride: v === '' ? null : v,
                          ...(v !== '' ? { useHighFaceEmblemOverride: true } : {}),
                        },
                        'highFaceSvgOverride',
                      );
                    }}
                  >
                    {emblemSvgSummary.mixed && (
                      <option value="__mixed__" disabled>
                        Mixed SVG graphics…
                      </option>
                    )}
                    <option value="">Inherit Global Graphic</option>
                    {project.svgAssets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="nudge-row">
                <button
                  type="button"
                  className="btn btn-compact"
                  onClick={() => resetDiceOverrides(targetDice, 'typography')}
                >
                  <RotateCcw size={12} aria-hidden="true" />
                  Reset Font &amp; Depth Overrides
                </button>
                <button
                  type="button"
                  className="btn btn-compact"
                  aria-disabled={diceWithFaceOverrides === 0 ? 'true' : undefined}
                  onClick={() => {
                    if (diceWithFaceOverrides === 0) return;
                    resetDiceOverrides(targetDice, 'faces');
                  }}
                >
                  Clear Face Overrides ({diceWithFaceOverrides})
                </button>
              </div>
            </section>

            <section className="panel-section">
              <h2 className="section-heading">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <BoxSelect size={13} aria-hidden="true" />
                  Per-Face Override
                </span>
                <span className="section-metric-amber">
                  {isGroupMode
                    ? 'Single-die only'
                    : selectedFace
                      ? `Face ${selectedFace.label}`
                      : 'Click a face'}
                </span>
              </h2>

              {selectedFace && selectedFaceId ? (
                <>
                  <div className="field-row">
                    <label htmlFor="face-custom-text" className="field-label-line">
                      Custom Face Text
                    </label>
                    <input
                      id="face-custom-text"
                      type="text"
                      className="text-input"
                      value={faceOverride?.customText ?? selectedFace.label}
                      onChange={(e) =>
                        updateFaceOverride(die.id, selectedFaceId, {
                          customText: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="field-row">
                    <label htmlFor="face-svg-select" className="field-label-line">
                      Custom SVG Logo (This Face Only)
                    </label>
                    <select
                      id="face-svg-select"
                      name="face-svg"
                      className="select-input"
                      value={faceOverride?.svgId ?? ''}
                      onChange={(e) =>
                        updateFaceOverride(die.id, selectedFaceId, {
                          svgId: e.target.value ? e.target.value : null,
                        })
                      }
                    >
                      <option value="">Use Numeral / Global High-Face</option>
                      {project.svgAssets.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>

                    <input
                      ref={faceSvgUploadRef}
                      type="file"
                      accept=".svg"
                      className="visually-hidden"
                      aria-label="Upload SVG for selected face"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const id = await uploadSvgFile(file);
                          updateFaceOverride(die.id, selectedFaceId, { svgId: id });
                        }
                        e.target.value = '';
                      }}
                    />
                    <button
                      type="button"
                      className="btn"
                      onClick={() => faceSvgUploadRef.current?.click()}
                    >
                      <Upload size={13} aria-hidden="true" />
                      Upload SVG for Face {selectedFace.label}
                    </button>
                  </div>

                  <div className="field-row">
                    <label htmlFor="face-scale-range" className="field-label-line">
                      <span>Face Scale</span>
                      <span className="field-value">
                        {(faceOverride?.scaleMultiplier ?? 1).toFixed(2)}×
                      </span>
                    </label>
                    <StudioSlider
                      id="face-scale-range"
                      min={0.4}
                      max={1.8}
                      step={0.05}
                      value={faceOverride?.scaleMultiplier ?? 1}
                      numberAriaLabel="Face scale multiplier"
                      ariaValueText={`${(faceOverride?.scaleMultiplier ?? 1).toFixed(2)}×`}
                      onChange={(val) =>
                        updateFaceOverride(die.id, selectedFaceId, { scaleMultiplier: val })
                      }
                    />
                  </div>

                  <div className="field-row">
                    <label htmlFor="face-rot-range" className="field-label-line">
                      <span>Face Rotation</span>
                      <span className="field-value">
                        {faceOverride?.rotationDeg ?? 0}°
                      </span>
                    </label>
                    <StudioSlider
                      id="face-rot-range"
                      min={-180}
                      max={180}
                      step={5}
                      value={faceOverride?.rotationDeg ?? 0}
                      numberAriaLabel="Face rotation in degrees"
                      ariaValueText={`${faceOverride?.rotationDeg ?? 0} degrees`}
                      onChange={(val) =>
                        updateFaceOverride(die.id, selectedFaceId, { rotationDeg: val })
                      }
                    />
                  </div>

                  <div className="variant-grid">
                    <div className="field-row">
                      <label htmlFor="face-offx" className="field-label-line">
                        Offset X (mm)
                      </label>
                      <input
                        id="face-offx"
                        type="number"
                        className="num-input"
                        step={0.1}
                        min={-6}
                        max={6}
                        value={faceOverride?.offsetXMm ?? 0}
                        onChange={(e) =>
                          updateFaceOverride(die.id, selectedFaceId, {
                            offsetXMm: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </div>
                    <div className="field-row">
                      <label htmlFor="face-offy" className="field-label-line">
                        Offset Y (mm)
                      </label>
                      <input
                        id="face-offy"
                        type="number"
                        className="num-input"
                        step={0.1}
                        min={-6}
                        max={6}
                        value={faceOverride?.offsetYMm ?? 0}
                        onChange={(e) =>
                          updateFaceOverride(die.id, selectedFaceId, {
                            offsetYMm: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn"
                    onClick={() => updateFaceOverride(die.id, selectedFaceId, null)}
                  >
                    Reset Face {selectedFace.label} Override
                  </button>
                </>
              ) : (
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '12px' }}>
                  Click or right-click any face in the 3D viewport (or use the top-left{' '}
                  <strong>Faces</strong> bar) to swap text, upload a custom SVG logo, or adjust
                  X/Y/rotation on a specific face.
                </p>
              )}
            </section>
          </div>
        </div>

        {/* TAB 3: MATCHED INSERT BLANKS */}
        <div
          role="tabpanel"
          aria-labelledby="inspector-tab-blanks"
          hidden={project.activeTab !== 'blanks'}
        >
          <div className="inspector-body">
            <section className="panel-section">
              <h2 className="section-heading">Matched Insert Blanks</h2>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={project.blanks.includeBlanksOnExport}
                  onChange={(e) =>
                    updateBlanks({ includeBlanksOnExport: e.target.checked })
                  }
                />
                <span>Include matched blank STLs/3MFs on export</span>
              </label>

              <div className="formula-card">
                <p className="formula-desc">
                  Exact per-plane normal inset keeps shell thickness uniform on asymmetric dice
                  (Coins, Prisms, Crystal &amp; Arch D4s):
                </p>
                <code className="formula-eq">
                  Blank = Master − 2 × ({resolvedActiveTypo.engravingDepthMm.toFixed(2)} +{' '}
                  {(die.blankClearanceOverrideMm ?? project.blanks.clearanceMm).toFixed(2)}) mm
                </code>
              </div>

              <div className="field-row">
                <label htmlFor="blank-clearance-range" className="field-label-line">
                  <span>Global Resin Clearance (Per Side)</span>
                  <span className="field-value">{project.blanks.clearanceMm.toFixed(2)} mm</span>
                </label>
                <StudioSlider
                  id="blank-clearance-range"
                  min={0}
                  max={0.4}
                  step={0.01}
                  numberMin={-0.5}
                  numberMax={0.6}
                  value={project.blanks.clearanceMm}
                  numberAriaLabel="Global blank clearance in mm"
                  ariaValueText={`${project.blanks.clearanceMm.toFixed(2)} mm`}
                  onChange={(val) => updateBlanks({ clearanceMm: val })}
                  onNumberChange={(raw) =>
                    updateBlanks({
                      clearanceMm: Math.max(-0.5, Math.min(0.6, Number(raw) || 0)),
                    })
                  }
                />
              </div>

              <div className="field-row">
                <label htmlFor="die-blank-override" className="field-label-line">
                  <span>
                    {isGroupMode
                      ? `Group Clearance Override (${selectedCount} dice)`
                      : `${activeDieLabel} Clearance Override`}
                  </span>
                  {clearanceSummary.mixed ? (
                    <span className="mixed-badge">Mixed</span>
                  ) : (
                    <span className="field-value">
                      {clearanceSummary.value === null
                        ? 'Auto'
                        : `${clearanceSummary.value.toFixed(2)} mm`}
                    </span>
                  )}
                </label>
                <div className="variant-grid">
                  <input
                    id="die-blank-override"
                    type="number"
                    className="num-input"
                    placeholder={clearanceSummary.mixed ? 'Mixed' : 'Auto'}
                    step={0.01}
                    min={-0.2}
                    max={0.8}
                    value={clearanceSummary.mixed ? '' : (clearanceSummary.value ?? '')}
                    onChange={(e) =>
                      updateDiceSettings(targetDice, {
                        blankClearanceOverrideMm:
                          e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                  />
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      updateDiceSettings(targetDice, { blankClearanceOverrideMm: null })
                    }
                  >
                    Use Global
                  </button>
                </div>
              </div>

              <div className="field-row">
                <label htmlFor="blank-bevel-range" className="field-label-line">
                  <span>Blank Bubble-Relief Edge Bevel</span>
                  <span className="field-value">{project.blanks.bubbleBevelMm.toFixed(2)} mm</span>
                </label>
                <StudioSlider
                  id="blank-bevel-range"
                  min={0}
                  max={0.5}
                  step={0.05}
                  value={project.blanks.bubbleBevelMm}
                  numberAriaLabel="Blank bubble-relief edge bevel in mm"
                  ariaValueText={`${project.blanks.bubbleBevelMm.toFixed(2)} mm`}
                  onChange={(val) => updateBlanks({ bubbleBevelMm: val })}
                />
              </div>

              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setViewportMode('xray')}
              >
                <Layers size={14} aria-hidden="true" />
                Inspect X-Ray Shell &amp; Blank Fit
              </button>
            </section>
          </div>
        </div>

        {/* TAB 4: SUPPORTS & EXPORT */}
        <div
          role="tabpanel"
          aria-labelledby="inspector-tab-export"
          hidden={project.activeTab !== 'export'}
        >
          <div className="inspector-body">
            <section className="panel-section">
              <h2 className="section-heading">Point-Down Fin &amp; Edge Bumpers</h2>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={project.supports.enabled}
                  onChange={(e) => updateSupports({ enabled: e.target.checked })}
                />
                <span>Bake edge bumpers &amp; fin supports into exported STLs</span>
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={project.supports.pointDown}
                  onChange={(e) => updateSupports({ pointDown: e.target.checked })}
                />
                <span>Auto-orient lowest vertex point-down</span>
              </label>

              <div className="field-row">
                <label htmlFor="bumper-width-range" className="field-label-line">
                  <span>Bumper Contact Width</span>
                  <span className="field-value">
                    {project.supports.bumperContactWidthMm.toFixed(2)} mm
                  </span>
                </label>
                <StudioSlider
                  id="bumper-width-range"
                  min={0.14}
                  max={0.5}
                  step={0.02}
                  value={project.supports.bumperContactWidthMm}
                  numberAriaLabel="Bumper contact width in mm"
                  ariaValueText={`${project.supports.bumperContactWidthMm.toFixed(2)} mm`}
                  onChange={(val) => updateSupports({ bumperContactWidthMm: val })}
                />
              </div>

              <div className="field-row">
                <label htmlFor="raft-lift-range" className="field-label-line">
                  <span>Build-Plate Lift Height</span>
                  <span className="field-value">{project.supports.liftHeightMm.toFixed(1)} mm</span>
                </label>
                <StudioSlider
                  id="raft-lift-range"
                  min={2.0}
                  max={8.0}
                  step={0.5}
                  value={project.supports.liftHeightMm}
                  numberAriaLabel="Build-plate lift height in mm"
                  ariaValueText={`${project.supports.liftHeightMm.toFixed(1)} mm`}
                  onChange={(val) => updateSupports({ liftHeightMm: val })}
                />
              </div>

              <button
                type="button"
                className="btn"
                onClick={() => setViewportMode('supports')}
              >
                <ShieldCheck size={14} aria-hidden="true" />
                Preview Print Supports in 3D
              </button>
            </section>

            <section className="panel-section">
              <h2 className="section-heading">Export Formats &amp; Shrinkage</h2>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={project.exportConfig.exportStl}
                  onChange={(e) => updateExportConfig({ exportStl: e.target.checked })}
                />
                <span>Binary .STL (Universal Slicers: Lychee / Chitubox)</span>
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={project.exportConfig.export3mf}
                  onChange={(e) => updateExportConfig({ export3mf: e.target.checked })}
                />
                <span>.3MF Archive (Exact mm units &amp; metadata)</span>
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={project.exportConfig.exportSpecSheet}
                  onChange={(e) =>
                    updateExportConfig({ exportSpecSheet: e.target.checked })
                  }
                />
                <span>Caliper_Specs.md (Master &amp; Blank Target Table)</span>
              </label>

              <div className="field-row">
                <label htmlFor="shrinkage-range" className="field-label-line">
                  <span>Resin Shrinkage Compensation</span>
                  <span className="field-value">
                    +{project.exportConfig.shrinkageCompensationPct.toFixed(2)}%
                  </span>
                </label>
                <StudioSlider
                  id="shrinkage-range"
                  min={0}
                  max={3.0}
                  step={0.1}
                  value={project.exportConfig.shrinkageCompensationPct}
                  numberAriaLabel="Resin shrinkage compensation percentage"
                  ariaValueText={`plus ${project.exportConfig.shrinkageCompensationPct.toFixed(2)} percent`}
                  onChange={(val) => updateExportConfig({ shrinkageCompensationPct: val })}
                />
              </div>

              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setExportModalOpen(true)}
              >
                <Download size={14} aria-hidden="true" />
                Export Complete Set…
              </button>
            </section>
          </div>
        </div>
      </div>
    </aside>
  );
}
