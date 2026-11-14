import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { TODAY, call, fakeDeps, makeEnv } from "./helpers.mjs";

describe("obral API", () => {
  let ctx;
  let risol;
  const deps = fakeDeps();
  const as = (method, path, body) => call(ctx.env, deps, method, path, { token: "admin", body });
  const put = (rows, hapus = [], tanggal = TODAY) => as("PUT", "/obral", { tanggal, rows, hapus });
  const row = (over = {}) => ({ productId: risol, hargaObral: 2000, jumlah: 12, ...over });

  before(async () => {
    ctx = await makeEnv();
    risol = (await as("POST", "/produk", { name: "Risol Mayo", dapur: "bakery", kategori: "makanan", harga: 3500 })).data.produk.id;
  });
  after(async () => { await ctx.dispose(); });
  beforeEach(async () => { await ctx.env.DB.prepare("DELETE FROM obral").run(); });

  it("saves with a snapshot of the normal price and reads back", async () => {
    const res = await put([row({ catatan: "sisa kemarin" })]);
    assert.equal(res.status, 200);
    const [o] = res.data.rows;
    assert.deepEqual(
      { productName: o.productName, dapur: o.dapur, hargaNormal: o.hargaNormal, hargaObral: o.hargaObral, jumlah: o.jumlah, catatan: o.catatan },
      { productName: "Risol Mayo", dapur: "bakery", hargaNormal: 3500, hargaObral: 2000, jumlah: 12, catatan: "sisa kemarin" },
    );
    assert.deepEqual((await as("GET", `/obral?tanggal=${TODAY}`)).data.rows.map((r) => r.id), [o.id]);
  });

  it("jumlah 0 is rejected naming the row", async () => {
    const res = await put([row({ jumlah: 0 })]);
    assert.equal(res.status, 400);
    assert.deepEqual(res.data.error.details, { row: 0, field: "jumlah" });
  });

  for (const [field, value] of [["hargaObral", -1], ["hargaObral", 1.5], ["catatan", "x".repeat(201)], ["catatan", 5]]) {
    it(`rejects ${field}=${JSON.stringify(value).slice(0, 12)}`, async () => {
      const res = await put([row({ [field]: value })]);
      assert.equal(res.status, 400);
      assert.deepEqual(res.data.error.details, { row: 0, field });
    });
  }

  it("the same product may appear twice at different prices", async () => {
    const res = await put([row(), row({ hargaObral: 1500, jumlah: 5 })]);
    assert.equal(res.status, 200);
    assert.deepEqual(res.data.rows.map((r) => r.hargaObral).sort(), [1500, 2000]);
  });

  it("edits and deletes", async () => {
    const [a, b] = (await put([row(), row({ hargaObral: 1500 })])).data.rows;
    const res = await put([{ id: a.id, productId: risol, hargaObral: 2500, jumlah: 3 }], [b.id]);
    assert.equal(res.data.rows.length, 1);
    assert.equal(res.data.rows[0].hargaObral, 2500);
    assert.equal(res.data.rows[0].hargaNormal, 3500);
  });

  it("unknown product and future date are rejected", async () => {
    assert.equal((await put([row({ productId: "nope" })])).data.error.code, "PRODUK_TIDAK_ADA");
    assert.equal((await put([row()], [], "2026-11-15")).data.error.code, "TANGGAL_TIDAK_VALID");
  });
});
