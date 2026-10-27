// Aturan clock in / clock out. Murni (tanpa D1) supaya bisa dites langsung.
import { OPEN_SHIFT_MAX_MS } from "../shared/constants.js";
import { workDateWIB } from "../shared/time.js";

/**
 * Baris `shifts` → bentuk API. Shift terbuka yang sudah lewat 20 jam dilaporkan
 * sebagai `lupa_pulang` walaupun cron per jam belum menandainya.
 */
export function toShiftView(row, nowMs) {
  const stale = row.status === "terbuka" && nowMs - row.masuk_at > OPEN_SHIFT_MAX_MS;
  const status = stale ? "lupa_pulang" : row.status;
  const pulangAt = row.pulang_at ?? null;
  return {
    id: row.id,
    workDate: row.work_date,
    masukAt: row.masuk_at,
    pulangAt,
    status,
    durationMin: status === "selesai" && pulangAt !== null ? Math.floor((pulangAt - row.masuk_at) / 60_000) : null,
  };
}

/** `recentRows` = shift terbaru karyawan, urut `masuk_at` turun. */
export function shiftStatus(recentRows, nowMs) {
  const views = recentRows.map((row) => toShiftView(row, nowMs));
  const today = workDateWIB(nowMs);
  return {
    today: views.find((v) => v.workDate === today) ?? null,
    open: views.find((v) => v.status === "terbuka") ?? null,
    last: views.find((v) => v.status !== "terbuka") ?? null,
  };
}

export function decideAbsen(kind, status, nowMs) {
  if (kind === "masuk") {
    if (status.open) return { ok: false, code: "SUDAH_CLOCK_IN" };
    if (status.today) return { ok: false, code: "SUDAH_CLOCK_IN_HARI_INI" };
    return { ok: true, action: "insert", workDate: workDateWIB(nowMs) };
  }
  if (!status.open) return { ok: false, code: "BELUM_CLOCK_IN" };
  return { ok: true, action: "close", shiftId: status.open.id };
}
