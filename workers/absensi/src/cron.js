// Tiap jam: tutup shift yang lupa clock out (lewat 23:59 WIB hari berikutnya), hapus selfie > 90 hari, buang challenge kedaluwarsa,
// buang catatan scan wajah gagal > 30 hari.
import { SELFIE_RETENTION_MS } from "../shared/constants.js";
import { addDays, workDateWIB } from "../shared/time.js";
import { markStaleShifts, purgeChallenges, purgeFaceFailures, purgeReminderLog, purgeSelfies } from "./db.js";

const FACE_FAILURE_RETENTION_MS = 30 * 86_400_000;

export async function runCron(env, nowMs) {
  return {
    stale: await markStaleShifts(env.DB, addDays(workDateWIB(nowMs), -1)),
    selfies: await purgeSelfies(env.PHOTOS, nowMs - SELFIE_RETENTION_MS),
    challenges: await purgeChallenges(env.DB, nowMs),
    faceFailures: await purgeFaceFailures(env.DB, nowMs - FACE_FAILURE_RETENTION_MS),
    reminderLog: await purgeReminderLog(env.DB, addDays(workDateWIB(nowMs), -7)),
  };
}
