import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { RekapData } from "@/toksan/types";

const zero = { produksi: 0, terjual: 0, retur: 0, omzet: 0 };
const fake = vi.hoisted(() => ({ getRekap: vi.fn() }));

vi.mock("@/contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("@/lib/firebase", () => ({ auth: {} }));
vi.mock("@/toksan/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/toksan/api")>()), getRekap: fake.getRekap }));

import { TrafikPage } from "@/toksan/pages/TrafikPage";

describe("Trafik page", () => {
  it("the dapur filter offers Bakery and Hangat Saji only (no Depan)", async () => {
    fake.getRekap.mockImplementation(async (dari: string, sampai: string): Promise<RekapData> => ({
      dari, sampai, totals: { ...zero, obralJumlah: 0, obralOmzet: 0, produkTerjual: 0 },
      produk: [], produkPerSesi: [], produkPerPihak: [], perHari: [], perSesi: [], perPihak: [], perDapur: [], obral: [],
    }));
    render(<TrafikPage />);
    const dapur = await screen.findByRole("combobox", { name: "Dapur" });
    const labels = within(dapur).getAllByRole("option").map((o) => o.textContent);
    expect(labels).toEqual(["Semua dapur", "Bakery", "Hangat Saji"]);
  });
});
