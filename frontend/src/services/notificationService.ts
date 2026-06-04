import type { Order } from "@/types/order";
import type { InventoryItem } from "@/types/inventory";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  writeBatch,
  getDocs,
  Timestamp,
  type Unsubscribe,
  type DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface NotificationItem {
  id: string;
  type: "order" | "promo" | "info";
  title: { id: string; en: string };
  message: { id: string; en: string };
  time: string;
  orderId?: string;
}

/** Shape of a Firestore notification document. */
export interface FirestoreNotification {
  id: string;
  recipientId: string;
  type: string;
  title: string;
  titleEn: string;
  message: string;
  messageEn: string;
  orderId?: string | null;
  orderShortId?: string | null;
  actorRole: string;
  read: boolean;
  createdAt: string;
}

function firestoreDocToNotification(
  docId: string,
  data: DocumentData
): FirestoreNotification {
  let createdAt: string;
  if (data.createdAt instanceof Timestamp) {
    createdAt = data.createdAt.toDate().toISOString();
  } else if (data.createdAt && typeof data.createdAt.toDate === "function") {
    createdAt = data.createdAt.toDate().toISOString();
  } else if (typeof data.createdAt === "string") {
    createdAt = data.createdAt;
  } else {
    createdAt = new Date().toISOString();
  }

  return {
    id: docId,
    recipientId: (data.recipientId as string) ?? "",
    type: (data.type as string) ?? "system",
    title: (data.title as string) ?? "",
    titleEn: (data.titleEn as string) ?? "",
    message: (data.message as string) ?? "",
    messageEn: (data.messageEn as string) ?? "",
    orderId: data.orderId as string | null | undefined,
    orderShortId: data.orderShortId as string | null | undefined,
    actorRole: (data.actorRole as string) ?? "system",
    read: (data.read as boolean) ?? false,
    createdAt,
  };
}

/**
 * Subscribe to real-time Firestore notifications for a specific user.
 * Returns an unsubscribe function.
 */
export function subscribeNotifications(
  userId: string,
  callback: (notifications: FirestoreNotification[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, "notifications"),
    where("recipientId", "==", userId),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(
    q,
    (snap) => {
      const list: FirestoreNotification[] = snap.docs.map((d) =>
        firestoreDocToNotification(d.id, d.data())
      );
      callback(list);
    },
    onError
  );
}

/**
 * Subscribe only to unread notification count for a user.
 * More efficient than subscribing to full notifications list.
 */
export function subscribeUnreadCount(
  userId: string,
  callback: (count: number) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, "notifications"),
    where("recipientId", "==", userId),
    where("read", "==", false)
  );

  return onSnapshot(
    q,
    (snap) => {
      callback(snap.size);
    },
    onError
  );
}

/** Mark a single notification as read. */
export async function markNotificationAsRead(
  notificationId: string
): Promise<void> {
  const docRef = doc(db, "notifications", notificationId);
  await updateDoc(docRef, { read: true });
}

/** Mark all notifications as read for a user. */
export async function markAllNotificationsAsRead(
  userId: string
): Promise<void> {
  const q = query(
    collection(db, "notifications"),
    where("recipientId", "==", userId),
    where("read", "==", false)
  );
  const snap = await getDocs(q);
  if (snap.empty) return;

  const batch = writeBatch(db);
  snap.docs.forEach((d) => {
    batch.update(d.ref, { read: true });
  });
  await batch.commit();
}

export function parseToIsoString(value: unknown): string {
  if (!value) return new Date().toISOString();
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const valObj = value as Record<string, unknown>;
    if ("seconds" in valObj) {
      const secondsVal = valObj.seconds;
      if (typeof secondsVal === "number") {
        return new Date(secondsVal * 1000).toISOString();
      }
    }
    if ("toDate" in valObj) {
      const toDateFn = valObj.toDate;
      if (typeof toDateFn === "function") {
        return (toDateFn as () => Date)().toISOString();
      }
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
  }
  try {
    if (typeof value === "number") {
      return new Date(value).toISOString();
    }
    const d = new Date(String(value));
    if (!isNaN(d.getTime())) {
      return d.toISOString();
    }
  } catch (err) {
    console.error("Failed to parse date in parseToIsoString:", err);
  }
  return new Date().toISOString();
}

function adjustTime(isoString: string, secondsOffset: number): string {
  try {
    const d = new Date(isoString);
    if (!isNaN(d.getTime())) {
      return new Date(d.getTime() + secondsOffset * 1000).toISOString();
    }
  } catch (err) {
    console.error("Failed to adjust time in notificationService:", err);
  }
  return isoString;
}

export const mapOrderToNotification = (order: Order): NotificationItem[] => {
  const shortId = order.id.slice(-6).toUpperCase();
  const list: NotificationItem[] = [];

  // Define logical sequential baseline times
  const timePlaced = parseToIsoString(order.createdAt);
  const timeConfirmed = adjustTime(timePlaced, 4);

  const timeInProduction = order.productionStartedAt 
    ? parseToIsoString(order.productionStartedAt) 
    : adjustTime(timeConfirmed, 6);

  const timeReady = order.qcReviewedAt 
    ? adjustTime(parseToIsoString(order.qcReviewedAt), -60) 
    : (order.status === "QC" ? parseToIsoString(order.updatedAt) : adjustTime(timeInProduction, 8));

  const timeReadyToDeliver = order.qcReviewedAt 
    ? parseToIsoString(order.qcReviewedAt) 
    : (order.status === "READY_TO_DELIVER" ? parseToIsoString(order.updatedAt) : adjustTime(timeReady, 2));

  const timeOutForDelivery = order.deliveryStartedAt 
    ? parseToIsoString(order.deliveryStartedAt) 
    : (order.status === "OUT_FOR_DELIVERY" ? parseToIsoString(order.updatedAt) : adjustTime(timeReadyToDeliver, 10));

  const timeDelivered = order.deliveredAt 
    ? parseToIsoString(order.deliveredAt) 
    : (order.status === "COMPLETED" ? parseToIsoString(order.updatedAt) : adjustTime(timeOutForDelivery, 10));

  const timeCompleted = order.customerConfirmedAt 
    ? parseToIsoString(order.customerConfirmedAt) 
    : (order.status === "COMPLETED" ? parseToIsoString(order.updatedAt) : adjustTime(timeDelivered, 10));

  // Stage 1: Order Placed
  list.push({
    id: `order-notif-${order.id}-PENDING`,
    type: "order",
    title: { id: `Pesanan Baru #${shortId}`, en: `New Order #${shortId}` },
    message: {
      id: `Pesanan baru sedang diproses.`,
      en: `New order is being processed.`,
    },
    time: timePlaced,
    orderId: order.id,
  });

  const isConfirmedOrBeyond = order.status !== "PENDING";

  if (isConfirmedOrBeyond) {
    list.push({
      id: `order-notif-${order.id}-CONFIRMED`,
      type: "order",
      title: { id: `Pesanan Dikonfirmasi #${shortId}`, en: `Order Confirmed #${shortId}` },
      message: {
        id: `Pesanan #${shortId} telah dikonfirmasi dan mengantre masuk ke proses produksi.`,
        en: `Order #${shortId} has been confirmed and is waiting to enter production.`,
      },
      time: timeConfirmed,
      orderId: order.id,
    });
  }

  // Stage 3: In Production (Cooking)
  const isInProductionOrBeyond = !["PENDING"].includes(order.status);
  if (isInProductionOrBeyond) {
    list.push({
      id: `order-notif-${order.id}-IN_PRODUCTION`,
      type: "order",
      title: { id: `Pesanan Mulai Dimasak #${shortId}`, en: `Cooking Started #${shortId}` },
      message: {
        id: `Pesanan #${shortId} Anda saat ini sedang diproses oleh Tim Produksi Koperasi.`,
        en: `Your order #${shortId} is currently being processed by the Cooperative Production Team.`,
      },
      time: timeInProduction,
      orderId: order.id,
    });
  }

  // Stage 4: Quality Control (QC)
  const isReadyOrBeyond = !["PENDING", "IN_PRODUCTION"].includes(order.status);
  if (isReadyOrBeyond) {
    list.push({
      id: `order-notif-${order.id}-QC`,
      type: "order",
      title: { id: `Uji Kelayakan (QC) #${shortId}`, en: `Quality Control (QC) #${shortId}` },
      message: {
        id: `Pesanan #${shortId} telah selesai dimasak dan sedang masuk ke tahap uji kelayakan (QC) di dapur.`,
        en: `Order #${shortId} has finished cooking and is currently undergoing quality control (QC) check in the kitchen.`,
      },
      time: timeReady,
      orderId: order.id,
    });
  }

  // Stage 5: Ready to Deliver
  const isReadyToDeliverOrBeyond = !["PENDING", "IN_PRODUCTION", "QC"].includes(order.status);
  if (isReadyToDeliverOrBeyond) {
    list.push({
      id: `order-notif-${order.id}-READY_TO_DELIVER`,
      type: "order",
      title: { id: `Pesanan Siap Dikirim #${shortId}`, en: `Order Ready for Delivery #${shortId}` },
      message: {
        id: `Sore! Pesanan #${shortId} selesai diproduksi dan siap diserahkan ke Kurir.`,
        en: `Yay! Order #${shortId} has finished production and is ready for the Courier.`,
      },
      time: timeReadyToDeliver,
      orderId: order.id,
    });
  }

  // Stage 6: Out for Delivery
  const isOutForDeliveryOrBeyond = !["PENDING", "IN_PRODUCTION", "QC", "READY_TO_DELIVER"].includes(order.status);
  if (isOutForDeliveryOrBeyond) {
    list.push({
      id: `order-notif-${order.id}-OUT_FOR_DELIVERY`,
      type: "order",
      title: { id: `Pesanan Sedang Dikirim #${shortId}`, en: `Order Out for Delivery #${shortId}` },
      message: {
        id: `Pesanan #${shortId} Anda saat ini sedang dikirim oleh Kurir.`,
        en: `Your order #${shortId} is currently out for delivery by Courier.`,
      },
      time: timeOutForDelivery,
      orderId: order.id,
    });
  }

  // Stage 7: Delivered (Courier confirmed)
  const isDeliveredOrBeyond = !["PENDING", "IN_PRODUCTION", "QC", "READY_TO_DELIVER", "OUT_FOR_DELIVERY"].includes(order.status);
  if (isDeliveredOrBeyond) {
    list.push({
      id: `order-notif-${order.id}-DELIVERED`,
      type: "order",
      title: { id: `Pesanan Sampai #${shortId}`, en: `Order Arrived #${shortId}` },
      message: {
        id: `Hore! Pesanan #${shortId} telah berhasil diserahterimakan dengan selamat. Terima kasih!`,
        en: `Hooray! Order #${shortId} has been successfully delivered. Thank you!`,
      },
      time: timeDelivered,
      orderId: order.id,
    });
  }

  // Stage 8: Completed / Failed
  if (order.status === "COMPLETED") {
    list.push({
      id: `order-notif-${order.id}-COMPLETED`,
      type: "order",
      title: { id: `Pesanan Selesai #${shortId}`, en: `Order Completed #${shortId}` },
      message: {
        id: `Detail pesanan #${shortId} diperbarui. Status saat ini: COMPLETED.`,
        en: `Order #${shortId} details updated. Current status: COMPLETED.`,
      },
      time: timeCompleted,
      orderId: order.id,
    });
  }

  if (order.status === "DELIVERY_FAILED") {
    list.push({
      id: `order-notif-${order.id}-FAILED`,
      type: "order",
      title: { id: `Pesanan Gagal #${shortId}`, en: `Order Failed #${shortId}` },
      message: {
        id: `Pesanan #${shortId} gagal dikirim: "${order.rejectionReason || "-"}".`,
        en: `Order #${shortId} delivery failed: "${order.rejectionReason || "-"}".`,
      },
      time: parseToIsoString(order.updatedAt),
      orderId: order.id,
    });
  }

  return list;
};;

export const mapProductToPromoNotification = (item: InventoryItem): NotificationItem => {
  const discountPercent = item.discountPercent ?? 0;
  
  const title = {
    id: `Promo Spesial: ${item.itemName}`,
    en: `Special Promo: ${item.itemName}`
  };
  const message = {
    id: `Dapatkan diskon potongan ${discountPercent}% untuk pembelian ${item.itemName} hari ini! Segera pesan sebelum kehabisan stok.`,
    en: `Get a ${discountPercent}% discount on ${item.itemName} today! Order now before stock runs out.`
  };
  
  return {
    id: `promo-product-${item.id}`,
    type: "promo",
    title,
    message,
    time: parseToIsoString(item.updatedAt),
  };
};

export const STATIC_PROMO_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "promo-1",
    type: "promo",
    title: { id: "Diskon Koperasi Berkah!", en: "Cooperative Blessing Discount!" },
    message: {
      id: "Dapatkan diskon potongan 15% untuk produk bertanda 'Star' di toko Koperasi Al-Umanaa hari ini.",
      en: "Get 15% discount for products marked with 'Star' tag at Al-Umanaa Cooperative store today.",
    },
    time: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
  },
  {
    id: "promo-2",
    type: "promo",
    title: { id: "Poin Belanja Melimpah", en: "Abundant Shopping Points" },
    message: {
      id: "Kumpulkan poin belanja dari setiap transaksi untuk ditukarkan dengan voucher belanja menarik di koperasi.",
      en: "Collect shopping points from every transaction to redeem for attractive shopping vouchers in the cooperative.",
    },
    time: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
  },
];

export const STATIC_INFO_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "info-1",
    type: "info",
    title: { id: "Pengumuman Jam Operasional", en: "Operational Hours Announcement" },
    message: {
      id: "Menyambut libur nasional, Koperasi Al-Umanaa tetap melayani pesanan online secara normal. Pengiriman kurir libur pada tanggal merah.",
      en: "Welcoming the national holiday, Al-Umanaa Cooperative continues to serve online orders normally. Courier delivery is closed on public holidays.",
    },
    time: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
  },
  {
    id: "info-2",
    type: "info",
    title: { id: "Jaminan Higienitas & Mutu Al-Umanaa", en: "Al-Umanaa Hygiene & Quality Guarantee" },
    message: {
      id: "Seluruh produk kami diproses dengan protokol kesehatan ketat dan melewati tahap Quality Control (QC) ketat untuk menjamin kesegaran.",
      en: "All of our products are processed with strict health protocols and pass tight Quality Control (QC) to guarantee freshness.",
    },
    time: new Date(Date.now() - 259200000).toISOString(), // 3 days ago
  },
];
