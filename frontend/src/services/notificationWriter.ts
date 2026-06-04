/**
 * Notification Writer Service
 *
 * Pushes real-time notifications to the Firestore `notifications` collection.
 * Called from orderService.ts whenever an action occurs that the customer
 * should be informed about (order creation, status transitions, payment
 * changes, QC results, delivery updates, etc.).
 *
 * Notifications are written fire-and-forget — errors are logged but never
 * block the calling flow.
 */

import { collection, doc, setDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type NotificationType =
  | "order"
  | "payment"
  | "production"
  | "delivery"
  | "validation"
  | "system";

export interface PushNotificationPayload {
  recipientId: string;
  type: NotificationType;
  title: string;
  titleEn: string;
  message: string;
  messageEn: string;
  orderId?: string;
  orderShortId?: string;
  actorRole: string;
}

/**
 * Write a notification document to Firestore.
 *
 * Always call this with `.catch(console.error)` so failures never propagate
 * to the caller's happy path.
 */
export async function pushNotification(
  payload: PushNotificationPayload
): Promise<void> {
  if (!payload.recipientId) {
    console.warn("[pushNotification] Skipped: no recipientId");
    return;
  }

  const colRef = collection(db, "notifications");
  const notifDoc = doc(colRef);

  await setDoc(notifDoc, {
    recipientId: payload.recipientId,
    type: payload.type,
    title: payload.title,
    titleEn: payload.titleEn,
    message: payload.message,
    messageEn: payload.messageEn,
    orderId: payload.orderId ?? null,
    orderShortId: payload.orderShortId ?? null,
    actorRole: payload.actorRole,
    read: false,
    createdAt: Timestamp.now(),
  });
}

/**
 * Helper to build a short ID from an order ID.
 */
export function shortOrderId(orderId: string): string {
  return orderId.length > 6
    ? orderId.slice(-6).toUpperCase()
    : orderId.toUpperCase();
}
