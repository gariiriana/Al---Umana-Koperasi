/**
 * Payment-proof upload orchestrator using Firestore direct access.
 *
 * Glues together the chunked-file upload protocol and the Order Firestore service.
 *
 * Requirements covered: 7.6, 7.7, 7.9, 7.10, 7.12.
 */

import {
  uploadFileInChunks,
  type UploadProgress,
} from "@/services/chunkUploadService";
import { attachPaymentProof } from "@/services/orderService";

export interface UploadPaymentProofResult {
  fileId: string;
}

/**
 * Upload a payment-proof image for `orderId` and attach it directly to the order in Firestore.
 */
export async function uploadPaymentProof(
  orderId: string,
  file: File,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadPaymentProofResult> {
  // Phase 1: chunked upload to `payment_proofs/{fileId}`.
  const upload = await uploadFileInChunks(file, {
    collection: "payment_proofs",
    orderId,
    onProgress,
  });

  // Phase 2: attach the uploaded file to the order in Firestore directly.
  await attachPaymentProof(orderId, upload.fileId);

  return { fileId: upload.fileId };
}
