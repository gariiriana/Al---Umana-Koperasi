// Kirim satu pesan FCM "data only" ke satu HP. Service worker aplikasi (frontend/public/push-sw.js) yang
// menampilkan notifikasinya, sama seperti notifikasi KASMA JOB dari Worker al-umana-push.
import { getAccessToken, MESSAGING_SCOPE } from "./auth.js";

/** Hasil FCM → "ok", "invalid" (token mati: hapus HP-nya), atau "error" (coba lagi nanti). */
export function classifyFcm(status, body) {
  if (status >= 200 && status < 300) return "ok";
  const error = body?.error ?? {};
  const codes = (error.details ?? []).map((d) => d?.errorCode).filter(Boolean);
  if (status === 404 || codes.includes("UNREGISTERED")) return "invalid";
  if (status === 400 && /registration token/i.test(String(error.message ?? ""))) return "invalid";
  return "error";
}

export async function sendFcm(env, token, data, fetchImpl = fetch) {
  let access;
  try {
    access = await getAccessToken(env, fetchImpl, MESSAGING_SCOPE);
  } catch (err) {
    console.warn("fcm auth failed", String(err?.message ?? err));
    return "error";
  }
  const response = await fetchImpl(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/messages:send`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${access}`, "content-type": "application/json" },
      body: JSON.stringify({
        message: {
          token,
          data: Object.fromEntries(Object.entries({ ...data, sentAt: Date.now() }).map(([k, v]) => [k, String(v)])),
          // Pengingat basi tidak berguna: buang kalau HP mati lebih dari 1 jam.
          webpush: { headers: { Urgency: "high", TTL: "3600" } },
        },
      }),
    },
  ).catch(() => null);
  if (!response) return "error";
  let body = null;
  if (!response.ok) body = await response.json().catch(() => null);
  const outcome = classifyFcm(response.status, body);
  if (outcome !== "ok") console.warn("fcm send failed", outcome, response.status, body?.error?.status ?? "");
  return outcome;
}
