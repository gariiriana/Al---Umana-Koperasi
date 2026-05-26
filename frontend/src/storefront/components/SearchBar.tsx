/**
 * Storefront product search input.
 *
 * - Placeholder text in Bahasa Indonesia (`"Cari produk..."`).
 * - Hard cap of 100 characters via the native `maxLength` attribute
 *   (Requirement 17.1).
 * - Debounces the `onChange` callback by 300 ms so that downstream
 *   filtering only runs once the Customer pauses typing
 *   (Requirement 17.2).
 *
 * The component is intentionally uncontrolled w.r.t. the parent — the
 * parent only ever sees the *debounced* query, never the per-keystroke
 * intermediate value. The parent may seed the initial query via
 * {@link SearchBarProps.initialValue}.
 *
 * Validates: Requirements 17.1, 17.2, 17.4.
 */

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

export interface SearchBarProps {
  /** Called with the debounced (≥ 300 ms idle) search query. */
  onChange: (query: string) => void;
  /** Optional initial value for the input. */
  initialValue?: string;
  /** Override the debounce delay (ms). Exposed for tests. */
  debounceMs?: number;
}

const MAX_LENGTH = 100;
const DEFAULT_DEBOUNCE_MS = 300;

export function SearchBar({
  onChange,
  initialValue = "",
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: SearchBarProps) {
  const [value, setValue] = useState(initialValue);

  // Track the latest onChange in a ref so the debounce effect doesn't
  // re-fire when the parent redefines the callback on each render.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      onChangeRef.current(value);
    }, debounceMs);
    return () => window.clearTimeout(handle);
  }, [value, debounceMs]);

  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-3 flex items-center text-[#6B7280]"
      >
        <Search className="h-4 w-4" />
      </span>
      <input
        type="text"
        role="searchbox"
        aria-label="Cari produk"
        placeholder="Cari produk..."
        value={value}
        maxLength={MAX_LENGTH}
        onChange={(e) => setValue(e.target.value)}
        className={
          "w-full min-h-11 rounded-2xl border border-[#E5E7EB] bg-white " +
          "pl-9 pr-9 py-2 text-sm text-[#111827] " +
          "font-['Hanken_Grotesk',system-ui,sans-serif] " +
          "placeholder:text-[#9CA3AF] " +
          "focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:border-transparent"
        }
      />
      {value.length > 0 && (
        <button
          type="button"
          aria-label="Hapus pencarian"
          onClick={() => setValue("")}
          className={
            "absolute inset-y-0 right-2 my-auto flex h-8 w-8 items-center " +
            "justify-center rounded-full text-[#6B7280] hover:text-[#111827] " +
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FBBF24]"
          }
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export default SearchBar;
