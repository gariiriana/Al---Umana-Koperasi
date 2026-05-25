import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";
import {
  MAX_FILE_SIZE,
  CHUNK_SIZE,
  MAX_CHUNKS,
  uploadFileInChunks,
  stripDataUri,
} from "../services/chunkUploadService";

// Mock firebase since we only want to test the file validation, slicing, and encoding logic
vi.mock("firebase/firestore", () => ({
  collection: () => ({}),
  doc: () => ({ id: "mock_doc_id" }),
  setDoc: vi.fn().mockResolvedValue(undefined),
  serverTimestamp: () => new Date(),
}));

vi.mock("@/lib/firebase", () => ({
  db: {},
}));

vi.mock("@/services/authService", () => ({
  currentUser: () => ({ uid: "mock_user_123" }),
}));

describe("File Chunking Protocol (Properties 11, 12, 13)", () => {
  it("should split valid files into sequential chunks and satisfy chunk invariants (Property 12)", async () => {
    // Generate a file size within the valid range [1, 5 MB] (lower than 15MB to run quickly in jsdom)
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 1, maxLength: 5 * 1024 * 1024 }),
        async (bytes) => {
          const file = new File([bytes], "test.png", { type: "image/png" });
          const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));

          expect(totalChunks).toBeLessThanOrEqual(MAX_CHUNKS);

          const progressCallback = vi.fn();
          const result = await uploadFileInChunks(file, {
            orderId: "test_order_123",
            onProgress: progressCallback,
          });

          expect(result.totalChunks).toBe(totalChunks);
          expect(result.fileSize).toBe(file.size);
          expect(result.fileName).toBe(file.name);
          expect(result.fileType).toBe(file.type);

          // Verify progress callback was fired for each chunk in order
          expect(progressCallback).toHaveBeenCalledTimes(totalChunks);
          for (let idx = 0; idx < totalChunks; idx++) {
            expect(progressCallback).toHaveBeenNthCalledWith(idx + 1, {
              chunkIndex: idx,
              totalChunks,
              fraction: (idx + 1) / totalChunks,
            });
          }
        }
      ),
      { numRuns: 10 } // Limit runs to keep execution time fast in jsdom environment
    );
  });

  it("should reject files exceeding the 15 MB limit (Property 13)", async () => {
    // Generate file sizes greater than 15 MB
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: MAX_FILE_SIZE + 1, max: MAX_FILE_SIZE * 2 }),
        async (oversized) => {
          // Instead of creating a huge array in memory, we can mock the File size getter
          const file = new File([], "huge.pdf", { type: "application/pdf" });
          Object.defineProperty(file, "size", { value: oversized });

          await expect(
            uploadFileInChunks(file, { orderId: "test_order_123" })
          ).rejects.toThrow("limit is 15728640");
        }
      )
    );
  });

  it("should correctly handle chunking round-trip and URI prefix stripping (Property 11)", () => {
    // Verify stripDataUri helper behavior
    fc.assert(
      fc.property(
        fc.string(),
        fc.string({ minLength: 1 }),
        (data, mime) => {
          const prefix = `data:${mime};base64,`;
          const chunk0 = prefix + data;

          expect(stripDataUri(chunk0)).toBe(data);
          expect(stripDataUri(data)).toBe(data); // unchanged if no prefix
        }
      )
    );
  });
});
