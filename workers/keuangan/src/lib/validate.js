// Validasi dasar & format tanggal/angka Keuangan. Uang dalam INTEGER sen.
import { KeuanganError } from "../http.js";

const WIB_OFFSET_MS = 7 * 3_600_000;

export function todayWib(nowMs = Date.now()) {
  return new Date(nowMs + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

export function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatDmy(isoDate) {
  if (!isIsoDate(isoDate)) return String(isoDate || "");
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

export function cleanText(v, max = 500) {
  return String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

export function newId() {
  return crypto.randomUUID();
}

export function isInt(value, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  return typeof value === "number" && Number.isInteger(value) && Number.isSafeInteger(value) && value >= min && value <= max;
}

export function invalid(field, message = `Field "${field}" tidak valid.`, row = undefined) {
  return new KeuanganError("VALIDATION_ERROR", 400, message, row === undefined ? { field } : { field, row });
}

export function requireIsoDate(value, field = "tanggal") {
  if (!isIsoDate(value)) throw invalid(field, `Tanggal "${field}" harus berformat YYYY-MM-DD yang valid.`);
  return value;
}

export function requireUnitKode(value, field = "unit_kode") {
  const clean = String(value ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{1,10}$/.test(clean)) {
    throw invalid(field, "Kode anak perusahaan harus huruf besar/angka, maksimal 10 karakter.");
  }
  return clean;
}

export function formatRupiahSen(sen) {
  const neg = sen < 0;
  const abs = Math.abs(sen);
  const whole = Math.floor(abs / 100);
  const dec = abs % 100;
  const formatted = whole.toLocaleString("id-ID") + (dec ? `,${String(dec).padStart(2, "0")}` : "");
  return `${neg ? "-" : ""}Rp${formatted}`;
}
