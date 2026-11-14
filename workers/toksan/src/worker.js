/**
 * al-umana-toksan: penjualan Toko Santri di koperasi-alumana.com/api/toksan/*.
 * Semua data di D1 (DB = "toksan"); Firestore hanya dibaca untuk role users/{uid}.
 * Lihat docs/superpowers/specs/2026-11-14-toksan-design.md.
 */
import { verifyIdToken } from "./auth.js";
import { ToksanError, corsHeaders, errorResponse, json } from "./http.js";
import { getUserProfile } from "./profile.js";
import { requireStaff } from "./session.js";
import { createProduk, listProduk, patchProduk } from "./handlers/produk.js";

const PREFIX = "/api/toksan";

const getMe = (ctx) => requireStaff(ctx);

const ROUTES = [
  ["GET", /^\/me$/, getMe],
  ["GET", /^\/produk$/, listProduk],
  ["POST", /^\/produk$/, createProduk],
  ["PATCH", /^\/produk\/([\w-]{1,64})$/, patchProduk],
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
    if (!match) throw new ToksanError("NOT_FOUND", 404);

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
    getUserProfile: (uid) => getUserProfile(env, uid),
    now: () => Date.now(),
  };
}

export default {
  fetch(request, env) {
    return handleRequest(request, env, realDeps(env));
  },
};
