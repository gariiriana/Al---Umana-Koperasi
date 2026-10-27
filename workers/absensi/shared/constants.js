// Satu sumber angka aturan absensi, dipakai Worker dan frontend
// (lihat docs/superpowers/specs/2026-10-27-absensi-design.md).

export const DEFAULT_TOLERANCE_M = 15;
export const MAX_TOLERANCE_M = 50;

export const MAX_ACCURACY_M = 50;
export const GOOD_ACCURACY_M = 15;
export const GPS_SAMPLE_MS = 10_000;

export const CHALLENGE_TTL_MS = 120_000;
export const OPEN_SHIFT_MAX_MS = 20 * 3600_000;

export const SELFIE_RETENTION_MS = 90 * 86_400_000;
export const MAX_SELFIE_BYTES = 200_000;
export const MIN_SELFIE_BYTES = 1_000;
export const SELFIE_WIDTH_PX = 480;
export const SELFIE_JPEG_QUALITY = 0.7;
export const FACE_MATCH_THRESHOLD = 0.55;

export const REKAP_MAX_DAYS = 366;
export const MIN_PASSWORD_LENGTH = 8;
