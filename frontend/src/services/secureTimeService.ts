/**
 * Secure Time Service to prevent clock manipulation.
 * Synchronizes with the backend server or public Time APIs
 * and tracks elapsed time using performance.now() (monotonic clock).
 */

let timeOffset = 0; // serverTime - localTime
let timeSynced = false;
let appLoadPerformanceTime = performance.now();
let initialServerTime = Date.now();
let initialLocalTime = Date.now();

export async function syncSecureTime(): Promise<number> {
  try {
    const isBrowser =
      typeof window !== "undefined" &&
      window.location &&
      window.location.origin &&
      !window.location.origin.startsWith("null") &&
      !window.location.origin.includes("about:");

    if (!isBrowser) {
      throw new Error("Non-browser environment detected, skipping local sync");
    }

    const start = performance.now();
    // Fetch from backend healthz endpoint using absolute URL
    const res = await fetch(`${window.location.origin}/healthz`, { method: "HEAD" });
    const end = performance.now();
    const rtt = end - start;

    const dateStr = res.headers.get("date") || res.headers.get("Date");
    if (dateStr) {
      const now = Date.now();
      const serverTime = new Date(dateStr).getTime() + rtt / 2;
      timeOffset = serverTime - now;
      initialServerTime = serverTime;
      initialLocalTime = now;
      appLoadPerformanceTime = performance.now();
      timeSynced = true;
      console.log(`[SecureTime] Synced with backend. Offset: ${timeOffset}ms, RTT: ${rtt}ms`);
      return serverTime;
    }
  } catch (err) {
    console.warn("[SecureTime] Failed to sync with backend. Trying public timezone API...", err);
    try {
      const start = performance.now();
      // Failover to a public time API
      const res = await fetch("https://worldtimeapi.org/api/timezone/Asia/Jakarta");
      const data = await res.json();
      const end = performance.now();
      const rtt = end - start;
      if (data && data.datetime) {
        const now = Date.now();
        const serverTime = new Date(data.datetime).getTime() + rtt / 2;
        timeOffset = serverTime - now;
        initialServerTime = serverTime;
        initialLocalTime = now;
        appLoadPerformanceTime = performance.now();
        timeSynced = true;
        console.log(`[SecureTime] Synced with WorldTimeAPI. Offset: ${timeOffset}ms`);
        return serverTime;
      }
    } catch (err2) {
      console.error("[SecureTime] All secure time sync attempts failed. Falling back to local clock.", err2);
    }
  }
  return Date.now();
}

/**
 * Returns a secure Date object that is immune to system clock changes
 * made after the app loaded/synced.
 */
export function getSecureTime(): Date {
  if (!timeSynced) {
    return new Date();
  }
  const elapsed = performance.now() - appLoadPerformanceTime;
  return new Date(initialServerTime + elapsed);
}

/**
 * Checks if the system time has been manipulated relative to performance.now().
 * If the user alters their device system clock after sync, Date.now() will drift from
 * expectedLocalTime (initialLocalTime + elapsed).
 */
export function isTimeManipulated(): boolean {
  if (!timeSynced) return false; // Can't determine if never synced
  const elapsed = performance.now() - appLoadPerformanceTime;
  const expectedLocalTime = initialLocalTime + elapsed;
  const actualLocalTime = Date.now();

  // If local device clock shifted by > 30 seconds since sync took place
  const postSyncDrift = Math.abs(actualLocalTime - expectedLocalTime);
  return postSyncDrift > 30_000;
}

export function isSecureTimeSynced(): boolean {
  return timeSynced;
}

// Initial auto-sync trigger
if (typeof window !== "undefined") {
  void syncSecureTime();
}
