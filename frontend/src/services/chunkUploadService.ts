/**
 * Frontend chunk-uploader implementing the Firestore Base64 chunking
 * protocol for three collections:
 *
 *   - `delivery_files`  (proof-of-delivery photos and signatures)
 *   - `product_images`  (admin-uploaded inventory images)
 *   - `payment_proofs`  (customer-uploaded payment-proof images)
 *
 * Algorithm (Requirements 7.6, 7.7, 11.4, 11.5):
 *   1. Validate MIME and size up-front. For `product_images` and
 *      `payment_proofs`, only image/jpeg, image/png, image/webp are accepted
 *      and size must be ≤ 15 MB. For `delivery_files`, only the size limit
 *      is enforced (existing behavior). Reject before any Firestore write.
 *   2. Slice the file into ≤ 524,288 bytes (512 KB) of pre-encoded source
 *      data per chunk. `totalChunks` must satisfy `1 ≤ totalChunks ≤ 30`.
 *   3. Base64-encode each slice. Prepend `data:<mime>;base64,` to chunk 0
 *      only; subsequent chunks contain raw Base64.
 *   4. Create a parent doc in the target collection with `status =
 *      "uploading"`. Only `delivery_files` and `payment_proofs` carry an
 *      `orderId` field (Requirement 7.7); `product_images` parent docs do
 *      not (Requirement 11.5).
 *   5. Write each chunk to `<collection>/{fileId}/chunks/{index}` (the
 *      Firestore doc id equals the chunk index, making rewrites idempotent).
 *   6. On success, update the parent doc `status` to `"completed"`.
 *   7. On any chunk-write failure, set the parent doc `status` to
 *      `"failed"` (best effort), and throw a `ChunkUploadError` whose
 *      `failedChunkIndex` and `fileId` let the caller resume from the
 *      failed chunk by calling `uploadFileInChunks` again with
 *      `{ resumeFileId, resumeFromChunk }` (Requirements 7.10, 11.6,
 *      11.13).
 *
 * The existing `delivery_files` call sites (e.g. `ProofCapture`) continue
 * to work unchanged: when `opts.collection` is omitted, it defaults to
 * `'delivery_files'`, preserving backwards compatibility.
 */

import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { currentUser } from "@/services/authService";
import {
  MAX_IMAGE_UPLOAD_BYTES,
  validateImageUpload,
} from "@/lib/validators";

/** Hard upper bound on uploaded file size (15 MB, Requirements 7.5, 11.3). */
export const MAX_FILE_SIZE = MAX_IMAGE_UPLOAD_BYTES;
/**
 * Maximum payload size per chunk in bytes of pre-encoded source data
 * (Requirements 7.6, 11.4).
 */
export const CHUNK_SIZE = 524_288;
/** Maximum number of chunks per file (Requirements 7.7, 11.5). */
export const MAX_CHUNKS = 30;

const SUBCOLLECTION = "chunks";

/** Collections that use the chunked-file protocol. */
export type FileCollection =
  | "delivery_files"
  | "product_images"
  | "payment_proofs";

const IMAGE_COLLECTIONS: ReadonlySet<FileCollection> = new Set([
  "product_images",
  "payment_proofs",
]);

export type ChunkUploadErrorCode =
  | "FILE_TOO_LARGE"
  | "CHUNK_LIMIT_EXCEEDED"
  | "ENCODE_FAILED"
  | "WRITE_FAILED"
  | "INVALID_FILE"
  | "INVALID_MIME";

export class ChunkUploadError extends Error {
  readonly code: ChunkUploadErrorCode;
  /**
   * Parent file document id. Set on `WRITE_FAILED` so the caller can
   * resume the upload via `uploadFileInChunks(file, { resumeFileId,
   * resumeFromChunk })`.
   */
  readonly fileId?: string;
  /**
   * 0-based index of the chunk that failed to write. Set on
   * `WRITE_FAILED`. Together with `fileId`, lets the caller resume from
   * exactly that chunk.
   */
  readonly failedChunkIndex?: number;

  constructor(
    code: ChunkUploadErrorCode,
    message: string,
    info?: { fileId?: string; failedChunkIndex?: number }
  ) {
    super(message);
    this.name = "ChunkUploadError";
    this.code = code;
    this.fileId = info?.fileId;
    this.failedChunkIndex = info?.failedChunkIndex;
  }
}

/**
 * Progress payload reported once per successful chunk write. Both the new
 * `{ uploadedChunks, percent }` fields and the legacy
 * `{ chunkIndex, fraction }` fields are populated so existing call sites
 * (e.g. `ProofCapture`) continue to work unchanged.
 */
export interface UploadProgress {
  /** 0-based index of the chunk just written. */
  chunkIndex: number;
  /** Number of chunks successfully written so far (= chunkIndex + 1). */
  uploadedChunks: number;
  /** Total number of chunks for this file. */
  totalChunks: number;
  /** Fraction in [0, 1]. */
  fraction: number;
  /** Integer percent in [0, 100]. */
  percent: number;
}

export interface UploadOptions {
  /** Optional file description to store in the parent document metadata. */
  description?: string;
  /**
   * Target Firestore collection. Defaults to `'delivery_files'` for
   * backwards compatibility with existing call sites.
   */
  collection?: FileCollection;
  /**
   * Associated Order document id. Persisted on `delivery_files` and
   * `payment_proofs` parent docs (Requirements 7.7, original delivery
   * spec). Ignored for `product_images` (Requirement 11.5 lists no
   * orderId field).
   */
  orderId?: string;
  /**
   * Associated InventoryItem document id. Reserved for `product_images`
   * call sites; not persisted on the parent doc (Requirement 11.5 lists
   * the parent fields exhaustively).
   */
  itemId?: string;
  /** Optional progress callback invoked once per successful chunk write. */
  onProgress?: (progress: UploadProgress) => void;
  /** Optional UID override; defaults to the currently signed-in user. */
  uploaderUid?: string;
  /**
   * Resume an interrupted upload by reusing this parent file id (instead
   * of generating a new one). Pair with `resumeFromChunk` to skip already
   * written chunks.
   */
  resumeFileId?: string;
  /**
   * Resume from this 0-based chunk index. Chunks `[0, resumeFromChunk)`
   * are assumed to be already written. Defaults to 0 when not provided
   * with `resumeFileId`.
   */
  resumeFromChunk?: number;
}

export interface UploadResult {
  fileId: string;
  totalChunks: number;
  fileName: string;
  fileType: string;
  fileSize: number;
}

/**
 * Upload a `File` using the Firestore Base64 chunking protocol against the
 * collection identified by `opts.collection` (defaults to
 * `'delivery_files'`). On success the parent doc `status` is `"completed"`;
 * on failure the parent doc `status` is `"failed"` (best effort) and the
 * thrown `ChunkUploadError` carries `fileId` and `failedChunkIndex` so the
 * caller can resume by calling this function again with `resumeFileId` and
 * `resumeFromChunk`.
 */
export async function uploadFileInChunks(
  file: File,
  opts: UploadOptions = {}
): Promise<UploadResult> {
  if (!file) {
    throw new ChunkUploadError("INVALID_FILE", "no file supplied");
  }

  const collectionName: FileCollection = opts.collection ?? "delivery_files";

  // 1. MIME + size validation. For image collections, defer to the shared
  //    validator from lib/validators (Requirements 7.3–7.5, 11.1–11.3).
  if (IMAGE_COLLECTIONS.has(collectionName)) {
    const validation = validateImageUpload(file.type, file.size);
    if (!validation.accepted) {
      if (validation.reason === "mime") {
        throw new ChunkUploadError(
          "INVALID_MIME",
          `MIME type "${file.type}" is not allowed; expected image/jpeg, image/png, or image/webp`
        );
      }
      throw new ChunkUploadError(
        "FILE_TOO_LARGE",
        `file is ${file.size} bytes; limit is ${MAX_FILE_SIZE}`
      );
    }
  } else if (file.size > MAX_FILE_SIZE) {
    // delivery_files keeps the existing size-only rule; MIME is validated
    // by call sites (e.g. ProofCapture restricts via its accept attribute).
    throw new ChunkUploadError(
      "FILE_TOO_LARGE",
      `file is ${file.size} bytes; limit is ${MAX_FILE_SIZE}`
    );
  }

  const isResume = typeof opts.resumeFileId === "string" && opts.resumeFileId.length > 0;

  // Compress images to optimize upload speed (only on first upload attempt, not on resume)
  let fileToUpload = file;
  if (!isResume) {
    try {
      fileToUpload = await compressImage(file);
    } catch (err) {
      console.warn("Client-side compression failed, uploading original file:", err);
    }
  }

  // 2. Compute and bound total chunks (Requirements 7.7, 11.5).
  const totalChunks = Math.max(1, Math.ceil(fileToUpload.size / CHUNK_SIZE));
  if (totalChunks > MAX_CHUNKS) {
    throw new ChunkUploadError(
      "CHUNK_LIMIT_EXCEEDED",
      `file would produce ${totalChunks} chunks (limit ${MAX_CHUNKS})`
    );
  }

  const uploadedBy = opts.uploaderUid ?? currentUser()?.uid ?? "anonymous";

  // 3. Resolve parent doc: either reuse the supplied id (resume) or
  //    generate a new one.
  const parentRef = isResume
    ? doc(db, collectionName, opts.resumeFileId as string)
    : doc(collection(db, collectionName));
  const parentId = parentRef.id;
  const startIndex = isResume
    ? clampChunkIndex(opts.resumeFromChunk, totalChunks)
    : 0;

  // 4. Create parent metadata document on first attempt; on resume just
  //    flip status back to "uploading" without overwriting createdAt.
  if (!isResume) {
    const meta: Record<string, unknown> = {
      fileName: fileToUpload.name,
      fileType: fileToUpload.type || "application/octet-stream",
      fileSize: fileToUpload.size,
      totalChunks,
      status: "uploading",
      uploadedBy,
      createdAt: serverTimestamp(),
    };
    if (opts.description) {
      meta.description = opts.description;
    }
    // Requirements 7.7 (payment_proofs) and the existing delivery_files
    // schema both carry orderId. Requirement 11.5 (product_images) does
    // not list orderId among the parent fields, so omit it there.
    if (
      (collectionName === "delivery_files" ||
        collectionName === "payment_proofs") &&
      opts.orderId
    ) {
      meta.orderId = opts.orderId;
    }
    await setDoc(parentRef, meta);
  } else {
    await setDoc(parentRef, { status: "uploading" }, { merge: true });
  }

  // 5. Slice, encode, and write each chunk. The Firestore doc id equals
  //    the chunk index, so re-writing the same index on resume is
  //    idempotent (Requirements 7.10, 11.6, 11.13).
  let currentIndex = startIndex;
  try {
    const mime = fileToUpload.type || "application/octet-stream";
    for (currentIndex = startIndex; currentIndex < totalChunks; currentIndex++) {
      const start = currentIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, fileToUpload.size);
      const slice = fileToUpload.slice(start, end);
      const base64 = await blobToBase64(slice);

      // Chunk 0 carries the full Data_URI prefix; subsequent chunks
      // contain raw Base64 only.
      const chunkData =
        currentIndex === 0 ? `data:${mime};base64,${base64}` : base64;

      const chunkRef = doc(parentRef, SUBCOLLECTION, String(currentIndex));
      await setDoc(chunkRef, {
        fileId: parentId,
        index: currentIndex,
        data: chunkData,
      });

      const uploadedChunks = currentIndex + 1;
      opts.onProgress?.({
        chunkIndex: currentIndex,
        uploadedChunks,
        totalChunks,
        fraction: uploadedChunks / totalChunks,
        percent: Math.round((uploadedChunks / totalChunks) * 100),
      });
    }

    // 6. Mark complete.
    await setDoc(parentRef, { status: "completed" }, { merge: true });

    return {
      fileId: parentId,
      totalChunks,
      fileName: fileToUpload.name,
      fileType: fileToUpload.type,
      fileSize: fileToUpload.size,
    };
  } catch (err) {
    // 7. Best-effort: mark parent as failed so consumers can clean up
    //    and so the next call can detect the prior failure.
    try {
      await setDoc(parentRef, { status: "failed" }, { merge: true });
    } catch {
      // Swallow — surfacing the original error is more useful.
    }
    if (err instanceof ChunkUploadError) {
      // Re-throw but enrich with the resume coordinates if missing.
      if (err.code === "WRITE_FAILED" && err.failedChunkIndex == null) {
        throw new ChunkUploadError(err.code, err.message, {
          fileId: parentId,
          failedChunkIndex: currentIndex,
        });
      }
      throw err;
    }
    throw new ChunkUploadError(
      "WRITE_FAILED",
      err instanceof Error ? err.message : String(err),
      { fileId: parentId, failedChunkIndex: currentIndex }
    );
  }
}

/**
 * Backwards-compatible thin wrapper around `uploadFileInChunks` that
 * targets the `delivery_files` collection. Existing call sites that
 * already pass `{ orderId, onProgress }` to `uploadFileInChunks` continue
 * to work without using this wrapper, since `collection` defaults to
 * `'delivery_files'`.
 */
export function uploadDeliveryFile(
  file: File,
  opts: { orderId: string; onProgress?: (p: UploadProgress) => void; uploaderUid?: string }
): Promise<UploadResult> {
  return uploadFileInChunks(file, {
    collection: "delivery_files",
    orderId: opts.orderId,
    onProgress: opts.onProgress,
    uploaderUid: opts.uploaderUid,
  });
}

/**
 * Convert a Blob to a Base64 string (without the Data_URI prefix). Uses
 * FileReader.readAsDataURL and strips the leading "data:...;base64," so
 * the caller can choose whether to prepend the prefix.
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new ChunkUploadError("ENCODE_FAILED", "FileReader error"));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(
          new ChunkUploadError("ENCODE_FAILED", "non-string FileReader result")
        );
        return;
      }
      const idx = result.indexOf(";base64,");
      if (idx < 0) {
        // Should not happen for readAsDataURL, but guard anyway.
        resolve(result);
        return;
      }
      resolve(result.slice(idx + ";base64,".length));
    };
    reader.readAsDataURL(blob);
  });
}

/** Decode a stored data string (chunk 0) by stripping any Data_URI prefix. */
export function stripDataUri(s: string): string {
  const idx = s.indexOf(";base64,");
  if (s.startsWith("data:") && idx >= 0) return s.slice(idx + ";base64,".length);
  return s;
}

function clampChunkIndex(value: number | undefined, totalChunks: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  const intValue = Math.floor(value);
  if (intValue < 0) return 0;
  if (intValue > totalChunks) return totalChunks;
  return intValue;
}

/**
 * Optimize upload speed by compressing large images on the client side.
 * Converts to JPEG format to reduce size significantly.
 */
function compressImage(
  file: File,
  maxWidth = 1024,
  maxHeight = 1024,
  quality = 0.75
): Promise<File> {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) {
      resolve(file);
      return;
    }
    // Don't compress very small files or SVGs (like signatures or small icons)
    if (file.size < 200 * 1024 || file.type === "image/svg+xml") {
      resolve(file);
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => resolve(file);
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => resolve(file);
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(file);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            const compressedFile = new File([blob], file.name, {
              type: "image/jpeg",
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          },
          "image/jpeg",
          quality
        );
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}
