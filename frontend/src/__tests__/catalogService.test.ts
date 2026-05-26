import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { InventoryItem } from "@/types/inventory";

// Stub the auth token getter so apiClient doesn't try to talk to Firebase.
vi.mock("@/services/authService", () => ({
  getIdToken: vi.fn().mockResolvedValue(null),
}));

import {
  listAvailableProducts,
  getProduct,
  listCategories,
  getRecommended,
} from "@/services/catalogService";

interface FetchCall {
  url: string;
  init?: RequestInit;
}

let calls: FetchCall[];
let nextResponse: () => Response;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeItem(over: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: "item-1",
    itemName: "Nasi Goreng",
    quantity: 10,
    unit: "porsi",
    price: 25_000,
    available: true,
    category: "Makanan",
    imageUrl: "",
    updatedAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

beforeEach(() => {
  calls = [];
  nextResponse = () => jsonResponse([]);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return nextResponse();
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("catalogService", () => {
  describe("listAvailableProducts", () => {
    it("calls /api/catalog/items without query string when no category", async () => {
      const items = [makeItem(), makeItem({ id: "item-2", itemName: "Es Teh" })];
      nextResponse = () => jsonResponse(items);

      const result = await listAvailableProducts();

      expect(result).toEqual(items);
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toMatch(/\/api\/catalog\/items$/);
      expect(calls[0].init?.method).toBe("GET");
    });

    it("appends category query param when category is provided", async () => {
      nextResponse = () => jsonResponse([]);

      await listAvailableProducts({ category: "Makanan" });

      expect(calls[0].url).toMatch(/\/api\/catalog\/items\?category=Makanan$/);
    });

    it("URL-encodes category values containing spaces and ampersands", async () => {
      nextResponse = () => jsonResponse([]);

      await listAvailableProducts({ category: "Roti & Kue" });

      expect(calls[0].url).toContain(
        "category=Roti+%26+Kue"
      );
    });

    it("ignores empty / whitespace-only category filter", async () => {
      nextResponse = () => jsonResponse([]);

      await listAvailableProducts({ category: "   " });

      expect(calls[0].url).toMatch(/\/api\/catalog\/items$/);
    });

    it("unwraps `{ items: [...] }` envelope when the backend returns one", async () => {
      const items = [makeItem()];
      nextResponse = () => jsonResponse({ items });

      const result = await listAvailableProducts();

      expect(result).toEqual(items);
    });
  });

  describe("getProduct", () => {
    it("calls /api/catalog/items/{id} with URL-encoded id", async () => {
      const item = makeItem({ id: "abc/xyz" });
      nextResponse = () => jsonResponse(item);

      const result = await getProduct("abc/xyz");

      expect(result).toEqual(item);
      expect(calls[0].url).toMatch(/\/api\/catalog\/items\/abc%2Fxyz$/);
    });
  });

  describe("listCategories", () => {
    it("returns the array body directly", async () => {
      nextResponse = () => jsonResponse(["Makanan", "Minuman"]);

      const result = await listCategories();

      expect(result).toEqual(["Makanan", "Minuman"]);
      expect(calls[0].url).toMatch(/\/api\/catalog\/categories$/);
    });

    it("unwraps `{ categories: [...] }` envelope", async () => {
      nextResponse = () => jsonResponse({ categories: ["Snack"] });

      const result = await listCategories();

      expect(result).toEqual(["Snack"]);
    });
  });

  describe("getRecommended", () => {
    it("returns at most 5 items, sorted by updatedAt desc", async () => {
      const items: InventoryItem[] = [
        makeItem({ id: "a", updatedAt: "2026-01-01T00:00:00Z" }),
        makeItem({ id: "b", updatedAt: "2026-03-01T00:00:00Z" }),
        makeItem({ id: "c", updatedAt: "2026-02-01T00:00:00Z" }),
        makeItem({ id: "d", updatedAt: "2026-05-01T00:00:00Z" }),
        makeItem({ id: "e", updatedAt: "2026-04-01T00:00:00Z" }),
        makeItem({ id: "f", updatedAt: "2026-06-01T00:00:00Z" }),
      ];
      nextResponse = () => jsonResponse(items);

      const result = await getRecommended();

      expect(result).toHaveLength(5);
      expect(result.map((r) => r.id)).toEqual(["f", "d", "e", "b", "c"]);
    });

    it("returns the full list when fewer than 5 items are available", async () => {
      const items: InventoryItem[] = [
        makeItem({ id: "a", updatedAt: "2026-01-01T00:00:00Z" }),
        makeItem({ id: "b", updatedAt: "2026-02-01T00:00:00Z" }),
      ];
      nextResponse = () => jsonResponse(items);

      const result = await getRecommended();

      expect(result.map((r) => r.id)).toEqual(["b", "a"]);
    });
  });
});
