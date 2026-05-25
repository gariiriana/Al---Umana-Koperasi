/**
 * GPS tracking service for couriers.
 *
 * Wraps the browser Geolocation API and writes valid coordinates directly
 * to Firestore at `courier_locations/{orderId}_{courierId}`. Each write is
 * also appended to the `location_history` subcollection so the full track
 * is preserved.
 *
 * Coordinate validation enforces the latitude / longitude bounds defined
 * in Requirement 5.5:
 *   - latitude:  [-90, 90]
 *   - longitude: [-180, 180]
 * Out-of-range values are silently discarded.
 */

import {
  doc,
  setDoc,
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

/** Coordinate bound constants per Requirement 5.5. */
export const MIN_LATITUDE = -90;
export const MAX_LATITUDE = 90;
export const MIN_LONGITUDE = -180;
export const MAX_LONGITUDE = 180;

/** Default tracking interval (seconds). 30s is the upper bound from Req 5.1. */
export const DEFAULT_INTERVAL_SECONDS = 30;

export interface TrackerOptions {
  orderId: string;
  courierId: string;
  /** Polling interval in seconds. Defaults to 30. Must be > 0. */
  intervalSeconds?: number;
  /** Optional callback fired after every successful Firestore write. */
  onWrite?: (latitude: number, longitude: number) => void;
  /** Optional callback fired on geolocation / Firestore errors. */
  onError?: (err: Error) => void;
}

export interface Tracker {
  stop: () => void;
}

/** Return true iff lat/lng fall within the valid Earth-coordinate ranges. */
export function isValidCoordinate(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= MIN_LATITUDE &&
    lat <= MAX_LATITUDE &&
    lng >= MIN_LONGITUDE &&
    lng <= MAX_LONGITUDE
  );
}

/** Promise-friendly wrapper around `navigator.geolocation.getCurrentPosition`. */
function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation API not available in this environment"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      maximumAge: 5_000,
      timeout: 15_000,
    });
  });
}

/**
 * Write a single GPS coordinate to Firestore. Invalid coordinates are
 * silently ignored to satisfy Req 5.5 ("discard the coordinate without
 * writing a record"). Returns true when a write was performed.
 */
export async function writeCoordinate(
  orderId: string,
  courierId: string,
  latitude: number,
  longitude: number
): Promise<boolean> {
  if (!orderId || !courierId) return false;
  if (!isValidCoordinate(latitude, longitude)) return false;

  const docId = `${orderId}_${courierId}`;
  const payload = {
    orderId,
    courierId,
    latitude,
    longitude,
    timestamp: serverTimestamp(),
  };

  await setDoc(doc(db, "courier_locations", docId), payload);
  await addDoc(
    collection(db, "courier_locations", docId, "location_history"),
    payload
  );
  return true;
}

/**
 * Start a tracker that polls the device's position every
 * `intervalSeconds` seconds and writes valid samples to Firestore.
 * Call `tracker.stop()` to halt polling.
 *
 * The tracker writes the first sample immediately on start so the
 * dashboard reflects the courier's current location without a delay.
 */
export function startTracker(opts: TrackerOptions): Tracker {
  const interval = Math.max(1, opts.intervalSeconds ?? DEFAULT_INTERVAL_SECONDS);
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const tick = async () => {
    if (stopped) return;
    try {
      const pos = await getCurrentPosition();
      const { latitude, longitude } = pos.coords;
      const wrote = await writeCoordinate(
        opts.orderId,
        opts.courierId,
        latitude,
        longitude
      );
      if (wrote) opts.onWrite?.(latitude, longitude);
    } catch (err) {
      opts.onError?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (!stopped) {
        timer = setTimeout(tick, interval * 1_000);
      }
    }
  };

  // Kick off immediately, then schedule subsequent ticks.
  void tick();

  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
