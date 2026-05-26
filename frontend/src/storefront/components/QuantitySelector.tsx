import { Minus, Plus } from "lucide-react";

/**
 * Mobile-first quantity stepper used on the product detail page. Two
 * 44×44 tap targets (Lucide Plus / Minus icons) flank a numeric value;
 * the value is clamped to `[min, max]` on every mutation so the parent
 * never has to validate. When the value reaches `max`, the helper hint
 * `"Maksimal {max} {unit} tersedia"` is rendered below.
 *
 * Validates: Requirements 2.4, 2.5.
 */

export interface QuantitySelectorProps {
  /** Current quantity. Must be an integer in `[min, max]`. */
  value: number;
  /** Callback fired with the next clamped quantity. */
  onChange: (next: number) => void;
  /** Maximum quantity (typically the inventory item's `quantity`). */
  max: number;
  /** Unit label used inside the max hint, e.g. "pcs", "kg". */
  unit: string;
  /** Optional minimum quantity. Defaults to `1` per Requirement 2.4. */
  min?: number;
  /** Optional disable flag (e.g. the parent has marked the item as unavailable). */
  disabled?: boolean;
  /** Optional id used by `aria-describedby` of the buttons for testing. */
  id?: string;
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  const intN = Math.floor(n);
  if (intN < lo) return lo;
  if (intN > hi) return hi;
  return intN;
}

export function QuantitySelector({
  value,
  onChange,
  max,
  unit,
  min = 1,
  disabled = false,
  id,
}: QuantitySelectorProps) {
  // Defensive clamp: a parent that hands us an out-of-range value still
  // gets a sensible UI rather than buttons that look wrongly enabled.
  const safeMax = Number.isFinite(max) && max >= min ? Math.floor(max) : min;
  const current = clamp(value, min, safeMax);
  const atMin = current <= min;
  const atMax = current >= safeMax;

  const decrement = () => {
    if (disabled || atMin) return;
    onChange(clamp(current - 1, min, safeMax));
  };
  const increment = () => {
    if (disabled || atMax) return;
    onChange(clamp(current + 1, min, safeMax));
  };

  const buttonClass =
    "h-11 w-11 inline-flex items-center justify-center rounded-full border " +
    "border-[#E5E7EB] bg-white text-[#111827] " +
    "transition-colors duration-150 " +
    "disabled:opacity-40 disabled:cursor-not-allowed " +
    "enabled:hover:bg-[#F3F4F6] " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FBBF24] focus-visible:ring-offset-2";

  return (
    <div className="space-y-1">
      <div
        id={id}
        role="group"
        aria-label="Jumlah pesanan"
        className="flex items-center gap-3"
      >
        <button
          type="button"
          onClick={decrement}
          disabled={disabled || atMin}
          aria-label="Kurangi jumlah"
          className={buttonClass}
        >
          <Minus className="h-5 w-5" aria-hidden="true" />
        </button>
        <span
          aria-live="polite"
          aria-atomic="true"
          className="min-w-[2.5rem] text-center font-['Manrope',system-ui,sans-serif] text-lg font-semibold tabular-nums text-[#111827]"
        >
          {current}
        </span>
        <button
          type="button"
          onClick={increment}
          disabled={disabled || atMax}
          aria-label="Tambah jumlah"
          className={buttonClass}
        >
          <Plus className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      {atMax && safeMax > 0 ? (
        <p
          className="text-xs text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]"
          role="status"
        >
          {`Maksimal ${safeMax} ${unit} tersedia`}
        </p>
      ) : null}
    </div>
  );
}

export default QuantitySelector;
