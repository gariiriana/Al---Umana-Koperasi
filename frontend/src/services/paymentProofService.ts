/**
 * Payment-proof upload orchestrator.
 *
 * Glues together the chunked-file upload protocol and the Order REST
 * API to implement the customer-side "upload payment proof" flow
 * (Requirements 7.6, 7.7, 7.9, 7.10):
 *
 *   1. Upload the image to `payment_proofs/{fileId}` via
 *      `uploadFileInChunks` from `chunkUploadService`.
 *   2. Attach the resulting `fileId` to the order by calling
 *      `attachPaymentProof` (POST `/api/orders/{id}/payment-proof`).
 *      The backend handler validates the proof and transitions the
 *      Order to `AWAITING_PAYMENT_APPROVAL`.
 *
 * Error semantics:
 *
 *   - Chunk upload failure → re-throw the original `ChunkUploadError`
 *     so the UI can surface `failedChunkIndex` / `fileId` for resume
 *     (Requirement 7.10).
 *   - Backend attach failure (after chunks were written successfully)
 *     → re-throw the original `ApiError` so the UI can show the backend
 *     error code. The chunked file is left in place; re-issuing
 *     `attachPaymentProof` with the same `fileId` is idempotent on the
 *     backend (Requirement 7.9 / state-machine handles re-entry).
 */

import { api } from "@/services/apiClient";
import {
  uploadFileInChunks,
  type UploadProgress,
} from "@/services/chunkUploadService";
import type { Order } from "@/types/order";

export interface UploadPaymentProofResult {
  fileId: string;
}

/**
 * Upload a payment-proof image for `orderId` and attach it to the order.
 *
 * @param orderId    Order document id (`orders/{orderId}`).
 * @param file       Customer-selected image file (validated upstream by
 *                   `validateImageUpload`; `chunkUploadService` enforces
 *                   the image rules again as a defense in depth).
 * @param onProgress Optional callback invoked once per successful chunk
 *                   write. The progress payload mirrors
 *                   `UploadProgress` from `chunkUploadService`.
 * @returns          The `{ fileId }` that was uploaded and attached.
 *
 * Errors:
 *   - `ChunkUploadError` from the chunk upload phase. The UI can read
 *     `err.fileId` and `err.failedChunkIndex` to offer "resume from
 *     chunk N".
 *   - `ApiError` from the backend attach phase. The chunked file
 *     (`payment_proofs/{fileId}`) is already in `status = "completed"`,
 *     so retrying `attachPaymentProof(orderId, fileId)` directly is a
 *     valid recovery path.
 */
export async function uploadPaymentProof(
  orderId: string,
  file: File,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadPaymentProofResult> {
  // Phase 1: chunked upload to `payment_proofs/{fileId}`. Errors here
  // propagate as-is so the UI can offer a "Resume" action.
  const upload = await uploadFileInChunks(file, {
    collection: "payment_proofs",
    orderId,
    onProgress,
  });

  // Phase 2: attach the uploaded file to the order. This is a thin
  // wrapper around `POST /api/orders/{id}/payment-proof` shared with
  // `orderService.attachPaymentProof` so both call sites use the same
  // error shape (`ApiError`).
  await attachPaymentProofViaApi(orderId, upload.fileId);

  return { fileId: upload.fileId };
}

/**
 * Internal helper that mirrors `orderService.attachPaymentProof`. We
 * keep a private copy here (instead of importing from `orderService`)
 * to avoid an import cycle if `orderService` ever needs to call back
 * into upload helpers.
 */
function attachPaymentProofViaApi(
  orderId: string,
  fileId: string
): Promise<Order> {
  return api.post<Order>(
    `/api/orders/${encodeURIComponent(orderId)}/payment-proof`,
    { fileId }
  );
}
