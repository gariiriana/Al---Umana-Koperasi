// HTTP helpers for the toksan Worker. Every error leaves as {error: {code, message, details}}.

export class ToksanError extends Error {
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
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "access-control-max-age": "600",
    vary: "Origin",
  };
}

export function errorResponse(err, cors = {}) {
  if (err instanceof ToksanError) {
    return json({ error: { code: err.code, message: err.code, details: err.details } }, err.status, cors);
  }
  console.error("toksan worker error", err);
  return json({ error: { code: "INTERNAL", message: "INTERNAL" } }, 500, cors);
}

export async function readJson(request, maxBytes = 200_000) {
  const text = await request.text();
  if (text.length > maxBytes) throw new ToksanError("VALIDATION_ERROR", 400);
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ToksanError("VALIDATION_ERROR", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ToksanError("VALIDATION_ERROR", 400);
  return body;
}
