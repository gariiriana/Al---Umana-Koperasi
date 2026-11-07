// Tanggal kerja dihitung dalam WIB (UTC+7, tanpa daylight saving).
import { LATE_AFTER_MINUTE_WIB } from "./constants.js";

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

/** Menit sejak 00:00 WIB (0–1439). */
export function minuteOfDayWIB(ms) {
  return Math.floor((((ms + WIB_OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS / 60_000);
}

/** Clock in lewat jam 08:00 WIB (08:00 lewat beberapa detik masih tepat waktu, 08:01 terlambat). */
export function isLateClockIn(ms) {
  return minuteOfDayWIB(ms) > LATE_AFTER_MINUTE_WIB;
}
