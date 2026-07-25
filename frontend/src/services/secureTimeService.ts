/**
 * Secure Time Service to prevent clock manipulation.
 * Synchronizes with the backend server or public Time APIs
 * and tracks elapsed time using performance.now() (monotonic clock).
 *
 * IMPORTANT: performance.now() pauses when the device sleeps or the
 * browser tab is suspended.  After waking up the elapsed value will
 * be far smaller than the wall-clock time that has actually passed,
 * causing false-positive "manipulation" alerts.  To mitigate this we:
 *   1. Re-sync every time the camera/critical UI opens (call syncSecureTime)
 *   2. Detect likely sleep gaps and auto re-sync
 *   3. Use a generous 5-minute tolerance instead of 30 seconds
 */

let timeOffset = 0; // serverTime - localTime
let timeSynced = false;
let appLoadPerformanceTime = performance.now();
let initialServerTime = Date.now();
let initialLocalTime = Date.now();
let lastSyncTimestamp = 0; // Date.now() at last successful sync

/**
 * Synchronize local clock against a trusted server source.
 * Safe to call multiple times — always resets the baseline.
 */
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
      lastSyncTimestamp = now;
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
        lastSyncTimestamp = now;
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
 *
 * If a sleep gap is detected (performance.now drift vs wall clock),
 * falls back to offset-corrected Date.now() which stays accurate
 * across sleep cycles.
 */
export function getSecureTime(): Date {
  if (!timeSynced) {
    return new Date();
  }

  // Check if device likely slept: performance.now elapsed should be
  // close to Date.now elapsed.  If it's off by > 60s, the device slept.
  const perfElapsed = performance.now() - appLoadPerformanceTime;
  const wallElapsed = Date.now() - initialLocalTime;
  const sleepGap = Math.abs(wallElapsed - perfElapsed);

  if (sleepGap > 60_000) {
    // Device slept — performance.now is stale.
    // Fall back to offset-corrected wall clock (still accurate).
    return new Date(Date.now() + timeOffset);
  }

  return new Date(initialServerTime + perfElapsed);
}

/**
 * Checks if the system time has been manipulated relative to performance.now().
 * If the user alters their device system clock after sync, Date.now() will drift from
 * expectedLocalTime (initialLocalTime + elapsed).
 *
 * KEY FIX: Detects sleep gaps and skips false-positive alerts.
 * performance.now() pauses during device sleep, so after waking up
 * the elapsed value is much smaller than the real wall-clock time.
 * This is NOT manipulation — it's expected OS behaviour on mobile.
 *
 * Threshold: 5 minutes (300s) to accommodate mobile network latency
 * and minor clock adjustments from OS NTP sync.
 */
export function isTimeManipulated(): boolean {
  if (!timeSynced) return false; // Can't determine if never synced

  const perfElapsed = performance.now() - appLoadPerformanceTime;
  const wallElapsed = Date.now() - initialLocalTime;

  // ── Sleep detection ──
  // If performance.now() is significantly behind Date.now(), the device
  // slept.  This is NOT clock manipulation.
  const sleepGap = wallElapsed - perfElapsed; // positive = device slept
  if (sleepGap > 60_000) {
    // Device clearly slept for > 1 minute.  Cannot reliably detect
    // manipulation using performance.now() — need a fresh sync.
    console.warn(
      `[SecureTime] Sleep gap detected (${Math.round(sleepGap / 1000)}s). ` +
      `Skipping manipulation check — re-sync recommended.`
    );
    return false;
  }

  // ── Normal drift detection ──
  // After ruling out sleep, check if the user moved their clock.
  const expectedLocalTime = initialLocalTime + perfElapsed;
  const actualLocalTime = Date.now();
  const postSyncDrift = Math.abs(actualLocalTime - expectedLocalTime);

  // 5 minute tolerance (was 30s, too aggressive for mobile)
  return postSyncDrift > 300_000;
}

/**
 * Returns how many milliseconds have passed since the last successful sync.
 * Returns Infinity if never synced.
 */
export function lastSyncAge(): number {
  if (!lastSyncTimestamp) return Infinity;
  return Date.now() - lastSyncTimestamp;
}

export function isSecureTimeSynced(): boolean {
  return timeSynced;
}

// Initial auto-sync trigger
if (typeof window !== "undefined") {
  void syncSecureTime();
}
