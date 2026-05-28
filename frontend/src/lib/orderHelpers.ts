import type { OrderStatus } from "@/types/order";

export const STATUS_LABELS: Record<"id" | "en", Record<OrderStatus, string>> = {
  id: {
    PLACING: "Menunggu Konfirmasi",
    AWAITING_PAYMENT_PROOF: "Menunggu Bukti Pembayaran",
    AWAITING_PAYMENT_APPROVAL: "Menunggu Persetujuan Pembayaran",
    PAYMENT_REJECTED: "Pembayaran Ditolak",
    CONFIRMED: "Sudah Dibayar, Menunggu Proses Memasak",
    IN_PRODUCTION: "Sedang Diproses",
    READY: "Siap",
    READY_TO_DELIVER: "Siap Dikirim",
    OUT_FOR_DELIVERY: "Dalam Pengiriman",
    DELIVERED: "Terkirim",
    FAILED: "Gagal",
  },
  en: {
    PLACING: "Awaiting Confirmation",
    AWAITING_PAYMENT_PROOF: "Awaiting Payment Proof",
    AWAITING_PAYMENT_APPROVAL: "Awaiting Payment Approval",
    PAYMENT_REJECTED: "Payment Rejected",
    CONFIRMED: "Paid, Awaiting Cooking Process",
    IN_PRODUCTION: "Processing",
    READY: "Ready",
    READY_TO_DELIVER: "Ready to Deliver",
    OUT_FOR_DELIVERY: "Out for Delivery",
    DELIVERED: "Delivered",
    FAILED: "Failed",
  }
};

export function getStatusBadgeClass(status: OrderStatus): string {
  switch (status) {
    case "DELIVERED":
      return "bg-emerald-50 border-emerald-200 text-emerald-700";
    case "FAILED":
    case "PAYMENT_REJECTED":
      return "bg-red-50 border-red-200 text-red-700";
    case "AWAITING_PAYMENT_PROOF":
    case "AWAITING_PAYMENT_APPROVAL":
      return "bg-amber-50 border-amber-200 text-amber-700";
    case "CONFIRMED":
    case "IN_PRODUCTION":
    case "READY":
    case "READY_TO_DELIVER":
    case "OUT_FOR_DELIVERY":
      return "bg-blue-50 border-blue-200 text-blue-700";
    default:
      return "bg-gray-50 border-gray-200 text-gray-700";
  }
}
