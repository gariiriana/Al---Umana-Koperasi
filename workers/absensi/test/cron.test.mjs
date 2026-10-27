import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { addEmployee, makeEnv, T0 } from "./helpers.mjs";
import { createChallenge, getPhoto, insertPhoto, insertShift, recentShifts } from "../src/db.js";
import { runCron } from "../src/cron.js";

const DAY = 86_400_000;
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 1]);

describe("runCron", () => {
  let env;
  let dispose;
  before(async () => {
    ({ env, dispose } = await makeEnv());
    await addEmployee(env);
  });
  after(() => dispose());

  it("closes forgotten shifts, drops 90-day-old selfies and expired challenges", async () => {
    await insertShift(env.DB, { id: "old", uid: "u1", workDate: "2026-10-26", masukAt: T0 - 21 * 3600_000, lat: 0, lng: 0, accuracy: 5, areaId: null, faceDistance: null, photoId: "p" });
    await insertShift(env.DB, { id: "fresh", uid: "u1", workDate: "2026-10-27", masukAt: T0 - 3600_000, lat: 0, lng: 0, accuracy: 5, areaId: null, faceDistance: null, photoId: "p" });
    await insertPhoto(env.PHOTOS, { id: "selfie-old", uid: "u1", kind: "selfie", jpeg, createdAt: T0 - 91 * DAY });
    await insertPhoto(env.PHOTOS, { id: "acuan-old", uid: "u1", kind: "acuan", jpeg, createdAt: T0 - 91 * DAY });
    await createChallenge(env.DB, { uid: "u1", purpose: "absen", kind: "masuk", nonce: "n", expiresAt: T0 - 1 });

    assert.deepEqual(await runCron(env, T0), { stale: 1, selfies: 1, challenges: 1 });
    const status = Object.fromEntries((await recentShifts(env.DB, "u1")).map((s) => [s.id, s.status]));
    assert.deepEqual(status, { old: "lupa_pulang", fresh: "terbuka" });
    assert.equal(await getPhoto(env.PHOTOS, "selfie-old"), null);
    assert.ok(await getPhoto(env.PHOTOS, "acuan-old"));
  });
});
