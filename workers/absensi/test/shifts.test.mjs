import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideAbsen, shiftStatus, toShiftView } from "../src/shifts.js";

// Milliseconds for a wall-clock time in WIB (UTC+7).
const wib = (y, m, d, h, min) => Date.UTC(y, m - 1, d, h - 7, min);
const row = (o) => ({
  id: "s1", uid: "u", work_date: "2026-10-26", masuk_at: wib(2026, 10, 26, 22, 0),
  pulang_at: null, status: "terbuka", ...o,
});

describe("shift rules", () => {
  it("night shift: open after midnight can clock out, not clock in", () => {
    const now = wib(2026, 10, 27, 6, 0);
    const s = shiftStatus([row()], now);
    assert.equal(s.open.workDate, "2026-10-26");
    assert.equal(s.today, null);
    assert.deepEqual(decideAbsen("pulang", s, now), { ok: true, action: "close", shiftId: "s1" });
    assert.equal(decideAbsen("masuk", s, now).code, "SUDAH_CLOCK_IN");
  });

  it("open shift from 2 days ago reads as lupa_pulang before cron ran", () => {
    const pagi = row({ masuk_at: wib(2026, 10, 26, 7, 0) });
    const now = wib(2026, 10, 28, 0, 0);
    const s = shiftStatus([pagi], now);
    assert.equal(s.open, null);
    assert.equal(s.last.status, "lupa_pulang");
    assert.equal(decideAbsen("pulang", s, now).code, "BELUM_CLOCK_IN");
    assert.equal(decideAbsen("masuk", s, now).action, "insert");
  });

  it("open shift can still clock out until 23:59 the next day", () => {
    const pagi = row({ masuk_at: wib(2026, 10, 26, 7, 0) });
    const now = wib(2026, 10, 27, 23, 59);
    const s = shiftStatus([pagi], now);
    assert.equal(decideAbsen("pulang", s, now).action, "close");
    assert.equal(decideAbsen("masuk", s, now).code, "SUDAH_CLOCK_IN");
  });

  it("one clock in per WIB date", () => {
    const done = row({ work_date: "2026-10-27", masuk_at: wib(2026, 10, 27, 7, 2), pulang_at: wib(2026, 10, 27, 16, 5), status: "selesai" });
    const s = shiftStatus([done], wib(2026, 10, 27, 18, 0));
    assert.equal(s.today.durationMin, 543);
    assert.equal(s.last.id, "s1");
    assert.equal(decideAbsen("masuk", s, wib(2026, 10, 27, 18, 0)).code, "SUDAH_CLOCK_IN_HARI_INI");
    const tomorrow = wib(2026, 10, 28, 7, 0);
    assert.deepEqual(decideAbsen("masuk", shiftStatus([done], tomorrow), tomorrow), { ok: true, action: "insert", workDate: "2026-10-28" });
  });

  it("toShiftView maps columns and leaves duration empty while open", () => {
    assert.deepEqual(toShiftView(row(), wib(2026, 10, 27, 1, 0)), {
      id: "s1", workDate: "2026-10-26", masukAt: wib(2026, 10, 26, 22, 0), pulangAt: null, status: "terbuka", durationMin: null,
      lateReason: null,
      latePhotoId: null,
      zoneMasuk: null,
      zonePulang: null,
      silahMasuk: null,
      lateOut: null,
    });
  });

  describe("late clock out (clock out telat)", () => {
    const masuk = wib(2026, 10, 26, 7, 0);
    const pulang = wib(2026, 10, 27, 7, 0);
    const closed = (status) => row({
      masuk_at: masuk, pulang_at: pulang, status: "selesai",
      late_out_id: "lx1", late_out_status: status, late_out_reason: "Lupa pencet", late_out_at: pulang,
    });
    const now = wib(2026, 10, 27, 9, 0);

    for (const status of ["pending", "approved"]) {
      it(`${status}: keeps the real clock-out time and counts the full duration`, () => {
        const view = toShiftView(closed(status), now);
        assert.equal(view.status, "selesai");
        assert.equal(view.pulangAt, pulang);
        assert.equal(view.durationMin, 1440);
        assert.deepEqual(view.lateOut, { id: "lx1", status, reason: "Lupa pencet", at: pulang });
      });
    }

    it("rejected: reads as tidak clock out without duration, raw time only in lateOut.at", () => {
      const view = toShiftView(closed("rejected"), now);
      assert.equal(view.status, "lupa_pulang");
      assert.equal(view.pulangAt, null);
      assert.equal(view.durationMin, null);
      assert.equal(view.lateOut.at, pulang);
      assert.equal(view.lateOut.status, "rejected");
    });
  });
});
