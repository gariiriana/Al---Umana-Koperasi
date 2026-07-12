import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock firebase/firestore
const mockAddDoc = vi.fn();
const mockOnSnapshot = vi.fn();
const mockCollection = vi.fn();
const mockQuery = vi.fn();

vi.mock("firebase/firestore", () => ({
  collection: (...args: unknown[]) => mockCollection(...args),
  addDoc: (...args: unknown[]) => mockAddDoc(...args),
  query: (...args: unknown[]) => mockQuery(...args),
  onSnapshot: (...args: unknown[]) => mockOnSnapshot(...args),
}));

vi.mock("@/lib/firebase", () => ({
  db: {},
}));

import {
  addCustomTkpiEntry,
  subscribeCustomTkpiEntries,
} from "@/services/mbgProductionService";

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("mbgProductionService - Custom TKPI Entries", () => {
  describe("addCustomTkpiEntry", () => {
    it("should call addDoc with correct collection and data", async () => {
      const mockEntry = {
        nama: "Tempe Goreng Spesial",
        kode: "CUSTOM-001",
        energi: 200,
        protein: 10,
        lemak: 12,
        kh: 15,
        serat: 2,
      };

      mockCollection.mockReturnValue({ path: "mbg_custom_tkpi" });
      mockAddDoc.mockResolvedValue({ id: "custom-entry-id" });

      const result = await addCustomTkpiEntry(mockEntry);

      expect(mockCollection).toHaveBeenCalledWith(expect.any(Object), "mbg_custom_tkpi");
      expect(mockAddDoc).toHaveBeenCalledWith({ path: "mbg_custom_tkpi" }, mockEntry);
      expect(result).toBe("custom-entry-id");
    });
  });

  describe("subscribeCustomTkpiEntries", () => {
    it("should setup onSnapshot query and return unsubscribe", () => {
      const mockEntries = [
        { id: "id-1", nama: "Tempe", energi: 150 },
        { id: "id-2", nama: "Tahu", energi: 80 },
      ];

      const mockQueryRef = { type: "query" };
      mockCollection.mockReturnValue({ path: "mbg_custom_tkpi" });
      mockQuery.mockReturnValue(mockQueryRef);

      mockOnSnapshot.mockImplementation((_q, callback) => {
        callback({
          docs: mockEntries.map((item) => ({
            id: item.id,
            data: () => ({ nama: item.nama, energi: item.energi }),
          })),
        });
        return () => "unsubscribed";
      });

      const mockCallback = vi.fn();
      const unsubscribe = subscribeCustomTkpiEntries(mockCallback);

      expect(mockCollection).toHaveBeenCalledWith(expect.any(Object), "mbg_custom_tkpi");
      expect(mockQuery).toHaveBeenCalledWith({ path: "mbg_custom_tkpi" });
      expect(mockOnSnapshot).toHaveBeenCalledWith(mockQueryRef, expect.any(Function), undefined);
      expect(mockCallback).toHaveBeenCalledWith(mockEntries);
      expect(unsubscribe()).toBe("unsubscribed");
    });
  });
});
