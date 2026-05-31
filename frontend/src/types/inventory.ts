/**
 * Inventory item types — the frontend mirror of the Go `stock.InventoryItem`
 * struct in `backend/internal/stock/models.go`.
 *
 * `imageUrl` (when set) is a Firestore reference of the form
 * `product_images/{fileId}`, not an HTTP URL. Callers fetch the bytes via
 * the `/api/files/product_images/{fileId}/download` endpoint.
 */

export interface InventoryItem {
  /** Firestore document ID. */
  id: string;
  /** Display name, 1–200 chars after trim. */
  itemName: string;
  /** Stock on hand, 0–99,999. */
  quantity: number;
  /** Unit of measure (e.g. "pcs", "kg"), 1–50 chars after trim. */
  unit: string;
  /** Price in IDR, integer rupiah ≥ 0. */
  price: number;
  /** Discount percentage, 0–100. */
  discountPercent?: number;
  /** Admin-controlled visibility flag. `true` ⇒ `quantity > 0`. */
  available: boolean;
  /** Required category, 1–50 chars after trim. */
  category: string;
  /** `product_images/{fileId}` reference; absent when no image is attached. */
  imageUrl?: string;
  /** Secondary image references. */
  detailImageUrls?: string[];
  /** ISO-8601 server timestamp of the last update. */
  updatedAt: string;
}

/** Payload accepted by create and update endpoints. */
export interface InventoryItemInput {
  itemName: string;
  quantity: number;
  unit: string;
  price: number;
  discountPercent?: number;
  available: boolean;
  category: string;
  imageUrl?: string;
  detailImageUrls?: string[];
}
