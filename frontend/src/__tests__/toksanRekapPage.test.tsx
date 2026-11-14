import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { RekapData } from "@/toksan/types";

const NABILA = { displayName: "toksan@alumana.id", holderName: "Nabila", role: "toksan" };
const fake = vi.hoisted(() => ({
  toast: vi.fn(), getRekap: vi.fn(), pdf: vi.fn(), docx: vi.fn(), invoice: vi.fn(),
  profile: null as null | { displayName: string; holderName?: string; role: string },
}));
vi.mock("@/toksan/export/invoicePdf", () => ({ exportInvoicePdf: fake.invoice }));

vi.mock("@/contexts/ToastContext", () => ({ useToast: () => ({ showToast: fake.toast }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ profile: fake.profile }) }));
vi.mock("@/lib/firebase", () => ({ auth: {} }));
vi.mock("@/toksan/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/toksan/api")>()), getRekap: fake.getRekap }));
vi.mock("@/toksan/export/rekapPdf", () => ({ exportRekapPdf: fake.pdf }));
vi.mock("@/toksan/export/rekapDocx", () => ({ exportRekapDocx: fake.docx }));
vi.mock("@/toksan/logic/period", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/toksan/logic/period")>()), todayWib: () => "2026-11-14" }));

import { RekapPage } from "@/toksan/pages/RekapPage";

const zero = { produksi: 0, terjual: 0, retur: 0, omzet: 0 };
const rekap = (over: Partial<RekapData> = {}): RekapData => ({
  dari: "2026-11-14", sampai: "2026-11-14",
  totals: { ...zero, obralJumlah: 0, obralOmzet: 0, produkTerjual: 0 },
  produk: [], produkPerSesi: [], produkPerPihak: [], perHari: [], perSesi: [], perPihak: [], perDapur: [], obral: [],
  ...over,
});

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  fake.profile = NABILA;
  fake.getRekap.mockImplementation(async (dari: string, sampai: string) => rekap({ dari, sampai }));
});

describe("Rekap page", () => {
  it("loads today for Harian, the Senin–Minggu week for Mingguan, the month for Bulanan", async () => {
    render(<RekapPage />);
    await waitFor(() => expect(fake.getRekap).toHaveBeenLastCalledWith("2026-11-14", "2026-11-14"));
    fireEvent.click(screen.getByRole("tab", { name: "Mingguan" }));
    await waitFor(() => expect(fake.getRekap).toHaveBeenLastCalledWith("2026-11-09", "2026-11-15"));
    fireEvent.click(screen.getByRole("tab", { name: "Bulanan" }));
    await waitFor(() => expect(fake.getRekap).toHaveBeenLastCalledWith("2026-11-01", "2026-11-30"));
  });

  it("export buttons are disabled when there is no data", async () => {
    render(<RekapPage />);
    expect(await screen.findByText(/Belum ada penjualan/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Export PDF/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("exports with the holder name in the signature", async () => {
    fake.getRekap.mockResolvedValue(rekap({
      totals: { produksi: 10, terjual: 9, retur: 1, omzet: 31_500, obralJumlah: 0, obralOmzet: 0, produkTerjual: 1 },
      perDapur: [{ dapur: "bakery", produksi: 10, terjual: 9, retur: 1, omzet: 31_500 }],
      produkPerSesi: [{ productId: "p1", productName: "Risol Mayo", dapur: "bakery", harga: 3500, sesi: "pagi", produksi: 10, terjual: 9, retur: 1, omzet: 31_500 }],
    }));
    render(<RekapPage />);
    expect(await screen.findByText("Risol Mayo")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Export PDF/ }));
    await waitFor(() => expect(fake.pdf).toHaveBeenCalled());
    expect(fake.pdf.mock.calls[0][0].footer.nama).toBe("Nabila");
    fireEvent.click(screen.getByRole("button", { name: /Export DOCX/ }));
    await waitFor(() => expect(fake.docx).toHaveBeenCalled());
  });

  it("without a holder name the signature is left blank, not the account's display name", async () => {
    fake.profile = { displayName: "Admin Toksan", role: "toksan" };
    fake.getRekap.mockResolvedValue(rekap({
      totals: { produksi: 10, terjual: 9, retur: 1, omzet: 31_500, obralJumlah: 0, obralOmzet: 0, produkTerjual: 1 },
      perDapur: [{ dapur: "bakery", produksi: 10, terjual: 9, retur: 1, omzet: 31_500 }],
      produkPerSesi: [{ productId: "p1", productName: "Risol Mayo", dapur: "bakery", harga: 3500, sesi: "pagi", produksi: 10, terjual: 9, retur: 1, omzet: 31_500 }],
    }));
    render(<RekapPage />);
    expect(await screen.findByText("Risol Mayo")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Export PDF/ }));
    await waitFor(() => expect(fake.pdf).toHaveBeenCalled());
    expect(fake.pdf.mock.calls[0][0].footer.nama).toBe("( ................................ )");
  });
});

describe("Rekap page: Invoice tab", () => {
  const sold = (productId: string, productName: string, dapur: "bakery" | "hangat_saji", harga: number, terjual: number) =>
    ({ productId, productName, dapur, harga, produksi: terjual, terjual, retur: 0, omzet: terjual * harga });

  beforeEach(() => {
    fake.getRekap.mockImplementation(async (dari: string, sampai: string) => rekap({
      dari, sampai,
      totals: { produksi: 106, terjual: 106, retur: 0, omzet: 860_600, obralJumlah: 0, obralOmzet: 0, produkTerjual: 2 },
      produk: [sold("p1", "Risol Mayo", "bakery", 3500, 10), sold("p2", "Dimsum", "hangat_saji", 8600, 96)],
    }));
  });

  it("bills one dapur for the chosen dates and exports the invoice PDF", async () => {
    render(<RekapPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Invoice" }));
    await waitFor(() => expect(fake.getRekap).toHaveBeenLastCalledWith("2026-11-09", "2026-11-14"));
    fireEvent.click(screen.getByRole("button", { name: "Hangat Saji" }));
    expect(await screen.findByText("Dimsum")).toBeTruthy();
    expect(screen.queryByText("Risol Mayo")).toBeNull();
    expect(screen.getByText("DELAPAN RATUS DUA PULUH LIMA RIBU ENAM RATUS RUPIAH")).toBeTruthy();
    expect((screen.getByLabelText("No. Faktur") as HTMLInputElement).value).toBe("TKS-HS-20261114");

    fireEvent.change(screen.getByLabelText("Diskon (Rp)"), { target: { value: "600" } });
    fireEvent.click(screen.getByRole("button", { name: /Export Invoice PDF/ }));
    await waitFor(() => expect(fake.invoice).toHaveBeenCalled());
    const model = fake.invoice.mock.calls[0][0];
    expect([model.unit, model.pelanggan, model.total, model.jatuhTempo]).toEqual(["Dapur Hangat Saji", "Toko Santri (Toksan)", "825.000,00", "21-11-2026"]);
  });

  it("changing the dates reloads the sales for that range", async () => {
    render(<RekapPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Invoice" }));
    await waitFor(() => expect(fake.getRekap).toHaveBeenLastCalledWith("2026-11-09", "2026-11-14"));
    fireEvent.change(screen.getByLabelText("Dari"), { target: { value: "2026-11-01" } });
    await waitFor(() => expect(fake.getRekap).toHaveBeenLastCalledWith("2026-11-01", "2026-11-14"));
    expect((screen.getByRole("button", { name: /Export Invoice PDF/ }) as HTMLButtonElement).disabled).toBe(false);
  });
});
