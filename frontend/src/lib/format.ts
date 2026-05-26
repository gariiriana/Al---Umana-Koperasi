// frontend/src/lib/format.ts
// Feature: customer-storefront-admin-stock
// Pure formatting and parsing helpers used by the storefront and admin UIs.
// No external dependencies; manual id-ID formatting guarantees a stable
// round-trip between formatIDR and parseIDR.
//
// Validates: Requirements 1.4, 2.2, 3.10, 5.5, 8.3, 9.3

const ELLIPSIS = "…";

/**
 * Inserts a `.` (period) every three digits from the right, matching the
 * Indonesian (id-ID) thousand-separator convention.
 *
 * @param n Non-negative integer.
 */
function dotThousands(n: number): string {
  const digits = String(n);
  let out = "";
  let count = 0;
  for (let i = digits.length - 1; i >= 0; i--) {
    out = digits[i] + out;
    count++;
    if (count === 3 && i > 0) {
      out = "." + out;
      count = 0;
    }
  }
  return out;
}

/**
 * Formats a number as Indonesian Rupiah, e.g. `25000 → "Rp 25.000"`.
 *
 * - Always prefixed with `"Rp "` (with the trailing space).
 * - No decimal portion.
 * - Negative or non-finite inputs are clamped to `0`.
 * - Non-integer inputs are floored.
 */
export function formatIDR(n: number): string {
  const safe = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  return "Rp " + dotThousands(safe);
}

/**
 * Parses a string produced by {@link formatIDR} back into a number.
 *
 * For every non-negative integer `n`, `parseIDR(formatIDR(n)) === n`.
 *
 * Tolerates leading/trailing whitespace and an optional `"Rp"` prefix
 * with or without a space. Returns `0` for inputs that cannot be parsed.
 */
export function parseIDR(s: string): number {
  let str = s.trim();
  if (str.startsWith("Rp")) {
    str = str.slice(2).trim();
  }
  if (str.length === 0) {
    return 0;
  }
  // Remove the id-ID thousand separators.
  const digits = str.replace(/\./g, "");
  if (!/^\d+$/.test(digits)) {
    return 0;
  }
  const n = Number(digits);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Truncates a string to at most `L` characters.
 *
 * - Returns `s` unchanged when `s.length <= L`.
 * - Otherwise returns a string of length exactly `L` ending with the
 *   single ellipsis character `"…"` (U+2026).
 * - For `L <= 0` returns the empty string.
 * - For `L === 1` returns `"…"` (when truncation is needed).
 */
export function truncate(s: string, L: number): string {
  if (L <= 0) {
    return "";
  }
  if (s.length <= L) {
    return s;
  }
  if (L === 1) {
    return ELLIPSIS;
  }
  return s.slice(0, L - 1) + ELLIPSIS;
}
