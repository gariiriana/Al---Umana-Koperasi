/**
 * Frontend chunk-uploader implementing the Firestore Base64 chunking
 * protocol described in Requirement 7.
 *
 * Algorithm:
 *  1. Reject files > 15 MB.
 *  2. Slice the file into ≤ 512 KB binary blobs.
 *  3. Base64-encode each blob; prepend `data:<type>;base64,` to chunk 0.
 *  4. Create a parent doc in `delivery_files` with status="uploading".
 *  5. Write each chunk to `delivery_files/{id}/chunks/{index}`.
 *  6. Update parent doc status to "completed" on success or "failed" on
 *     any chunk write failure.
 *
 * The upload returns the parent document ID, which the caller persists on
 * the order alongside other proof file references.
 */

import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { currentUser } from "@/services/authService";

/** Hard upper bound on uploaded file size (15 MB). */
export const MAX_FILE_SIZE = 15 * 1024 * 1024;
/** Maximum payload size per chunk (512 KB). */
export const CHUNK_SIZE = 524_286;
/** Maximum number of chunks per file. */
export const MAX_CHUNKS = 30;

const COLLECTION = "delivery_files";
const SUBCOLLECTION = "chunks";

export class ChunkUploadError extends Error {
  readonly code:
    | "FILE_TOO_LARGE"
    | "CHUNK_LIMIT_EXCEEDED"
    | "ENCODE_FAILED"
    | "WRITE_FAILED"
    | "INVALID_FILE";

  constructor(code: ChunkUploadError["code"], message: string) {
    super(message);
    this.name = "ChunkUploadError";
    this.code = code;
  }
}

export interface UploadProgress {
  /** 0-based index of the chunk just written. */
  chunkIndex: number;
  /** Total number of chunks for this file. */
  totalChunks: number;
  /** Fraction in [0, 1]. */
  fraction: number;
}

export interface UploadOptions {
  orderId: string;
  /** Optional progress callback invoked once per successful chunk write. */
  onProgress?: (progress: UploadProgress) => void;
  /** Optional UID override; defaults to the currently signed-in user. */
  uploaderUid?: string;
}

export interface UploadResult {
  fileId: string;
  totalChunks: number;
  fileName: string;
  fileType: string;
  fileSize: number;
}

/**
 * Upload a File using the chunking protocol. On success the parent doc
 * status is "completed". On any failure the parent doc status is set to
 * "failed" (best-effort) and the error is rethrown so the caller can
 * surface a retry option.
 */
export async function uploadFileInChunks(
  file: File,
  opts: UploadOptions
): Promise<UploadResult> {
  if (!file) {
    throw new ChunkUploadError("INVALID_FILE", "no file supplied");
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new ChunkUploadError(
      "FILE_TOO_LARGE",
      `file is ${file.size} bytes; limit is ${MAX_FILE_SIZE}`
    );
  }

  const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
  if (totalChunks > MAX_CHUNKS) {
    throw new ChunkUploadError(
      "CHUNK_LIMIT_EXCEEDED",
      `file would produce ${totalChunks} chunks (limit ${MAX_CHUNKS})`
    );
  }

  const uploadedBy = opts.uploaderUid ?? currentUser()?.uid ?? "anonymous";
  const parentRef = doc(collection(db, COLLECTION));
  const parentId = parentRef.id;

  // 1. Create parent metadata document.
  await setDoc(parentRef, {
    orderId: opts.orderId,
    fileName: file.name,
    fileType: file.type || "application/octet-stream",
    fileSize: file.size,
    totalChunks,
    status: "uploading",
    uploadedBy,
    createdAt: serverTimestamp(),
  });

  try {
    // 2. Slice, encode, and write each chunk in sequence.
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const slice = file.slice(start, end);
      const base64 = await blobToBase64(slice);

      // Chunk 0 carries the full Data_URI prefix; subsequent chunks contain
      // raw Base64 only.
      const chunkData =
        i === 0 ? `data:${file.type || "application/octet-stream"};base64,${base64}` : base64;

      const chunkRef = doc(parentRef, SUBCOLLECTION, String(i));
      await setDoc(chunkRef, {
        fileId: parentId,
        index: i,
        data: chunkData,
      });

      opts.onProgress?.({
        chunkIndex: i,
        totalChunks,
        fraction: (i + 1) / totalChunks,
      });
    }

    // 3. Mark complete.
    await setDoc(
      parentRef,
      { status: "completed" },
      { merge: true }
    );

    return {
      fileId: parentId,
      totalChunks,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
    };
  } catch (err) {
    // Best-effort: mark parent as failed so consumers can clean up.
    try {
      await setDoc(parentRef, { status: "failed" }, { merge: true });
    } catch {
      // Swallow — surfacing the original error is more useful.
    }
    if (err instanceof ChunkUploadError) throw err;
    throw new ChunkUploadError(
      "WRITE_FAILED",
      err instanceof Error ? err.message : String(err)
    );
  }
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
        reject(new ChunkUploadError("ENCODE_FAILED", "non-string FileReader result"));
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
