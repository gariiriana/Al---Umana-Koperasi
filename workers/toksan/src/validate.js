// Shared value rules for the toksan Worker.
import { ToksanError } from "./http.js";

export const DAPUR = ["bakery", "hangat_saji", "depan"];
export const KATEGORI = ["makanan", "minuman", "lainnya"];
export const SESI = ["pagi", "siang", "sore"];
export const PIHAK = ["rijal", "nisaa"];

const WIB_OFFSET_MS = 7 * 3_600_000;

export function todayWib(nowMs) {
  return new Date(nowMs + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

/** A real calendar date in YYYY-MM-DD form. */
export function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function cleanName(name) {
  return String(name ?? "").trim().replace(/\s+/g, " ");
}

export function nameKey(name) {
  return cleanName(name).toLowerCase();
}

export const newId = () => crypto.randomUUID();

export function isWholeNumber(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

/** A YYYY-MM-DD date that is not after today (WIB). */
export function checkTanggal(value, nowMs) {
  if (!isIsoDate(value) || value > todayWib(nowMs)) throw new ToksanError("TANGGAL_TIDAK_VALID", 400);
  return value;
}

/** Shape of a batch payload: {tanggal, rows: [], hapus: [id]}. */
export function checkBatch(body, nowMs, maxRows = 300) {
  const tanggal = checkTanggal(body.tanggal, nowMs);
  const rows = body.rows ?? [];
  const hapus = body.hapus ?? [];
  if (!Array.isArray(rows) || rows.length > maxRows) throw invalid("rows");
  if (!Array.isArray(hapus) || hapus.length > maxRows || !hapus.every((id) => typeof id === "string")) throw invalid("hapus");
  rows.forEach((row, i) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw invalid("row", i);
    if (row.id !== undefined && typeof row.id !== "string") throw invalid("id", i);
  });
  return { tanggal, rows, hapus };
}

/** Throws VALIDATION_ERROR naming the field (and the row, for batch payloads). */
export function invalid(field, row = undefined) {
  return new ToksanError("VALIDATION_ERROR", 400, row === undefined ? { field } : { row, field });
}
