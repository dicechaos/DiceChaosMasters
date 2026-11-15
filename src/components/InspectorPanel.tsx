import { useRef, type KeyboardEvent } from 'react';
import {
  BoxSelect,
  Download,
  Layers,
  ShieldCheck,
  Sliders,
  Type,
  Upload,
} from 'lucide-react';
import { BUNDLED_FONTS, DIE_DISPLAY_NAMES, SET_PRESETS } from '../engine/presets';
import { useDiceStore } from '../store/useDiceStore';
import type {
  D3Variant,
  D4Variant,
  InspectorTab,
  SetPresetId,
  SixNineIndicator,
} from '../types/dice';

const TABS: Array<{ id: InspectorTab; label: string; icon: typeof Sliders }> = [
  { id: 'shape', label: 'Shape', icon: Sliders },
  { id: 'typography', label: 'Fonts & SVG', icon: Type },
  { id: 'blanks', label: 'Blanks', icon: Layers },
  { id: 'export', label: 'Supports', icon: ShieldCheck },
];

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
  const updateDieSettings = useDiceStore((s) => s.updateDieSettings);
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

  const fontUploadRef = useRef<HTMLInputElement>(null);
  const highSvgUploadRef = useRef<HTMLInputElement>(null);
  const faceSvgUploadRef = useRef<HTMLInputElement>(null);

  const die = project.dice[project.activeDie];
  const selectedFaceId = project.selectedFaceId;
  const selectedFace = activeResult?.faces.find((f) => f.id === selectedFaceId) ?? null;
  const faceOverride = selectedFaceId ? die.faceOverrides[selectedFaceId] : undefined;

  const hasSecondaryDim =
    die.kind === 'd2' ||
    die.kind === 'd3' ||
    (die.kind === 'd4' &&
      (die.d4Variant === 'crystal' ||
        die.d4Variant === 'arch' ||
        die.d4Variant === 'pendulum'));

  const primaryDimLabel =
    die.kind === 'd2'
      ? 'Coin Diameter'
      : die.kind === 'd4' && (die.d4Variant === 'crystal' || die.d4Variant === 'arch' || die.d4Variant === 'pendulum')
        ? 'Body Width (F2F)'
        : 'Face-to-Face Size';

  const secondaryDimLabel =
    die.kind === 'd2' ? 'Coin Thickness' : 'Tip-to-Tip Length';

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
                  const p = SET_PRESETS[pid];
                  return (
                    <button
                      key={pid}
                      type="button"
                      className="choice-tile"
                      aria-pressed={project.presetId === pid}
                      onClick={() => applyPreset(pid)}
                    >
                      <span className="choice-tile-title">{p.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="panel-section">
              <h2 className="section-heading">
                <span>{DIE_DISPLAY_NAMES[die.kind]} Geometry</span>
                <span style={{ color: 'var(--brand-amber-bright)' }}>
                  {die.sizeMm.toFixed(1)} mm
                </span>
              </h2>

              {die.kind === 'd4' && (
                <div className="field-row">
                  <span className="field-label-line">D4 Shape Variant (6 Styles)</span>
                  <div className="variant-grid">
                    {D4_VARIANT_CARDS.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        className="choice-tile"
                        aria-pressed={die.d4Variant === v.id}
                        onClick={() => setD4Variant(v.id)}
                      >
                        <span className="choice-tile-title">{v.title}</span>
                        <span className="choice-tile-desc">{v.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {die.kind === 'd3' && (
                <div className="field-row">
                  <span className="field-label-line">D3 Shape Style</span>
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
                        aria-pressed={die.d3Variant === v.id}
                        onClick={() => updateDieSettings('d3', { d3Variant: v.id })}
                      >
                        <span className="choice-tile-title">{v.title}</span>
                        <span className="choice-tile-desc">{v.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {die.kind === 'd10' && (
                <div className="field-row">
                  <label htmlFor="d10-numbering-select" className="field-label-line">
                    D10 Numbering Range
                  </label>
                  <select
                    id="d10-numbering-select"
                    className="select-input"
                    value={die.d10Numbering}
                    onChange={(e) =>
                      updateDieSettings('d10', {
                        d10Numbering: e.target.value as '0_9' | '1_10',
                      })
                    }
                  >
                    <option value="0_9">Standard RPG (0 – 9)</option>
                    <option value="1_10">Sequential (1 – 10)</option>
                  </select>
                </div>
              )}

              {die.kind === 'd00' && (
                <div className="field-row">
                  <label htmlFor="d00-orient-select" className="field-label-line">
                    Percentile Orientation
                  </label>
                  <select
                    id="d00-orient-select"
                    className="select-input"
                    value={die.d00Orientation}
                    onChange={(e) =>
                      updateDieSettings('d00', {
                        d00Orientation: e.target.value as 'horizontal' | 'vertical',
                      })
                    }
                  >
                    <option value="horizontal">Horizontal (Across Wide Kite)</option>
                    <option value="vertical">Vertical (Along Kite Axis)</option>
                  </select>
                </div>
              )}

              {die.kind === 'd20' && (
                <div className="field-row">
                  <label htmlFor="d20-layout-select" className="field-label-line">
                    D20 Face Layout
                  </label>
                  <select
                    id="d20-layout-select"
                    className="select-input"
                    value={die.d20Numbering}
                    onChange={(e) =>
                      updateDieSettings('d20', {
                        d20Numbering: e.target.value as 'balanced' | 'spindown',
                      })
                    }
                  >
                    <option value="balanced">Balanced RPG (Opposite Sum = 21)</option>
                    <option value="spindown">Spindown Counter (Sequential Path)</option>
                  </select>
                </div>
              )}

              <div className="field-row">
                <label htmlFor="die-size-range" className="field-label-line">
                  <span>{primaryDimLabel}</span>
                  <span className="field-value">{die.sizeMm.toFixed(1)} mm</span>
                </label>
                <div className="control-pair">
                  <input
                    id="die-size-range"
                    type="range"
                    min={8}
                    max={45}
                    step={0.5}
                    value={die.sizeMm}
                    onChange={(e) =>
                      updateDieSettings(die.kind, { sizeMm: Number(e.target.value) })
                    }
                  />
                  <input
                    type="number"
                    aria-label={`${primaryDimLabel} in millimeters`}
                    className="num-input"
                    min={8}
                    max={45}
                    step={0.5}
                    value={die.sizeMm}
                    onChange={(e) =>
                      updateDieSettings(die.kind, {
                        sizeMm: Math.max(8, Math.min(45, Number(e.target.value) || 8)),
                      })
                    }
                  />
                </div>
              </div>

              {hasSecondaryDim && (
                <div className="field-row">
                  <label htmlFor="die-sec-range" className="field-label-line">
                    <span>{secondaryDimLabel}</span>
                    <span className="field-value">{die.secondarySizeMm.toFixed(1)} mm</span>
                  </label>
                  <div className="control-pair">
                    <input
                      id="die-sec-range"
                      type="range"
                      min={die.kind === 'd2' ? 2.0 : 14}
                      max={die.kind === 'd2' ? 8.0 : 50}
                      step={0.2}
                      value={die.secondarySizeMm}
                      onChange={(e) =>
                        updateDieSettings(die.kind, {
                          secondarySizeMm: Number(e.target.value),
                        })
                      }
                    />
                    <input
                      type="number"
                      aria-label={`${secondaryDimLabel} in millimeters`}
                      className="num-input"
                      min={die.kind === 'd2' ? 2.0 : 14}
                      max={die.kind === 'd2' ? 8.0 : 50}
                      step={0.2}
                      value={die.secondarySizeMm}
                      onChange={(e) =>
                        updateDieSettings(die.kind, {
                          secondarySizeMm: Number(e.target.value) || 3.6,
                        })
                      }
                    />
                  </div>
                </div>
              )}

              <div className="field-row">
                <label htmlFor="edge-chamfer-range" className="field-label-line">
                  <span>Edge Chamfer / Bevel</span>
                  <span className="field-value">
                    {die.edgeChamferMm <= 0.005
                      ? '0.00 mm (Hard Edge)'
                      : `${die.edgeChamferMm.toFixed(2)} mm`}
                  </span>
                </label>
                <div className="control-pair">
                  <input
                    id="edge-chamfer-range"
                    type="range"
                    min={0}
                    max={1.0}
                    step={0.05}
                    value={die.edgeChamferMm}
                    onChange={(e) =>
                      updateDieSettings(die.kind, { edgeChamferMm: Number(e.target.value) })
                    }
                  />
                  <input
                    type="number"
                    aria-label="Edge chamfer in millimeters"
                    className="num-input"
                    min={0}
                    max={1.0}
                    step={0.05}
                    value={die.edgeChamferMm}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      updateDieSettings(die.kind, {
                        edgeChamferMm: Number.isNaN(v) ? 0 : Math.max(0, Math.min(1.0, v)),
                      });
                    }}
                  />
                </div>
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
                <div className="control-pair">
                  <input
                    id="font-scale-range"
                    type="range"
                    min={30}
                    max={90}
                    step={1}
                    value={project.typography.fontScalePct}
                    onChange={(e) =>
                      updateTypography({ fontScalePct: Number(e.target.value) })
                    }
                  />
                  <input
                    type="number"
                    aria-label="Global font scale percentage"
                    className="num-input"
                    min={30}
                    max={90}
                    value={project.typography.fontScalePct}
                    onChange={(e) =>
                      updateTypography({
                        fontScalePct: Math.max(30, Math.min(90, Number(e.target.value) || 58)),
                      })
                    }
                  />
                </div>
              </div>

              <div className="field-row">
                <label htmlFor="die-font-mult" className="field-label-line">
                  <span>{DIE_DISPLAY_NAMES[die.kind]} Font Multiplier</span>
                  <span className="field-value">{die.fontScaleMultiplier.toFixed(2)}×</span>
                </label>
                <div className="control-pair">
                  <input
                    id="die-font-mult"
                    type="range"
                    min={0.5}
                    max={1.5}
                    step={0.05}
                    value={die.fontScaleMultiplier}
                    onChange={(e) =>
                      updateDieSettings(die.kind, {
                        fontScaleMultiplier: Number(e.target.value),
                      })
                    }
                  />
                  <input
                    type="number"
                    aria-label="Per-die font multiplier"
                    className="num-input"
                    min={0.5}
                    max={1.5}
                    step={0.05}
                    value={die.fontScaleMultiplier}
                    onChange={(e) =>
                      updateDieSettings(die.kind, {
                        fontScaleMultiplier: Number(e.target.value) || 1.0,
                      })
                    }
                  />
                </div>
              </div>

              <div className="field-row">
                <label htmlFor="engrave-depth-range" className="field-label-line">
                  <span>Engraving Depth</span>
                  <span className="field-value">
                    {project.typography.engravingDepthMm.toFixed(2)} mm
                  </span>
                </label>
                <div className="control-pair">
                  <input
                    id="engrave-depth-range"
                    type="range"
                    min={0.3}
                    max={1.4}
                    step={0.05}
                    value={project.typography.engravingDepthMm}
                    onChange={(e) =>
                      updateTypography({ engravingDepthMm: Number(e.target.value) })
                    }
                  />
                  <input
                    type="number"
                    aria-label="Engraving depth in mm"
                    className="num-input"
                    min={0.3}
                    max={1.4}
                    step={0.05}
                    value={project.typography.engravingDepthMm}
                    onChange={(e) =>
                      updateTypography({
                        engravingDepthMm: Math.max(0.3, Math.min(1.4, Number(e.target.value) || 0.75)),
                      })
                    }
                  />
                </div>
              </div>

              <div className="field-row">
                <label htmlFor="draft-angle-range" className="field-label-line">
                  <span>Anti-Tear Draft Angle</span>
                  <span className="field-value">{project.typography.draftAngleDeg}°</span>
                </label>
                <div className="control-pair">
                  <input
                    id="draft-angle-range"
                    type="range"
                    min={0}
                    max={25}
                    step={1}
                    value={project.typography.draftAngleDeg}
                    onChange={(e) =>
                      updateTypography({ draftAngleDeg: Number(e.target.value) })
                    }
                  />
                  <input
                    type="number"
                    aria-label="Anti-tear draft angle in degrees"
                    className="num-input"
                    min={0}
                    max={25}
                    value={project.typography.draftAngleDeg}
                    onChange={(e) =>
                      updateTypography({
                        draftAngleDeg: Math.max(0, Math.min(25, Number(e.target.value) || 0)),
                      })
                    }
                  />
                </div>
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
                <input
                  id="tracking-range"
                  type="range"
                  min={-0.16}
                  max={0.12}
                  step={0.01}
                  value={project.typography.twoDigitTrackingEm}
                  onChange={(e) =>
                    updateTypography({ twoDigitTrackingEm: Number(e.target.value) })
                  }
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
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <BoxSelect size={13} aria-hidden="true" />
                  Per-Face Override
                </span>
                <span style={{ color: 'var(--brand-amber-bright)' }}>
                  {selectedFace ? `Face ${selectedFace.label}` : 'Click a face'}
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
                        updateFaceOverride(die.kind, selectedFaceId, {
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
                      className="select-input"
                      value={faceOverride?.svgId ?? ''}
                      onChange={(e) =>
                        updateFaceOverride(die.kind, selectedFaceId, {
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
                          updateFaceOverride(die.kind, selectedFaceId, { svgId: id });
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
                    <input
                      id="face-scale-range"
                      type="range"
                      min={0.4}
                      max={1.8}
                      step={0.05}
                      value={faceOverride?.scaleMultiplier ?? 1}
                      onChange={(e) =>
                        updateFaceOverride(die.kind, selectedFaceId, {
                          scaleMultiplier: Number(e.target.value),
                        })
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
                    <input
                      id="face-rot-range"
                      type="range"
                      min={-180}
                      max={180}
                      step={5}
                      value={faceOverride?.rotationDeg ?? 0}
                      onChange={(e) =>
                        updateFaceOverride(die.kind, selectedFaceId, {
                          rotationDeg: Number(e.target.value),
                        })
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
                          updateFaceOverride(die.kind, selectedFaceId, {
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
                          updateFaceOverride(die.kind, selectedFaceId, {
                            offsetYMm: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn"
                    onClick={() => updateFaceOverride(die.kind, selectedFaceId, null)}
                  >
                    Reset Face {selectedFace.label} Override
                  </button>
                </>
              ) : (
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '12px' }}>
                  Click any face in the 3D viewport or use the top-left <strong>Faces</strong> bar
                  to swap text, upload a custom SVG logo, or adjust X/Y/rotation on a specific face.
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
                Exact per-plane normal inset keeps shell thickness uniform on asymmetric dice
                (Coins, Prisms, Crystal &amp; Arch D4s):
                <code>
                  Blank = Master - 2 × ({project.typography.engravingDepthMm.toFixed(2)} +{' '}
                  {(die.blankClearanceOverrideMm ?? project.blanks.clearanceMm).toFixed(2)}) mm
                </code>
              </div>

              <div className="field-row">
                <label htmlFor="blank-clearance-range" className="field-label-line">
                  <span>Global Resin Clearance (Per Side)</span>
                  <span className="field-value">{project.blanks.clearanceMm.toFixed(2)} mm</span>
                </label>
                <div className="control-pair">
                  <input
                    id="blank-clearance-range"
                    type="range"
                    min={0}
                    max={0.4}
                    step={0.01}
                    value={project.blanks.clearanceMm}
                    onChange={(e) =>
                      updateBlanks({ clearanceMm: Number(e.target.value) })
                    }
                  />
                  <input
                    type="number"
                    aria-label="Global blank clearance in mm"
                    className="num-input"
                    min={0}
                    max={0.4}
                    step={0.01}
                    value={project.blanks.clearanceMm}
                    onChange={(e) =>
                      updateBlanks({
                        clearanceMm: Math.max(-0.5, Math.min(0.6, Number(e.target.value) || 0)),
                      })
                    }
                  />
                </div>
              </div>

              <div className="field-row">
                <label htmlFor="die-blank-override" className="field-label-line">
                  <span>{DIE_DISPLAY_NAMES[die.kind]} Clearance Override</span>
                  <span className="field-value">
                    {die.blankClearanceOverrideMm === null
                      ? 'Auto'
                      : `${die.blankClearanceOverrideMm.toFixed(2)} mm`}
                  </span>
                </label>
                <div className="variant-grid">
                  <input
                    id="die-blank-override"
                    type="number"
                    className="num-input"
                    placeholder="Auto"
                    step={0.01}
                    min={-0.2}
                    max={0.8}
                    value={die.blankClearanceOverrideMm ?? ''}
                    onChange={(e) =>
                      updateDieSettings(die.kind, {
                        blankClearanceOverrideMm:
                          e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                  />
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      updateDieSettings(die.kind, { blankClearanceOverrideMm: null })
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
                <input
                  id="blank-bevel-range"
                  type="range"
                  min={0}
                  max={0.5}
                  step={0.05}
                  value={project.blanks.bubbleBevelMm}
                  onChange={(e) =>
                    updateBlanks({ bubbleBevelMm: Number(e.target.value) })
                  }
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
                <input
                  id="bumper-width-range"
                  type="range"
                  min={0.14}
                  max={0.5}
                  step={0.02}
                  value={project.supports.bumperContactWidthMm}
                  onChange={(e) =>
                    updateSupports({ bumperContactWidthMm: Number(e.target.value) })
                  }
                />
              </div>

              <div className="field-row">
                <label htmlFor="raft-lift-range" className="field-label-line">
                  <span>Build-Plate Lift Height</span>
                  <span className="field-value">{project.supports.liftHeightMm.toFixed(1)} mm</span>
                </label>
                <input
                  id="raft-lift-range"
                  type="range"
                  min={2.0}
                  max={8.0}
                  step={0.5}
                  value={project.supports.liftHeightMm}
                  onChange={(e) =>
                    updateSupports({ liftHeightMm: Number(e.target.value) })
                  }
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
                <input
                  id="shrinkage-range"
                  type="range"
                  min={0}
                  max={3.0}
                  step={0.1}
                  value={project.exportConfig.shrinkageCompensationPct}
                  onChange={(e) =>
                    updateExportConfig({
                      shrinkageCompensationPct: Number(e.target.value),
                    })
                  }
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
