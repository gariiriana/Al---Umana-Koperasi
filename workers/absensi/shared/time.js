// Tanggal kerja dihitung dalam WIB (UTC+7, tanpa daylight saving).
import { LATE_AFTER_MINUTE_WIB, NIGHT_SHIFT_FROM_MINUTE_WIB, NIGHT_SHIFT_OUT_UNTIL_MINUTE_WIB } from "./constants.js";

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

/** Shift tanggal `workDate` yang belum di-clock out sudah tidak bisa ditutup (lewat 23:59 WIB hari berikutnya). */
export function isShiftExpired(workDate, nowMs) {
  return workDateWIB(nowMs) > addDays(workDate, 1);
}

/**
 * Clock out sesudah "ganti hari": perlu alasan + persetujuan. Shift biasa: tanggal WIB clock out lewat tanggal
 * clock in. Shift malam (clock in mulai 20:00 WIB): baru telat lewat 12:00 WIB keesokan harinya.
 */
export function isLateClockOut(masukAt, nowMs) {
  const masukDate = workDateWIB(masukAt);
  const outDate = workDateWIB(nowMs);
  if (minuteOfDayWIB(masukAt) < NIGHT_SHIFT_FROM_MINUTE_WIB) return outDate > masukDate;
  const nextDay = addDays(masukDate, 1);
  return outDate > nextDay || (outDate === nextDay && minuteOfDayWIB(nowMs) > NIGHT_SHIFT_OUT_UNTIL_MINUTE_WIB);
}
