// Tanggal kerja dihitung dalam WIB (UTC+7, tanpa daylight saving).
const WIB_OFFSET_MS = 7 * 3600_000;
const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` tanggal WIB untuk waktu `ms`. */
export function workDateWIB(ms) {
  return new Date(ms + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

/** Geser tanggal `YYYY-MM-DD` sebanyak `n` hari. */
export function addDays(date, n) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}
