import { describe, expect, it } from "vitest";
import { isOwnDeliveryDocument } from "@/lib/mbgCourierAssignment";

// Arsip Dokumen MBG: kurir hanya melihat laporan miliknya sejak 2026-11-13.
describe("laporan MBG milik kurir", () => {
  const report = { petugasId: "erik", kenekId: "rahmat", createdBy: "erik" };

  it("milik kurir utama dan kenek-nya", () => {
    expect(isOwnDeliveryDocument(report, "erik")).toBe(true);
    expect(isOwnDeliveryDocument(report, "rahmat")).toBe(true);
  });

  it("bukan milik kurir lain", () => {
    expect(isOwnDeliveryDocument(report, "agus")).toBe(false);
    expect(isOwnDeliveryDocument({ petugasId: "erik", createdBy: "erik" }, "")).toBe(false);
  });

  it("laporan lama tanpa kenekId tetap milik pembuatnya", () => {
    expect(isOwnDeliveryDocument({ petugasId: "erik", createdBy: "agus" }, "agus")).toBe(true);
  });
});
