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
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
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
};

/**
 * Returns the Bahasa Indonesian label for a given `OrderStatus`. Falls back to
 * the raw status code when called with a value outside the typed union (which
 * can only happen if the backend returns a status the frontend has not been
 * built against yet).
 */
export function statusLabel(status: OrderStatus): string {
  return ORDER_STATUS_LABELS[status] ?? String(status);
}
