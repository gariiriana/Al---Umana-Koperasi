import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const wib = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00+07:00`);

vi.mock("@/absensi/AbsensiSession", () => ({
  useAbsensiSession: () => ({
    me: { uid: "adm", name: "Admin", role: "admin_absensi", pendingRequests: 3 },
    signOut: vi.fn(async () => {}),
  }),
}));
vi.mock("@/absensi/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/absensi/api")>()),
  getNotifications: vi.fn(async () => ({ unreadCount: 0, notifications: [] })),
  listEmployees: vi.fn(async () => ({ employees: [] })),
  getRekap: vi.fn(async () => ({
    rows: [{
      shiftId: "s1", uid: "b", name: "Budi", workDate: "2026-11-07", masukAt: wib("2026-11-07", "09:06"),
      pulangAt: wib("2026-11-07", "17:00"), durationMin: 474, status: "selesai", areaName: "SPPG",
      masukPhotoId: null, pulangPhotoId: null, lateReason: "Ban motor bocor",
    }],
    requests: [],
  })),
}));

import { AdminLayout } from "@/absensi/admin/AdminLayout";

function renderAdmin(tab: string) {
  return render(
    <MemoryRouter initialEntries={[`/absensi/admin/${tab}`]}>
      <Routes>
        <Route path="/absensi/admin/:tab" element={<AdminLayout />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("admin absensi di HP", () => {
  it("navigasi bawah: 5 menu, menu aktif ditandai, badge persetujuan", async () => {
    renderAdmin("rekap");
    const [, bottom] = screen.getAllByRole("navigation", { name: "Menu admin absensi" });
    const links = within(bottom).getAllByRole("link");
    expect(links).toHaveLength(5);
    for (const name of ["Hari ini", "Persetujuan, 3 menunggu", "Rekap", "Karyawan", "Area"]) {
      expect(within(bottom).getByRole("link", { name })).toBeTruthy();
    }
    expect(within(bottom).getByRole("link", { name: "Rekap" }).getAttribute("aria-current")).toBe("page");
    await screen.findAllByText("Budi");
  });

  it("Rekap: kartu HP memuat jam masuk/pulang dan alasan terlambat utuh", async () => {
    renderAdmin("rekap");
    expect(await screen.findByText("Sabtu, 7 Nov 2026")).toBeTruthy();
    const card = screen.getByRole("button", { name: /Budi/ });
    expect(within(card).getByText("Masuk 09:06")).toBeTruthy();
    expect(within(card).getByText("Terlambat")).toBeTruthy();
    expect(within(card).getByText("Alasan terlambat: Ban motor bocor")).toBeTruthy();
    // Satu area saja: nama area tidak diulang di kartu.
    expect(within(card).queryByText("SPPG")).toBeNull();
  });
});
