import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Produk } from "@/toksan/types";

const fake = vi.hoisted(() => ({
  toast: vi.fn(),
  listProduk: vi.fn(),
  getObral: vi.fn(),
  saveObral: vi.fn(),
  createProduk: vi.fn(),
  updateProduk: vi.fn(),
}));

vi.mock("@/contexts/ToastContext", () => ({ useToast: () => ({ showToast: fake.toast }) }));
vi.mock("@/lib/firebase", () => ({ auth: {} }));
vi.mock("@/toksan/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/toksan/api")>()),
  listProduk: fake.listProduk,
  getObral: fake.getObral,
  saveObral: fake.saveObral,
  createProduk: fake.createProduk,
  updateProduk: fake.updateProduk,
}));
vi.mock("@/toksan/logic/period", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/toksan/logic/period")>()),
  todayWib: () => "2026-11-14",
}));

import { ToksanApiError } from "@/toksan/api";
import { ObralPage } from "@/toksan/pages/ObralPage";
import { ProdukPage } from "@/toksan/pages/ProdukPage";

const PRODUK: Produk[] = [
  { id: "p1", name: "Risol Mayo", dapur: "bakery", kategori: "makanan", harga: 3500, active: true, updatedAt: 0 },
  { id: "p2", name: "Dimsum", dapur: "hangat_saji", kategori: "makanan", harga: 8600, active: true, updatedAt: 0 },
];

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  fake.listProduk.mockResolvedValue(PRODUK);
  fake.getObral.mockResolvedValue([]);
  fake.saveObral.mockResolvedValue([]);
});

// Obral: produk ditambah lewat tombol Pilih Produk (centang di sheet), sama seperti Input Harian.
async function pickObral(...names: string[]) {
  fireEvent.click(await screen.findByRole("button", { name: /Pilih Produk/ }));
  const sheet = within(screen.getByRole("dialog", { name: "Pilih Produk" }));
  for (const name of names) {
    if (!sheet.queryByRole("checkbox", { name: new RegExp(name) })) fireEvent.click(sheet.getByRole("tab", { name: /Hangat Saji/ }));
    fireEvent.click(sheet.getByRole("checkbox", { name: new RegExp(name) }));
  }
  fireEvent.click(sheet.getByRole("button", { name: /Tambahkan/ }));
}

describe("Obral", () => {
  it("adds products through Pilih Produk, with no search box and no sesi or Rijal/Nisaa", async () => {
    render(<ObralPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Pilih Produk/ }));
    expect(screen.queryByLabelText("Cari produk yang diobral")).toBeNull();
    const sheet = within(screen.getByRole("dialog", { name: "Pilih Produk" }));
    expect(sheet.queryByRole("group", { name: "Pihak" })).toBeNull();
    expect(sheet.queryByText("Rijal / Nisaa")).toBeNull();
    fireEvent.click(sheet.getByRole("checkbox", { name: /Risol Mayo/ }));
    fireEvent.click(sheet.getByRole("button", { name: /Tambahkan 1 produk/ }));
    expect(screen.getByRole("listitem", { name: "Obral Risol Mayo" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the normal price, computes the total and saves numbers", async () => {
    render(<ObralPage />);
    await waitFor(() => expect(fake.getObral).toHaveBeenCalledWith("2026-11-14"));
    await pickObral("Risol Mayo");
    const card = screen.getByRole("listitem", { name: "Obral Risol Mayo" });
    expect(within(card).getByText(/Normal Rp3\.500/)).toBeTruthy();
    fireEvent.change(within(card).getByLabelText("Harga obral Risol Mayo"), { target: { value: "2000" } });
    fireEvent.change(within(card).getByLabelText("Jumlah obral Risol Mayo"), { target: { value: "12" } });
    expect(within(card).getByText("Rp24.000")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Simpan/ }));
    await waitFor(() => expect(fake.saveObral).toHaveBeenCalledWith("2026-11-14", [
      { productId: "p1", hargaObral: 2000, jumlah: 12, catatan: null },
    ], []));
  });

  it("Simpan stays disabled while jumlah is empty", async () => {
    render(<ObralPage />);
    await pickObral("Dimsum");
    fireEvent.change(screen.getByLabelText("Harga obral Dimsum"), { target: { value: "5000" } });
    expect((screen.getByRole("button", { name: /Simpan/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("Produk Toksan", () => {
  it("adds a product with an integer price", async () => {
    fake.createProduk.mockResolvedValue({ ...PRODUK[0], id: "p9", name: "Pukis", harga: 2800 });
    render(<ProdukPage />);
    await screen.findByText("Risol Mayo");
    fireEvent.click(screen.getByRole("button", { name: /Tambah produk/ }));
    fireEvent.change(screen.getByLabelText("Nama produk"), { target: { value: "Pukis" } });
    fireEvent.change(screen.getByLabelText("Dapur"), { target: { value: "bakery" } });
    fireEvent.change(screen.getByLabelText("Kategori"), { target: { value: "makanan" } });
    fireEvent.change(screen.getByLabelText("Harga reseller"), { target: { value: "2.800" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan produk" }));
    await waitFor(() => expect(fake.createProduk).toHaveBeenCalledWith({ name: "Pukis", dapur: "bakery", kategori: "makanan", harga: 2800 }));
  });

  it("shows NAMA_SUDAH_ADA under the name field", async () => {
    fake.createProduk.mockRejectedValue(new ToksanApiError("NAMA_SUDAH_ADA", 409));
    render(<ProdukPage />);
    await screen.findByText("Risol Mayo");
    fireEvent.click(screen.getByRole("button", { name: /Tambah produk/ }));
    fireEvent.change(screen.getByLabelText("Nama produk"), { target: { value: "risol mayo" } });
    fireEvent.change(screen.getByLabelText("Harga reseller"), { target: { value: "3500" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan produk" }));
    expect(await screen.findByText("Nama produk sudah dipakai.")).toBeTruthy();
  });

  it("deactivates a product", async () => {
    fake.updateProduk.mockResolvedValue({ ...PRODUK[0], active: false });
    render(<ProdukPage />);
    await screen.findByText("Risol Mayo");
    fireEvent.click(screen.getByRole("button", { name: "Nonaktifkan Risol Mayo" }));
    await waitFor(() => expect(fake.updateProduk).toHaveBeenCalledWith("p1", { active: false }));
    expect(await screen.findByRole("button", { name: "Aktifkan Risol Mayo" })).toBeTruthy();
  });

  it("filters by name and dapur", async () => {
    render(<ProdukPage />);
    await screen.findByText("Risol Mayo");
    fireEvent.change(screen.getByLabelText("Filter dapur"), { target: { value: "hangat_saji" } });
    expect(screen.queryByText("Risol Mayo")).toBeNull();
    expect(screen.getByText("Dimsum")).toBeTruthy();
  });
});
