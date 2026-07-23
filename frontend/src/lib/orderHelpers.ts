import type { OrderStatus } from "@/types/order";

export const STATUS_LABELS: Record<"id" | "en", Record<OrderStatus, string>> = {
  id: {
    PENDING: "Pending",
    IN_PRODUCTION: "Dalam Produksi",
    QC: "Uji Kelayakan (QC)",
    READY_TO_DELIVER: "Siap Dikirim",
    OUT_FOR_DELIVERY: "Dalam Pengiriman",
    COMPLETED: "Selesai",
    DELIVERY_FAILED: "Gagal Kirim",
    PLACING: "Membuat Pesanan",
    AWAITING_PAYMENT_PROOF: "Menunggu Pembayaran",
    AWAITING_PAYMENT_APPROVAL: "Menunggu Verifikasi",
    PAYMENT_REJECTED: "Pembayaran Ditolak",
    CONFIRMED: "Dikonfirmasi",
    READY: "Uji Kelayakan (QC)",
    DELIVERED: "Selesai",
    FAILED: "Gagal",
  },
  en: {
    PENDING: "Pending",
    IN_PRODUCTION: "In Production",
    QC: "Quality Control (QC)",
    READY_TO_DELIVER: "Ready to Deliver",
    OUT_FOR_DELIVERY: "Out for Delivery",
    COMPLETED: "Completed",
    DELIVERY_FAILED: "Delivery Failed",
    PLACING: "Placing Order",
    AWAITING_PAYMENT_PROOF: "Awaiting Payment",
    AWAITING_PAYMENT_APPROVAL: "Awaiting Approval",
    PAYMENT_REJECTED: "Payment Rejected",
    CONFIRMED: "Confirmed",
    READY: "Quality Control (QC)",
    DELIVERED: "Completed",
    FAILED: "Failed",
  }
};

export function getStatusBadgeClass(status: OrderStatus): string {
  switch (status) {
    case "COMPLETED":
      return "bg-emerald-50 border-emerald-200 text-emerald-700";
    case "DELIVERY_FAILED":
      return "bg-red-50 border-red-200 text-red-700";
    case "PENDING":
      return "bg-amber-50 border-amber-200 text-amber-700";
    case "QC":
    case "IN_PRODUCTION":
    case "READY_TO_DELIVER":
    case "OUT_FOR_DELIVERY":
      return "bg-blue-50 border-blue-200 text-blue-700";
    default:
      return "bg-gray-50 border-gray-200 text-gray-700";
  }
}

export const isOrderPastDeadline = (order: { eventDate?: string; deliveryTime?: string; status: OrderStatus }): boolean => {
  if (!order.eventDate) return false;

  const terminalStatuses = ["COMPLETED", "DELIVERED", "FAILED", "DELIVERY_FAILED"];
  if (terminalStatuses.includes(order.status)) return false;

  const datePart = order.eventDate.slice(0, 10);
  let time = "12:00";
  if (order.deliveryTime) {
    const match = order.deliveryTime.match(/(\d{2})[:.](\d{2})/);
    if (match) {
      time = `${match[1]}:${match[2]}`;
    }
  }
  const ts = Date.parse(`${datePart}T${time}`);
  if (isNaN(ts)) return false;

  return Date.now() > ts;
};

