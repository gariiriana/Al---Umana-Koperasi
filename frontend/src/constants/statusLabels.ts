/**
 * Bahasa Indonesian labels for every {@link OrderStatus} value.
 *
 * The mapping is the single source of truth referenced by Requirement 9.5
 * of the customer-storefront-admin-stock spec. The exhaustive `Record` shape
 * forces the compiler to flag any new `OrderStatus` member that has not been
 * given a label here.
 */

import type { OrderStatus } from "@/types/order";

/** Complete mapping from `OrderStatus` to its Bahasa Indonesian label. */
export const ORDER_STATUS_LABELS_ID: Record<OrderStatus, string> = {
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
};

/** Complete mapping from `OrderStatus` to its English label. */
export const ORDER_STATUS_LABELS_EN: Record<OrderStatus, string> = {
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
};

export const ORDER_STATUS_LABELS = ORDER_STATUS_LABELS_ID;

/**
 * Returns the localized label for a given `OrderStatus`. Falls back to
 * the raw status code when called with a value outside the typed union.
 */
export function statusLabel(status: OrderStatus, lang: "id" | "en" = "id"): string {
  const labels = lang === "en" ? ORDER_STATUS_LABELS_EN : ORDER_STATUS_LABELS_ID;
  return labels[status] ?? String(status);
}
