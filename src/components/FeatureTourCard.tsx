import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Sparkles, X } from 'lucide-react';
import { useDiceStore } from '../store/useDiceStore';
import type { InspectorTab, ViewportMode } from '../types/dice';

interface TourStepDef {
  title: string;
  body: string;
  tab?: InspectorTab;
  viewport?: ViewportMode;
}

const TOUR_STEPS: TourStepDef[] = [
  {
    title: '1. 12 Polyhedral Shapes & Set Templates',
    body: 'Pick any die from the D2–D20 rail on the left (including D5, D7, D9, 6 D2 coin silhouettes, and Rhombic D12) or click Add Die / Sets to load game templates and twin Logo + Numbers pairs. Select multiple dice with Ctrl/Shift+Click for live group editing.',
    tab: 'shape',
    viewport: 'single',
  },
  {
    title: '2. Fonts, SVGs & Right-Click Face Editing',
    body: 'Open Fonts & SVG to pick a bundled typeface, browse installed OS TTF/OTF fonts, or drag-and-drop custom fonts and SVG emblems onto the window. Click or right-click any face in 3D or on the top Faces bar (including All) for instant text, SVG, rotation, and scale overrides.',
    tab: 'typography',
    viewport: 'single',
  },
  {
    title: '3. Matched Insert Blanks & X-Ray Check',
    body: 'Switch to Insert X-Ray (3) to inspect the translucent outer shell around your matched inner blank core. The caliper formula guarantees Blank = Master − 2 × (EngraveDepth + Clearance).',
    tab: 'blanks',
    viewport: 'xray',
  },
  {
    title: '4. Resin Shaders & Focus Mode',
    body: 'Preview masters in Master Grey, Arcane Sapphire, Cure Clear, or Obsidian resin right above the 3D scene. Press F to re-frame the camera or \\ (Backslash) for full-bleed Focus Mode.',
    viewport: 'single',
  },
  {
    title: '5. Supports & Print-Ready Bundle Export',
    body: 'Check generated point-down fin & edge bumper supports (4), then click Export Set (Ctrl+E) to write watertight .stl meshes, multi-part .3mf files, matched blanks, and Caliper_Specs.md in one bundle.',
    tab: 'export',
    viewport: 'supports',
  },
];

export function FeatureTourCard() {
  const tourOpen = useDiceStore((s) => s.tourOpen);
  const tourStep = useDiceStore((s) => s.tourStep);
  const closeTour = useDiceStore((s) => s.closeTour);
  const setTourStep = useDiceStore((s) => s.setTourStep);
  const setActiveTab = useDiceStore((s) => s.setActiveTab);
  const setViewportMode = useDiceStore((s) => s.setViewportMode);

  const popoverRef = useRef<HTMLDivElement>(null);
  const nextBtnRef = useRef<HTMLButtonElement>(null);
  const doneBtnRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);

  const stepDef = TOUR_STEPS[Math.min(Math.max(0, tourStep), TOUR_STEPS.length - 1)];

  useEffect(() => {
    const el = popoverRef.current as (HTMLDivElement & {
      showPopover?: () => void;
      hidePopover?: () => void;
    }) | null;
    if (!el) return;

    if (tourOpen) {
      if (!wasOpenRef.current) {
        try {
          if (typeof el.showPopover === 'function' && !el.matches(':popover-open')) {
            el.showPopover();
          }
        } catch {
          // Ignore duplicate open state
        }
        wasOpenRef.current = true;
        // Route programmatic focus into the manual popover without obscuring target
        requestAnimationFrame(() => {
          (nextBtnRef.current ?? doneBtnRef.current)?.focus();
        });
      }
    } else if (wasOpenRef.current) {
      try {
        if (typeof el.hidePopover === 'function' && el.matches(':popover-open')) {
          el.hidePopover();
        }
      } catch {
        // Ignore already-closed state
      }
      wasOpenRef.current = false;
      requestAnimationFrame(() => {
        document.getElementById('dcm-tour-trigger')?.focus();
      });
    }
  }, [tourOpen]);

  const goToStep = (index: number) => {
    const clamped = Math.max(0, Math.min(TOUR_STEPS.length - 1, index));
    setTourStep(clamped);
    const nextDef = TOUR_STEPS[clamped];
    if (nextDef.tab) setActiveTab(nextDef.tab);
    if (nextDef.viewport) setViewportMode(nextDef.viewport);
  };

  return (
    <div
      ref={popoverRef}
      id="dcm-feature-tour"
      className="tour-popover"
      role="dialog"
      aria-modal="false"
      aria-labelledby="dcm-tour-title"
      {...({ popover: 'manual' } as Record<string, string>)}
      hidden={!tourOpen}
    >
      <div className="tour-header">
        <span className="tour-step-pill">
          <Sparkles size={11} style={{ verticalAlign: '-1px', marginRight: 4 }} aria-hidden="true" />
          Step {tourStep + 1} / {TOUR_STEPS.length}
        </span>
        <button
          type="button"
          className="btn btn-icon"
          aria-label="Close maker tour"
          title="Close tour (Esc)"
          onClick={closeTour}
          {...({ popoverTarget: 'dcm-feature-tour', popoverTargetAction: 'hide' } as Record<
            string,
            string
          >)}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>

      <h2 id="dcm-tour-title" className="tour-title">
        {stepDef.title}
      </h2>
      <p className="tour-body">{stepDef.body}</p>

      <div className="tour-actions">
        <button
          type="button"
          className="btn btn-compact"
          aria-disabled={tourStep === 0}
          onClick={() => {
            if (tourStep > 0) goToStep(tourStep - 1);
          }}
        >
          <ChevronLeft size={14} aria-hidden="true" />
          Previous
        </button>

        <div style={{ display: 'flex', gap: 6 }}>
          {tourStep < TOUR_STEPS.length - 1 ? (
            <button
              ref={nextBtnRef}
              type="button"
              className="btn btn-primary btn-compact"
              onClick={() => goToStep(tourStep + 1)}
            >
              Next
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          ) : (
            <button
              ref={doneBtnRef}
              type="button"
              className="btn btn-primary btn-compact"
              onClick={closeTour}
              {...({ popoverTarget: 'dcm-feature-tour', popoverTargetAction: 'hide' } as Record<
                string,
                string
              >)}
            >
              Got it
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
