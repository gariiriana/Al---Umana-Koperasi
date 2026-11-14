import { describe, expect, it } from "vitest";
import { datesBetween, monthLabel, monthRange, todayWib, weekLabel, weekRange } from "@/toksan/logic/period";
import { addProduct, applyToSelected, dayTotal, fromPenjualan, rowTotal, toPayload, validateRows, type InputRow } from "@/toksan/logic/inputRows";
import type { Produk } from "@/toksan/types";

const produk = (over: Partial<Produk> = {}): Produk => ({
  id: "p1", name: "Risol Mayo", dapur: "bakery", kategori: "makanan", harga: 3500, active: true, updatedAt: 0, ...over,
});

describe("period", () => {
  it("todayWib switches at 00:00 WIB (17:00 UTC)", () => {
    expect(todayWib(new Date("2026-11-13T16:59:00Z"))).toBe("2026-11-13");
    expect(todayWib(new Date("2026-11-13T17:30:00Z"))).toBe("2026-11-14");
  });

  it("weekRange runs Senin to Minggu", () => {
    expect(weekRange("2026-11-14")).toEqual({ dari: "2026-11-09", sampai: "2026-11-15" });
    expect(weekRange("2026-11-09")).toEqual({ dari: "2026-11-09", sampai: "2026-11-15" });
    expect(weekRange("2026-11-15")).toEqual({ dari: "2026-11-09", sampai: "2026-11-15" });
  });

  it("weekRange crosses a month boundary", () => {
    expect(weekRange("2026-11-01")).toEqual({ dari: "2026-10-26", sampai: "2026-11-01" });
    expect(weekRange("2026-11-02")).toEqual({ dari: "2026-11-02", sampai: "2026-11-08" });
  });

  it("monthRange handles February and December", () => {
    expect(monthRange("2026-02-10")).toEqual({ dari: "2026-02-01", sampai: "2026-02-28" });
    expect(monthRange("2028-02-10")).toEqual({ dari: "2028-02-01", sampai: "2028-02-29" });
    expect(monthRange("2026-12-31")).toEqual({ dari: "2026-12-01", sampai: "2026-12-31" });
  });

  it("datesBetween is inclusive", () => {
    expect(datesBetween("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });

  it("labels", () => {
    expect(weekLabel({ dari: "2026-11-09", sampai: "2026-11-15" })).toBe("9 – 15 November 2026");
    expect(weekLabel({ dari: "2026-10-26", sampai: "2026-11-01" })).toBe("26 Oktober – 1 November 2026");
    expect(weekLabel({ dari: "2026-12-28", sampai: "2027-01-03" })).toBe("28 Desember 2026 – 3 Januari 2027");
    expect(monthLabel("2026-11-14")).toBe("November 2026");
  });
});

describe("input rows", () => {
  const empty: InputRow[] = [];

  it("addProduct inherits the last sesi and leaves pihak empty", () => {
    const { rows, focusKey } = addProduct(empty, produk(), "siang");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ productId: "p1", productName: "Risol Mayo", dapur: "bakery", harga: 3500, sesi: "siang", pihak: null, jumlah: null, retur: null, selected: false });
    expect(focusKey).toBe(rows[0].key);
  });

  it("addProduct focuses existing duplicate", () => {
    const first = addProduct(empty, produk(), "pagi");
    const again = addProduct(first.rows, produk(), "pagi");
    expect(again.rows).toBe(first.rows);
    expect(again.focusKey).toBe(first.focusKey);
  });

  it("addProduct adds a second row once the first has a pihak", () => {
    const first = addProduct(empty, produk(), "pagi");
    const withPihak = first.rows.map((r) => ({ ...r, pihak: "rijal" as const }));
    expect(addProduct(withPihak, produk(), "pagi").rows).toHaveLength(2);
  });

  it("applyToSelected only touches ticked rows", () => {
    let rows = addProduct(empty, produk(), "pagi").rows;
    rows = addProduct(rows, produk({ id: "p2", name: "Dimsum" }), "pagi").rows;
    rows = rows.map((r, i) => ({ ...r, selected: i === 1 }));
    const next = applyToSelected(rows, { pihak: "nisaa" });
    expect(next.map((r) => r.pihak)).toEqual([null, "nisaa"]);
    expect(applyToSelected(next, { sesi: "sore" }).map((r) => r.sesi)).toEqual(["pagi", "sore"]);
  });

  it("validateRows flags missing sesi and pihak", () => {
    const rows = addProduct(empty, produk(), null).rows.map((r) => ({ ...r, jumlah: 5, retur: 0 }));
    expect(validateRows(rows)).toEqual({ [rows[0].key]: ["sesi", "pihak"] });
  });

  it("validateRows flags retur > jumlah, empty or fractional jumlah", () => {
    const base = addProduct(empty, produk(), "pagi").rows[0];
    const ok = { ...base, pihak: "rijal" as const, jumlah: 5, retur: 0 };
    expect(validateRows([ok])).toEqual({});
    expect(validateRows([{ ...ok, retur: 6 }])[ok.key]).toEqual(["retur"]);
    expect(validateRows([{ ...ok, jumlah: null }])[ok.key]).toEqual(["jumlah"]);
    expect(validateRows([{ ...ok, jumlah: 2.5 }])[ok.key]).toEqual(["jumlah"]);
    expect(validateRows([{ ...ok, retur: null }])).toEqual({});
  });

  it("validateRows flags duplicate product+sesi+pihak on the later row", () => {
    const base = addProduct(empty, produk(), "pagi").rows[0];
    const a = { ...base, pihak: "rijal" as const, jumlah: 5, retur: 0 };
    const b = { ...a, key: "other" };
    expect(validateRows([a, b])).toEqual({ other: ["duplikat"] });
  });

  it("totals: terjual = jumlah - retur, total = terjual x harga", () => {
    const row = { ...addProduct(empty, produk(), "pagi").rows[0], jumlah: 30, retur: 2 };
    expect(rowTotal(row)).toEqual({ terjual: 28, total: 98_000 });
    expect(rowTotal({ ...row, jumlah: null, retur: null })).toEqual({ terjual: 0, total: 0 });
    expect(dayTotal([row, { ...row, key: "b", jumlah: 10, retur: null }])).toBe(98_000 + 35_000);
  });

  it("round trip from saved rows to the save payload sends numbers", () => {
    const rows = fromPenjualan([{ id: "s1", tanggal: "2026-11-14", productId: "p1", productName: "Risol Mayo", dapur: "bakery", harga: 3500, sesi: "pagi", pihak: "rijal", jumlah: 30, retur: 2, updatedAt: 0, updatedBy: "u" }]);
    const added = addProduct(rows, produk({ id: "p2", name: "Dimsum" }), "siang").rows.map((r) => (r.productId === "p2" ? { ...r, pihak: "nisaa" as const, jumlah: 4, retur: null } : r));
    expect(toPayload(added)).toEqual([
      { id: "s1", productId: "p1", sesi: "pagi", pihak: "rijal", jumlah: 30, retur: 2 },
      { productId: "p2", sesi: "siang", pihak: "nisaa", jumlah: 4, retur: 0 },
    ]);
  });
});
