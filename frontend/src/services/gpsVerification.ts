/**
 * GPS Verification Service to detect Fake GPS / Spoofed location on the web.
 */

export interface GpsCheckResult {
  isValid: boolean;
  isMocked: boolean;
  reason?: string;
}

/**
 * Checks if the given coordinates and accuracy are suspiciously spoofed.
 */
export function verifyGpsLocation(
  lat: number,
  lng: number,
  accuracy: number
): GpsCheckResult {
  // 1. Check for exactly 0,0 coordinates
  if (lat === 0 && lng === 0) {
    return {
      isValid: false,
      isMocked: true,
      reason: "Koordinat GPS tidak valid (0,0).",
    };
  }

  // 2. Check for negative or exactly zero accuracy
  if (accuracy <= 0) {
    return {
      isValid: false,
      isMocked: true,
      reason: "Akurasi GPS tidak valid.",
    };
  }

  // 3. Browser automation flag (common in spoofing/bot scripts)
  if (typeof navigator !== "undefined" && navigator.webdriver) {
    return {
      isValid: false,
      isMocked: true,
      reason: "Browser terdeteksi di bawah kendali otomatis.",
    };
  }

  // 4. Default Chrome DevTools mock location accuracy is exactly 150 meters.
  // Although 150m is a possible real accuracy, if it's EXACTLY 150.00000000...
  // combined with developer settings, it's highly suspicious. We warn or flag.
  if (accuracy === 150) {
    console.warn("[GPS] Suspicious accuracy of exactly 150m (common in DevTools spoofing).");
  }

  // 5. Timezone verification:
  // If coordinates place the user in Indonesia, verify that the browser timezone matches.
  // Indonesia is roughly: Latitude [-11.0, 6.0], Longitude [95.0, 141.0]
  const isInIndonesia = lat >= -11.0 && lat <= 6.0 && lng >= 95.0 && lng <= 141.0;
  if (isInIndonesia) {
    const timezoneOffset = new Date().getTimezoneOffset(); // returns minutes from UTC
    // Indonesia timezones:
    // WIB (UTC+7): -420 minutes
    // WITA (UTC+8): -480 minutes
    // WIT (UTC+9): -540 minutes
    const validOffsets = [-420, -480, -540];
    if (!validOffsets.includes(timezoneOffset)) {
      return {
        isValid: false,
        isMocked: true,
        reason: `Mismatched Timezone: Lokasi di Indonesia, tetapi zona waktu perangkat Anda UTC${timezoneOffset < 0 ? "+" : "-"}${Math.abs(timezoneOffset / 60)}. Silakan ubah zona waktu perangkat Anda ke WIB/WITA/WIT.`,
      };
    }
  }

  return {
    isValid: true,
    isMocked: false,
  };
}
