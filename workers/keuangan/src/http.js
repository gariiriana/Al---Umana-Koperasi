// HTTP helpers untuk Worker Keuangan. Format error: { error: { code, message, details } }.

export class KeuanganError extends Error {
  constructor(code, status, message = code, details = undefined) {
    super(message || code);
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
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "access-control-max-age": "600",
    vary: "Origin",
  };
}

export function errorResponse(err, cors = {}) {
  if (err instanceof KeuanganError) {
    return json(
      { error: { code: err.code, message: err.message || err.code, details: err.details } },
      err.status,
      cors,
    );
  }
  console.error("keuangan worker error", err);
  return json({ error: { code: "INTERNAL", message: "Terjadi kesalahan sistem." } }, 500, cors);
}

export async function readJson(request, maxBytes = 1_000_000) {
  const text = await request.text();
  if (text.length > maxBytes) throw new KeuanganError("VALIDATION_ERROR", 400, "Payload terlalu besar.");
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new KeuanganError("VALIDATION_ERROR", 400, "Format JSON tidak valid.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new KeuanganError("VALIDATION_ERROR", 400, "Payload harus berupa objek JSON.");
  }
  return body;
}
