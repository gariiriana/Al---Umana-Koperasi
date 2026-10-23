/**
 * Storefront checkout — POST /api/orders.
 *
 * The browser only says what the customer picked. Everything that involves
 * money is decided here from Firestore, inside one transaction: product price
 * and stock (`inventory`, where `price` is already the final selling price),
 * the promo, the fixed delivery + service fee, and the starting payment state.
 * Stock is decremented in the same commit, so two customers can never both buy
 * the last portion.
 *
 * Retries are harmless: the order ID is derived from the customer's UID and the
 * Idempotency-Key header. Replaying the same payload returns the existing order;
 * reusing the key for a different payload is rejected with 409.
 */

import { decodeFields, encodeFields, encodeValue } from "./firestore-values.js";

export const DELIVERY_FEE = 10_000;
export const SERVICE_FEE = 2_000;

const PAYMENT_METHODS = new Set(["cod", "bank_transfer", "e_wallet"]);
const MAX_BODY_CHARS = 64 * 1024;
const MAX_ITEMS = 50;
const MAX_QUANTITY = 99; // the cart clamps quantities to 1..99
const MAX_PRICE = 100_000_000;
const ITEM_ID = /^[A-Za-z0-9_-]{1,128}$/;
const PROMO_CODE = /^[A-Z0-9_-]{1,40}$/;
const REQUEST_ID = /^[A-Za-z0-9-]{16,128}$/;
const TRANSACTION_ATTEMPTS = 3;
const SECURETOKEN_JWKS = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

/** An expected failure with a status and a message the storefront can show as-is. */
export class CheckoutError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const invalid = (details) => new CheckoutError(400, "VALIDATION_ERROR", "Data pesanan tidak lengkap atau tidak valid.", details);

// ---------------------------------------------------------------------------
// Request validation and pricing (pure)
// ---------------------------------------------------------------------------

export function parseCheckoutRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw invalid([{ field: "body", reason: "must be a JSON object" }]);
  const errors = [];
  const fail = (field, reason) => { errors.push({ field, reason }); };
  const text = (value, field, max, required) => {
    if (value === undefined || value === null) {
      if (required) fail(field, "required");
      return "";
    }
    if (typeof value !== "string") {
      fail(field, "must be text");
      return "";
    }
    const trimmed = value.trim();
    if (required && !trimmed) fail(field, "required");
    if (trimmed.length > max) fail(field, `at most ${max} characters`);
    return trimmed;
  };

  const customerName = text(body.customerName, "customerName", 120, true);
  const deliveryAddress = text(body.deliveryAddress, "deliveryAddress", 2000, true);
  const deliveryTime = text(body.deliveryTime, "deliveryTime", 100, false);
  const paymentMethod = body.paymentMethod;
  if (!PAYMENT_METHODS.has(paymentMethod)) fail("paymentMethod", "unknown payment method");
  const promoCode = text(body.promoCode, "promoCode", 40, false).toUpperCase();
  if (promoCode && !PROMO_CODE.test(promoCode)) fail("promoCode", "invalid code");

  const items = [];
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > MAX_ITEMS) {
    fail("items", `1 to ${MAX_ITEMS} items`);
  } else {
    const seen = new Set();
    body.items.forEach((item, index) => {
      const itemId = item?.itemId;
      if (typeof itemId !== "string" || !ITEM_ID.test(itemId)) return fail(`items[${index}].itemId`, "invalid");
      if (seen.has(itemId)) return fail(`items[${index}].itemId`, "duplicate");
      seen.add(itemId);
      if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_QUANTITY) {
        return fail(`items[${index}].quantity`, `1 to ${MAX_QUANTITY}`);
      }
      items.push({ itemId, quantity: item.quantity, notes: text(item.notes, `items[${index}].notes`, 500, false) });
    });
  }

  // Coordinates are parsed from a Maps link on the phone; bad ones are dropped, not fatal.
  const { deliveryLat: lat, deliveryLng: lng } = body;
  const location = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? { lat, lng } : null;

  if (errors.length) throw invalid(errors);
  return { customerName, deliveryAddress, deliveryTime, paymentMethod, promoCode, items, location };
}

export function promoDiscount(promo, subtotal) {
  const unavailable = new CheckoutError(422, "PROMO_UNAVAILABLE", "Kode promo tidak berlaku untuk pesanan ini.");
  if (!promo || promo.active !== true) throw unavailable;
  if (subtotal < (Number.isFinite(promo.minPurchase) ? promo.minPurchase : 0)) throw unavailable;
  const { value } = promo;
  if (!Number.isFinite(value) || value < 0) throw unavailable;
  let discount;
  if (promo.discountType === "percentage") {
    if (value > 100) throw unavailable;
    discount = Math.round((subtotal * value) / 100);
    if (Number.isFinite(promo.maxDiscount) && promo.maxDiscount > 0) discount = Math.min(discount, promo.maxDiscount);
  } else if (promo.discountType === "fixed") {
    discount = value;
  } else {
    throw unavailable;
  }
  return Math.min(discount, subtotal);
}

/**
 * Prices the order from inventory documents (`products`: itemId → fields or null).
 * Anything that cannot be sold at a trustworthy price counts as unavailable.
 */
export function priceCheckout(request, products, promo) {
  const unavailable = [];
  const lines = [];
  let subtotal = 0;
  for (const { itemId, quantity, notes } of request.items) {
    const product = products.get(itemId);
    if (!product) {
      unavailable.push({ field: itemId, reason: "not_found" });
      continue;
    }
    const { price } = product;
    if (product.available !== true || !Number.isFinite(product.quantity) || product.quantity < quantity
      || !Number.isInteger(price) || price < 0 || price > MAX_PRICE) {
      unavailable.push({ field: itemId, reason: "out_of_stock" });
      continue;
    }
    lines.push({
      itemId,
      itemName: typeof product.itemName === "string" ? product.itemName : "",
      quantity,
      price,
      notes,
      imageUrl: typeof product.imageUrl === "string" ? product.imageUrl : "",
    });
    subtotal += price * quantity;
  }
  if (unavailable.length) {
    throw new CheckoutError(409, "OUT_OF_STOCK", "Sebagian menu sudah habis atau stoknya kurang.", unavailable);
  }
  const discount = request.promoCode ? promoDiscount(promo, subtotal) : 0;
  const additionalFee = DELIVERY_FEE + SERVICE_FEE;
  return { lines, subtotal, discount, additionalFee, totalPrice: subtotal - discount + additionalFee };
}

export function orderFields(uid, request, priced, fingerprint) {
  const fields = {
    customerId: uid,
    customerName: request.customerName,
    deliveryAddress: request.deliveryAddress,
    deliveryTime: request.deliveryTime,
    items: priced.lines,
    paymentMethod: request.paymentMethod,
    promoCode: request.promoCode,
    discountAmount: priced.discount,
    totalPrice: priced.totalPrice,
    additionalFee: priced.additionalFee,
    status: request.paymentMethod === "cod" ? "CONFIRMED" : "AWAITING_PAYMENT_PROOF",
    checkoutFingerprint: fingerprint,
  };
  if (request.paymentMethod !== "cod") fields.paymentStatus = "awaiting_proof";
  if (request.location) {
    fields.deliveryLat = request.location.lat;
    fields.deliveryLng = request.location.lng;
  }
  return fields;
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Same customer + same Idempotency-Key always maps to the same order document. */
export const checkoutOrderId = (uid, requestId) => sha256Hex(`${uid}:${requestId}`);

/** Identifies the payload, independent of item order, to tell a replay from a reused key. */
export function checkoutFingerprint(request) {
  const items = [...request.items].sort((a, b) => (a.itemId < b.itemId ? -1 : 1)).map((i) => [i.itemId, i.quantity, i.notes]);
  return sha256Hex(JSON.stringify([request.customerName, request.deliveryAddress, request.deliveryTime,
    request.paymentMethod, request.promoCode, items, request.location]));
}

// ---------------------------------------------------------------------------
// Firebase ID token
// ---------------------------------------------------------------------------

let cachedJwks = null;

function base64UrlDecode(value) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

/** Verify a Firebase Auth ID token (RS256, securetoken JWKs). Returns the uid or null. */
export async function verifyIdToken(token, projectId) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  let header;
  let payload;
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
  } catch {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (header.alg !== "RS256" || payload.aud !== projectId || payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (!payload.sub || payload.exp <= now || payload.iat > now + 300) return null;

  if (!cachedJwks || cachedJwks.expiresAt < Date.now()) {
    const response = await fetch(SECURETOKEN_JWKS);
    if (!response.ok) return null;
    const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get("cache-control") || "")?.[1] || 3600);
    cachedJwks = { keys: (await response.json()).keys || [], expiresAt: Date.now() + maxAge * 1000 };
  }
  const jwk = cachedJwks.keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, base64UrlDecode(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  return valid ? payload.sub : null;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

async function call(firestore, path, body) {
  const response = await firestore(path, body);
  if (!response.ok) throw new Error(`Firestore ${path} failed (${response.status})`);
  return response.json();
}

function orderView(id, fields) {
  const { checkoutFingerprint: _fingerprint, ...visible } = fields;
  return { id, ...visible };
}

/**
 * deps.firestore(path, body) POSTs to `projects/{p}/databases/(default)/{path}`;
 * deps.documents is `projects/{p}/databases/(default)/documents`;
 * deps.verifyIdToken(token) resolves to a uid or null.
 * Returns { status, body } or throws CheckoutError.
 */
export async function handleCheckout(request, deps) {
  const auth = request.headers.get("authorization") || "";
  const uid = auth.startsWith("Bearer ") ? await deps.verifyIdToken(auth.slice(7)).catch(() => null) : null;
  if (!uid) throw new CheckoutError(401, "UNAUTHORIZED", "Sesi login sudah berakhir. Silakan masuk lagi.");

  const requestId = request.headers.get("idempotency-key") || "";
  if (!REQUEST_ID.test(requestId)) throw invalid([{ field: "Idempotency-Key", reason: "16 to 128 letters, digits or dashes" }]);

  const raw = await request.text();
  if (raw.length > MAX_BODY_CHARS) throw invalid([{ field: "body", reason: "too large" }]);
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    throw invalid([{ field: "body", reason: "invalid JSON" }]);
  }
  const order = parseCheckoutRequest(body);
  const [orderId, fingerprint] = await Promise.all([checkoutOrderId(uid, requestId), checkoutFingerprint(order)]);
  return placeOrder(deps, { uid, orderId, fingerprint, order });
}

async function placeOrder({ firestore, documents }, { uid, orderId, fingerprint, order }) {
  const orderName = `${documents}/orders/${orderId}`;
  const productName = (itemId) => `${documents}/inventory/${itemId}`;
  const promoName = order.promoCode ? `${documents}/promos/${order.promoCode}` : null;
  const names = [orderName, ...order.items.map((i) => productName(i.itemId)), ...(promoName ? [promoName] : [])];

  for (let attempt = 0; attempt < TRANSACTION_ATTEMPTS; attempt++) {
    const { transaction } = await call(firestore, "documents:beginTransaction", { options: { readWrite: {} } });
    let finished = false;
    try {
      const found = new Map();
      for (const result of await call(firestore, "documents:batchGet", { documents: names, transaction })) {
        if (result.found) found.set(result.found.name, decodeFields(result.found.fields));
      }

      const existing = found.get(orderName);
      if (existing) {
        if (existing.customerId !== uid || existing.checkoutFingerprint !== fingerprint) {
          throw new CheckoutError(409, "IDEMPOTENCY_CONFLICT",
            "Pesanan ini sudah pernah dibuat dengan isi berbeda. Cek menu Pesanan Saya sebelum memesan lagi.",
            [{ field: "orderId", reason: orderId }]);
        }
        return { status: 200, body: orderView(orderId, existing) };
      }

      const products = new Map(order.items.map((i) => [i.itemId, found.get(productName(i.itemId)) || null]));
      const priced = priceCheckout(order, products, promoName ? found.get(promoName) || null : null);
      const fields = orderFields(uid, order, priced, fingerprint);
      const response = await firestore("documents:commit", {
        transaction,
        writes: [
          {
            update: { name: orderName, fields: encodeFields(fields) },
            currentDocument: { exists: false },
            updateTransforms: [
              { fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" },
              { fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" },
            ],
          },
          // Only `quantity` changes: other inventory fields (e.g. updatedAt, which
          // sorts the catalog) keep the meaning the admin screens give them.
          ...priced.lines.map((line) => ({
            update: { name: productName(line.itemId), fields: { quantity: encodeValue(products.get(line.itemId).quantity - line.quantity) } },
            updateMask: { fieldPaths: ["quantity"] },
            currentDocument: { exists: true },
          })),
        ],
      });
      finished = true;
      // 409 = ABORTED by a concurrent transaction: read again and retry.
      if (response.status === 409) continue;
      if (!response.ok) throw new Error(`Firestore commit failed (${response.status})`);
      const { commitTime } = await response.json();
      return { status: 201, body: orderView(orderId, { ...fields, createdAt: commitTime, updatedAt: commitTime }) };
    } finally {
      if (!finished) await firestore("documents:rollback", { transaction }).catch(() => {});
    }
  }
  throw new CheckoutError(503, "BUSY", "Banyak pesanan masuk bersamaan. Coba lagi sebentar.");
}
