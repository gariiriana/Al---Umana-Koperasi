// Silah = hari libur mingguan tetap per karyawan (diatur admin absensi).
// Hari dalam minggu memakai nomor JS getUTCDay: 0 = Minggu … 6 = Sabtu.

export const SILAH_DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

/** Urutan tampil Senin → Minggu. */
export const SILAH_DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Paling banyak 6 hari Silah per minggu (minimal 1 hari kerja). */
export const MAX_SILAH_DAYS = 6;

/** Hari dalam minggu untuk tanggal `YYYY-MM-DD`. */
export function weekdayOf(date) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** `"5,6"` → `[5, 6]`; teks kosong → `[]`. */
export function parseSilahDays(text) {
  if (!text) return [];
  return String(text).split(",").map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
}

/** Validasi + urutkan; null kalau tidak sah. */
export function normalizeSilahDays(days) {
  if (!Array.isArray(days) || days.length > MAX_SILAH_DAYS) return null;
  if (!days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) return null;
  const unique = [...new Set(days)];
  if (unique.length !== days.length) return null;
  return unique.sort((a, b) => SILAH_DAY_ORDER.indexOf(a) - SILAH_DAY_ORDER.indexOf(b));
}

/**
 * Hari Silah yang berlaku pada `date` dari riwayat jadwal satu karyawan
 * (`[{ effectiveFrom, days }]`, urutan bebas). Sebelum jadwal pertama = tidak ada Silah.
 */
export function silahDaysOn(history, date) {
  let best = null;
  for (const entry of history) {
    if (entry.effectiveFrom <= date && (!best || entry.effectiveFrom > best.effectiveFrom)) best = entry;
  }
  return best ? best.days : [];
}

/** Baris D1 `{ uid, effective_from, days }` → Map uid → riwayat `[{ effectiveFrom, days }]`. */
export function groupSilahHistory(rows) {
  const byUid = new Map();
  for (const row of rows) {
    const list = byUid.get(row.uid) ?? [];
    list.push({ effectiveFrom: row.effective_from, days: parseSilahDays(row.days) });
    byUid.set(row.uid, list);
  }
  return byUid;
}

export function isSilahOn(history, date) {
  return silahDaysOn(history, date).includes(weekdayOf(date));
}

/** `[5, 6]` → "Jumat, Sabtu". */
export function formatSilahDays(days) {
  return days.length > 0 ? days.map((d) => SILAH_DAY_NAMES[d]).join(", ") : "-";
}
