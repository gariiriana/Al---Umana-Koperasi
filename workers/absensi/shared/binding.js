// Challenge passkey untuk absen = hash dari nonce server + isi absen, jadi
// sidik jari menandatangani lokasi dan selfie yang persis sama dengan yang dikirim.

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function payloadChallenge({ nonce, kind, lat, lng, accuracy, selfieSha256Hex }) {
  const canonical = `${nonce}|${kind}|${lat.toFixed(7)}|${lng.toFixed(7)}|${accuracy.toFixed(1)}|${selfieSha256Hex}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return base64Url(new Uint8Array(digest));
}
