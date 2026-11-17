/**
 * Request limits with the Workers Rate Limiting binding (`[[ratelimits]]` in
 * wrangler.toml). They keep one caller from burning the Firestore free quota
 * or flooding the endpoints.
 *
 * A missing binding (local runs, tests) or a failing limiter never blocks
 * real traffic: the limit is a brake, not a lock.
 */

/** True when `key` may go on. `limiter` is a Rate Limiting binding or undefined. */
export async function withinLimit(limiter, key) {
  if (!limiter || !key) return true;
  try {
    return (await limiter.limit({ key })).success !== false;
  } catch {
    return true;
  }
}

export function tooManyRequests(cors = {}) {
  return new Response(JSON.stringify({
    error: { code: "RATE_LIMITED", message: "Terlalu banyak permintaan. Coba lagi sebentar." },
  }), {
    status: 429,
    headers: { "content-type": "application/json", "cache-control": "no-store", "retry-after": "60", ...cors },
  });
}
