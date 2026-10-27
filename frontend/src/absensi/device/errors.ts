// Kegagalan di perangkat (izin, GPS, kamera, passkey); teksnya ada di messages.ts.
export type DeviceErrorCode =
  | "IZIN_LOKASI"
  | "GPS_TIDAK_ADA"
  | "GPS_PALSU"
  | "IZIN_KAMERA"
  | "KAMERA_TIDAK_ADA"
  | "PASSKEY_DIBATALKAN"
  | "PASSKEY_TIDAK_DIDUKUNG";

export class DeviceError extends Error {
  readonly code: DeviceErrorCode;

  constructor(code: DeviceErrorCode) {
    super(code);
    this.name = "DeviceError";
    this.code = code;
  }
}
