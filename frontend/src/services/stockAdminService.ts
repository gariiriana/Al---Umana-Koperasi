/**
 * Stock administration REST client. Each method maps to one endpoint under
 * `/api/admin/inventory` on the Go backend.
 *
 * The backend enforces the `admin` Firebase custom claim on every route in
 * this surface; non-admin tokens receive 403 `FORBIDDEN_ADMIN_ONLY`. The
 * Bearer token is attached automatically by `apiClient` (see
 * `frontend/src/services/apiClient.ts`).
 *
 * Errors propagate as `ApiError` instances from `apiClient`. Field-level
 * validation failures arrive as 400 with `error.details` populated; missing
 * IDs surface as 404.
 */

import { api, apiRequest } from "@/services/apiClient";
import type { InventoryItem, InventoryItemInput } from "@/types/inventory";

interface ListInventoryResponse {
  items: InventoryItem[];
}

interface ListCategoriesResponse {
  categories: string[];
}

export interface ListAllItemsOptions {
  /** Optional category filter; matches `InventoryItem.category` exactly. */
  category?: string;
}

/**
 * List every inventory item visible to administrators. Unlike the public
 * catalog endpoint, this does not filter by `available` or `quantity > 0`.
 */
export async function listAllItems(
  opts: ListAllItemsOptions = {}
): Promise<InventoryItem[]> {
  const params = new URLSearchParams();
  if (opts.category) params.set("category", opts.category);
  const qs = params.toString();
  const path = qs ? `/api/admin/inventory?${qs}` : "/api/admin/inventory";
  const res = await api.get<ListInventoryResponse | InventoryItem[]>(path);
  return Array.isArray(res) ? res : res.items ?? [];
}

/** Fetch a single inventory item by ID. */
export function getItem(id: string): Promise<InventoryItem> {
  return api.get<InventoryItem>(
    `/api/admin/inventory/${encodeURIComponent(id)}`
  );
}

/** Create a new inventory item. Returns the persisted document. */
export function createItem(input: InventoryItemInput): Promise<InventoryItem> {
  return api.post<InventoryItem>("/api/admin/inventory", input);
}

/** Replace an existing inventory item. Returns the persisted document. */
export function updateItem(
  id: string,
  input: InventoryItemInput
): Promise<InventoryItem> {
  return apiRequest<InventoryItem>(
    `/api/admin/inventory/${encodeURIComponent(id)}`,
    { method: "PUT", json: input }
  );
}

/**
 * Patch only the stock quantity. The backend enforces the
 * `available = true ⇒ quantity > 0` invariant: setting `quantity = 0`
 * forces `available = false`.
 */
export async function patchStock(id: string, quantity: number): Promise<void> {
  await api.patch<void>(
    `/api/admin/inventory/${encodeURIComponent(id)}/stock`,
    { quantity }
  );
}

/** Permanently delete an inventory item and cascade-clean its image file. */
export async function deleteItem(id: string): Promise<void> {
  await api.delete<void>(`/api/admin/inventory/${encodeURIComponent(id)}`);
}

/**
 * Return the lexicographically sorted list of distinct, non-empty
 * categories currently present in the inventory.
 */
export async function listCategories(): Promise<string[]> {
  const res = await api.get<ListCategoriesResponse | string[]>(
    "/api/admin/inventory/categories"
  );
  return Array.isArray(res) ? res : res.categories ?? [];
}
