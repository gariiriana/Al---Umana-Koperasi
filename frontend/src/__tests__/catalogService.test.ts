import { describe, it, expect, vi, beforeEach } from "vitest";
import type { InventoryItem } from "@/types/inventory";

// Mock firebase/firestore
const mockGetDocs = vi.fn();
const mockGetDoc = vi.fn();

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  doc: vi.fn((_db, _col, id) => {
    // E.g. doc(db, "inventory", "abc/xyz") -> total segments: collection (1) + "abc/xyz" (2) = 3 segments.
    // Firestore requires an even number of segments for doc references.
    const segmentsCount = 1 + (id ? id.split("/").length : 0);
    if (segmentsCount % 2 !== 0) {
      throw new Error("Invalid document reference. Document references must have an even number of segments");
    }
    return { id };
  }),
  getDoc: (ref: unknown) => mockGetDoc(ref),
  getDocs: (q: unknown) => mockGetDocs(q),
  query: vi.fn((col, ...filters) => ({ col, filters })),
  where: vi.fn((field, op, val) => ({ type: "where", field, op, val })),
  orderBy: vi.fn((field, dir) => ({ type: "orderBy", field, dir })),
}));

vi.mock("@/lib/firebase", () => ({
  db: {},
}));

import {
  listAvailableProducts,
  getProduct,
  listCategories,
  getRecommended,
} from "@/services/catalogService";

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

const mockDocSnap = (id: string, data: unknown) => ({
  id,
  exists: () => true,
  data: () => data,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

interface MockQuery {
  col: unknown;
  filters: Array<{ type: string; field: string; val?: string; dir?: string }>;
}

describe("catalogService (Firestore direct)", () => {
  describe("listAvailableProducts", () => {
    it("calls listAvailableProducts without category filter", async () => {
      const items = [
        makeItem({ id: "item-1" }),
        makeItem({ id: "item-2", itemName: "Es Teh" }),
      ];
      mockGetDocs.mockResolvedValue({
        docs: items.map((item) => mockDocSnap(item.id, item)),
      });

      const result = await listAvailableProducts();

      expect(result).toEqual(items);
      expect(mockGetDocs).toHaveBeenCalled();
    });

    it("appends category query param when category is provided", async () => {
      mockGetDocs.mockResolvedValue({ docs: [] });

      await listAvailableProducts({ category: "Makanan" });

      const callArgs = mockGetDocs.mock.calls[0][0] as MockQuery;
      const categoryFilter = callArgs.filters.find(
        (f) => f.type === "where" && f.field === "category"
      );
      expect(categoryFilter?.val).toBe("Makanan");
    });

    it("ignores empty / whitespace-only category filter", async () => {
      mockGetDocs.mockResolvedValue({ docs: [] });

      await listAvailableProducts({ category: "   " });

      const callArgs = mockGetDocs.mock.calls[0][0] as MockQuery;
      const categoryFilter = callArgs.filters.find(
        (f) => f.type === "where" && f.field === "category"
      );
      expect(categoryFilter).toBeUndefined();
    });

    it("uses demo storage when demo products are available", async () => {
      const demoItems = [
        makeItem({ id: "demo-1", itemName: "Demo Beras", category: "Sembako" }),
      ];
      vi.spyOn(Storage.prototype, "getItem").mockReturnValue(
        JSON.stringify(demoItems)
      );

      const result = await listAvailableProducts();

      expect(result).toEqual(demoItems);
      expect(mockGetDocs).not.toHaveBeenCalled();
    });
  });

  describe("getProduct", () => {
    it("fetches single product and fails for invalid path segments", async () => {
      const item = makeItem({ id: "abc-xyz" });
      mockGetDoc.mockResolvedValue(mockDocSnap(item.id, item));

      const result = await getProduct("abc-xyz");

      expect(result).toEqual(item);
    });

    it("recreates backend path slash error for odd segments", async () => {
      await expect(getProduct("abc/xyz")).rejects.toThrow(
        /Invalid document reference/
      );
    });

    it("retrieves product from demo storage when available", async () => {
      const demoItems = [
        makeItem({ id: "demo-1", itemName: "Demo Beras", category: "Sembako" }),
      ];
      vi.spyOn(Storage.prototype, "getItem").mockReturnValue(
        JSON.stringify(demoItems)
      );

      const result = await getProduct("demo-1");

      expect(result).toEqual(demoItems[0]);
      expect(mockGetDoc).not.toHaveBeenCalled();
    });
  });

  describe("listCategories", () => {
    it("returns unique sorted categories", async () => {
      const items = [
        { category: "Minuman" },
        { category: "Makanan" },
        { category: "Makanan" },
        { category: "" },
      ];
      mockGetDocs.mockResolvedValue({
        docs: items.map((item, idx) => mockDocSnap(`item-${idx}`, item)),
      });

      const result = await listCategories();

      expect(result).toEqual(["Makanan", "Minuman"]);
    });

    it("returns unique sorted categories from demo storage when available", async () => {
      const demoItems = [
        makeItem({ id: "demo-1", category: "Sembako" }),
        makeItem({ id: "demo-2", category: "Minuman" }),
      ];
      vi.spyOn(Storage.prototype, "getItem").mockReturnValue(
        JSON.stringify(demoItems)
      );

      const result = await listCategories();

      expect(result).toEqual(["Minuman", "Sembako"]);
      expect(mockGetDocs).not.toHaveBeenCalled();
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
      mockGetDocs.mockResolvedValue({
        docs: items.map((item) => mockDocSnap(item.id, item)),
      });

      const result = await getRecommended();

      expect(result).toHaveLength(5);
      expect(result.map((r) => r.id)).toEqual(["f", "d", "e", "b", "c"]);
    });

    it("returns the full list when fewer than 5 items are available", async () => {
      const items: InventoryItem[] = [
        makeItem({ id: "a", updatedAt: "2026-01-01T00:00:00Z" }),
        makeItem({ id: "b", updatedAt: "2026-02-01T00:00:00Z" }),
      ];
      mockGetDocs.mockResolvedValue({
        docs: items.map((item) => mockDocSnap(item.id, item)),
      });

      const result = await getRecommended();

      expect(result.map((r) => r.id)).toEqual(["b", "a"]);
    });
  });
});
