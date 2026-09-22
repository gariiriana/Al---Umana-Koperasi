import { Timestamp } from "firebase/firestore";
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

const INVOICE_API_BASE_URL =
  (import.meta.env.VITE_INVOICE_API_BASE_URL as string | undefined) ??
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "";

async function requestPublicInvoice<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${INVOICE_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`Invoice request failed (${response.status})`);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
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
  const data = await requestPublicInvoice<FirestoreOrderData & { id: string }>(
    `/api/public/invoices/${encodeURIComponent(token)}`,
  );
  return parseOrder(data.id, data);
}

/**
 * Save customer digital signature data.
 * This runs without authentication.
 */
export async function signInvoice(token: string, signatureData: string): Promise<void> {
  await requestPublicInvoice<void>(`/api/public/invoices/${encodeURIComponent(token)}/sign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signatureData }),
  });
}
