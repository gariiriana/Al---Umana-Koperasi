import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { RekapData } from "@/toksan/types";

const NABILA = { displayName: "toksan@alumana.id", holderName: "Nabila", role: "toksan" };
const fake = vi.hoisted(() => ({
  toast: vi.fn(), getRekap: vi.fn(), pdf: vi.fn(), docx: vi.fn(),
  profile: null as null | { displayName: string; holderName?: string; role: string },
}));

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
