// HTTP helpers for the absensi Worker. Every error leaves as {error: {code, message, details}}.
import { MAX_SELFIE_BYTES, MIN_SELFIE_BYTES } from "../shared/constants.js";

export class AbsensiError extends Error {
  constructor(code, status, details = undefined) {
    super(code);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

export function corsHeaders(request, env) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== env.ALLOWED_ORIGIN) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, PUT, PATCH, OPTIONS",
    "access-control-max-age": "600",
    vary: "Origin",
  };
}

export function errorResponse(err, cors = {}) {
  if (err instanceof AbsensiError) {
    return json({ error: { code: err.code, message: err.code, details: err.details } }, err.status, cors);
  }
  console.error("absensi worker error", err);
  return json({ error: { code: "INTERNAL", message: "INTERNAL" } }, 500, cors);
}

export async function readJson(request, maxBytes = 400_000) {
  const text = await request.text();
  if (text.length > maxBytes) throw new AbsensiError("VALIDATION_ERROR", 400);
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new AbsensiError("VALIDATION_ERROR", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new AbsensiError("VALIDATION_ERROR", 400);
  return body;
}

/** Base64 JPEG from the phone → bytes; anything else is SELFIE_TIDAK_VALID. */
export function decodeJpeg(base64) {
  let bytes;
  try {
    bytes = Uint8Array.from(atob(String(base64 || "")), (c) => c.charCodeAt(0));
  } catch {
    throw new AbsensiError("SELFIE_TIDAK_VALID", 400);
  }
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!isJpeg || bytes.length < MIN_SELFIE_BYTES || bytes.length > MAX_SELFIE_BYTES) {
    throw new AbsensiError("SELFIE_TIDAK_VALID", 400);
  }
  return bytes;
}
