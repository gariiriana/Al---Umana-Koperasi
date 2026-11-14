import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { NOW, TODAY, call, fakeDeps, makeEnv } from "./helpers.mjs";

describe("penjualan API", () => {
  let ctx;
  let risol;
  let dimsum;
  const deps = fakeDeps();
  const as = (method, path, body) => call(ctx.env, deps, method, path, { token: "admin", body });
  const put = (rows, hapus = [], tanggal = TODAY) => as("PUT", "/penjualan", { tanggal, rows, hapus });
  const get = (tanggal = TODAY) => as("GET", `/penjualan?tanggal=${tanggal}`);
  const row = (over = {}) => ({ productId: risol, sesi: "pagi", pihak: "rijal", jumlah: 30, retur: 2, ...over });

  before(async () => {
    ctx = await makeEnv();
    risol = (await as("POST", "/produk", { name: "Risol Mayo", dapur: "bakery", kategori: "makanan", harga: 3500 })).data.produk.id;
    dimsum = (await as("POST", "/produk", { name: "Dimsum", dapur: "hangat_saji", kategori: "makanan", harga: 8600 })).data.produk.id;
  });
  after(async () => { await ctx.dispose(); });
  beforeEach(async () => { await ctx.env.DB.prepare("DELETE FROM sales").run(); });

  it("saves rows with the product snapshot and returns the day", async () => {
    const res = await put([row(), row({ productId: dimsum, sesi: "siang", pihak: "nisaa", jumlah: 96, retur: 0 })]);
    assert.equal(res.status, 200);
    assert.equal(res.data.tanggal, TODAY);
    const [a, b] = res.data.rows;
    assert.deepEqual(
      { name: a.productName, dapur: a.dapur, harga: a.harga, sesi: a.sesi, pihak: a.pihak, jumlah: a.jumlah, retur: a.retur, by: a.updatedBy },
      { name: "Risol Mayo", dapur: "bakery", harga: 3500, sesi: "pagi", pihak: "rijal", jumlah: 30, retur: 2, by: "admin" },
    );
    assert.equal(b.productName, "Dimsum");
    assert.deepEqual((await get()).data.rows.map((r) => r.id), res.data.rows.map((r) => r.id));
  });

  it("rejects retur > jumlah and names the row", async () => {
    const res = await put([row(), row({ sesi: "siang", jumlah: 5, retur: 6 })]);
    assert.equal(res.status, 400);
    assert.equal(res.data.error.code, "VALIDATION_ERROR");
    assert.deepEqual(res.data.error.details, { row: 1, field: "retur" });
    assert.deepEqual((await get()).data.rows, []);
  });

  for (const [field, value] of [["jumlah", -1], ["jumlah", 2.5], ["jumlah", null], ["jumlah", "5"], ["retur", -1], ["sesi", "malam"], ["pihak", ""], ["pihak", null]]) {
    it(`rejects ${field}=${JSON.stringify(value)}`, async () => {
      const res = await put([row({ [field]: value })]);
      assert.equal(res.status, 400);
      assert.deepEqual(res.data.error.details, { row: 0, field });
    });
  }

  it("duplicate product+sesi+pihak inside one batch → 409 naming the row", async () => {
    const res = await put([row(), row({ jumlah: 1, retur: 0 })]);
    assert.equal(res.status, 409);
    assert.equal(res.data.error.code, "DUPLIKAT");
    assert.deepEqual(res.data.error.details, { row: 1 });
  });

  it("duplicate against a stored row → 409, unless that row is deleted in the same batch", async () => {
    const saved = (await put([row()])).data.rows[0];
    const dup = await put([row({ jumlah: 5, retur: 0 })]);
    assert.equal(dup.status, 409);
    assert.deepEqual(dup.data.error.details, { row: 0 });
    const replaced = await put([row({ jumlah: 5, retur: 0 })], [saved.id]);
    assert.equal(replaced.status, 200);
    assert.equal(replaced.data.rows.length, 1);
    assert.equal(replaced.data.rows[0].jumlah, 5);
  });

  it("updates an existing row's sesi, pihak, jumlah and retur", async () => {
    const saved = (await put([row()])).data.rows[0];
    const res = await put([{ id: saved.id, productId: risol, sesi: "sore", pihak: "nisaa", jumlah: 40, retur: 1 }]);
    assert.equal(res.status, 200);
    assert.deepEqual(
      { sesi: res.data.rows[0].sesi, pihak: res.data.rows[0].pihak, jumlah: res.data.rows[0].jumlah, retur: res.data.rows[0].retur },
      { sesi: "sore", pihak: "nisaa", jumlah: 40, retur: 1 },
    );
  });

  it("swapping sesi between two stored rows succeeds", async () => {
    const [a, b] = (await put([row({ jumlah: 10 }), row({ sesi: "siang", jumlah: 20 })])).data.rows;
    const res = await put([{ ...row(), id: a.id, sesi: "siang", jumlah: 10 }, { ...row(), id: b.id, sesi: "pagi", jumlah: 20 }]);
    assert.equal(res.status, 200);
    const bySesi = Object.fromEntries(res.data.rows.map((r) => [r.sesi, r.jumlah]));
    assert.deepEqual(bySesi, { pagi: 20, siang: 10 });
  });

  it("an id from another date is BARIS_TIDAK_ADA", async () => {
    const saved = (await put([row()], [], "2026-11-13")).data.rows[0];
    const res = await put([{ ...row(), id: saved.id }]);
    assert.equal(res.status, 404);
    assert.equal(res.data.error.code, "BARIS_TIDAK_ADA");
  });

  it("price change does not rewrite saved rows", async () => {
    await put([row()]);
    await as("PATCH", `/produk/${risol}`, { harga: 4000 });
    const after1 = await get();
    assert.equal(after1.data.rows[0].harga, 3500);
    const res = await put([row({ sesi: "siang" })]);
    const bySesi = Object.fromEntries(res.data.rows.map((r) => [r.sesi, r.harga]));
    assert.deepEqual(bySesi, { pagi: 3500, siang: 4000 });
    await as("PATCH", `/produk/${risol}`, { harga: 3500 });
  });

  it("future date → TANGGAL_TIDAK_VALID; malformed date too", async () => {
    assert.equal((await put([row()], [], "2026-11-15")).data.error.code, "TANGGAL_TIDAK_VALID");
    assert.equal((await put([row()], [], "2026-02-30")).data.error.code, "TANGGAL_TIDAK_VALID");
    assert.equal((await get("kemarin")).data.error.code, "TANGGAL_TIDAK_VALID");
  });

  it("unknown product → PRODUK_TIDAK_ADA naming the row", async () => {
    const res = await put([row({ productId: "nope" })]);
    assert.equal(res.status, 400);
    assert.equal(res.data.error.code, "PRODUK_TIDAK_ADA");
    assert.deepEqual(res.data.error.details, { row: 0 });
  });

  it("inactive product: new rows rejected, existing rows still editable", async () => {
    const saved = (await put([row()])).data.rows[0];
    await as("PATCH", `/produk/${risol}`, { active: false });
    const added = await put([row({ sesi: "siang" })]);
    assert.equal(added.data.error.code, "PRODUK_NONAKTIF");
    const edited = await put([{ ...row(), id: saved.id, jumlah: 10, retur: 0 }]);
    assert.equal(edited.status, 200);
    await as("PATCH", `/produk/${risol}`, { active: true });
  });

  it("deletes rows listed in hapus", async () => {
    const saved = (await put([row(), row({ sesi: "siang" })])).data.rows;
    const res = await put([], [saved[0].id]);
    assert.equal(res.data.rows.length, 1);
  });

  it("rejects more than 300 rows", async () => {
    const rows = Array.from({ length: 301 }, (_, i) => row({ jumlah: i }));
    const res = await put(rows);
    assert.equal(res.status, 400);
  });

  it("unchanged rows keep who last changed them; only the edited row is re-stamped", async () => {
    const [a, b] = (await put([row(), row({ sesi: "siang", jumlah: 20 })])).data.rows;
    const later = fakeDeps({ now: () => NOW + 60_000 });
    const res = await call(ctx.env, later, "PUT", "/penjualan", {
      token: "boss",
      body: { tanggal: TODAY, hapus: [], rows: [{ ...row(), id: a.id }, { ...row({ sesi: "siang", jumlah: 25 }), id: b.id }] },
    });
    assert.equal(res.status, 200);
    const byId = Object.fromEntries(res.data.rows.map((r) => [r.id, r]));
    assert.deepEqual([byId[a.id].updatedBy, byId[a.id].updatedAt], ["admin", NOW]);
    assert.deepEqual([byId[b.id].updatedBy, byId[b.id].updatedAt, byId[b.id].jumlah], ["boss", NOW + 60_000, 25]);
  });

  it("a 300-row save runs a small fixed number of queries (D1 per-request limit)", async () => {
    const ids = [];
    const insert = [];
    for (let i = 0; i < 50; i++) {
      const id = `bulk${i}`;
      ids.push(id);
      insert.push(ctx.env.DB.prepare(
        "INSERT INTO products (id, name, name_key, dapur, kategori, harga, active, created_at, updated_at, updated_by) VALUES (?, ?, ?, 'bakery', 'makanan', 1000, 1, 0, 0, 'seed')",
      ).bind(id, `Bulk ${i}`, `bulk ${i}`));
    }
    await ctx.env.DB.batch(insert);
    let prepared = 0;
    const db = ctx.env.DB;
    const counting = { prepare: (sql) => { prepared += 1; return db.prepare(sql); }, batch: (s) => db.batch(s) };
    const env = { ...ctx.env, DB: counting };
    const rows = ids.flatMap((productId) => ["pagi", "siang", "sore"].flatMap((sesi) => ["rijal", "nisaa"].map((pihak) => ({ productId, sesi, pihak, jumlah: 5, retur: 0 }))));
    assert.equal(rows.length, 300);

    const first = await call(env, deps, "PUT", "/penjualan", { token: "admin", body: { tanggal: TODAY, rows, hapus: [] } });
    assert.equal(first.status, 200);
    assert.equal(first.data.rows.length, 300);
    assert.ok(prepared <= 6, `first save prepared ${prepared} statements`);

    prepared = 0;
    const edited = first.data.rows.map((r) => ({ id: r.id, productId: r.productId, sesi: r.sesi, pihak: r.pihak, jumlah: 6, retur: 1 }));
    const second = await call(env, deps, "PUT", "/penjualan", { token: "admin", body: { tanggal: TODAY, rows: edited, hapus: [] } });
    assert.equal(second.status, 200);
    assert.ok(second.data.rows.every((r) => r.jumlah === 6 && r.retur === 1));
    assert.ok(prepared <= 6, `edit save prepared ${prepared} statements`);
    await ctx.env.DB.prepare("DELETE FROM sales").run();
    await ctx.env.DB.prepare("DELETE FROM products WHERE id LIKE 'bulk%'").run();
  });
});
