import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Order } from "@/types/order";

const fake = vi.hoisted(() => ({ orders: [] as Order[], toast: vi.fn() }));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: "me", email: "dede@example.test" }, profile: { uid: "me", role: "kurir_mbg", displayName: "Dede" } }) }));
// showToast harus stabil seperti di aplikasi: DeliveryPage me-reset daftar setiap kali referensinya berubah.
vi.mock("@/contexts/ToastContext", () => ({ useToast: () => ({ showToast: fake.toast }) }));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/services/realtimeService", () => ({
  subscribeCourierOrders: (_uid: string, listener: (orders: Order[]) => void) => { listener(fake.orders); return () => {}; },
}));
vi.mock("@/services/gpsService", () => ({ startTracker: () => ({ stop: vi.fn() }) }));
vi.mock("@/services/orderService", () => ({ dispatchOrder: vi.fn() }));
vi.mock("@/services/notificationWriter", () => ({ pushNotification: vi.fn() }));
vi.mock("@/services/chunkUploadService", () => ({ uploadFileInChunks: vi.fn() }));
vi.mock("@/components/LiveCamera", () => ({ LiveCamera: () => null }));
vi.mock("@/components/ProductImage", () => ({ ProductImage: () => null }));
vi.mock("@/components/delivery/ProofCapture", () => ({ ProofCapture: () => null }));
vi.mock("@/components/delivery/ProofModal", () => ({ ProofModal: () => null }));
vi.mock("@/utils/cateringDeliveryReceiptPdfExporter", () => ({ exportCateringDeliveryProofPdf: vi.fn() }));

import { DeliveryPage } from "@/pages/DeliveryPage";

const readyOrder = { id: "o1", institutionName: "Bu Ani", customerName: "Ani", recipientName: "Ani", recipientPhone: "08",
  eventDate: "2026-11-13", deliveryTime: "12:00", deliveryAddress: "Jl. Mawar 1", status: "READY_TO_DELIVER",
  assignedCourierId: "me", items: [], createdAt: "2026-11-12T00:00:00Z" } as unknown as Order;

beforeEach(() => {
  cleanup();
  fake.orders = [readyOrder];
});
afterEach(() => window.history.pushState({}, "", "/"));

describe("Antar Katering dibuka dari Tugas Saya", () => {
  it("opens the requested order straight away", async () => {
    window.history.pushState({}, "", "/distribusi/delivery?order=o1");
    render(<DeliveryPage />);
    await vi.waitFor(() => expect(screen.queryByText("Pengantaran Saya")).toBeNull());
  });

  it("stays on the list when the order is not one of mine", () => {
    window.history.pushState({}, "", "/distribusi/delivery?order=nope");
    render(<DeliveryPage />);
    expect(screen.getByText("Pengantaran Saya")).toBeTruthy();
  });
});
