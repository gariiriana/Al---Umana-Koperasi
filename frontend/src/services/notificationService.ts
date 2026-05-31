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

export const mapOrderToNotification = (order: Order): NotificationItem => {
  const shortId = order.id.slice(-6).toUpperCase();
  const time = order.updatedAt || order.createdAt;

  const title = { id: `Pembaruan Pesanan #${shortId}`, en: `Order Update #${shortId}` };
  let msg = { id: "", en: "" };

  switch (order.status) {
    case "PLACING":
      msg = {
        id: `Pesanan sedang ditempatkan. Silakan selesaikan proses checkout Anda.`,
        en: `Order is being placed. Please complete your checkout process.`,
      };
      break;
    case "AWAITING_PAYMENT_PROOF":
      msg = {
        id: `Selesaikan transfer pembayaran pesanan #${shortId} Anda dan unggah bukti transfer.`,
        en: `Complete transfer for order #${shortId} and upload your payment proof.`,
      };
      break;
    case "AWAITING_PAYMENT_APPROVAL":
      msg = {
        id: `Bukti transfer pesanan #${shortId} Anda telah diterima dan sedang ditinjau oleh Admin.`,
        en: `Your transfer proof for order #${shortId} has been received and is under review by Admin.`,
      };
      break;
    case "PAYMENT_REJECTED":
      msg = {
        id: `Bukti transfer ditolak: "${order.paymentRejectionReason || "-"}". Silakan unggah bukti baru yang valid.`,
        en: `Transfer proof rejected: "${order.paymentRejectionReason || "-"}". Please upload a new valid proof.`,
      };
      break;
    case "CONFIRMED":
      msg = {
        id: `Pesanan #${shortId} telah dikonfirmasi dan mengantre masuk ke proses produksi.`,
        en: `Order #${shortId} has been confirmed and is waiting to enter production.`,
      };
      break;
    case "IN_PRODUCTION":
      msg = {
        id: `Pesanan #${shortId} Anda saat ini sedang diproses oleh Tim Produksi Koperasi.`,
        en: `Your order #${shortId} is currently being processed by the Cooperative Production Team.`,
      };
      break;
    case "READY":
    case "READY_TO_DELIVER":
      msg = {
        id: `Sore! Pesanan #${shortId} selesai diproduksi dan siap diserahkan ke Kurir.`,
        en: `Yay! Order #${shortId} has finished production and is ready for the Courier.`,
      };
      break;
    case "OUT_FOR_DELIVERY":
      msg = {
        id: `Pesanan #${shortId} Anda saat ini sedang dikirim oleh Kurir.`,
        en: `Your order #${shortId} is currently out for delivery by Courier.`,
      };
      break;
    case "DELIVERED":
      msg = {
        id: `Hore! Pesanan #${shortId} telah berhasil diserahterimakan dengan selamat. Terima kasih!`,
        en: `Hooray! Order #${shortId} has been successfully delivered. Thank you!`,
      };
      break;
    case "FAILED":
      msg = {
        id: `Pesanan #${shortId} dibatalkan karena stok habis atau kendala lain: "${order.rejectionReason || "-"}".`,
        en: `Order #${shortId} cancelled due to out-of-stock or issues: "${order.rejectionReason || "-"}".`,
      };
      break;
    default:
      msg = {
        id: `Detail pesanan #${shortId} diperbarui. Status saat ini: ${order.status}.`,
        en: `Order #${shortId} details updated. Current status: ${order.status}.`,
      };
  }

  return {
    id: `order-notif-${order.id}-${order.status}`,
    type: "order",
    title,
    message: msg,
    time,
    orderId: order.id,
  };
};

export const mapProductToPromoNotification = (item: InventoryItem): NotificationItem => {
  const discountPercent = (item.price % 3 === 0) ? 10 : (item.price % 5 === 0) ? 15 : 0;
  
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
    time: item.updatedAt || new Date().toISOString(),
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
