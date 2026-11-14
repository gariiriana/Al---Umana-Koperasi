import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Penjualan, Produk } from "@/toksan/types";

const fake = vi.hoisted(() => ({
  toast: vi.fn(),
  listProduk: vi.fn(),
  getPenjualan: vi.fn(),
  savePenjualan: vi.fn(),
}));

vi.mock("@/contexts/ToastContext", () => ({ useToast: () => ({ showToast: fake.toast }) }));
vi.mock("@/toksan/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/toksan/api")>()),
  listProduk: fake.listProduk,
  getPenjualan: fake.getPenjualan,
  savePenjualan: fake.savePenjualan,
}));
vi.mock("@/lib/firebase", () => ({ auth: {} }));
vi.mock("@/toksan/logic/period", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/toksan/logic/period")>()),
  todayWib: () => "2026-11-14",
}));

import { InputHarianPage } from "@/toksan/pages/InputHarianPage";

const PRODUK: Produk[] = [
  { id: "p1", name: "Risol Mayo", dapur: "bakery", kategori: "makanan", harga: 3500, active: true, updatedAt: 0 },
  { id: "p2", name: "Dimsum", dapur: "hangat_saji", kategori: "makanan", harga: 8600, active: true, updatedAt: 0 },
  { id: "p3", name: "Pukis Lama", dapur: "bakery", kategori: "makanan", harga: 2800, active: false, updatedAt: 0 },
];
const SAVED: Penjualan[] = [
  { id: "s1", tanggal: "2026-11-14", productId: "p1", productName: "Risol Mayo", dapur: "bakery", harga: 3500, sesi: "pagi", pihak: "rijal", jumlah: 30, retur: 2, updatedAt: 0, updatedBy: "u" },
];

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  localStorage.clear();
  fake.listProduk.mockResolvedValue(PRODUK);
  fake.getPenjualan.mockResolvedValue(SAVED);
  fake.savePenjualan.mockImplementation(async () => SAVED);
});

const openSheet = () => {
  fireEvent.click(screen.getByRole("button", { name: /Pilih Produk/ }));
  return screen.getByRole("dialog", { name: "Pilih Produk" });
};
const chip = (scope: HTMLElement, group: string, name: string) =>
  fireEvent.click(within(within(scope).getByRole("group", { name: group })).getByRole("button", { name }));

/** Opens Pilih Produk, sets sesi/pihak once, ticks products by name (via the search box) and adds them. */
const pickProducts = (names: string[], { sesi, pihak = "Nisaa" }: { sesi?: string; pihak?: string } = {}) => {
  const sheet = openSheet();
  if (sesi) chip(sheet, "Sesi", sesi);
  chip(sheet, "Pihak", pihak);
  for (const name of names) {
    fireEvent.change(within(sheet).getByLabelText("Cari produk"), { target: { value: name } });
    fireEvent.click(within(sheet).getByRole("checkbox", { name: new RegExp(name) }));
  }
  fireEvent.click(within(sheet).getByRole("button", { name: /^Tambahkan/ }));
};

describe("Input Harian", () => {
  it("loads today's rows and shows the day total", async () => {
    render(<InputHarianPage />);
    expect(await screen.findByText("Risol Mayo")).toBeTruthy();
    expect(fake.getPenjualan).toHaveBeenCalledWith("2026-11-14");
    expect(screen.getByTestId("total-hari").textContent).toContain("Rp98.000");
  });

  it("the picker only offers active products", async () => {
    render(<InputHarianPage />);
    await screen.findByText("Risol Mayo");
    const sheet = openSheet();
    fireEvent.change(within(sheet).getByLabelText("Cari produk"), { target: { value: "pukis" } });
    expect(within(sheet).queryByRole("checkbox", { name: /Pukis Lama/ })).toBeNull();
  });

  it("allows adding a product directly via the quick search box (Cara 1)", async () => {
    render(<InputHarianPage />);
    await screen.findByText("Risol Mayo");
    const searchInput = screen.getByRole("combobox", { name: "Cari produk" });
    fireEvent.change(searchInput, { target: { value: "Dimsum" } });
    const option = await screen.findByRole("option", { name: /Dimsum/i });
    fireEvent.click(option);
    expect(screen.getByRole("group", { name: "Pihak Dimsum" })).toBeTruthy();
  });

  it("Pilih Produk lists products per dapur and adds several at once with sesi and pihak already set", async () => {
    render(<InputHarianPage />);
    await screen.findByText("Risol Mayo");
    const sheet = openSheet();
    chip(sheet, "Sesi", "Siang");
    chip(sheet, "Pihak", "Nisaa");
    fireEvent.click(within(sheet).getByRole("checkbox", { name: /Risol Mayo/ }));
    expect(within(sheet).queryByRole("checkbox", { name: /Dimsum/ })).toBeNull(); // other dapur tab
    fireEvent.click(within(sheet).getByRole("tab", { name: /Hangat Saji/ }));
    fireEvent.click(within(sheet).getByRole("checkbox", { name: /Dimsum/ }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Tambahkan 2 produk" }));

    expect(screen.queryByRole("dialog", { name: "Pilih Produk" })).toBeNull();
    expect(screen.getAllByRole("group", { name: "Pihak Risol Mayo" })).toHaveLength(1);
    const dimsumSesi = screen.getByRole("group", { name: "Sesi Dimsum" });
    const dimsumPihak = screen.getByRole("group", { name: "Pihak Dimsum" });
    expect(within(dimsumSesi).getByRole("button", { name: "Siang" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(dimsumPihak).getByRole("button", { name: "Nisaa" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/1 baris belum lengkap|2 baris belum lengkap/)).toBeTruthy(); // only jumlah left
  });

  it("Tambahkan stays off until Rijal or Nisaa is chosen", async () => {
    render(<InputHarianPage />);
    await screen.findByText("Risol Mayo");
    const sheet = openSheet();
    fireEvent.click(within(sheet).getByRole("tab", { name: /Hangat Saji/ }));
    fireEvent.click(within(sheet).getByRole("checkbox", { name: /Dimsum/ }));
    const tambah = within(sheet).getByRole("button", { name: /^Tambahkan/ }) as HTMLButtonElement;
    expect(tambah.disabled).toBe(true);
    expect(within(sheet).getByText(/Pilih Rijal atau Nisaa/)).toBeTruthy();
    chip(sheet, "Pihak", "Rijal");
    expect(tambah.disabled).toBe(false);
  });

  it("a product already on the day for that sesi and pihak is marked and cannot be ticked", async () => {
    render(<InputHarianPage />);
    await screen.findByText("Risol Mayo");
    const sheet = openSheet();
    chip(sheet, "Pihak", "Rijal"); // saved row: Risol Mayo, Pagi, Rijal
    const risol = within(sheet).getByRole("checkbox", { name: /Risol Mayo/ }) as HTMLInputElement;
    expect(risol.disabled).toBe(true);
    expect(within(sheet).getByText("sudah ada")).toBeTruthy();
    chip(sheet, "Pihak", "Nisaa");
    expect(risol.disabled).toBe(false);
  });

  it("ticking rows and clicking Nisaa sets pihak on all ticked rows", async () => {
    render(<InputHarianPage />);
    await screen.findByText("Risol Mayo");
    pickProducts(["Dimsum"], { pihak: "Rijal" });
    const sheet = openSheet();
    chip(sheet, "Sesi", "Siang");
    chip(sheet, "Pihak", "Rijal");
    fireEvent.change(within(sheet).getByLabelText("Cari produk"), { target: { value: "Risol Mayo" } });
    fireEvent.click(within(sheet).getByRole("checkbox", { name: /Risol Mayo/ }));
    fireEvent.click(within(sheet).getByRole("button", { name: /^Tambahkan/ }));

    fireEvent.click(screen.getByLabelText("Pilih semua"));
    fireEvent.click(within(screen.getByRole("toolbar", { name: "Ubah yang dicentang" })).getByRole("button", { name: "Nisaa" }));
    for (const name of ["Risol Mayo", "Dimsum"]) {
      const group = screen.getByRole("group", { name: `Pihak ${name}` });
      expect(within(group).getByRole("button", { name: "Nisaa" }).getAttribute("aria-pressed")).toBe("true");
    }
  });

  it("Simpan stays disabled until every row has sesi, pihak and jumlah", async () => {
    render(<InputHarianPage />);
    await screen.findByText("Risol Mayo");
    const simpan = screen.getByRole("button", { name: /Simpan/ });
    expect((simpan as HTMLButtonElement).disabled).toBe(true); // nothing in form yet
    pickProducts(["Dimsum"]);
    expect((simpan as HTMLButtonElement).disabled).toBe(true); // jumlah still empty
    fireEvent.change(screen.getByLabelText("Jumlah Dimsum"), { target: { value: "96" } });
    expect((simpan as HTMLButtonElement).disabled).toBe(false);
  });

  it("Simpan sends numbers and clears the form after save", async () => {
    render(<InputHarianPage />);
    await screen.findByText("Risol Mayo");
    fireEvent.click(screen.getByRole("button", { name: "Edit Risol Mayo" }));
    pickProducts(["Dimsum"], { pihak: "Nisaa" });
    fireEvent.change(screen.getByLabelText("Jumlah Dimsum"), { target: { value: "96" } });
    fireEvent.change(screen.getByLabelText("Retur Risol Mayo"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: /Simpan/ }));
    await waitFor(() => expect(fake.savePenjualan).toHaveBeenCalled());
    expect(fake.savePenjualan).toHaveBeenCalledWith("2026-11-14", [
      { id: "s1", productId: "p1", sesi: "pagi", pihak: "rijal", jumlah: 30, retur: 3 },
      { productId: "p2", sesi: "pagi", pihak: "nisaa", jumlah: 96, retur: 0 },
    ], []);
    expect(screen.queryByLabelText("Jumlah Dimsum")).toBeNull();
  });

  it("deleting a saved row sends its id in hapus", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<InputHarianPage />);
    await screen.findByText("Risol Mayo");
    fireEvent.click(screen.getByRole("button", { name: "Hapus Risol Mayo" }));
    await waitFor(() => expect(fake.savePenjualan).toHaveBeenCalledWith("2026-11-14", [], ["s1"]));
  });
});

const simpanDisabled = () => (screen.getByRole("button", { name: /Simpan/ }) as HTMLButtonElement).disabled;

describe("Input Harian: unsaved work", () => {
  it("typed changes survive leaving the page (menu tap) and come back as a draft", async () => {
    const first = render(<InputHarianPage />);
    await screen.findByText("Risol Mayo");
    pickProducts(["Dimsum"]);
    fireEvent.change(screen.getByLabelText("Jumlah Dimsum"), { target: { value: "45" } });
    first.unmount();

    render(<InputHarianPage />);
    await screen.findByText(/belum disimpan.*dipulihkan/i);
    expect((screen.getByLabelText("Jumlah Dimsum") as HTMLInputElement).value).toBe("45");
    expect(simpanDisabled()).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Buang draft" }));
    expect(screen.queryByLabelText("Jumlah Dimsum")).toBeNull();
    expect(screen.queryByText(/dipulihkan/i)).toBeNull();
  });

  it("a successful save clears the draft and resets the form to empty", async () => {
    const first = render(<InputHarianPage />);
    await screen.findByText("Risol Mayo");
    pickProducts(["Dimsum"]);
    fireEvent.change(screen.getByLabelText("Jumlah Dimsum"), { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: /Simpan/ }));
    await waitFor(() => expect(fake.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "success" })));
    expect(screen.queryByLabelText("Jumlah Dimsum")).toBeNull();
    first.unmount();

    render(<InputHarianPage />);
    await screen.findByText("Risol Mayo");
    expect(screen.queryByLabelText("Jumlah Dimsum")).toBeNull();
    expect(screen.queryByText(/dipulihkan/i)).toBeNull();
  });

  it("a failed load for the new date clears the old rows and keeps Simpan off until retried", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<InputHarianPage />);
    await screen.findByText("Risol Mayo");
    pickProducts(["Dimsum"]);
    fireEvent.change(screen.getByLabelText("Jumlah Dimsum"), { target: { value: "45" } });

    fake.getPenjualan.mockRejectedValueOnce(new Error("offline"));
    fireEvent.change(screen.getByLabelText("Tanggal"), { target: { value: "2026-11-13" } });
    const retry = await screen.findByRole("button", { name: "Coba lagi" });
    expect(screen.queryByText("Risol Mayo")).toBeNull();
    expect(simpanDisabled()).toBe(true);

    fake.getPenjualan.mockResolvedValueOnce([]);
    fireEvent.click(retry);
    await screen.findByText("Belum ada penjualan di tanggal ini");
    expect(fake.getPenjualan).toHaveBeenLastCalledWith("2026-11-13");
  });

  it("a slow answer for an earlier date does not overwrite the date now on screen", async () => {
    render(<InputHarianPage />);
    await screen.findByText("Risol Mayo");
    let releaseOld: (rows: Penjualan[]) => void = () => {};
    fake.getPenjualan.mockImplementationOnce(() => new Promise<Penjualan[]>((resolve) => { releaseOld = resolve; }));
    fake.getPenjualan.mockResolvedValueOnce([]);
    fireEvent.change(screen.getByLabelText("Tanggal"), { target: { value: "2026-11-13" } });
    fireEvent.change(screen.getByLabelText("Tanggal"), { target: { value: "2026-11-12" } });
    await screen.findByText("Belum ada penjualan di tanggal ini");
    releaseOld(SAVED);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("Risol Mayo")).toBeNull();
    expect(screen.getByText("Belum ada penjualan di tanggal ini")).toBeTruthy();
  });
});
