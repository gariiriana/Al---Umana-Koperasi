/**
 * Shared dummy product data for demo mode.
 *
 * Admin can load these products via the "Muat Data Dummy" button in
 * ProductsPage. The data is persisted to localStorage under DEMO_KEY so
 * the storefront HomePage can read it without a backend connection.
 *
 * All image URLs are public Unsplash photos with explicit format/crop
 * parameters so they load quickly on mobile.
 */

import type { InventoryItem } from "@/types/inventory";

export const DEMO_STORAGE_KEY = "al_umana_demo_products_v1";

export const DUMMY_PRODUCTS: InventoryItem[] = [
  {
    id: "demo-001",
    itemName: "Beras Pandan Wangi Premium 5kg",
    category: "Sembako",
    price: 82000,
    quantity: 50,
    unit: "karung",
    available: true,
    imageUrl:
      "https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&q=80&w=600",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "demo-002",
    itemName: "Minyak Goreng Bimoli 2 Liter",
    category: "Sembako",
    price: 38500,
    quantity: 40,
    unit: "botol",
    available: true,
    imageUrl:
      "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&q=80&w=600",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "demo-003",
    itemName: "Gula Pasir Putih Gulaku 1kg",
    category: "Sembako",
    price: 19000,
    quantity: 100,
    unit: "pcs",
    available: true,
    imageUrl:
      "https://images.unsplash.com/photo-1581781870027-04212e231e96?auto=format&fit=crop&q=80&w=600",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "demo-004",
    itemName: "Tepung Terigu Segitiga Biru 1kg",
    category: "Sembako",
    price: 14500,
    quantity: 75,
    unit: "pcs",
    available: true,
    imageUrl:
      "https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&q=80&w=600",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "demo-005",
    itemName: "Telur Ayam Negeri Segar (1 kg)",
    category: "Sembako",
    price: 28000,
    quantity: 60,
    unit: "kg",
    available: true,
    imageUrl:
      "https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?auto=format&fit=crop&q=80&w=600",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "demo-006",
    itemName: "Kopi Bubuk Toraja 200g",
    category: "Minuman",
    price: 47000,
    quantity: 30,
    unit: "pcs",
    available: true,
    imageUrl:
      "https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&q=80&w=600",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "demo-007",
    itemName: "Teh Celup Sosro Premium 50 Sachet",
    category: "Minuman",
    price: 13500,
    quantity: 80,
    unit: "kotak",
    available: true,
    imageUrl:
      "https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&q=80&w=600",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "demo-008",
    itemName: "Air Mineral Aqua 600ml (24 botol)",
    category: "Minuman",
    price: 55000,
    quantity: 20,
    unit: "dus",
    available: true,
    imageUrl:
      "https://images.unsplash.com/photo-1548839140-29a749e1cf4d?auto=format&fit=crop&q=80&w=600",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "demo-009",
    itemName: "Sabun Cuci Piring Sunlight 750ml",
    category: "Kebersihan",
    price: 22000,
    quantity: 45,
    unit: "botol",
    available: true,
    imageUrl:
      "https://images.unsplash.com/photo-1585771724684-38269d6639fd?auto=format&fit=crop&q=80&w=600",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "demo-010",
    itemName: "Sabun Mandi Lifebuoy 100g",
    category: "Kebersihan",
    price: 6500,
    quantity: 120,
    unit: "pcs",
    available: true,
    imageUrl:
      "https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?auto=format&fit=crop&q=80&w=600",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "demo-011",
    itemName: "Deterjen Rinso Anti Noda 900g",
    category: "Kebersihan",
    price: 32000,
    quantity: 35,
    unit: "pcs",
    available: true,
    imageUrl:
      "https://images.unsplash.com/photo-1585814226582-b5e459a2e75c?auto=format&fit=crop&q=80&w=600",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "demo-012",
    itemName: "Mie Instan Indomie Goreng (5 bungkus)",
    category: "Makanan",
    price: 17500,
    quantity: 90,
    unit: "paket",
    available: true,
    imageUrl:
      "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&q=80&w=600",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "demo-013",
    itemName: "Sardines ABC Saus Tomat 155g",
    category: "Makanan",
    price: 12500,
    quantity: 55,
    unit: "kaleng",
    available: true,
    imageUrl:
      "https://images.unsplash.com/photo-1601121141461-9d6647bef0a2?auto=format&fit=crop&q=80&w=600",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "demo-014",
    itemName: "Kecap Manis ABC Botol 275ml",
    category: "Bumbu & Rempah",
    price: 16000,
    quantity: 40,
    unit: "botol",
    available: true,
    imageUrl:
      "https://images.unsplash.com/photo-1612871689665-f0d97e2c2cb1?auto=format&fit=crop&q=80&w=600",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "demo-015",
    itemName: "Sambal Indofood Ekstra Pedas 140ml",
    category: "Bumbu & Rempah",
    price: 14000,
    quantity: 50,
    unit: "botol",
    available: true,
    imageUrl:
      "https://images.unsplash.com/photo-1637866891046-2a24cf82e7ab?auto=format&fit=crop&q=80&w=600",
    updatedAt: new Date().toISOString(),
  },
];

/** Write demo products to localStorage so storefront can pick them up. */
export function saveDemoToStorage(products: InventoryItem[]): void {
  try {
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(products));
  } catch {
    // Quota exceeded or private-mode restriction — ignore silently.
  }
}

/** Read demo products from localStorage. Returns null if not found. */
export function loadDemoFromStorage(): InventoryItem[] | null {
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as InventoryItem[]) : null;
  } catch {
    return null;
  }
}

/** Clear the demo products from localStorage. */
export function clearDemoStorage(): void {
  try {
    localStorage.removeItem(DEMO_STORAGE_KEY);
  } catch {
    // ignore
  }
}
