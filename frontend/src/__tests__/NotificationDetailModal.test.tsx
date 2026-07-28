import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotificationDetailModal } from "../components/delivery/NotificationDetailModal";
import type { FirestoreNotification } from "../services/notificationService";

vi.mock("@/lib/firebase", () => ({
  db: {},
}));

vi.mock("@/services/orderService", () => ({
  getOrder: vi.fn().mockResolvedValue({
    id: "ORDER_PBOTKA",
    status: "DISTRIBUSI",
    customerName: "Gari Iriana",
    recipientName: "Budi Santoso",
    recipientPhone: "08123456789",
    deliveryAddress: "Jl. Merdeka No. 45, Jakarta",
    institutionName: "SDN 01 Merdeka",
    assignedCourierId: "Kurir Ahmad",
    createdAt: "2026-07-28T10:00:00.000Z",
    deliveryStartedAt: "2026-07-28T10:15:00.000Z",
    deliveredAt: "2026-07-28T10:45:00.000Z",
    items: [
      { itemId: "1", name: "Nasi Box Ayam Bakar", quantity: 50, price: 25000 },
    ],
  }),
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn(),
  getDoc: vi.fn().mockResolvedValue({
    exists: () => false,
  }),
  collection: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
}));

describe("NotificationDetailModal Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockNotif: FirestoreNotification = {
    id: "notif-123",
    recipientId: "user-1",
    type: "delivery",
    title: "Kurir Ditugaskan #PBOTKA",
    titleEn: "Courier Assigned #PBOTKA",
    message: "Kurir baru telah ditugaskan untuk mengirim pesanan #PBOTKA.",
    messageEn: "New courier assigned to deliver order #PBOTKA.",
    orderId: "ORDER_PBOTKA",
    orderShortId: "PBOTKA",
    actorRole: "distribusi",
    read: false,
    createdAt: "2026-07-28T10:00:00.000Z",
  };

  it("does not render when isOpen is false", () => {
    const { container } = render(
      <NotificationDetailModal isOpen={false} onClose={() => {}} notification={mockNotif} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders notification title, message and fetches order details when open", async () => {
    render(
      <NotificationDetailModal isOpen={true} onClose={() => {}} notification={mockNotif} />
    );

    await waitFor(
      () => {
        expect(screen.getByText("Kurir Ditugaskan #PBOTKA")).not.toBeNull();
        expect(
          screen.getByText("Kurir baru telah ditugaskan untuk mengirim pesanan #PBOTKA.")
        ).not.toBeNull();
        expect(screen.getByText("Informasi Penerima")).not.toBeNull();
        expect(screen.getByText("Budi Santoso")).not.toBeNull();
        expect(screen.getByText("SDN 01 Merdeka")).not.toBeNull();
        expect(screen.getByText("Nasi Box Ayam Bakar")).not.toBeNull();
      },
      { timeout: 3000 }
    );
  });

  it("calls onClose when close button is clicked", async () => {
    const handleClose = vi.fn();
    render(
      <NotificationDetailModal isOpen={true} onClose={handleClose} notification={mockNotif} />
    );

    const closeBtn = screen.getByLabelText("Tutup Modal");
    fireEvent.click(closeBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
