import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  listAdminRequests: vi.fn(),
  reviewAdminLateOut: vi.fn(),
  fetchPhotoUrl: vi.fn(async () => "blob:selfie"),
}));
vi.mock("@/absensi/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/absensi/api")>()),
  ...api,
}));
vi.mock("@/absensi/AbsensiSession", () => ({
  useAbsensiSession: () => ({ reloadMe: vi.fn(async () => {}) }),
}));

import { PersetujuanTab } from "@/absensi/admin/PersetujuanTab";
import type { LateOutExceptionView } from "@/absensi/types";

const wib = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00+07:00`);

const item: LateOutExceptionView = {
  id: "lx1", shiftId: "s1", uid: "joko", employeeName: "Joko", unitName: "Dapur", workDate: "2026-11-13",
  masukAt: wib("2026-11-13", "07:00"), at: wib("2026-11-14", "07:00"), reason: "Lupa menekan clock out",
  photoId: "selfie-1", status: "pending", reviewedBy: null, reviewerName: null, reviewedAt: null, reviewNote: null,
  createdAt: wib("2026-11-14", "07:00"),
};

beforeEach(() => {
  api.listAdminRequests.mockReset();
  api.reviewAdminLateOut.mockReset();
  api.listAdminRequests.mockResolvedValue({ requests: [], zoneExceptions: [], silahExceptions: [], lateOutExceptions: [item], pendingCount: 1 });
  api.reviewAdminLateOut.mockResolvedValue({ ...item, status: "approved" });
});

describe("Persetujuan admin: clock out terlambat", () => {
  it("menampilkan jam masuk, jam pulang, durasi, alasan, dan bisa disetujui", async () => {
    render(<PersetujuanTab />);
    expect(await screen.findByText("Clock out terlambat")).toBeTruthy();
    expect(screen.getByText(/13 November 2026/)).toBeTruthy();
    expect(screen.getByText(/clock in 07:00/)).toBeTruthy();
    expect(screen.getByText(/14\/Nov\/2026 07:00/)).toBeTruthy();
    expect(screen.getByText(/24 jam/)).toBeTruthy();
    expect(screen.getByText(/"Lupa menekan clock out"/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Lihat selfie" }));
    expect(await screen.findByAltText("Selfie Joko")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Setujui" }));
    await waitFor(() => expect(api.reviewAdminLateOut).toHaveBeenCalledWith("lx1", { action: "approve" }));
  });
});
