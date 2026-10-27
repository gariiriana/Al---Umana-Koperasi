import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/absensi/AbsensiSession", () => ({
  useAbsensiSession: () => ({
    me: {
      uid: "u1",
      name: "Sari",
      faceRequired: false,
      faceDescriptor: null,
      activated: true,
      areas: [],
      status: { today: null, open: null, last: null },
    },
    setStatus: vi.fn(),
    reloadMe: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
  }),
}));
vi.mock("@/absensi/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/absensi/api")>()),
  getRiwayat: vi.fn(async () => ({ rows: [] })),
}));

import { BerandaPage } from "@/absensi/pages/BerandaPage";

const BANNER = "HP ini belum terdaftar. Minta admin absensi reset HP kamu.";

beforeEach(() => localStorage.clear());

describe("BerandaPage", () => {
  it("tanpa penanda perangkat: banner tampil, Clock In tetap bisa ditekan", async () => {
    render(<MemoryRouter><BerandaPage /></MemoryRouter>);
    expect(screen.getByText(BANNER)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Clock In/ }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: /Clock in dulu/ }) as HTMLButtonElement).disabled).toBe(true);
    await screen.findByText("Belum ada absen di bulan ini.");
  });

  it("dengan penanda perangkat: tanpa banner", async () => {
    localStorage.setItem("absensi:device:u1", "1");
    render(<MemoryRouter><BerandaPage /></MemoryRouter>);
    expect(screen.queryByText(BANNER)).toBeNull();
    expect(screen.getByText("Sari")).toBeTruthy();
    await screen.findByText("Belum ada absen di bulan ini.");
  });
});
