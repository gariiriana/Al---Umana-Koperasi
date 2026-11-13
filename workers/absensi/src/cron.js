// Tiap jam: tutup shift yang lupa clock out (lewat 23:59 WIB hari berikutnya), hapus selfie > 90 hari, buang challenge kedaluwarsa.
import { SELFIE_RETENTION_MS } from "../shared/constants.js";
import { addDays, workDateWIB } from "../shared/time.js";
import { markStaleShifts, purgeChallenges, purgeSelfies } from "./db.js";

export async function runCron(env, nowMs) {
  return {
    stale: await markStaleShifts(env.DB, addDays(workDateWIB(nowMs), -1)),
    selfies: await purgeSelfies(env.PHOTOS, nowMs - SELFIE_RETENTION_MS),
    challenges: await purgeChallenges(env.DB, nowMs),
  };
}
