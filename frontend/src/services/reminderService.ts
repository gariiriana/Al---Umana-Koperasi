import { listOrders } from "./orderService";
import { sendWhatsAppNotificationDirect } from "./whatsappService";
import type { Order } from "@/types/order";

/**
 * Get upcoming deliveries that are scheduled within the next N hours.
 */
export async function getUpcomingDeliveries(hoursAhead = 1): Promise<Order[]> {
  const orders = await listOrders();
  const now = Date.now();
  const limitTime = now + hoursAhead * 60 * 60 * 1000;

  return orders.filter((o) => {
    if (o.status !== "READY_TO_DELIVER" && o.status !== "OUT_FOR_DELIVERY") return false;
    
    // Parse delivery target time
    const targetTime = o.deliveryTimerEnd 
      ? new Date(o.deliveryTimerEnd).getTime()
      : new Date(`${(o.eventDate || "").slice(0, 10)}T${o.deliveryTime.includes(":") ? o.deliveryTime : "12:00"}`).getTime();
      
    if (isNaN(targetTime)) return false;
    return targetTime >= now && targetTime <= limitTime;
  });
}

/**
 * Get orders with overdue payments.
 */
export async function getOverduePayments(): Promise<Order[]> {
  const orders = await listOrders();
  const now = Date.now();

  return orders.filter((o) => {
    if (o.paymentStatus === "SUDAH_DIBAYAR") return false;
    if (o.status === "DELIVERY_FAILED" || o.status === "COMPLETED") return false;
    
    const dueDate = new Date(o.paymentDueDate).getTime();
    if (isNaN(dueDate)) return false;
    return dueDate < now;
  });
}

/**
 * Send a WhatsApp reminder to the recipient about an upcoming delivery.
 */
export async function sendDeliveryReminder(orderId: string): Promise<boolean> {
  try {
    const orders = await listOrders();
    const order = orders.find((o) => o.id === orderId);
    if (!order || !order.recipientPhone) return false;

    const shortId = order.id.length > 6 ? order.id.slice(-6).toUpperCase() : order.id.toUpperCase();
    const msg = `Halo ${order.recipientName},\n\nPengingat: Pesanan Anda #${shortId} dijadwalkan untuk dikirim pada ${order.eventDate} pukul ${order.deliveryTime}.\n\nMohon pastikan ada penerima di lokasi pengantaran (${order.deliveryAddress.split(" | ")[0]}). Terima kasih!`;
    
    return await sendWhatsAppNotificationDirect(order.recipientPhone, shortId, msg);
  } catch (err) {
    console.error("[sendDeliveryReminder Error]", err);
    return false;
  }
}

/**
 * Send a WhatsApp reminder to the recipient about an overdue payment.
 */
export async function sendPaymentReminder(orderId: string): Promise<boolean> {
  try {
    const orders = await listOrders();
    const order = orders.find((o) => o.id === orderId);
    if (!order || !order.recipientPhone) return false;

    const shortId = order.id.length > 6 ? order.id.slice(-6).toUpperCase() : order.id.toUpperCase();
    const invoiceUrl = `${window.location.origin}/invoice/${order.invoiceToken}`;
    const msg = `Halo ${order.recipientName},\n\nPengingat Pembayaran: Pesanan Anda #${shortId} dengan total tagihan Rp ${order.totalPrice.toLocaleString()} telah melewati jatuh tempo pada ${new Date(order.paymentDueDate).toLocaleDateString("id-ID")}.\n\nSilakan lakukan tanda tangan digital dan pembayaran tagihan Anda melalui tautan invoice berikut:\n${invoiceUrl}`;
    
    return await sendWhatsAppNotificationDirect(order.recipientPhone, shortId, msg);
  } catch (err) {
    console.error("[sendPaymentReminder Error]", err);
    return false;
  }
}
