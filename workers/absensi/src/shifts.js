// Aturan clock in / clock out. Murni (tanpa D1) supaya bisa dites langsung.
import { isShiftExpired, workDateWIB } from "../shared/time.js";

/**
 * Baris `shifts` → bentuk API. Shift terbuka yang lewat 23:59 WIB hari berikutnya dilaporkan
 * sebagai `lupa_pulang` walaupun cron per jam belum menandainya.
 */
export function toShiftView(row, nowMs) {
  const stale = row.status === "terbuka" && isShiftExpired(row.work_date, nowMs);
  // Clock out telat yang ditolak: dihitung tidak clock out. Jam aslinya tetap di `shifts` dan di lateOut.at.
  const lateOutRejected = row.late_out_status === "rejected";
  const status = stale || lateOutRejected ? "lupa_pulang" : row.status;
  const pulangAt = lateOutRejected ? null : row.pulang_at ?? null;
  return {
    id: row.id,
    workDate: row.work_date,
    masukAt: row.masuk_at,
    pulangAt,
    status,
    durationMin: status === "selesai" && pulangAt !== null ? Math.floor((pulangAt - row.masuk_at) / 60_000) : null,
    lateReason: row.late_reason ?? null,
    latePhotoId: row.late_photo_id ?? null,
    zoneMasuk: zoneView(row, "masuk"),
    zonePulang: zoneView(row, "pulang"),
    silahMasuk: row.silah_ex_id
      ? { id: row.silah_ex_id, status: row.silah_ex_status, reason: row.silah_ex_reason ?? "" }
      : null,
    lateOut: row.late_out_id
      ? { id: row.late_out_id, status: row.late_out_status, reason: row.late_out_reason ?? "", at: row.late_out_at }
      : null,
  };
}

/** Absen di luar zona untuk `kind` (kolom dari ZONE_COLUMNS di db.js), atau null kalau di dalam zona. */
function zoneView(row, kind) {
  const id = row[`zone_${kind}_id`];
  if (!id) return null;
  return {
    id,
    status: row[`zone_${kind}_status`],
    reason: row[`zone_${kind}_reason`] ?? "",
    distanceM: row[`zone_${kind}_distance`] ?? null,
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
