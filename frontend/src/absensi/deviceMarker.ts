// Penanda lokal bahwa HP ini sudah aktivasi untuk akun `uid`. Hanya untuk banner Beranda:
// passkey tetap diverifikasi Worker, jadi penanda yang hilang tidak memblokir absen.

export const deviceMarkerKey = (uid: string) => `absensi:device:${uid}`;

export function setDeviceMarker(uid: string): void {
  try {
    localStorage.setItem(deviceMarkerKey(uid), "1");
  } catch {
    // Penyimpanan diblokir (mode privat); aktivasi tetap sah tanpa penanda.
  }
}

/** null kalau penyimpanan tidak bisa dibaca (jangan tampilkan banner dalam kasus itu). */
export function hasDeviceMarker(uid: string): boolean | null {
  try {
    return localStorage.getItem(deviceMarkerKey(uid)) === "1";
  } catch {
    return null;
  }
}
