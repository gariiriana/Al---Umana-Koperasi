/**
 * Shared dummy product data for demo mode.
 *
 * Admin can load these products via the "Muat Data Dummy" button in
 * ProductsPage. The data is persisted to localStorage under DEMO_KEY so
 * the storefront HomePage can read it without a backend connection.
 *
 * All image URLs are from Wikimedia Commons (Creative Commons licensed)
 * and accurately depict the corresponding Indonesian UMKM/koperasi products.
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
      "https://upload.wikimedia.org/wikipedia/commons/1/13/Uncooked_ST25_rice_on_bamboo_surface.jpg",
    detailImageUrls: [],
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
      "https://upload.wikimedia.org/wikipedia/commons/c/c0/Palm-Oil.jpg",
    detailImageUrls: [],
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
      "https://upload.wikimedia.org/wikipedia/commons/6/6d/Gula_Pasir_Dari_Pohon_Tebu.jpg",
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
      "https://upload.wikimedia.org/wikipedia/commons/6/64/All-Purpose_Flour_%284107895947%29.jpg",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "demo-005",
    itemName: "Telur Ayam Negeri Segar (1 kg)",
    category: "Sembako",
    price: 28000,
    discountPercent: 15,
    quantity: 60,
    unit: "kg",
    available: true,
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/c/cc/Telur_Ayam.jpg",
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
      "https://upload.wikimedia.org/wikipedia/commons/c/c5/Roasted_coffee_beans.jpg",
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
      "https://upload.wikimedia.org/wikipedia/commons/6/6b/ES_TEH_MANIS.jpg",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "demo-008",
    itemName: "Air Mineral Aqua 600ml (24 botol)",
    category: "Minuman",
    price: 55000,
    discountPercent: 15,
    quantity: 20,
    unit: "dus",
    available: true,
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/f/fd/A_bottle_of_Aqua_mineral_water.JPG",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "demo-009",
    itemName: "Sabun Cuci Piring Sunlight 750ml",
    category: "Kebersihan",
    price: 22000,
    discountPercent: 15,
    quantity: 45,
    unit: "botol",
    available: true,
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/f/fa/Dish-soap.jpg",
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
      "https://upload.wikimedia.org/wikipedia/commons/5/53/A_bar_of_soap.jpg",
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
      "https://upload.wikimedia.org/wikipedia/commons/c/c2/Laundry_detergents.jpg",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "demo-012",
    itemName: "Mie Instan Indomie Goreng (5 bungkus)",
    category: "Makanan",
    price: 17500,
    discountPercent: 15,
    quantity: 90,
    unit: "paket",
    available: true,
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/4/4e/Indomie_Mi_goreng_%2803-07-2021%29.jpg",
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
      "https://upload.wikimedia.org/wikipedia/commons/3/3a/Canned_sardines.jpg",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "demo-014",
    itemName: "Kecap Manis ABC Botol 275ml",
    category: "Bumbu & Rempah",
    price: 16000,
    discountPercent: 15,
    quantity: 40,
    unit: "botol",
    available: true,
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/b/ba/Kecap_manis_%26_kecap_asin.jpg",
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
      "https://upload.wikimedia.org/wikipedia/commons/a/a3/Sambal_ulek.JPG",
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
