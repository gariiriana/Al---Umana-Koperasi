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
  },
  en: {
    PENDING: "Pending",
    IN_PRODUCTION: "In Production",
    QC: "Quality Control (QC)",
    READY_TO_DELIVER: "Ready to Deliver",
    OUT_FOR_DELIVERY: "Out for Delivery",
    COMPLETED: "Completed",
    DELIVERY_FAILED: "Delivery Failed",
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
