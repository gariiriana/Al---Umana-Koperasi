import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { call, fakeDeps, makeEnv } from "./helpers.mjs";

const RISOL = { name: "Risol Mayo", dapur: "bakery", kategori: "makanan", harga: 3500 };

describe("produk API", () => {
  let ctx;
  const deps = fakeDeps();
  const as = (method, path, body, token = "admin") => call(ctx.env, deps, method, path, { token, body });
  before(async () => { ctx = await makeEnv(); });
  after(async () => { await ctx.dispose(); });

  it("creates a product and lists it", async () => {
    const created = await as("POST", "/produk", RISOL);
    assert.equal(created.status, 200);
    assert.equal(created.data.produk.name, "Risol Mayo");
    assert.equal(created.data.produk.harga, 3500);
    assert.equal(created.data.produk.active, true);
    assert.ok(created.data.produk.id);
    const list = await as("GET", "/produk");
    assert.deepEqual(list.data.produk.map((p) => p.name), ["Risol Mayo"]);
  });

  it("rejects a duplicate name regardless of case and spaces", async () => {
    const res = await as("POST", "/produk", { ...RISOL, name: "  risol   MAYO " });
    assert.equal(res.status, 409);
    assert.equal(res.data.error.code, "NAMA_SUDAH_ADA");
  });

  for (const [field, value] of [["harga", -1], ["harga", 1.5], ["harga", "3500"], ["dapur", "kantin"], ["kategori", "snack"], ["name", "  "]]) {
    it(`rejects ${field}=${JSON.stringify(value)} naming the field`, async () => {
      const res = await as("POST", "/produk", { ...RISOL, name: `X ${field} ${value}`, [field]: value });
      assert.equal(res.status, 400);
      assert.equal(res.data.error.code, "VALIDATION_ERROR");
      assert.equal(res.data.error.details.field, field);
    });
  }

  it("sorts by dapur then name", async () => {
    await as("POST", "/produk", { name: "Dimsum", dapur: "hangat_saji", kategori: "makanan", harga: 8600 });
    await as("POST", "/produk", { name: "Arem Arem", dapur: "bakery", kategori: "makanan", harga: 3500 });
    const list = await as("GET", "/produk");
    assert.deepEqual(list.data.produk.map((p) => p.name), ["Arem Arem", "Risol Mayo", "Dimsum"]);
  });

  it("patches price and deactivates, keeping it listed", async () => {
    const id = (await as("GET", "/produk")).data.produk.find((p) => p.name === "Risol Mayo").id;
    const res = await as("PATCH", `/produk/${id}`, { harga: 4000, active: false });
    assert.equal(res.status, 200);
    assert.equal(res.data.produk.harga, 4000);
    assert.equal(res.data.produk.active, false);
    const listed = (await as("GET", "/produk")).data.produk.find((p) => p.id === id);
    assert.equal(listed.active, false);
  });

  it("rename to an existing name is rejected", async () => {
    const id = (await as("GET", "/produk")).data.produk.find((p) => p.name === "Dimsum").id;
    const res = await as("PATCH", `/produk/${id}`, { name: "arem arem" });
    assert.equal(res.status, 409);
    assert.equal(res.data.error.code, "NAMA_SUDAH_ADA");
  });

  it("404 PRODUK_TIDAK_ADA when patching an unknown id", async () => {
    const res = await as("PATCH", "/produk/nope", { harga: 1 });
    assert.equal(res.status, 404);
    assert.equal(res.data.error.code, "PRODUK_TIDAK_ADA");
  });

  it("kurir cannot read products", async () => {
    const res = await as("GET", "/produk", undefined, "kurir");
    assert.equal(res.status, 403);
  });
});
