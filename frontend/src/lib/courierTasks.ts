import {
  getOrderDeadline,
  isActiveCourierAssignment,
  isAssignedToCourier,
} from "@/lib/deliveryAssignment";
import { isMbgTaskAssignedTo } from "@/lib/mbgCourierAssignment";
import { addDays, formatTanggal, getJakartaDate } from "@/utils/date";
import type { MbgDeliveryStatus, MbgDeliveryTask } from "@/types/mbg";
import type { Order, OrderStatus } from "@/types/order";

/**
 * Satu daftar tugas untuk semua kurir (katering & MBG) di halaman "Tugas Saya".
 * Murni (tanpa Firestore) supaya aturan tampil/urut bisa diuji.
 */

export type CourierTaskKind = "mbg" | "katering";

export interface CourierTaskCard {
  /** `mbg:<taskId>` | `katering:<orderId>` */
  key: string;
  kind: CourierTaskKind;
  title: string;
  detail: string;
  statusLabel: string;
  done: boolean;
  sortTime: number;
  /** Halaman yang mengerjakan tugas ini, langsung ke tugasnya. */
  href: string;
}

export interface CourierTaskInput {
  uid: string;
  /** getJakartaDate() */
  today: string;
  orders: Order[];
  mbgTasks: MbgDeliveryTask[];
  /** batchId → tanggal batch (YYYY-MM-DD) */
  batchDates: Record<string, string>;
}

export const MBG_STATUS_LABEL: Record<MbgDeliveryStatus, string> = {
  waiting: "Belum serah terima",
  handover_done: "Sudah serah terima",
  delivering: "Sedang diantar",
  delivered: "Selesai",
};

const KATERING_STATUS_LABEL: Partial<Record<OrderStatus, string>> = {
  READY: "Siap diambil",
  READY_TO_DELIVER: "Siap diambil",
  OUT_FOR_DELIVERY: "Sedang diantar",
  PENDING: "Masih diproduksi",
  IN_PRODUCTION: "Masih diproduksi",
  QC: "Masih diproduksi",
  DELIVERED: "Selesai",
  COMPLETED: "Selesai",
};

export function kateringStatusLabel(status: OrderStatus): string {
  return KATERING_STATUS_LABEL[status] ?? status;
}

const joinParts = (parts: Array<string | undefined>): string =>
  parts.map((part) => part?.trim()).filter(Boolean).join(" · ");

function mbgCard(task: MbgDeliveryTask, tanggal: string, uid: string): CourierTaskCard {
  const asKenek = task.petugasId !== uid && task.kenekId === uid;
  return {
    key: `mbg:${task.id}`,
    kind: "mbg",
    title: formatTanggal(tanggal),
    detail: joinParts([
      `${task.entryIds?.length ?? 0} sekolah`,
      `${(task.totalPorsi ?? 0).toLocaleString("id-ID")} porsi`,
      asKenek ? "sebagai Kenek" : undefined,
    ]),
    statusLabel: MBG_STATUS_LABEL[task.status] ?? task.status,
    done: task.status === "delivered",
    // Antar MBG pagi hari; jam tetap supaya urutannya stabil terhadap pesanan katering.
    sortTime: Date.parse(`${tanggal}T07:00:00+07:00`),
    href: `/mbg/delivery?batch=${encodeURIComponent(task.batchId)}`,
  };
}

function kateringCard(order: Order): CourierTaskCard {
  const done = order.status === "DELIVERED" || order.status === "COMPLETED";
  return {
    key: `katering:${order.id}`,
    kind: "katering",
    title: order.institutionName || order.customerName || order.recipientName || "Pesanan katering",
    detail: joinParts([formatTanggal(order.eventDate), order.deliveryTime, order.deliveryAddress]),
    statusLabel: kateringStatusLabel(order.status),
    done,
    sortTime: getOrderDeadline(order),
    href: `/distribusi/delivery?order=${encodeURIComponent(order.id)}`,
  };
}

export function buildCourierTaskList({ uid, today, orders, mbgTasks, batchDates }: CourierTaskInput): CourierTaskCard[] {
  const from = addDays(today, -1);
  const to = addDays(today, 1);

  const mbg = mbgTasks.flatMap((task) => {
    const tanggal = batchDates[task.batchId];
    if (!tanggal || tanggal < from || tanggal > to || !isMbgTaskAssignedTo(task, uid)) return [];
    return [mbgCard(task, tanggal, uid)];
  });

  const katering = orders.flatMap((order) => {
    if (!isAssignedToCourier(order, [uid])) return [];
    const deliveredToday = (order.status === "DELIVERED" || order.status === "COMPLETED")
      && Boolean(order.deliveredAt) && getJakartaDate(new Date(order.deliveredAt as string)) === today;
    if (!isActiveCourierAssignment(order.status) && !deliveredToday) return [];
    return [kateringCard(order)];
  });

  return [...mbg, ...katering].sort((a, b) =>
    Number(a.done) - Number(b.done) || a.sortTime - b.sortTime || a.key.localeCompare(b.key));
}
