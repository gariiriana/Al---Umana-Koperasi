/**
 * Public catalog REST client.
 *
 * Mirrors the Go `catalog` package endpoints exposed at `/api/catalog/*`.
 * These endpoints do not require authentication, but they tolerate a
 * Bearer token if the shared `apiClient` happens to attach one — so we
 * intentionally reuse `apiClient` here rather than duplicating a fetch
 * wrapper.
 *
 * Endpoints:
 *   - GET /api/catalog/items?category=...  → InventoryItem[]
 *   - GET /api/catalog/items/{id}          → InventoryItem
 *   - GET /api/catalog/categories          → string[]
 *
 * The "recommended banner" view (Requirement 14.8) is computed
 * client-side from `listAvailableProducts` so we keep one source of
 * truth for "available" filtering and avoid an extra backend route.
 */

import { api } from "@/services/apiClient";
import type { InventoryItem } from "@/types/inventory";

export interface ListAvailableProductsOptions {
  /** Optional category filter; omitted when undefined or empty. */
  category?: string;
}

/**
 * Fetch all available products. When `category` is supplied, the
 * backend additionally restricts the result to items in that category.
 * The backend already filters by `available = true ∧ quantity > 0`
 * (Requirements 1.1, 1.7, 13.5), so callers can render the result
 * directly without re-filtering.
 */
export async function listAvailableProducts(
  opts: ListAvailableProductsOptions = {}
): Promise<InventoryItem[]> {
  const params = new URLSearchParams();
  if (opts.category && opts.category.trim() !== "") {
    params.set("category", opts.category);
  }
  const qs = params.toString();
  const path = qs ? `/api/catalog/items?${qs}` : "/api/catalog/items";
  const res = await api.get<InventoryItem[] | { items: InventoryItem[] }>(path);
  // Tolerate both `[]` and `{ items: [] }` envelopes so this client
  // doesn't break if the backend response shape is wrapped later.
  return Array.isArray(res) ? res : res.items ?? [];
}

/** Fetch a single product by document ID. */
export function getProduct(id: string): Promise<InventoryItem> {
  return api.get<InventoryItem>(
    `/api/catalog/items/${encodeURIComponent(id)}`
  );
}

/**
 * Distinct non-empty category strings, sorted alphabetically server-side
 * (Requirement 13.6). Used by the storefront category navigation and by
 * the admin product form's category dropdown.
 */
export async function listCategories(): Promise<string[]> {
  const res = await api.get<string[] | { categories: string[] }>(
    "/api/catalog/categories"
  );
  return Array.isArray(res) ? res : res.categories ?? [];
}

/**
 * Top 5 available products sorted by `updatedAt` descending — used by
 * the "Sering Direkomendasikan" banner on the home page (Requirement
 * 14.8). Computed client-side from `listAvailableProducts` so we don't
 * require a dedicated backend route.
 */
export async function getRecommended(): Promise<InventoryItem[]> {
  const items = await listAvailableProducts();
  return [...items]
    .sort((a, b) => {
      // Descending by updatedAt. Stable on equal timestamps because
      // Array.prototype.sort is stable in all modern engines.
      const ta = Date.parse(a.updatedAt);
      const tb = Date.parse(b.updatedAt);
      // NaN-safe: items with an unparseable timestamp sink to the end.
      if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
      if (Number.isNaN(ta)) return 1;
      if (Number.isNaN(tb)) return -1;
      return tb - ta;
    })
    .slice(0, 5);
}
