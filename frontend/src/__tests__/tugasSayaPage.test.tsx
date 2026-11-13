import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { MbgDeliveryTask } from "@/types/mbg";
import type { Order } from "@/types/order";

const fake = vi.hoisted(() => ({
  orders: [] as Order[],
  tasks: [] as MbgDeliveryTask[],
  batchDates: {} as Record<string, string>,
  batchIdsAsked: [] as string[][],
  toast: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: "me" }, profile: { uid: "me", role: "kurir_mbg", displayName: "Dede" } }) }));
vi.mock("@/contexts/ToastContext", () => ({ useToast: () => ({ showToast: fake.toast }) }));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/utils/date", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/utils/date")>()), getJakartaDate: () => "2026-11-13" }));
vi.mock("@/services/realtimeService", () => ({
  subscribeCourierOrders: (_uid: string, listener: (orders: Order[]) => void) => { listener(fake.orders); return () => {}; },
}));
vi.mock("@/services/courierTaskService", () => ({
  subscribeRecentMbgBatchDates: (_today: string, onData: (dates: Record<string, string>) => void) => { onData(fake.batchDates); return () => {}; },
  subscribeMyMbgTasks: (_uid: string, batchIds: string[], onData: (tasks: MbgDeliveryTask[]) => void) => {
    fake.batchIdsAsked.push(batchIds);
    onData(fake.tasks);
    return () => {};
  },
}));

import { TugasSayaPage } from "@/pages/kurir/TugasSayaPage";

const renderPage = () => render(<MemoryRouter><TugasSayaPage /></MemoryRouter>);

beforeEach(() => {
  cleanup();
  fake.batchIdsAsked = [];
  fake.batchDates = { b1: "2026-11-13" };
  fake.tasks = [{ id: "t1", batchId: "b1", petugasId: "me", petugasName: "Dede", entryIds: ["s1", "s2"], totalPorsi: 200,
    handoverPhotoId: "", handoverAt: "", status: "waiting", deliveryPhotos: [], completedAt: "", createdAt: "", updatedAt: "" }];
  fake.orders = [
    { id: "o1", institutionName: "Bu Ani", eventDate: "2026-11-13", deliveryTime: "12:00", deliveryAddress: "Jl. Mawar 1",
      status: "READY_TO_DELIVER", assignedCourierId: "me" } as Order,
    { id: "o2", institutionName: "Pak Budi", eventDate: "2026-11-13", deliveryTime: "09:00", deliveryAddress: "Jl. Melati",
      status: "COMPLETED", assignedCourierId: "me", deliveredAt: "2026-11-13T03:00:00Z" } as Order,
  ];
});

describe("Tugas Saya", () => {
  it("shows MBG and catering cards that open the right page", () => {
    renderPage();
    const mbg = screen.getByRole("link", { name: /MBG.*2 sekolah/ });
    const katering = screen.getByRole("link", { name: /KATERING.*Bu Ani/ });
    expect(mbg.getAttribute("href")).toBe("/mbg/delivery?batch=b1");
    expect(katering.getAttribute("href")).toBe("/distribusi/delivery?order=o1");
    expect(fake.batchIdsAsked.at(-1)).toEqual(["b1"]);
  });

  it("lists finished work under Selesai hari ini", () => {
    renderPage();
    const done = screen.getByRole("region", { name: /Selesai hari ini/ });
    expect(within(done).getByRole("link", { name: /Pak Budi/ })).toBeTruthy();
    const todo = screen.getByRole("region", { name: /Belum selesai/ });
    expect(within(todo).queryByRole("link", { name: /Pak Budi/ })).toBeNull();
  });

  it("says so plainly when there is nothing to do", () => {
    fake.orders = [];
    fake.tasks = [];
    renderPage();
    expect(screen.getByText("Belum ada tugas hari ini")).toBeTruthy();
  });
});
