import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sessionMocks = vi.hoisted(() => ({
  reloadMe: vi.fn(async () => {}),
  signOut: vi.fn(async () => {}),
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
      name: "Gari Iriana",
      email: "gariiriana14@gmail.com",
      role: sessionMocks.role,
      faceRequired: true,
      activated: true,
      areas: [{ id: "sppg", name: "SPPG Sukabumi Gunungguruh Kebonmanggu", polygon: [], toleranceM: 40, active: true }],
      faceDescriptor: [0.1, 0.2],
      unreadNotifications: sessionMocks.unreadNotifications,
      pendingRequests: 1,
    },
    reloadMe: sessionMocks.reloadMe,
    signOut: sessionMocks.signOut,
  }),
}));

vi.mock("@/absensi/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/absensi/api")>()),
  ...api,
}));

import { PersetujuanTab } from "@/absensi/admin/PersetujuanTab";
import { NotificationBellButton } from "@/absensi/components/NotificationSheet";
import { LEAVE_SUBTYPE_OPTIONS, PengajuanPage } from "@/absensi/pages/PengajuanPage";
import { ProfilPage } from "@/absensi/pages/ProfilPage";

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  sessionMocks.reloadMe.mockClear();
  sessionMocks.signOut.mockClear();
  sessionMocks.role = "absen_karyawan";
  sessionMocks.unreadNotifications = 1;
  api.listMyRequests.mockResolvedValue({ requests: [] });
  api.getRekan.mockResolvedValue({ coworkers: [{ uid: "u2", name: "Budi" }] });
  api.createRequest.mockResolvedValue({ id: "r1" });
});

describe("PengajuanPage (Karyawan - SS 1, SS 2, SS 3)", () => {
  it("menampilkan 15 jenis cuti di Pilih Jenis, mengisi Karyawan Pengganti, dan mengirim Permohonan Cuti", async () => {
    render(
      <MemoryRouter initialEntries={["/absensi/persetujuan?buat=cuti"]}>
        <PengajuanPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("dialog", { name: "Form Permohonan Cuti" })).toBeTruthy();
    expect(LEAVE_SUBTYPE_OPTIONS).toHaveLength(15);

    // Buka bottom sheet Pilih Jenis (SS 2)
    fireEvent.click(screen.getByRole("button", { name: "Pilih Jenis Cuti" }));
    expect(await screen.findByRole("dialog", { name: "Pilih Jenis" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cuti Besar (Long Service)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Khitanan anak" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Replacement Off (Cuti Pengganti)" })).toBeTruthy();

    // Pilih jenis "Sakit"
    fireEvent.click(screen.getByRole("button", { name: "Sakit" }));

    await waitFor(() => expect(api.getRekan).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("Tanggal Mulai"), { target: { value: "2026-10-28" } });
    fireEvent.change(screen.getByLabelText("Tanggal Selesai"), { target: { value: "2026-10-29" } });
    fireEvent.change(screen.getByLabelText("Alasan"), { target: { value: "Demam, sendi sakit, migrain berat" } });
    fireEvent.change(screen.getByLabelText("Karyawan Pengganti"), { target: { value: "u2" } });

    fireEvent.click(screen.getByRole("button", { name: "Kirim Permohonan" }));

    await waitFor(() =>
      expect(api.createRequest).toHaveBeenCalledWith({
        kind: "cuti",
        leaveType: "sakit",
        leaveSubtype: "Sakit",
        startDate: "2026-10-28",
        endDate: "2026-10-29",
        partnerUid: "u2",
        attachmentName: undefined,
        reason: "Demam, sendi sakit, migrain berat",
      }),
    );
    await waitFor(() => expect(api.listMyRequests).toHaveBeenCalledTimes(2));
  });

  it("menampilkan riwayat Permohonan Cuti Saya dikelompokkan per periode dan tombol Lihat Riwayat / +", async () => {
    api.listMyRequests.mockResolvedValue({
      requests: [
        {
          id: "req-1",
          uid: "u1",
          employeeName: "Gari Iriana",
          kind: "cuti",
          leaveType: "sakit",
          leaveSubtype: "Sakit",
          startDate: "2026-08-26",
          endDate: "2026-08-28",
          fromShift: null,
          toShift: null,
          partnerUid: null,
          partnerName: null,
          reason: "Dirawat di rumah sakit karena sakit Campak",
          status: "approved",
          reviewedBy: "adm",
          reviewerName: "Admin Absensi",
          reviewedAt: Date.parse("2026-08-26T07:30:00+07:00"),
          reviewNote: null,
          createdAt: Date.parse("2026-08-26T07:00:00+07:00"),
        },
      ],
    });

    render(
      <MemoryRouter initialEntries={["/absensi/persetujuan"]}>
        <PengajuanPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Permohonan Cuti Saya")).toBeTruthy();
    expect(await screen.findByText("PERMINTAAN LAMA")).toBeTruthy();
    expect(screen.getByText(/Dirawat di rumah sakit karena sakit Campak/)).toBeTruthy();
    expect(screen.getByText("Status: Disetujui")).toBeTruthy();
    expect(screen.getByText("Penyetuju: Admin Absensi")).toBeTruthy();
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

describe("ProfilPage (Karyawan - SS 4)", () => {
  it("menampilkan kartu identitas, menu AKUN lengkap, versi aplikasi, dan tombol Keluar", async () => {
    render(
      <MemoryRouter initialEntries={["/absensi/profil"]}>
        <ProfilPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Gari Iriana")).toBeTruthy();
    expect(screen.getByText("AKUN")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Edit Profil/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Registrasi Wajah/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ubah Kata Sandi/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Pengaturan Bahasa/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Riwayat Absensi Saya/ })).toBeTruthy();
    expect(screen.getByText("Ver. 2.9.3 (94)")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Keluar" }));
    expect(sessionMocks.signOut).toHaveBeenCalled();
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
          leaveSubtype: "Cuti Tahunan",
          startDate: "2026-10-28",
          endDate: "2026-10-29",
          fromShift: null,
          toShift: null,
          partnerUid: "u2",
          partnerName: "Budi",
          attachmentName: "surat.pdf",
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
    expect(screen.getByText("Cuti Tahunan")).toBeTruthy();
    expect(screen.getByText(/Karyawan pengganti: Budi/)).toBeTruthy();
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
