/**
 * al-umana-absensi: clock in/out karyawan di koperasi-alumana.com/api/absensi/*.
 * Semua data di D1 (DB = "absensi", PHOTOS = "absensi_foto"); tidak pernah menyentuh Firestore.
 * Lihat docs/superpowers/specs/2026-10-27-absensi-design.md.
 */
import { verifyIdToken } from "./auth.js";
import { AbsensiError, corsHeaders, errorResponse, json } from "./http.js";
import { createAuthUser, setAuthDisabled, setClaims } from "./identity.js";
import { absen, absenOptions, activate, activateOptions, getMe, getRiwayat } from "./handlers/karyawan.js";
import { registrationOptions, verifyAuthentication, verifyRegistration } from "./passkey.js";

const PREFIX = "/api/absensi";

const ROUTES = [
  ["GET", /^\/me$/, getMe],
  ["GET", /^\/riwayat$/, getRiwayat],
  ["POST", /^\/activate\/options$/, activateOptions],
  ["POST", /^\/activate$/, activate],
  ["POST", /^\/absen\/options$/, absenOptions],
  ["POST", /^\/absen$/, absen],
];

export async function handleRequest(request, env, deps) {
  const url = new URL(request.url);
  const cors = corsHeaders(request, env);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  try {
    const path = url.pathname.startsWith(PREFIX) ? url.pathname.slice(PREFIX.length) : null;
    const match = path === null ? null : ROUTES
      .map(([method, pattern, handler]) => ({ method, handler, params: pattern.exec(path) }))
      .find((route) => route.params && route.method === request.method);
    if (!match) throw new AbsensiError("NOT_FOUND", 404);

    const result = await match.handler({ request, env, deps, url, params: match.params.slice(1) });
    if (result instanceof Response) {
      for (const [key, value] of Object.entries(cors)) result.headers.set(key, value);
      return result;
    }
    return json(result, 200, cors);
  } catch (err) {
    return errorResponse(err, cors);
  }
}

export function realDeps(env) {
  return {
    verifyToken: (token) => verifyIdToken(token, env),
    now: () => Date.now(),
    webauthn: { registrationOptions, verifyRegistration, verifyAuthentication },
    identity: {
      createAuthUser: (input) => createAuthUser(env, input),
      setClaims: (uid, claims) => setClaims(env, uid, claims),
      setAuthDisabled: (uid, disabled) => setAuthDisabled(env, uid, disabled),
    },
    country: (request) => request.cf?.country ?? null,
  };
}

export default {
  fetch(request, env) {
    return handleRequest(request, env, realDeps(env));
  },
};
