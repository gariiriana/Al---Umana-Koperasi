/**
 * Security endpoints served under /api/security/* (wired in worker.js).
 *
 * POST /api/security/app-check-token
 *   Firebase App Check custom provider. The browser solves an invisible
 *   Cloudflare Turnstile challenge and sends the token here. The token is
 *   verified with Cloudflare (`siteverify`), and then a custom token signed by
 *   the service account is exchanged for an App Check token. Firestore only
 *   serves requests carrying that token once enforcement is switched on in the
 *   Firebase console.
 *
 * POST /api/security/csp-report
 *   Receives Content-Security-Policy violation reports (legacy `report-uri`
 *   and Reporting API formats) and writes a compact summary to Worker Logs.
 *
 * Pure functions with injected dependencies, so they can be tested without
 * network access (security.test.mjs).
 */

export const APP_CHECK_AUDIENCE =
  "https://firebaseappcheck.googleapis.com/google.firebase.appcheck.v1.TokenExchangeService";
export const APP_CHECK_TTL_SECONDS = 12 * 60 * 60;
export const TURNSTILE_ACTION = "app-check";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const ALLOWED_HOSTNAMES = new Set([
  "koperasi-alumana.com",
  "www.koperasi-alumana.com",
  "al-umana-koperasi.web.app",
  "al-umana-koperasi.firebaseapp.com",
]);
const MAX_TOKEN_BODY = 4_096;
const MAX_TURNSTILE_TOKEN = 2_048;
const MAX_REPORT_BODY = 65_536;
const MAX_REPORTS_LOGGED = 10;

function json(body, status, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
}

/**
 * @param {Request} request
 * @param {Record<string, string>} env
 * @param {{ fetch: typeof fetch, signJwt: (claims: object) => Promise<string>,
 *           getAccessToken: () => Promise<string>, now: () => number }} deps
 * @param {Record<string, string>} [cors]
 */
export async function handleAppCheckToken(request, env, deps, cors = {}) {
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405, cors);

  const raw = await request.text();
  if (raw.length > MAX_TOKEN_BODY) return json({ error: "body too large" }, 413, cors);
  let turnstileToken;
  try {
    turnstileToken = JSON.parse(raw)?.turnstileToken;
  } catch {
    return json({ error: "invalid json" }, 400, cors);
  }
  if (typeof turnstileToken !== "string" || !turnstileToken || turnstileToken.length > MAX_TURNSTILE_TOKEN) {
    return json({ error: "turnstileToken required" }, 400, cors);
  }

  if (!env.TURNSTILE_APPCHECK_SECRET || !env.FIREBASE_APP_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PROJECT_ID) {
    console.error("app-check: missing configuration");
    return json({ error: "not configured" }, 503, cors);
  }

  // 1. Is the browser a human on our own site?
  const form = new URLSearchParams({ secret: env.TURNSTILE_APPCHECK_SECRET, response: turnstileToken });
  const ip = request.headers.get("cf-connecting-ip");
  if (ip) form.set("remoteip", ip);
  let verdict;
  try {
    const response = await deps.fetch(SITEVERIFY_URL, { method: "POST", body: form });
    verdict = await response.json();
  } catch (error) {
    console.error("app-check: siteverify failed", error instanceof Error ? error.message : error);
    return json({ error: "verification unavailable" }, 502, cors);
  }
  if (!verdict?.success || !ALLOWED_HOSTNAMES.has(verdict.hostname) || verdict.action !== TURNSTILE_ACTION) {
    console.warn("app-check: turnstile rejected", verdict?.["error-codes"]?.join(",") || "", verdict?.hostname || "", verdict?.action || "");
    return json({ error: "verification failed" }, 403, cors);
  }

  // 2. Mint a custom token and exchange it for an App Check token.
  const iat = Math.floor(deps.now() / 1000);
  try {
    const customToken = await deps.signJwt({
      iss: env.FIREBASE_CLIENT_EMAIL,
      sub: env.FIREBASE_CLIENT_EMAIL,
      aud: APP_CHECK_AUDIENCE,
      app_id: env.FIREBASE_APP_ID,
      iat,
      exp: iat + 300,
      ttl: `${APP_CHECK_TTL_SECONDS}s`,
    });
    const accessToken = await deps.getAccessToken();
    const url = `https://firebaseappcheck.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}`
      + `/apps/${env.FIREBASE_APP_ID}:exchangeCustomToken`;
    const response = await deps.fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ customToken }),
    });
    if (!response.ok) {
      console.error("app-check: exchange failed", response.status, (await response.text()).slice(0, 300));
      return json({ error: "token exchange failed" }, 502, cors);
    }
    const payload = await response.json();
    const ttlSeconds = Number.parseFloat(String(payload.ttl ?? "").replace(/s$/, "")) || APP_CHECK_TTL_SECONDS;
    return json({ token: payload.token, expireTimeMillis: deps.now() + Math.round(ttlSeconds * 1000) }, 200, cors);
  } catch (error) {
    console.error("app-check: exchange error", error instanceof Error ? error.message : error);
    return json({ error: "token exchange failed" }, 502, cors);
  }
}

// ---------------------------------------------------------------------------
// CSP reports
// ---------------------------------------------------------------------------

function stripQuery(value) {
  if (typeof value !== "string") return "";
  return value.split(/[?#]/)[0];
}

function pathOf(value) {
  try {
    return new URL(value).pathname;
  } catch {
    return stripQuery(value);
  }
}

/** Normalize legacy `{"csp-report": {...}}` and Reporting API `[{type, body}]` payloads. */
export function summarizeCspReports(payload) {
  const raw = Array.isArray(payload)
    ? payload.filter((r) => r?.type === "csp-violation").map((r) => r.body || {}).map((b) => ({
      directive: b.effectiveDirective || b.violatedDirective,
      blocked: b.blockedURL,
      page: b.documentURL,
      file: b.sourceFile,
      line: b.lineNumber,
    }))
    : payload?.["csp-report"]
      ? [payload["csp-report"]].map((b) => ({
        directive: b["effective-directive"] || b["violated-directive"],
        blocked: b["blocked-uri"],
        page: b["document-uri"],
        file: b["source-file"],
        line: b["line-number"],
      }))
      : [];
  return raw
    .filter((r) => !/^(chrome|moz|safari|safari-web|ms-browser)-extension:/.test(String(r.blocked || "")))
    .slice(0, MAX_REPORTS_LOGGED)
    .map((r) => ({
      directive: String(r.directive || ""),
      blocked: stripQuery(r.blocked),
      page: pathOf(r.page),
      source: r.file ? `${stripQuery(r.file)}${r.line ? `:${r.line}` : ""}` : "",
    }));
}

export async function handleCspReport(request, log = console.warn, cors = {}) {
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405, cors);
  const raw = await request.text();
  if (raw.length > MAX_REPORT_BODY) return new Response(null, { status: 413, headers: cors });
  let payload = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    // Ignore garbage; reports are best-effort.
  }
  for (const report of summarizeCspReports(payload)) {
    log("csp-violation", JSON.stringify(report));
  }
  return new Response(null, { status: 204, headers: cors });
}
