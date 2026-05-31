import type { Order } from "@/types/order";
import type { InventoryItem } from "@/types/inventory";

export interface NotificationItem {
  id: string;
  type: "order" | "promo" | "info";
  title: { id: string; en: string };
  message: { id: string; en: string };
  time: string;
  orderId?: string;
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
  const timeStage2 = adjustTime(timePlaced, 2);
  
  const timeConfirmed = order.paymentApprovedAt 
    ? parseToIsoString(order.paymentApprovedAt) 
    : adjustTime(timePlaced, 4);

  const timeInProduction = order.productionStartedAt 
    ? parseToIsoString(order.productionStartedAt) 
    : adjustTime(timeConfirmed, 6);

  const timeReady = order.qcReviewedAt 
    ? adjustTime(parseToIsoString(order.qcReviewedAt), -60) 
    : (order.status === "READY" ? parseToIsoString(order.updatedAt) : adjustTime(timeInProduction, 8));

  const timeReadyToDeliver = order.qcReviewedAt 
    ? parseToIsoString(order.qcReviewedAt) 
    : (order.status === "READY_TO_DELIVER" ? parseToIsoString(order.updatedAt) : adjustTime(timeReady, 2));

  const timeOutForDelivery = order.deliveryStartedAt 
    ? parseToIsoString(order.deliveryStartedAt) 
    : (order.status === "OUT_FOR_DELIVERY" ? parseToIsoString(order.updatedAt) : adjustTime(timeReadyToDeliver, 10));

  const timeDelivered = order.deliveredAt 
    ? parseToIsoString(order.deliveredAt) 
    : (order.status === "DELIVERED" ? parseToIsoString(order.updatedAt) : adjustTime(timeOutForDelivery, 10));

  const timeCompleted = order.customerConfirmedAt 
    ? parseToIsoString(order.customerConfirmedAt) 
    : (order.status === "COMPLETED" ? parseToIsoString(order.updatedAt) : adjustTime(timeDelivered, 10));

  // Stage 1: Order Placed
  list.push({
    id: `order-notif-${order.id}-PLACING`,
    type: "order",
    title: { id: `Pesanan Baru #${shortId}`, en: `New Order #${shortId}` },
    message: {
      id: `Pesanan sedang ditempatkan. Silakan selesaikan proses checkout Anda.`,
      en: `Order is being placed. Please complete your checkout process.`,
    },
    time: timePlaced,
    orderId: order.id,
  });

  // Stage 2: Payment Proof needed / Uploaded / Approved / Rejected
  if (order.status === "AWAITING_PAYMENT_PROOF") {
    list.push({
      id: `order-notif-${order.id}-AWAITING_PAYMENT_PROOF`,
      type: "order",
      title: { id: `Pembayaran Pesanan #${shortId}`, en: `Payment for Order #${shortId}` },
      message: {
        id: `Selesaikan transfer pembayaran pesanan #${shortId} Anda dan unggah bukti transfer.`,
        en: `Complete transfer for order #${shortId} and upload your payment proof.`,
      },
      time: timeStage2,
      orderId: order.id,
    });
  }

  if (order.status === "AWAITING_PAYMENT_APPROVAL") {
    list.push({
      id: `order-notif-${order.id}-AWAITING_PAYMENT_APPROVAL`,
      type: "order",
      title: { id: `Verifikasi Pembayaran #${shortId}`, en: `Payment Verification #${shortId}` },
      message: {
        id: `Bukti transfer pesanan #${shortId} Anda telah diterima dan sedang ditinjau oleh Admin.`,
        en: `Your transfer proof for order #${shortId} has been received and is under review by Admin.`,
      },
      time: timeStage2,
      orderId: order.id,
    });
  }

  if (order.status === "PAYMENT_REJECTED") {
    list.push({
      id: `order-notif-${order.id}-PAYMENT_REJECTED`,
      type: "order",
      title: { id: `Pembayaran Ditolak #${shortId}`, en: `Payment Rejected #${shortId}` },
      message: {
        id: `Bukti transfer ditolak: "${order.paymentRejectionReason || "-"}". Silakan unggah bukti baru yang valid.`,
        en: `Transfer proof rejected: "${order.paymentRejectionReason || "-"}". Please upload a new valid proof.`,
      },
      time: order.paymentRejectedAt ? parseToIsoString(order.paymentRejectedAt) : timeStage2,
      orderId: order.id,
    });
  }

  // If payment is approved (status is CONFIRMED or beyond)
  const isConfirmedOrBeyond = ![
    "PLACING",
    "AWAITING_PAYMENT_PROOF",
    "AWAITING_PAYMENT_APPROVAL",
    "PAYMENT_REJECTED",
  ].includes(order.status);

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
  const isInProductionOrBeyond = isConfirmedOrBeyond && order.status !== "CONFIRMED";
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
  const isReadyOrBeyond = isInProductionOrBeyond && order.status !== "IN_PRODUCTION";
  if (isReadyOrBeyond) {
    list.push({
      id: `order-notif-${order.id}-READY`,
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
  const isReadyToDeliverOrBeyond = isReadyOrBeyond && order.status !== "READY";
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
  const isOutForDeliveryOrBeyond = isReadyToDeliverOrBeyond && order.status !== "READY_TO_DELIVER";
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
  const isDeliveredOrBeyond = isOutForDeliveryOrBeyond && order.status !== "OUT_FOR_DELIVERY";
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

  if (order.status === "FAILED") {
    list.push({
      id: `order-notif-${order.id}-FAILED`,
      type: "order",
      title: { id: `Pesanan Gagal #${shortId}`, en: `Order Failed #${shortId}` },
      message: {
        id: `Pesanan #${shortId} dibatalkan karena stok habis atau kendala lain: "${order.rejectionReason || "-"}".`,
        en: `Order #${shortId} cancelled due to out-of-stock or issues: "${order.rejectionReason || "-"}".`,
      },
      time: parseToIsoString(order.updatedAt),
      orderId: order.id,
    });
  }

  return list;
};

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
