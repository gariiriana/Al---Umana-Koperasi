/**
 * Notification Writer Service
 *
 * Pushes real-time notifications to the Firestore `notifications` collection.
 * Called from the order, job desk, MBG and Super Admin task flows whenever an
 * action occurs that another account should be informed about.
 *
 * Every document is created with `pushStatus: "pending"`; the Cloudflare
 * Worker `al-umana-push` delivers it to the recipient's phones (even when the
 * app is closed) and marks it "sent". `recipientId` is either a user uid or a
 * role name (e.g. "mo_katering"); the Worker expands role aliases.
 *
 * Notifications are written fire-and-forget — errors are logged but never
 * block the calling flow.
 */

import { collection, doc, setDoc, Timestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { kickPushWorker } from "./pushService";

export type NotificationType =
  | "order"
  | "payment"
  | "production"
  | "delivery"
  | "validation"
  | "jobdesk"
  | "mbg"
  | "task"
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
  /** Halaman yang dibuka saat notifikasi diketuk (default: beranda role). */
  link?: string;
}

const MAX_TITLE = 200;
const MAX_MESSAGE = 1000;

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
  const actorUid = auth.currentUser?.uid;

  await setDoc(notifDoc, {
    recipientId: payload.recipientId,
    type: payload.type,
    title: payload.title.slice(0, MAX_TITLE),
    titleEn: payload.titleEn.slice(0, MAX_TITLE),
    message: payload.message.slice(0, MAX_MESSAGE),
    messageEn: payload.messageEn.slice(0, MAX_MESSAGE),
    orderId: payload.orderId ?? null,
    orderShortId: payload.orderShortId ?? null,
    actorRole: payload.actorRole,
    ...(actorUid ? { actorUid } : {}),
    ...(payload.link ? { link: payload.link } : {}),
    read: false,
    pushStatus: "pending",
    createdAt: Timestamp.now(),
  });
  kickPushWorker();
}

/** Same notification to several recipients (uids and/or role names), deduplicated. */
export async function notifyRecipients(
  recipients: Array<string | null | undefined>,
  payload: Omit<PushNotificationPayload, "recipientId">
): Promise<void> {
  const unique = [...new Set(recipients.filter((r): r is string => Boolean(r)))];
  await Promise.all(unique.map((recipientId) => pushNotification({ ...payload, recipientId })));
}

/** Fire-and-forget variant: a failed notification must never break the user's action. */
export function notifyQuietly(
  recipients: Array<string | null | undefined>,
  payload: Omit<PushNotificationPayload, "recipientId">
): void {
  notifyRecipients(recipients, payload).catch((err) => console.error("[notify] gagal mengirim notifikasi:", err));
}

/**
 * Helper to build a short ID from an order ID.
 */
export function shortOrderId(orderId: string): string {
  return orderId.length > 6
    ? orderId.slice(-6).toUpperCase()
    : orderId.toUpperCase();
}
