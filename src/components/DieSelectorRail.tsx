import { formatDieVariantLabel } from '../engine/exporters/batchExporter';
import { DIE_DISPLAY_NAMES, DIE_ORDER } from '../engine/presets';
import { useDiceStore } from '../store/useDiceStore';

export function DieSelectorRail() {
  const project = useDiceStore((s) => s.project);
  const setActiveDie = useDiceStore((s) => s.setActiveDie);
  const updateDieSettings = useDiceStore((s) => s.updateDieSettings);

  const enabledCount = DIE_ORDER.filter((k) => project.dice[k].enabled).length;

  return (
    <aside className="die-rail" aria-label="Dice Set Selector">
      <div className="rail-header">
        <h2 className="rail-heading">Polyhedral Set</h2>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {enabledCount}/9 active
        </span>
      </div>

      <nav className="die-list" aria-label="Die shapes">
        {DIE_ORDER.map((kind) => {
          const die = project.dice[kind];
          const isActive = project.activeDie === kind;
          const variantSubtitle =
            kind === 'd4' || kind === 'd3' || kind === 'd20'
              ? formatDieVariantLabel(die)
              : kind === 'd2'
                ? `${die.secondarySizeMm.toFixed(1)} mm thick`
                : 'Standard';

          return (
            <div key={kind} className={`die-card ${isActive ? 'active' : ''}`}>
              <input
                id={`enable-die-${kind}`}
                type="checkbox"
                checked={die.enabled}
                aria-label={`Include ${DIE_DISPLAY_NAMES[kind]} in export`}
                onChange={(e) => updateDieSettings(kind, { enabled: e.target.checked })}
              />
              <button
                type="button"
                className="die-card-btn"
                aria-current={isActive ? 'true' : undefined}
                onClick={() => setActiveDie(kind)}
              >
                <span>
                  <span className="die-name">{DIE_DISPLAY_NAMES[kind]}</span>
                  <span className="die-sub">{variantSubtitle}</span>
                </span>
                <span className="die-mm-pill">{die.sizeMm.toFixed(1)} mm</span>
              </button>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
