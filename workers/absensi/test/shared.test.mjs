import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDays, isLateClockIn, isLateClockOut, isShiftExpired, minuteOfDayWIB, workDateWIB } from "../shared/time.js";
import { checkLocation, distanceToPolygonM, pointInPolygon } from "../shared/geo.js";
import { payloadChallenge, sha256Hex } from "../shared/binding.js";

const PIN = { lat: -6.9735229, lng: 106.8651559 };
const square = (c, d) => [
  { lat: c.lat - d, lng: c.lng - d },
  { lat: c.lat + d, lng: c.lng - d },
  { lat: c.lat + d, lng: c.lng + d },
  { lat: c.lat - d, lng: c.lng + d },
];
const SQ = square(PIN, 0.0001);
const FAR = square({ lat: PIN.lat + 0.01, lng: PIN.lng }, 0.0001);
// A point `m` metres north of the square's north edge.
const north = (m) => ({ lat: PIN.lat + 0.0001 + m / 110540, lng: PIN.lng });

describe("time", () => {
  it("workDateWIB flips at 00:00 WIB", () => {
    assert.equal(workDateWIB(Date.UTC(2026, 9, 26, 16, 59)), "2026-10-26");
    assert.equal(workDateWIB(Date.UTC(2026, 9, 26, 17, 0)), "2026-10-27");
  });
  it("addDays crosses month ends", () => {
    assert.equal(addDays("2026-10-31", 1), "2026-11-01");
    assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  });
  it("minuteOfDayWIB counts minutes since 00:00 WIB", () => {
    assert.equal(minuteOfDayWIB(Date.UTC(2026, 9, 26, 17, 0)), 0);
    assert.equal(minuteOfDayWIB(Date.UTC(2026, 9, 27, 1, 5)), 8 * 60 + 5);
  });
  it("isLateClockIn: 08:00 still on time, 08:01 onward late, early morning not late", () => {
    assert.equal(isLateClockIn(Date.UTC(2026, 9, 27, 0, 59)), false); // 07:59 WIB
    assert.equal(isLateClockIn(Date.UTC(2026, 9, 27, 1, 0, 59)), false); // 08:00:59 WIB
    assert.equal(isLateClockIn(Date.UTC(2026, 9, 27, 1, 1)), true); // 08:01 WIB
    assert.equal(isLateClockIn(Date.UTC(2026, 9, 27, 12, 0)), true); // 19:00 WIB
    assert.equal(isLateClockIn(Date.UTC(2026, 9, 26, 20, 0)), false); // 03:00 WIB
  });
});

describe("geo", () => {
  it("pointInPolygon and distanceToPolygonM", () => {
    assert.equal(pointInPolygon(PIN, SQ), true);
    assert.equal(pointInPolygon(north(5), SQ), false);
    assert.equal(distanceToPolygonM(PIN, SQ), 0);
    assert.ok(Math.abs(distanceToPolygonM(north(10), SQ) - 10) < 0.5);
  });

  it("checkLocation", () => {
    const A = [{ id: "a", name: "SPPG", polygon: SQ, toleranceM: 15, active: true }];
    assert.deepEqual(checkLocation({ ...PIN, accuracy: 10 }, A), { ok: true, areaId: "a", distanceM: 0 });
    assert.equal(checkLocation({ ...PIN, accuracy: 86 }, A).ok, true); // indoor WiFi/A-GPS inside polygon
    assert.equal(checkLocation({ ...north(10), accuracy: 12 }, A).ok, true); // min(12,15) >= 10
    const r = checkLocation({ ...north(10), accuracy: 5 }, A); // min(5,15) < 10
    assert.equal(r.code, "DI_LUAR_AREA");
    assert.ok(Math.abs(r.distanceM - 10) < 0.5);
    assert.equal(checkLocation({ ...north(20), accuracy: 86 }, A).code, "DI_LUAR_AREA"); // still capped at toleranceM=15
    assert.equal(checkLocation({ ...PIN, accuracy: 301 }, A).code, "GPS_LEMAH");
    assert.equal(checkLocation({ ...PIN, accuracy: 0 }, A).code, "GPS_LEMAH");
    assert.equal(checkLocation({ ...PIN, accuracy: 10 }, [{ ...A[0], active: false }]).code, "AREA_BELUM_ADA");
    assert.equal(checkLocation({ ...PIN, accuracy: 10 }, [{ ...A[0], id: "far", polygon: FAR }, A[0]]).areaId, "a");
  });
});

describe("binding", () => {
  it("sha256Hex hashes bytes", async () => {
    assert.equal(await sha256Hex(new TextEncoder().encode("abc")),
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("payloadChallenge is deterministic and covers every field", async () => {
    const base = { nonce: "n1", kind: "masuk", lat: -6.9735229, lng: 106.8651559, accuracy: 9.5, selfieSha256Hex: "ab".repeat(32) };
    const c = await payloadChallenge(base);
    assert.match(c, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(await payloadChallenge({ ...base }), c);
    for (const change of [{ kind: "pulang" }, { lat: base.lat + 1e-7 }, { accuracy: 9.6 }, { selfieSha256Hex: "cd".repeat(32) }, { nonce: "n2" }]) {
      assert.notEqual(await payloadChallenge({ ...base, ...change }), c);
    }
  });
});

describe("clock-out rules", () => {
  const wib = (y, m, d, h, min) => Date.UTC(y, m - 1, d, h - 7, min);

  it("a shift can be closed until 23:59 WIB the next day", () => {
    assert.equal(isShiftExpired("2026-12-01", wib(2026, 12, 2, 23, 59)), false);
    assert.equal(isShiftExpired("2026-12-01", wib(2026, 12, 3, 0, 0)), true);
  });

  it("normal shift: clock out is late once the day has changed", () => {
    const masuk = wib(2026, 12, 1, 7, 0);
    assert.equal(isLateClockOut(masuk, wib(2026, 12, 1, 23, 59)), false);
    assert.equal(isLateClockOut(masuk, wib(2026, 12, 2, 0, 1)), true);
  });

  it("night shift (clock in from 20:00): late only after 12:00 the next day", () => {
    const masuk = wib(2026, 12, 1, 23, 0);
    assert.equal(isLateClockOut(masuk, wib(2026, 12, 2, 7, 0)), false);
    assert.equal(isLateClockOut(masuk, wib(2026, 12, 2, 12, 0)), false);
    assert.equal(isLateClockOut(masuk, wib(2026, 12, 2, 12, 1)), true);
  });

  it("20:00 is the first night-shift minute", () => {
    assert.equal(isLateClockOut(wib(2026, 12, 1, 20, 0), wib(2026, 12, 2, 6, 0)), false);
    assert.equal(isLateClockOut(wib(2026, 12, 1, 19, 59), wib(2026, 12, 2, 6, 0)), true);
  });
});
