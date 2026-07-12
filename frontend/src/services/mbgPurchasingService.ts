// ============================================================================
// MBG Purchasing Service — Purchase Orders + Supplier Management
// ============================================================================

import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { MbgPurchaseOrder, MbgSupplier } from '@/types/mbg';

const PO_COLLECTION = 'mbg_purchase_orders';
const SUPPLIER_COLLECTION = 'mbg_suppliers';

// ---- Purchase Orders ----

export function subscribePurchaseOrders(
  batchId: string,
  callback: (orders: MbgPurchaseOrder[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, PO_COLLECTION),
    where('batchId', '==', batchId)
  );
  return onSnapshot(q, (snap) => {
    const orders = snap.docs.map((d) => ({ id: d.id, ...d.data() } as MbgPurchaseOrder));
    orders.sort((a, b) => (a.supplierName || '').localeCompare(b.supplierName || ''));
    callback(orders);
  }, onError);
}

export async function addPurchaseOrder(order: Omit<MbgPurchaseOrder, 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, PO_COLLECTION), order);
  return ref.id;
}

export async function updatePurchaseOrder(id: string, updates: Partial<MbgPurchaseOrder>): Promise<void> {
  await updateDoc(doc(db, PO_COLLECTION, id), { ...updates, updatedAt: new Date().toISOString() });
}

export async function deletePurchaseOrder(id: string): Promise<void> {
  await deleteDoc(doc(db, PO_COLLECTION, id));
}

// ---- Suppliers ----

export function subscribeSuppliers(
  callback: (suppliers: MbgSupplier[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(collection(db, SUPPLIER_COLLECTION), orderBy('name'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as MbgSupplier)));
  }, onError);
}

export async function addSupplier(supplier: Omit<MbgSupplier, 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, SUPPLIER_COLLECTION), supplier);
  return ref.id;
}

export async function updateSupplier(id: string, updates: Partial<MbgSupplier>): Promise<void> {
  await updateDoc(doc(db, SUPPLIER_COLLECTION, id), { ...updates, updatedAt: new Date().toISOString() });
}

export async function deleteSupplier(id: string): Promise<void> {
  await deleteDoc(doc(db, SUPPLIER_COLLECTION, id));
}
