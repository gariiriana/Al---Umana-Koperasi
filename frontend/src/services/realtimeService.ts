/**
 * Real-time Firestore subscription helpers. These wrap `onSnapshot` so
 * components can subscribe to typed streams of domain entities without
 * importing Firestore primitives directly.
 *
 * Each helper returns the unsubscribe function from Firestore so callers
 * can clean up in a useEffect cleanup.
 */

import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type DocumentSnapshot,
  type QuerySnapshot,
  type Unsubscribe,
  Timestamp
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import type { Order, OrderStatus } from "@/types/order";
import type { CourierGPS } from "@/types/courier-gps";
import type { FileMetadata } from "@/types/file";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function toIsoString(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

function snapshotToOrder(snap: DocumentSnapshot<DocumentData>): Order {
  const data = snap.data() ?? {};
  return {
    id: snap.id,
    orderType: (data.orderType as Order["orderType"]) ?? "event",
    institutionName: (data.institutionName as string) ?? "",
    recipientName: (data.recipientName as string) ?? "",
    recipientPhone: (data.recipientPhone as string) ?? "",
    recipientNotes: data.recipientNotes as string | undefined,
    eventDate: (data.eventDate as string) ?? "",
    foodDetails: (data.foodDetails as string) ?? "",
    drinkDetails: (data.drinkDetails as string) ?? "",
    totalPrice: (data.totalPrice as number) ?? 0,
    additionalNotes: data.additionalNotes as string | undefined,
    paymentStatus: (data.paymentStatus as Order["paymentStatus"]) ?? "BELUM_DIBAYAR",
    paymentDueDate: (data.paymentDueDate as string) ?? "",
    invoiceToken: data.invoiceToken as string | undefined,
    invoiceSignedAt: data.invoiceSignedAt ? toIsoString(data.invoiceSignedAt) : undefined,
    invoiceSignatureData: data.invoiceSignatureData as string | undefined,
    manualValidation: data.manualValidation as Order["manualValidation"],
    adminComplaintNotes: data.adminComplaintNotes as string | undefined,
    adminComplaintPhotoId: data.adminComplaintPhotoId as string | undefined,
    status: ((data.status as string) ?? "PENDING") as OrderStatus,
    customerId: (data.customerId as string) ?? "",
    customerName: (data.customerName as string) ?? "",
    items: (data.items as Order["items"]) ?? [],
    deliveryAddress: (data.deliveryAddress as string) ?? "",
    deliveryTime: (data.deliveryTime as string) ?? "",
    rejectionReason: data.rejectionReason as string | undefined,
    outOfStockItems: data.outOfStockItems as string[] | undefined,
    assignedCourierId: data.assignedCourierId as string | undefined,
    productionStartedBy: data.productionStartedBy as string | undefined,
    productionStartedAt: data.productionStartedAt
      ? toIsoString(data.productionStartedAt)
      : undefined,
    qcReviewedBy: data.qcReviewedBy as string | undefined,
    qcReviewedAt: data.qcReviewedAt
      ? toIsoString(data.qcReviewedAt)
      : undefined,
    qcFailReason: data.qcFailReason as string | undefined,
    deliveredAt: data.deliveredAt ? toIsoString(data.deliveredAt) : undefined,
    proofFileIds: data.proofFileIds as string[] | undefined,
    deliveryProofPhotos: data.deliveryProofPhotos as Order["deliveryProofPhotos"],
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
    paymentMethod: ((data.paymentMethod as string) ?? "cod") as Order["paymentMethod"],
    paymentProofFileId: data.paymentProofFileId as string | undefined,
    paymentApprovedBy: data.paymentApprovedBy as string | undefined,
    paymentApprovedAt: data.paymentApprovedAt ? toIsoString(data.paymentApprovedAt) : undefined,
    paymentRejectedBy: data.paymentRejectedBy as string | undefined,
    paymentRejectedAt: data.paymentRejectedAt ? toIsoString(data.paymentRejectedAt) : undefined,
    paymentRejectionReason: data.paymentRejectionReason as string | undefined,
    productionStartPhotoId: data.productionStartPhotoId as string | undefined,
    productionTimerEnd: data.productionTimerEnd ? toIsoString(data.productionTimerEnd) : undefined,
    productionDurationMinutes: data.productionDurationMinutes as number | undefined,
    deliveryStartPhotoId: data.deliveryStartPhotoId as string | undefined,
    deliveryTimerEnd: data.deliveryTimerEnd ? toIsoString(data.deliveryTimerEnd) : undefined,
    deliveryStartedAt: data.deliveryStartedAt ? toIsoString(data.deliveryStartedAt) : undefined,
    deliveryDurationMinutes: data.deliveryDurationMinutes as number | undefined,
    courierLat: data.courierLat as number | undefined,
    courierLng: data.courierLng as number | undefined,
    deliveryLat: data.deliveryLat as number | undefined,
    deliveryLng: data.deliveryLng as number | undefined,
    customerConfirmedAt: data.customerConfirmedAt ? toIsoString(data.customerConfirmedAt) : undefined,
    rating: data.rating as number | undefined,
    review: data.review as string | undefined,
    reviewPhotoId: data.reviewPhotoId as string | undefined,
    reviewedAt: data.reviewedAt ? toIsoString(data.reviewedAt) : undefined,
    promoCode: data.promoCode as string | undefined,
    discountAmount: data.discountAmount as number | undefined,
    kitchen: data.kitchen as string | undefined,
    itemKitchens: data.itemKitchens as Record<string, string> | undefined,
    qaStartChecklist: data.qaStartChecklist as Order["qaStartChecklist"] | undefined,
    isPreOrder: !!data.isPreOrder,
  };
}

function snapshotToOrders(snap: QuerySnapshot<DocumentData>): Order[] {
  return snap.docs.map(snapshotToOrder);
}

function snapshotToCourierGPS(
  snap: DocumentSnapshot<DocumentData>
): CourierGPS | null {
  const data = snap.data();
  if (!data) return null;
  return {
    orderId: (data.orderId as string) ?? "",
    courierId: (data.courierId as string) ?? "",
    latitude: typeof data.latitude === "number" ? data.latitude : 0,
    longitude: typeof data.longitude === "number" ? data.longitude : 0,
    timestamp: toIsoString(data.timestamp),
  };
}

/* ------------------------------------------------------------------ */
/*  Subscriptions                                                      */
/* ------------------------------------------------------------------ */

/** Subscribe to all orders, ordered by creation time descending. */
export function subscribeOrders(
  listener: (orders: Order[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) => listener(snapshotToOrders(snap)),
    onError
  );
}

/** Subscribe to orders filtered by a single status. */
export function subscribeOrdersByStatus(
  status: OrderStatus,
  listener: (orders: Order[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, "orders"),
    where("status", "==", status),
    orderBy("createdAt", "asc")
  );
  return onSnapshot(
    q,
    (snap) => listener(snapshotToOrders(snap)),
    onError
  );
}

/** Subscribe to a single order document. */
export function subscribeOrder(
  id: string,
  listener: (order: Order | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, "orders", id),
    (snap) => listener(snap.exists() ? snapshotToOrder(snap) : null),
    onError
  );
}

/** Subscribe to all courier GPS locations. */
export function subscribeCourierLocations(
  listener: (locations: CourierGPS[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, "courier_locations"),
    (snap) => {
      const locations: CourierGPS[] = [];
      snap.forEach((d) => {
        const loc = snapshotToCourierGPS(d);
        if (loc) locations.push(loc);
      });
      listener(locations);
    },
    onError
  );
}

/** Subscribe to GPS updates for a specific order. */
export function subscribeOrderLocation(
  orderId: string,
  courierId: string,
  listener: (loc: CourierGPS | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, "courier_locations", `${orderId}_${courierId}`),
    (snap) => listener(snap.exists() ? snapshotToCourierGPS(snap) : null),
    onError
  );
}

/** Subscribe to delivery files for a given order. */
export function subscribeOrderFiles(
  orderId: string,
  listener: (files: FileMetadata[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, "delivery_files"),
    where("orderId", "==", orderId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const files: FileMetadata[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          orderId: (data.orderId as string) ?? "",
          fileName: (data.fileName as string) ?? "",
          fileSize: (data.fileSize as number) ?? 0,
          fileType: (data.fileType as string) ?? "",
          totalChunks: (data.totalChunks as number) ?? 0,
          status: (data.status as FileMetadata["status"]) ?? "uploading",
          uploadedBy: (data.uploadedBy as string) ?? "",
          createdAt: toIsoString(data.createdAt),
        };
      });
      listener(files);
    },
    onError
  );
}
