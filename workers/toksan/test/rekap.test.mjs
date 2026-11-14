import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { TODAY, call, fakeDeps, makeEnv } from "./helpers.mjs";

const KEMARIN = "2026-11-13";

describe("rekap API", () => {
  let ctx;
  let risol;
  let dimsum;
  const deps = fakeDeps();
  const as = (method, path, body) => call(ctx.env, deps, method, path, { token: "admin", body });
  const rekap = (dari, sampai) => as("GET", `/rekap?dari=${dari}&sampai=${sampai}`);

  before(async () => {
    ctx = await makeEnv();
    risol = (await as("POST", "/produk", { name: "Risol Mayo", dapur: "bakery", kategori: "makanan", harga: 3500 })).data.produk.id;
    dimsum = (await as("POST", "/produk", { name: "Dimsum", dapur: "hangat_saji", kategori: "makanan", harga: 8600 })).data.produk.id;
    await as("PUT", "/penjualan", { tanggal: KEMARIN, rows: [
      { productId: risol, sesi: "pagi", pihak: "rijal", jumlah: 30, retur: 2 },
      { productId: dimsum, sesi: "siang", pihak: "nisaa", jumlah: 96, retur: 0 },
    ] });
    await as("PUT", "/penjualan", { tanggal: TODAY, rows: [
      { productId: risol, sesi: "pagi", pihak: "nisaa", jumlah: 20, retur: 0 },
      { productId: risol, sesi: "siang", pihak: "rijal", jumlah: 10, retur: 1 },
    ] });
    await as("PUT", "/obral", { tanggal: TODAY, rows: [{ productId: risol, hargaObral: 2000, jumlah: 12 }] });
  });
  after(async () => { await ctx.dispose(); });

  it("totals over two days", async () => {
    const { status, data } = await rekap(KEMARIN, TODAY);
    assert.equal(status, 200);
    assert.equal(data.dari, KEMARIN);
    assert.equal(data.sampai, TODAY);
    assert.deepEqual(data.totals, { produksi: 156, terjual: 153, retur: 3, omzet: 1_025_100, obralJumlah: 12, obralOmzet: 24_000, produkTerjual: 2 });
  });

  it("per product, per day, per sesi, per pihak, per dapur", async () => {
    const { data } = await rekap(KEMARIN, TODAY);
    assert.deepEqual(data.produk.map(({ productName, dapur, harga, produksi, terjual, retur, omzet }) => ({ productName, dapur, harga, produksi, terjual, retur, omzet })), [
      { productName: "Risol Mayo", dapur: "bakery", harga: 3500, produksi: 60, terjual: 57, retur: 3, omzet: 199_500 },
      { productName: "Dimsum", dapur: "hangat_saji", harga: 8600, produksi: 96, terjual: 96, retur: 0, omzet: 825_600 },
    ]);
    assert.deepEqual(data.perHari, [
      { tanggal: KEMARIN, produksi: 126, terjual: 124, retur: 2, omzet: 923_600 },
      { tanggal: TODAY, produksi: 30, terjual: 29, retur: 1, omzet: 101_500 },
    ]);
    assert.deepEqual(data.perSesi, [{ sesi: "pagi", terjual: 48, omzet: 168_000 }, { sesi: "siang", terjual: 105, omzet: 857_100 }]);
    assert.deepEqual(data.perPihak, [{ pihak: "rijal", terjual: 37, omzet: 129_500 }, { pihak: "nisaa", terjual: 116, omzet: 895_600 }]);
    assert.deepEqual(data.perDapur, [
      { dapur: "bakery", produksi: 60, terjual: 57, retur: 3, omzet: 199_500 },
      { dapur: "hangat_saji", produksi: 96, terjual: 96, retur: 0, omzet: 825_600 },
    ]);
    const rijalRisol = data.produkPerPihak.find((p) => p.productId === risol && p.pihak === "rijal");
    assert.deepEqual({ produksi: rijalRisol.produksi, terjual: rijalRisol.terjual, omzet: rijalRisol.omzet }, { produksi: 40, terjual: 37, omzet: 129_500 });
    const pagiRisol = data.produkPerSesi.filter((p) => p.productId === risol && p.sesi === "pagi");
    assert.deepEqual(pagiRisol.map((p) => p.terjual), [48]);
    assert.equal(data.obral.length, 1);
    assert.equal(data.obral[0].hargaObral, 2000);
  });

  it("groups by product and harga", async () => {
    await as("PATCH", `/produk/${risol}`, { harga: 4000 });
    await as("PUT", "/penjualan", { tanggal: TODAY, rows: [{ productId: risol, sesi: "sore", pihak: "rijal", jumlah: 5, retur: 0 }] });
    const { data } = await rekap(TODAY, TODAY);
    const lines = data.produk.filter((p) => p.productId === risol).map((p) => [p.harga, p.terjual]);
    assert.deepEqual(lines, [[3500, 29], [4000, 5]]);
  });

  it("empty range gives zeros and empty lists", async () => {
    const { data } = await rekap("2026-10-01", "2026-10-31");
    assert.deepEqual(data.totals, { produksi: 0, terjual: 0, retur: 0, omzet: 0, obralJumlah: 0, obralOmzet: 0, produkTerjual: 0 });
    for (const key of ["produk", "produkPerSesi", "produkPerPihak", "perHari", "perSesi", "perPihak", "perDapur", "obral"]) assert.deepEqual(data[key], [], key);
  });

  it("rejects dari > sampai, bad dates and spans over 366 days", async () => {
    assert.equal((await rekap(TODAY, KEMARIN)).data.error.code, "TANGGAL_TIDAK_VALID");
    assert.equal((await rekap("x", TODAY)).data.error.code, "TANGGAL_TIDAK_VALID");
    assert.equal((await rekap("2025-11-01", TODAY)).data.error.code, "TANGGAL_TIDAK_VALID");
    assert.equal((await rekap("2025-11-14", TODAY)).status, 200);
    assert.equal((await rekap("2026-11-09", "2026-11-15")).status, 200, "minggu ini may end after today");
  });
});
