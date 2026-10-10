/**
 * Pure logic for the push Worker (no network) — unit tested in logic.test.mjs.
 */

/**
 * Recipient role → device roles that should receive it. Mirrors the role
 * aliases used by the app: canonicalJobDeskRole() in firestore.rules /
 * flowNotifications.ts, and the legacy order roles (tim_produksi, distribusi).
 */
export const ROLE_ALIASES = {
  admin: ["admin"],
  super_admin: ["super_admin"],
  developer: ["developer"],
  monitoring: ["monitoring"],
  // Pesanan katering (orderService) memakai role lama.
  tim_produksi: ["tim_produksi", "produksi_1"],
  distribusi: ["distribusi", "distribusi_1"],
  kurir: ["kurir", "kurir_katering"],
  // Job desk: role kanonik → semua role yang melihat job desk itu.
  produksi_1: ["produksi_1", "tim_produksi", "MBG2", "mbg2", "produksi_mbg_2"],
  distribusi_1: ["distribusi_1", "distribusi", "distribusi_mbg"],
  produksi_2: ["produksi_2", "produksi_mbg"],
  distribusi_2: ["distribusi_2", "distribusi_mbg_2"],
  mo_katering: ["mo_katering"],
  co_mo_katering: ["co_mo_katering"],
  // MBG
  admin_mbg: ["admin_mbg"],
  produksi_mbg: ["produksi_mbg", "MBG2", "mbg2", "produksi_mbg_2", "dokumentasi_produksiMBG"],
  distribusi_mbg: ["distribusi_mbg", "distribusi_mbg_2"],
  kurir_mbg: ["kurir_mbg"],
  pelanggan: ["pelanggan"],
  customer: ["customer"],
};

/** @returns {{kind: "role", roles: string[]} | {kind: "uid", uid: string}} */
export function resolveRecipient(recipientId) {
  const roles = ROLE_ALIASES[recipientId];
  return roles ? { kind: "role", roles } : { kind: "uid", uid: recipientId };
}

export const MAX_AGE_MS = 12 * 60 * 60 * 1000;
export const STALE_CLAIM_MS = 3 * 60 * 1000;
export const MAX_ATTEMPTS = 3;

export function decodeValue(value) {
  if (!value || typeof value !== "object") return null;
  if ("nullValue" in value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decodeValue);
  if ("mapValue" in value) {
    return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([k, v]) => [k, decodeValue(v)]));
  }
  return null;
}

export function encodeValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encodeValue(v)])) } };
}

/** Firestore REST document → plain notification object. */
export function toNotification(document) {
  const fields = Object.fromEntries(Object.entries(document.fields || {}).map(([k, v]) => [k, decodeValue(v)]));
  return { ...fields, id: document.name.split("/").pop(), name: document.name, updateTime: document.updateTime };
}

/**
 * Split queried notifications into those to send now and those too old to
 * send (e.g. the Worker was down for a day — don't blast stale news).
 */
export function selectCandidates(notifications, nowMs) {
  const ready = [];
  const expired = [];
  for (const n of notifications) {
    const created = Date.parse(n.createdAt || "") || 0;
    if (n.pushStatus === "sending") {
      const claimed = Date.parse(n.pushClaimedAt || "") || 0;
      if (nowMs - claimed < STALE_CLAIM_MS) continue; // another run is sending it
    } else if (n.pushStatus !== "pending") {
      continue;
    }
    if (!n.recipientId || (created && nowMs - created > MAX_AGE_MS)) expired.push(n);
    else ready.push(n);
  }
  ready.sort((a, b) => (Date.parse(a.createdAt || "") || 0) - (Date.parse(b.createdAt || "") || 0));
  return { ready, expired };
}

/**
 * Devices a notification goes to. Role broadcasts skip the actor's own phones
 * (the MO doesn't need a push for the job desk they just saved); a direct
 * uid notification (e.g. the "Notifikasi aktif" test) always reaches it.
 */
export function targetsFor(notification, devices) {
  const target = resolveRecipient(notification.recipientId);
  const seen = new Set();
  const out = [];
  for (const d of devices || []) {
    if (!d.token || seen.has(d.token)) continue;
    if (target.kind === "role" && notification.actorUid && d.uid === notification.actorUid) continue;
    seen.add(d.token);
    out.push(d);
  }
  return out;
}

/**
 * Pick notifications that fit in the remaining subrequest budget
 * (one FCM call per device). Order is preserved; the rest waits for the
 * next run. A notification bigger than a whole budget is still taken alone
 * so it can't block the queue forever (it is then sent to the first devices).
 */
export function planBatch(ready, devicesByRecipient, sendBudget) {
  const plan = [];
  let used = 0;
  for (const n of ready) {
    const targets = targetsFor(n, devicesByRecipient[n.recipientId]);
    if (plan.length && used + targets.length > sendBudget) break;
    const allowed = targets.slice(0, Math.max(0, sendBudget - used));
    plan.push({ notification: n, targets: allowed });
    used += allowed.length;
    if (used >= sendBudget) break;
  }
  return plan;
}

/** Map an app link to a same-origin path the service worker can open. */
export function safeLink(link) {
  return typeof link === "string" && /^\/[A-Za-z0-9/_-]{0,120}$/.test(link) ? link : "/";
}

export function buildMessage(notification, token) {
  const title = String(notification.title || "Al-Umanaa").slice(0, 200);
  const body = String(notification.message || "").slice(0, 1000);
  return {
    message: {
      token,
      data: {
        id: String(notification.id),
        title,
        body,
        url: safeLink(notification.link),
        tag: String(notification.id),
        type: String(notification.type || "system"),
        sentAt: String(Date.now()),
      },
      webpush: { headers: { Urgency: "high", TTL: "43200" } },
    },
  };
}

/**
 * FCM v1 error → what to do.
 *   "invalid": token is dead → delete the device.
 *   "auth":    credentials / API problem → fail, retrying won't help soon.
 *   "retry":   transient (quota, 5xx).
 */
export function classifyFcmError(status, body) {
  const error = body && body.error ? body.error : {};
  const codes = (error.details || []).map((d) => d && d.errorCode).filter(Boolean);
  const message = String(error.message || "");
  if (status === 404 || codes.includes("UNREGISTERED")) return "invalid";
  if (codes.includes("SENDER_ID_MISMATCH")) return "invalid";
  if (status === 400 && (codes.includes("INVALID_ARGUMENT") || error.status === "INVALID_ARGUMENT") && /registration token/i.test(message)) return "invalid";
  if (status === 401 || status === 403 || codes.includes("THIRD_PARTY_AUTH_ERROR")) return "auth";
  return "retry";
}

/** Final pushStatus for a notification after its sends. */
export function finalStatus(targetCount, results, attempts) {
  if (targetCount === 0) return "no_devices";
  if (results.some((r) => r === "ok")) return "sent";
  if (results.every((r) => r === "invalid")) return "no_devices";
  if (results.some((r) => r === "auth")) return "failed";
  return attempts + 1 < MAX_ATTEMPTS ? "pending" : "failed";
}
