// Lambang Al-Umanaa tanpa teks untuk kop rekap (teks yayasan sudah ditulis di kop).
export const LOGO_PATH = "/logo-mark.png";

export async function loadLogoBytes(): Promise<Uint8Array | null> {
  try {
    const response = await fetch(LOGO_PATH);
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}

export function bytesToDataUrl(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:image/png;base64,${btoa(binary)}`;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
