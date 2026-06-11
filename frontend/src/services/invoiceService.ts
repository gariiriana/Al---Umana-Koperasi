import { collection, query, where, getDocs, runTransaction, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Order, OrderLineItem, OrderStatus, OrderType, PaymentStatus } from "@/types/order";

interface FirestoreOrderData {
  orderType?: OrderType;
  institutionName?: string;
  recipientName?: string;
  recipientPhone?: string;
  recipientNotes?: string;
  eventDate?: string;
  foodDetails?: string;
  drinkDetails?: string;
  totalPrice?: number;
  additionalFee?: number;
  additionalNotes?: string;
  paymentStatus?: PaymentStatus;
  paymentDueDate?: string;
  invoiceToken?: string;
  invoiceSignedAt?: unknown;
  invoiceSignatureData?: string;
  status?: OrderStatus;
  items?: OrderLineItem[];
  deliveryAddress?: string;
  deliveryTime?: string;
  promoCode?: string;
  discountAmount?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

function toIsoString(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

function toIsoStringOrUndefined(value: unknown): string | undefined {
  if (value == null) return undefined;
  return toIsoString(value);
}

function parseOrder(snapId: string, data: FirestoreOrderData): Order {
  return {
    id: snapId,
    orderType: data.orderType || "event",
    institutionName: data.institutionName || "",
    recipientName: data.recipientName || "",
    recipientPhone: data.recipientPhone || "",
    recipientNotes: data.recipientNotes,
    eventDate: data.eventDate || "",
    foodDetails: data.foodDetails || "",
    drinkDetails: data.drinkDetails || "",
    totalPrice: data.totalPrice || 0,
    additionalFee: data.additionalFee,
    additionalNotes: data.additionalNotes,
    paymentStatus: data.paymentStatus || "BELUM_DIBAYAR",
    paymentDueDate: data.paymentDueDate || "",
    invoiceToken: data.invoiceToken,
    invoiceSignedAt: toIsoStringOrUndefined(data.invoiceSignedAt),
    invoiceSignatureData: data.invoiceSignatureData,
    status: (data.status || "PENDING") as OrderStatus,
    items: data.items || [],
    deliveryAddress: data.deliveryAddress || "",
    deliveryTime: data.deliveryTime || "",
    promoCode: data.promoCode,
    discountAmount: data.discountAmount,
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
  };
}

/**
 * Fetch a single order by its public invoice token.
 * This runs without authentication.
 */
export async function getOrderByInvoiceToken(token: string): Promise<Order> {
  const colRef = collection(db, "orders");
  const q = query(colRef, where("invoiceToken", "==", token));
  const snap = await getDocs(q);
  
  if (snap.empty) {
    throw new Error("Invoice tidak ditemukan");
  }
  
  const docSnap = snap.docs[0];
  return parseOrder(docSnap.id, docSnap.data());
}

/**
 * Save customer digital signature data.
 * This runs without authentication.
 */
export async function signInvoice(token: string, signatureData: string): Promise<void> {
  const colRef = collection(db, "orders");
  const q = query(colRef, where("invoiceToken", "==", token));
  const snap = await getDocs(q);
  
  if (snap.empty) {
    throw new Error("Invoice tidak ditemukan");
  }
  
  const docRef = snap.docs[0].ref;
  
  await runTransaction(db, async (tx) => {
    tx.update(docRef, {
      invoiceSignedAt: new Date().toISOString(),
      invoiceSignatureData: signatureData,
      updatedAt: new Date(),
    });
  });
}
