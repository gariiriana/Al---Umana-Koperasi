/**
 * Public catalog client using Firestore direct access.
 *
 * Implements catalog operations directly via the Firebase Client SDK,
 * bypassing the Go catalog package endpoints.
 *
 * Requirements covered: 1.1, 1.7, 13.5, 13.6, 14.8.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { InventoryItem } from "@/types/inventory";

import { loadDemoFromStorage } from "@/lib/dummyData";

export interface ListAvailableProductsOptions {
  /** Optional category filter; omitted when undefined or empty. */
  category?: string;
}

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

/**
 * Fetch all available products.
 * Filters by `available == true` and `quantity > 0` ordered by quantity asc.
 * (Requirements 1.1, 1.7, 13.5)
 */
export async function listAvailableProducts(
  opts: ListAvailableProductsOptions = {}
): Promise<InventoryItem[]> {
  const demoProducts = loadDemoFromStorage();
  if (demoProducts && demoProducts.length > 0) {
    let filtered = demoProducts.filter((item) => item.available && item.quantity > 0);
    if (opts.category && opts.category.trim() !== "") {
      filtered = filtered.filter((item) => item.category?.trim() === opts.category?.trim());
    }
    filtered.sort((a, b) => a.quantity - b.quantity);
    return filtered;
  }

  const colRef = collection(db, "inventory");
  
  // Construct a query that only uses equality filters to avoid index requirements
  let q = query(colRef, where("available", "==", true));

  if (opts.category && opts.category.trim() !== "") {
    q = query(q, where("category", "==", opts.category.trim()));
  }

  const snap = await getDocs(q);
  const items = snap.docs.map((docSnap) => {
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
    } as InventoryItem;
  });

  // Filter quantity > 0 and sort by quantity asc in-memory to avoid composite index
  const filtered = items.filter((item) => item.quantity > 0);
  filtered.sort((a, b) => a.quantity - b.quantity);
  return filtered;
}

/** Fetch a single product by document ID. */
export async function getProduct(id: string): Promise<InventoryItem> {
  const demoProducts = loadDemoFromStorage();
  if (demoProducts && demoProducts.length > 0) {
    const item = demoProducts.find((p) => p.id === id);
    if (item) return item;
  }

  const docRef = doc(db, "inventory", id);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) {
    throw new Error(`Product not found: ${id}`);
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
  } as InventoryItem;
}

/**
 * Distinct non-empty category strings, sorted alphabetically
 * (Requirement 13.6).
 */
export async function listCategories(): Promise<string[]> {
  const demoProducts = loadDemoFromStorage();
  if (demoProducts && demoProducts.length > 0) {
    const categories = new Set<string>();
    demoProducts.forEach((p) => {
      if (p.category && p.category.trim() !== "") {
        categories.add(p.category.trim());
      }
    });
    return Array.from(categories).sort();
  }

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

/**
 * Top 5 available products sorted by `updatedAt` descending — used by
 * the "Sering Direkomendasikan" banner on the home page (Requirement
 * 14.8).
 */
export async function getRecommended(): Promise<InventoryItem[]> {
  const items = await listAvailableProducts();
  return [...items]
    .sort((a, b) => {
      const ta = Date.parse(a.updatedAt);
      const tb = Date.parse(b.updatedAt);
      if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
      if (Number.isNaN(ta)) return 1;
      if (Number.isNaN(tb)) return -1;
      return tb - ta;
    })
    .slice(0, 5);
}
