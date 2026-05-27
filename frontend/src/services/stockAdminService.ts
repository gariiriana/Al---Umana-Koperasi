/**
 * Stock administration service using Firestore direct access.
 *
 * Implements administrative inventory management operations directly via
 * the Firebase Client SDK, bypassing the Go stock package endpoints.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { InventoryItem, InventoryItemInput } from "@/types/inventory";

function formatUpdatedAt(val: unknown): string {
  if (!val) return new Date().toISOString();
  if (typeof val === "string") return val;
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (val && typeof val === "object" && "toDate" in val) {
    const toDateFn = (val as { toDate?: unknown }).toDate;
    if (typeof toDateFn === "function") {
      const date = toDateFn.call(val);
      if (date instanceof Date) {
        return date.toISOString();
      }
    }
  }
  if (val instanceof Date) return val.toISOString();
  return new Date().toISOString();
}

export interface ListAllItemsOptions {
  /** Optional category filter; matches `InventoryItem.category` exactly. */
  category?: string;
}

/**
 * List every inventory item visible to administrators.
 * Unlike the public catalog endpoint, this does not filter by `available` or `quantity > 0`.
 */
export async function listAllItems(
  opts: ListAllItemsOptions = {}
): Promise<InventoryItem[]> {
  const colRef = collection(db, "inventory");
  let q = query(colRef);
  if (opts.category) {
    q = query(q, where("category", "==", opts.category));
  }
  const snap = await getDocs(q);
  return snap.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      itemName: (data.itemName as string) ?? "",
      quantity: (data.quantity as number) ?? 0,
      unit: (data.unit as string) ?? "",
      price: (data.price as number) ?? 0,
      available: (data.available as boolean) ?? false,
      category: (data.category as string) ?? "",
      imageUrl: (data.imageUrl as string) ?? "",
      updatedAt: formatUpdatedAt(data.updatedAt),
    } as InventoryItem;
  });
}

/** Fetch a single inventory item by ID. */
export async function getItem(id: string): Promise<InventoryItem> {
  const docRef = doc(db, "inventory", id);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) {
    throw new Error(`Inventory item not found: ${id}`);
  }
  const data = docSnap.data();
  return {
    id: docSnap.id,
    itemName: (data.itemName as string) ?? "",
    quantity: (data.quantity as number) ?? 0,
    unit: (data.unit as string) ?? "",
    price: (data.price as number) ?? 0,
    available: (data.available as boolean) ?? false,
    category: (data.category as string) ?? "",
    imageUrl: (data.imageUrl as string) ?? "",
    updatedAt: formatUpdatedAt(data.updatedAt),
  } as InventoryItem;
}

/** Create a new inventory item. Returns the persisted document. */
export async function createItem(input: InventoryItemInput): Promise<InventoryItem> {
  const colRef = collection(db, "inventory");
  const data = {
    itemName: input.itemName,
    quantity: input.quantity,
    unit: input.unit,
    price: input.price,
    available: input.quantity === 0 ? false : input.available,
    category: input.category ?? "",
    imageUrl: input.imageUrl ?? "",
    updatedAt: new Date().toISOString(),
  };
  const docRef = await addDoc(colRef, data);
  return { id: docRef.id, ...data } as InventoryItem;
}

/** Replace an existing inventory item. Returns the persisted document. */
export async function updateItem(
  id: string,
  input: InventoryItemInput
): Promise<InventoryItem> {
  const docRef = doc(db, "inventory", id);
  const data = {
    itemName: input.itemName,
    quantity: input.quantity,
    unit: input.unit,
    price: input.price,
    available: input.quantity === 0 ? false : input.available,
    category: input.category ?? "",
    imageUrl: input.imageUrl ?? "",
    updatedAt: new Date().toISOString(),
  };
  await setDoc(docRef, data, { merge: true });
  return { id, ...data } as InventoryItem;
}

/**
 * Patch only the stock quantity. Enforces the
 * `available = true => quantity > 0` invariant.
 */
export async function patchStock(id: string, quantity: number): Promise<void> {
  const docRef = doc(db, "inventory", id);
  const updates: Record<string, unknown> = {
    quantity,
    updatedAt: new Date().toISOString(),
  };
  if (quantity === 0) {
    updates.available = false;
  }
  await updateDoc(docRef, updates);
}

/** Permanently delete an inventory item and cascade-clean its image file. */
export async function deleteItem(id: string): Promise<void> {
  const docRef = doc(db, "inventory", id);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    const data = docSnap.data();
    const imageUrl = data.imageUrl as string | undefined;
    if (imageUrl && imageUrl.startsWith("product_images/")) {
      const fileId = imageUrl.split("/")[1];
      if (fileId) {
        // Cascade delete parent document
        await deleteDoc(doc(db, "product_images", fileId));
        // Cascade delete chunk documents (0..30 max limits)
        const chunkPromises = [];
        for (let i = 0; i < 30; i++) {
          chunkPromises.push(
            deleteDoc(doc(db, "product_images", fileId, "chunks", String(i)))
          );
        }
        await Promise.all(chunkPromises);
      }
    }
  }
  await deleteDoc(docRef);
}

/**
 * Return the lexicographically sorted list of distinct, non-empty
 * categories currently present in the inventory.
 */
export async function listCategories(): Promise<string[]> {
  const colRef = collection(db, "inventory");
  const snap = await getDocs(colRef);
  const categories = new Set<string>();
  snap.docs.forEach((docSnap) => {
    const cat = docSnap.data().category;
    if (typeof cat === "string" && cat.trim() !== "") {
      categories.add(cat.trim());
    }
  });
  return Array.from(categories).sort();
}
