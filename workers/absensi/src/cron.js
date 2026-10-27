// Tiap jam: tutup shift yang lupa clock out, hapus selfie > 90 hari, buang challenge kedaluwarsa.
import { OPEN_SHIFT_MAX_MS, SELFIE_RETENTION_MS } from "../shared/constants.js";
import { markStaleShifts, purgeChallenges, purgeSelfies } from "./db.js";

export async function runCron(env, nowMs) {
  return {
    stale: await markStaleShifts(env.DB, nowMs - OPEN_SHIFT_MAX_MS),
    selfies: await purgeSelfies(env.PHOTOS, nowMs - SELFIE_RETENTION_MS),
    challenges: await purgeChallenges(env.DB, nowMs),
  };
}
