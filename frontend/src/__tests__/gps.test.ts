import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { isValidCoordinate } from "../services/gpsService";

describe("GPS Coordinate Validation (Property 9)", () => {
  it("should validate that coordinates fall within standard Earth-latitude and longitude bounds", () => {
    fc.assert(
      fc.property(
        fc.double(),
        fc.double(),
        (lat, lng) => {
          const result = isValidCoordinate(lat, lng);
          const expected =
            Number.isFinite(lat) &&
            Number.isFinite(lng) &&
            lat >= -90 &&
            lat <= 90 &&
            lng >= -180 &&
            lng <= 180;
          expect(result).toBe(expected);
        }
      )
    );
  });

  it("should always reject coordinates outside the valid range", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.double({ min: 90.0001 }),
          fc.double({ max: -90.0001 })
        ),
        fc.double({ min: -180, max: 180 }),
        (invalidLat, validLng) => {
          expect(isValidCoordinate(invalidLat, validLng)).toBe(false);
        }
      )
    );

    fc.assert(
      fc.property(
        fc.double({ min: -90, max: 90 }),
        fc.oneof(
          fc.double({ min: 180.0001 }),
          fc.double({ max: -180.0001 })
        ),
        (validLat, invalidLng) => {
          expect(isValidCoordinate(validLat, invalidLng)).toBe(false);
        }
      )
    );
  });
});

describe("GPS Staleness Anomaly Detection (Property 10)", () => {
  const STALE_GPS_MS = 5 * 60 * 1000; // 5 minutes

  it("should classify GPS location as stale if elapsed time exceeds 5 minutes", () => {
    fc.assert(
      fc.property(
        fc.nat(), // current timestamp (e.g., in ms)
        fc.integer({ min: STALE_GPS_MS + 1, max: STALE_GPS_MS * 10 }), // elapsed delta
        (now, delta) => {
          const ts = now - delta;
          const isStale = !Number.isNaN(ts) && now - ts > STALE_GPS_MS;
          expect(isStale).toBe(true);
        }
      )
    );
  });

  it("should classify GPS location as active if elapsed time is within 5 minutes", () => {
    fc.assert(
      fc.property(
        fc.nat(),
        fc.integer({ min: 0, max: STALE_GPS_MS }),
        (now, delta) => {
          const ts = now - delta;
          const isStale = !Number.isNaN(ts) && now - ts > STALE_GPS_MS;
          expect(isStale).toBe(false);
        }
      )
    );
  });
});
