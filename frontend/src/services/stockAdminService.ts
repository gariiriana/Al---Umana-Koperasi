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
function syncDemoStorage(action: 'create' | 'update' | 'delete', item: InventoryItem) {
  try {
    const raw = localStorage.getItem("al_umana_demo_products_v1");
    if (!raw) return;
    let products = JSON.parse(raw) as InventoryItem[];
    if (!Array.isArray(products)) return;
    if (action === 'create') {
      products.push(item);
    } else if (action === 'update') {
      products = products.map(p => p.id === item.id ? { ...p, ...item } : p);
    } else if (action === 'delete') {
      products = products.filter(p => p.id !== item.id);
    }
    localStorage.setItem("al_umana_demo_products_v1", JSON.stringify(products));
  } catch (err) {
    console.error("Failed to sync demo storage:", err);
  }
}

function syncDemoStock(id: string, quantity: number) {
  try {
    const raw = localStorage.getItem("al_umana_demo_products_v1");
    if (!raw) return;
    let products = JSON.parse(raw) as InventoryItem[];
    if (!Array.isArray(products)) return;
    products = products.map(p => {
      if (p.id === id) {
        const available = quantity === 0 ? false : p.available;
        return { ...p, quantity, available };
      }
      return p;
    });
    localStorage.setItem("al_umana_demo_products_v1", JSON.stringify(products));
  } catch (err) {
    console.error("Failed to sync demo stock:", err);
  }
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
      discountPercent: (data.discountPercent as number) ?? 0,
      available: (data.available as boolean) ?? false,
      category: (data.category as string) ?? "",
      imageUrl: (data.imageUrl as string) ?? "",
      detailImageUrls: Array.isArray(data.detailImageUrls) ? (data.detailImageUrls as string[]) : [],
      updatedAt: formatUpdatedAt(data.updatedAt),
      ingredients: (data.ingredients as string) ?? "",
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
    discountPercent: (data.discountPercent as number) ?? 0,
    available: (data.available as boolean) ?? false,
    category: (data.category as string) ?? "",
    imageUrl: (data.imageUrl as string) ?? "",
    detailImageUrls: Array.isArray(data.detailImageUrls) ? (data.detailImageUrls as string[]) : [],
    updatedAt: formatUpdatedAt(data.updatedAt),
    ingredients: (data.ingredients as string) ?? "",
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
    discountPercent: input.discountPercent ?? 0,
    available: input.quantity === 0 ? false : input.available,
    category: input.category ?? "",
    imageUrl: input.imageUrl ?? "",
    detailImageUrls: input.detailImageUrls ?? [],
    ingredients: input.ingredients ?? "",
    updatedAt: new Date().toISOString(),
  };
  const docRef = await addDoc(colRef, data);
  const newItem = { id: docRef.id, ...data } as InventoryItem;
  syncDemoStorage('create', newItem);
  return newItem;
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
    discountPercent: input.discountPercent ?? 0,
    available: input.quantity === 0 ? false : input.available,
    category: input.category ?? "",
    imageUrl: input.imageUrl ?? "",
    detailImageUrls: input.detailImageUrls ?? [],
    ingredients: input.ingredients ?? "",
    updatedAt: new Date().toISOString(),
  };
  await setDoc(docRef, data, { merge: true });
  const updated = { id, ...data } as InventoryItem;
  syncDemoStorage('update', updated);
  return updated;
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
  syncDemoStock(id, quantity);
}

/** Permanently delete an image and all its associated chunks from Firestore. */
export async function deleteImageFileAndChunks(imageUrl: string): Promise<void> {
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

/** Permanently delete an inventory item and cascade-clean its image file. */
export async function deleteItem(id: string): Promise<void> {
  const docRef = doc(db, "inventory", id);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    const data = docSnap.data();
    const imageUrl = data.imageUrl as string | undefined;
    if (imageUrl) {
      await deleteImageFileAndChunks(imageUrl);
    }
    const detailImageUrls = data.detailImageUrls as string[] | undefined;
    if (detailImageUrls && Array.isArray(detailImageUrls)) {
      await Promise.all(detailImageUrls.map((url) => deleteImageFileAndChunks(url)));
    }
  }
  await deleteDoc(docRef);
  syncDemoStorage('delete', { id } as InventoryItem);
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
