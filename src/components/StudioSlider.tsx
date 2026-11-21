import type { CSSProperties, FocusEventHandler, PointerEventHandler } from 'react';

export interface StudioSliderProps {
  id: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  numberAriaLabel: string;
  /** Optional override value displayed in the numeric input (e.g. '' for Mixed or Auto). */
  numberValue?: number | '';
  /** Optional separate handler for numeric input edits (e.g. supporting empty string -> null). */
  onNumberChange?: (raw: string) => void;
  numberMin?: number;
  numberMax?: number;
  numberStep?: number;
  placeholder?: string;
  ariaValueText?: string;
  onPointerDown?: PointerEventHandler<HTMLInputElement>;
  onPointerUp?: PointerEventHandler<HTMLInputElement>;
  onPointerCancel?: PointerEventHandler<HTMLInputElement>;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  onNumberFocus?: FocusEventHandler<HTMLInputElement>;
  onNumberBlur?: FocusEventHandler<HTMLInputElement>;
}

/**
 * Brand-consistent native range slider paired with a tabular numeric spinbutton.
 * Syncs --attr-min, --attr-max, and --control-value inline so WebKit/Blink
 * filled tracks work smoothly with or without CSS progress()/typed attr().
 */
export function StudioSlider({
  id,
  min,
  max,
  step = 1,
  value,
  onChange,
  numberAriaLabel,
  numberValue,
  onNumberChange,
  numberMin,
  numberMax,
  numberStep,
  placeholder,
  ariaValueText,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onBlur,
  onNumberFocus,
  onNumberBlur,
}: StudioSliderProps) {
  const clamped = Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
  const sliderStyle = {
    '--attr-min': min,
    '--attr-max': max,
    '--control-value': clamped,
  } as CSSProperties;

  const displayedNum = numberValue !== undefined ? numberValue : value;
  const effNumMin = numberMin ?? min;
  const effNumMax = numberMax ?? max;
  const effNumStep = numberStep ?? step;

  return (
    <div className="control-pair">
      <input
        id={id}
        type="range"
        className="studio-range"
        min={min}
        max={max}
        step={step}
        value={clamped}
        aria-valuetext={ariaValueText}
        style={sliderStyle}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onBlur={onBlur}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <input
        type="number"
        aria-label={numberAriaLabel}
        className="num-input"
        placeholder={placeholder}
        min={effNumMin}
        max={effNumMax}
        step={effNumStep}
        value={displayedNum}
        onFocus={onNumberFocus}
        onBlur={onNumberBlur ?? onBlur}
        onChange={(e) => {
          if (onNumberChange) {
            onNumberChange(e.target.value);
            return;
          }
          const parsed = Number(e.target.value);
          if (Number.isNaN(parsed)) return;
          onChange(Math.max(effNumMin, Math.min(effNumMax, parsed)));
        }}
      />
    </div>
  );
}
