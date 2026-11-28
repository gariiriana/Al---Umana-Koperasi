// Pengingat clock in / clock out ke HP, dijalankan cron tiap 5 menit. Jamnya sama untuk semua karyawan.
// - Clock in 07:30 WIB: hanya untuk yang belum punya shift hari ini, tidak sedang Silah, dan tidak sedang
//   cuti / sakit / izin yang disetujui.
// - Clock out 16:30 WIB: hanya untuk yang shift hari ini masih terbuka.
// Satu pengingat per orang per hari per jenis (reminder_log). Tick yang terlewat masih dikejar sampai 30 menit.
import { groupSilahHistory, isSilahOn } from "../shared/silah.js";
import { NIGHT_SHIFT_FROM_MINUTE_WIB } from "../shared/constants.js";
import { minuteOfDayWIB, workDateWIB } from "../shared/time.js";
import { jamWIB } from "./approval.js";
import {
  approvedRequestsInRange, claimReminder, deletePushDeviceByHash, listPushDevices, listSilahHistory, releaseReminder,
  reminderCandidates,
} from "./db.js";

export const REMIND_MASUK_MIN = 7 * 60 + 30;
export const REMIND_PULANG_MIN = 16 * 60 + 30;
export const REMINDER_CATCH_UP_MIN = 30;

const due = (setMinute, nowMinute) => nowMinute >= setMinute && nowMinute - setMinute < REMINDER_CATCH_UP_MIN;

function message(kind, workDate, person) {
  const base = { url: "/absensi", tag: `absen-${kind}-${workDate}`, type: "absensi_pengingat", id: `absen-${kind}-${workDate}-${person.uid}` };
  if (kind === "masuk") {
    return { ...base, title: "Waktunya Clock In", body: "Kamu belum clock in hari ini. Buka aplikasi Absensi, lalu Clock In." };
  }
  return {
    ...base,
    title: "Jangan lupa Clock Out",
    body: `Kamu clock in jam ${jamWIB(person.open_masuk_at)} WIB dan belum clock out. Clock out sebelum pulang ya.`,
  };
}

/**
 * Kirim pengingat yang jatuh tempo pada `nowMs`. `send(token, data)` → "ok" | "invalid" (token mati, dihapus) | "error".
 * Mengembalikan jumlah orang yang diingatkan per jenis.
 */
export async function runReminders(env, nowMs, send) {
  const db = env.DB;
  const workDate = workDateWIB(nowMs);
  const minute = minuteOfDayWIB(nowMs);
  const result = { masuk: 0, pulang: 0, failed: 0 };
  const wantsMasuk = due(REMIND_MASUK_MIN, minute);
  const wantsPulang = due(REMIND_PULANG_MIN, minute);
  if (!wantsMasuk && !wantsPulang) return result;
  // Shift malam kemarin (clock in mulai 20:00 WIB) yang masih berjalan = sedang kerja, tidak perlu diingatkan clock in.
  const startOfTodayMs = nowMs - minute * 60_000 - (nowMs % 60_000);
  const nightFromMs = startOfTodayMs - (24 * 60 - NIGHT_SHIFT_FROM_MINUTE_WIB) * 60_000;
  const candidates = await reminderCandidates(db, workDate, nightFromMs);
  if (candidates.length === 0) return result;

  const [silahRows, leaves] = wantsMasuk
    ? await Promise.all([listSilahHistory(db, { to: workDate }), approvedRequestsInRange(db, { from: workDate, to: workDate })])
    : [[], []];
  const silah = groupSilahHistory(silahRows);
  const onLeave = new Set(leaves.filter((r) => r.kind === "cuti").map((r) => r.uid));

  for (const person of candidates) {
    const sent = new Set(String(person.sent_kinds ?? "").split(",").filter(Boolean));
    const kinds = [];
    if (wantsMasuk && !sent.has("masuk") && !person.has_shift
      && !onLeave.has(person.uid) && !isSilahOn(silah.get(person.uid) ?? [], workDate)) {
      kinds.push("masuk");
    }
    if (wantsPulang && !sent.has("pulang") && person.open_masuk_at) kinds.push("pulang");

    for (const kind of kinds) {
      if ((await claimReminder(db, { uid: person.uid, workDate, kind, nowMs })) === 0) continue;
      const devices = await listPushDevices(db, person.uid);
      let delivered = false;
      let retry = false;
      for (const device of devices) {
        const outcome = await send(device.token, message(kind, workDate, person));
        if (outcome === "ok") delivered = true;
        else if (outcome === "invalid") await deletePushDeviceByHash(db, device.token_hash);
        else retry = true;
      }
      if (delivered) result[kind] += 1;
      else {
        result.failed += 1;
        // Gagal sementara (FCM / jaringan): lepas tanda supaya tick berikutnya mencoba lagi.
        if (retry) await releaseReminder(db, { uid: person.uid, workDate, kind });
      }
    }
  }
  return result;
}
