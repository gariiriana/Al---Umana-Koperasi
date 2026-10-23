// Unit tests run anywhere: `node --test checkout.test.mjs`.
// The Firestore tests need the emulator (from the repo root):
//   npx firebase-tools emulators:exec --only firestore --project demo-courier-fixes --config firebase.test.json "node --test workers/invoice-api/checkout.test.mjs"
import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  CheckoutError, checkoutFingerprint, checkoutOrderId, handleCheckout, parseCheckoutRequest, priceCheckout, promoDiscount,
} from "./checkout.js";
import { decodeFields, encodeFields } from "./firestore-values.js";

const body = (extra = {}) => ({
  customerName: "Buyer", deliveryAddress: "Jl. Pesantren 1", deliveryTime: "", paymentMethod: "cod",
  items: [{ itemId: "nasi", quantity: 2, notes: "pedas", price: 1, itemName: "client says" }],
  ...extra,
});
const rejects = (fn, code) => assert.throws(fn, (e) => e instanceof CheckoutError && e.code === code);

describe("parseCheckoutRequest", () => {
  it("keeps only what the customer chose and ignores client prices", () => {
    const parsed = parseCheckoutRequest(body({ promoCode: " diskonbaru ", discountAmount: 999999, deliveryLat: -6.2, deliveryLng: 106.8 }));
    assert.deepEqual(parsed, {
      customerName: "Buyer", deliveryAddress: "Jl. Pesantren 1", deliveryTime: "", paymentMethod: "cod",
      promoCode: "DISKONBARU", items: [{ itemId: "nasi", quantity: 2, notes: "pedas" }], location: { lat: -6.2, lng: 106.8 },
    });
  });
  it("rejects bad input", () => {
    rejects(() => parseCheckoutRequest(body({ customerName: "  " })), "VALIDATION_ERROR");
    rejects(() => parseCheckoutRequest(body({ paymentMethod: "paid" })), "VALIDATION_ERROR");
    rejects(() => parseCheckoutRequest(body({ items: [] })), "VALIDATION_ERROR");
    rejects(() => parseCheckoutRequest(body({ items: [{ itemId: "a/b", quantity: 1 }] })), "VALIDATION_ERROR");
    rejects(() => parseCheckoutRequest(body({ items: [{ itemId: "nasi", quantity: 0 }] })), "VALIDATION_ERROR");
    rejects(() => parseCheckoutRequest(body({ items: [{ itemId: "nasi", quantity: 1.5 }] })), "VALIDATION_ERROR");
    rejects(() => parseCheckoutRequest(body({ items: [{ itemId: "nasi", quantity: 1 }, { itemId: "nasi", quantity: 2 }] })), "VALIDATION_ERROR");
    rejects(() => parseCheckoutRequest([]), "VALIDATION_ERROR");
  });
  it("drops impossible coordinates instead of failing", () => {
    assert.equal(parseCheckoutRequest(body({ deliveryLat: 200, deliveryLng: 10 })).location, null);
  });
});

describe("pricing", () => {
  const request = parseCheckoutRequest(body({ items: [{ itemId: "nasi", quantity: 2 }, { itemId: "es", quantity: 1 }] }));
  const products = new Map([
    ["nasi", { itemName: "Nasi", price: 8000, discountPercent: 20, quantity: 10, available: true, imageUrl: "img" }],
    ["es", { itemName: "Es", price: 5000, quantity: 1, available: true }],
  ]);

  it("uses the stored price as-is (it is already discounted) and adds the fixed fees", () => {
    const priced = priceCheckout(request, products, null);
    assert.equal(priced.subtotal, 21000);
    assert.equal(priced.additionalFee, 12000);
    assert.equal(priced.totalPrice, 33000);
    assert.deepEqual(priced.lines[0], { itemId: "nasi", itemName: "Nasi", quantity: 2, price: 8000, notes: "", imageUrl: "img" });
  });
  it("lists every item that cannot be sold", () => {
    const tight = new Map(products).set("es", { price: 5000, quantity: 0, available: true });
    assert.throws(() => priceCheckout(request, tight, null), (e) => e.code === "OUT_OF_STOCK"
      && JSON.stringify(e.details) === JSON.stringify([{ field: "es", reason: "out_of_stock" }]));
    const missing = new Map(products).set("es", null).set("nasi", { ...products.get("nasi"), available: false });
    assert.throws(() => priceCheckout(request, missing, null), (e) => e.details.length === 2);
  });
  it("fails closed on a missing or broken price", () => {
    for (const price of [undefined, "8000", -1, 1.5, Number.NaN]) {
      const broken = new Map(products).set("nasi", { ...products.get("nasi"), price });
      rejects(() => priceCheckout(request, broken, null), "OUT_OF_STOCK");
    }
  });
  it("applies promos the way the checkout screen shows them", () => {
    assert.equal(promoDiscount({ active: true, discountType: "percentage", value: 15, minPurchase: 20000, maxDiscount: 5000 }, 21000), 3150);
    assert.equal(promoDiscount({ active: true, discountType: "percentage", value: 15, minPurchase: 0, maxDiscount: 2000 }, 21000), 2000);
    assert.equal(promoDiscount({ active: true, discountType: "fixed", value: 50000, minPurchase: 0, maxDiscount: null }, 21000), 21000);
    rejects(() => promoDiscount({ active: false, discountType: "fixed", value: 1 }, 21000), "PROMO_UNAVAILABLE");
    rejects(() => promoDiscount({ active: true, discountType: "fixed", value: 1, minPurchase: 300000 }, 21000), "PROMO_UNAVAILABLE");
    rejects(() => promoDiscount(null, 21000), "PROMO_UNAVAILABLE");
    rejects(() => promoDiscount({ active: true, discountType: "percentage", value: 150 }, 21000), "PROMO_UNAVAILABLE");
  });
});

describe("idempotency keys", () => {
  it("derives the order id from the customer and the request id", async () => {
    assert.equal(await checkoutOrderId("u1", "req-0000000000000001"), await checkoutOrderId("u1", "req-0000000000000001"));
    assert.notEqual(await checkoutOrderId("u1", "req-0000000000000001"), await checkoutOrderId("u2", "req-0000000000000001"));
  });
  it("fingerprints the payload regardless of item order", async () => {
    const a = parseCheckoutRequest(body({ items: [{ itemId: "a", quantity: 1 }, { itemId: "b", quantity: 2 }] }));
    const b = parseCheckoutRequest(body({ items: [{ itemId: "b", quantity: 2 }, { itemId: "a", quantity: 1 }] }));
    const c = parseCheckoutRequest(body({ items: [{ itemId: "b", quantity: 3 }, { itemId: "a", quantity: 1 }] }));
    assert.equal(await checkoutFingerprint(a), await checkoutFingerprint(b));
    assert.notEqual(await checkoutFingerprint(a), await checkoutFingerprint(c));
  });
});

// ---------------------------------------------------------------------------
// Against the Firestore emulator: real transactions, preconditions and contention
// ---------------------------------------------------------------------------

const host = process.env.FIRESTORE_EMULATOR_HOST;
const project = process.env.GCLOUD_PROJECT || "demo-courier-fixes";
const database = `projects/${project}/databases/(default)`;
const documents = `${database}/documents`;
const owner = { authorization: "Bearer owner", "content-type": "application/json" };

const firestore = (path, payload) => fetch(`http://${host}/v1/${database}/${path}`, { method: "POST", headers: owner, body: JSON.stringify(payload) });
const deps = { documents, firestore, verifyIdToken: async (token) => (token.startsWith("uid:") ? token.slice(4) : null) };
const seed = (path, fields) => firestore("documents:commit", { writes: [{ update: { name: `${documents}/${path}`, fields: encodeFields(fields) } }] });
const read = async (path) => {
  const response = await fetch(`http://${host}/v1/${documents}/${path}`, { headers: owner });
  return response.ok ? decodeFields((await response.json()).fields) : null;
};
const place = (uid, requestId, payload) => handleCheckout(new Request("https://koperasi-alumana.com/api/orders", {
  method: "POST",
  headers: { authorization: `Bearer uid:${uid}`, "idempotency-key": requestId, "content-type": "application/json" },
  body: JSON.stringify(payload),
}), deps).catch((error) => {
  if (error instanceof CheckoutError) return { status: error.status, body: { code: error.code, details: error.details } };
  throw error;
});

describe("checkout against Firestore", { skip: !host && "FIRESTORE_EMULATOR_HOST not set" }, () => {
  beforeEach(async () => {
    await fetch(`http://${host}/emulator/v1/${documents}`, { method: "DELETE" });
    await Promise.all([
      seed("inventory/nasi", { itemName: "Nasi", price: 8000, quantity: 10, available: true, imageUrl: "img", updatedAt: "2026-10-01T00:00:00Z" }),
      seed("inventory/es", { itemName: "Es", price: 5000, quantity: 1, available: true }),
      seed("promos/DISKONBARU", { discountType: "percentage", value: 15, minPurchase: 20000, maxDiscount: 5000, active: true }),
      seed("promos/LAMA", { discountType: "fixed", value: 5000, minPurchase: 0, maxDiscount: null, active: false }),
    ]);
  });

  it("creates a COD order with server prices and takes the stock in the same commit", async () => {
    const result = await place("buyer", "req-cod-000000000001", body({ promoCode: "diskonbaru", items: [{ itemId: "nasi", quantity: 2 }, { itemId: "es", quantity: 1 }] }));
    assert.equal(result.status, 201);
    const stored = await read(`orders/${result.body.id}`);
    assert.equal(stored.customerId, "buyer");
    assert.equal(stored.status, "CONFIRMED");
    assert.equal(stored.paymentStatus, undefined);
    assert.equal(stored.discountAmount, 3150);
    assert.equal(stored.totalPrice, 21000 - 3150 + 12000);
    assert.equal(stored.items[0].price, 8000);
    assert.match(stored.createdAt, /^\d{4}-/);
    assert.equal(result.body.totalPrice, stored.totalPrice);
    assert.equal(result.body.checkoutFingerprint, undefined);
    assert.equal((await read("inventory/nasi")).quantity, 8);
    assert.equal((await read("inventory/nasi")).updatedAt, "2026-10-01T00:00:00Z");
    assert.equal((await read("inventory/es")).quantity, 0);
  });

  it("starts transfer orders waiting for payment proof", async () => {
    const result = await place("buyer", "req-transfer-0000001", body({ paymentMethod: "bank_transfer" }));
    assert.equal(result.status, 201);
    assert.equal(result.body.status, "AWAITING_PAYMENT_PROOF");
    assert.equal(result.body.paymentStatus, "awaiting_proof");
  });

  it("returns the same order for a retry and refuses a reused key with a different payload", async () => {
    const first = await place("buyer", "req-retry-0000000001", body());
    const retry = await place("buyer", "req-retry-0000000001", body());
    assert.equal(retry.status, 200);
    assert.equal(retry.body.id, first.body.id);
    assert.equal((await read("inventory/nasi")).quantity, 8);
    const changed = await place("buyer", "req-retry-0000000001", body({ paymentMethod: "bank_transfer" }));
    assert.equal(changed.status, 409);
    assert.equal(changed.body.code, "IDEMPOTENCY_CONFLICT");
    const otherCustomer = await place("other", "req-retry-0000000001", body());
    assert.equal(otherCustomer.status, 201);
    assert.notEqual(otherCustomer.body.id, first.body.id);
  });

  it("rejects short stock and dead promos without writing anything", async () => {
    const short = await place("buyer", "req-short-0000000001", body({ items: [{ itemId: "nasi", quantity: 1 }, { itemId: "es", quantity: 2 }, { itemId: "gone", quantity: 1 }] }));
    assert.equal(short.status, 409);
    assert.deepEqual(short.body.details, [{ field: "es", reason: "out_of_stock" }, { field: "gone", reason: "not_found" }]);
    const promo = await place("buyer", "req-promo-0000000001", body({ promoCode: "LAMA" }));
    assert.equal(promo.status, 422);
    assert.equal((await read("inventory/nasi")).quantity, 10);
    assert.equal((await read("inventory/es")).quantity, 1);
  });

  it("sells the last portion only once when two customers race for it", async () => {
    const results = await Promise.all(["a", "b", "c"].map((uid) => place(uid, `req-race-${uid}-0000000001`, body({ items: [{ itemId: "es", quantity: 1 }] }))));
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409, 409]);
    assert.equal((await read("inventory/es")).quantity, 0);
  });

  it("needs a signed-in customer and a request id", async () => {
    const anonymous = await handleCheckout(new Request("https://x/api/orders", { method: "POST", headers: { "idempotency-key": "req-anon-00000000001" }, body: "{}" }), deps)
      .catch((e) => e);
    assert.equal(anonymous.status, 401);
    const noKey = await place("buyer", "short", body());
    assert.equal(noKey.status, 400);
  });
});
