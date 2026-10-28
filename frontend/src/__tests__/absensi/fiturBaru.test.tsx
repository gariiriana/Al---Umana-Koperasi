import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sessionMocks = vi.hoisted(() => ({
  reloadMe: vi.fn(async () => {}),
  role: "absen_karyawan" as "absen_karyawan" | "admin_absensi",
  unreadNotifications: 1,
}));

const api = vi.hoisted(() => ({
  listMyRequests: vi.fn(),
  createRequest: vi.fn(),
  getRekan: vi.fn(),
  listAdminRequests: vi.fn(),
  reviewAdminRequest: vi.fn(),
  getNotifications: vi.fn(),
  markNotificationsRead: vi.fn(),
}));

vi.mock("@/absensi/AbsensiSession", () => ({
  useAbsensiSession: () => ({
    me: {
      uid: "u1",
      name: "Sari",
      role: sessionMocks.role,
      unreadNotifications: sessionMocks.unreadNotifications,
      pendingRequests: 1,
    },
    reloadMe: sessionMocks.reloadMe,
  }),
}));

vi.mock("@/absensi/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/absensi/api")>()),
  ...api,
}));

import { PersetujuanTab } from "@/absensi/admin/PersetujuanTab";
import { NotificationBellButton } from "@/absensi/components/NotificationSheet";
import { PengajuanPage } from "@/absensi/pages/PengajuanPage";

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  sessionMocks.reloadMe.mockClear();
  sessionMocks.role = "absen_karyawan";
  sessionMocks.unreadNotifications = 1;
  api.listMyRequests.mockResolvedValue({ requests: [] });
  api.getRekan.mockResolvedValue({ coworkers: [{ uid: "u2", name: "Budi" }] });
  api.createRequest.mockResolvedValue({ request: { id: "r1" } });
});

describe("PengajuanPage (Karyawan)", () => {
  it("mengirim Permohonan Cuti dan memuat ulang daftar pengajuan", async () => {
    render(
      <MemoryRouter initialEntries={["/absensi/persetujuan?buat=cuti"]}>
        <PengajuanPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("dialog", { name: "Form Permohonan Cuti" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Kategori"), { target: { value: "sakit" } });
    fireEvent.change(screen.getByLabelText("Dari Tanggal"), { target: { value: "2026-10-28" } });
    fireEvent.change(screen.getByLabelText("Sampai Tanggal"), { target: { value: "2026-10-29" } });
    fireEvent.change(screen.getByLabelText("Alasan / Keterangan"), { target: { value: "Istirahat dokter" } });

    fireEvent.click(screen.getByRole("button", { name: "Kirim Pengajuan" }));

    await waitFor(() =>
      expect(api.createRequest).toHaveBeenCalledWith({
        kind: "cuti",
        leaveType: "sakit",
        startDate: "2026-10-28",
        endDate: "2026-10-29",
        reason: "Istirahat dokter",
      }),
    );
    await waitFor(() => expect(api.listMyRequests).toHaveBeenCalledTimes(2));
  });

  it("mengirim Pergantian Shift bersama rekan pengganti", async () => {
    render(
      <MemoryRouter initialEntries={["/absensi/persetujuan?buat=shift"]}>
        <PengajuanPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("dialog", { name: "Form Pergantian Shift" })).toBeTruthy();
    await waitFor(() => expect(api.getRekan).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("Tanggal Shift"), { target: { value: "2026-10-30" } });
    fireEvent.change(screen.getByLabelText("Rekan Tukar Shift (Opsional)"), { target: { value: "u2" } });
    fireEvent.change(screen.getByLabelText("Alasan Pergantian Shift"), { target: { value: "Keperluan keluarga pagi" } });

    fireEvent.click(screen.getByRole("button", { name: "Kirim Pengajuan" }));

    await waitFor(() =>
      expect(api.createRequest).toHaveBeenCalledWith({
        kind: "pergantian_shift",
        date: "2026-10-30",
        fromShift: "Shift Pagi (07:00 - 15:00)",
        toShift: "Shift Siang (15:00 - 23:00)",
        partnerUid: "u2",
        reason: "Keperluan keluarga pagi",
      }),
    );
  });
});

describe("PersetujuanTab (Admin Absensi)", () => {
  it("menampilkan pengajuan pending dan menyetujui dengan catatan admin", async () => {
    sessionMocks.role = "admin_absensi";
    api.listAdminRequests.mockResolvedValue({
      pendingCount: 1,
      requests: [
        {
          id: "req-99",
          uid: "u1",
          employeeName: "Gari Iriana",
          kind: "cuti",
          leaveType: "cuti",
          startDate: "2026-10-28",
          endDate: "2026-10-29",
          fromShift: null,
          toShift: null,
          partnerUid: null,
          partnerName: null,
          reason: "Cuti tahunan",
          status: "pending",
          reviewedBy: null,
          reviewerName: null,
          reviewedAt: null,
          reviewNote: null,
          createdAt: Date.parse("2026-10-27T08:00:00+07:00"),
        },
      ],
    });
    api.reviewAdminRequest.mockResolvedValue({ request: { id: "req-99", status: "approved" } });

    render(<MemoryRouter><PersetujuanTab /></MemoryRouter>);

    expect(await screen.findByText("Gari Iriana")).toBeTruthy();
    expect(screen.getByText("1 pengajuan menunggu persetujuan")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText(/Catatan persetujuan/), {
      target: { value: "Selamat berlibur, jadwal aman" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Setujui" }));

    await waitFor(() =>
      expect(api.reviewAdminRequest).toHaveBeenCalledWith("req-99", {
        action: "approve",
        note: "Selamat berlibur, jadwal aman",
      }),
    );
    expect(sessionMocks.reloadMe).toHaveBeenCalled();
  });
});

describe("NotificationBellButton", () => {
  it("menampilkan badge belum dibaca, membuka daftar notifikasi, dan menandai semua sudah dibaca", async () => {
    api.getNotifications.mockResolvedValue({
      unreadCount: 1,
      notifications: [
        {
          id: "n-1",
          recipientUid: "u1",
          kind: "pengajuan_disetujui",
          title: "Pengajuan Cuti Disetujui",
          body: "Permohonan Cuti Anda telah disetujui.",
          refRequestId: "req-99",
          readAt: null,
          createdAt: Date.parse("2026-10-27T10:00:00+07:00"),
        },
      ],
    });
    api.markNotificationsRead.mockResolvedValue({ unreadCount: 0 });

    render(<MemoryRouter><NotificationBellButton /></MemoryRouter>);

    const bell = screen.getByRole("button", { name: "Notifikasi" });
    expect(bell.textContent).toContain("1");

    fireEvent.click(bell);
    expect(await screen.findByText("Pengajuan Cuti Disetujui")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Baca semua/ }));
    await waitFor(() => expect(api.markNotificationsRead).toHaveBeenCalledWith());
  });
});

