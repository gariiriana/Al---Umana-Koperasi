// frontend/src/lib/validators.ts
// Feature: customer-storefront-admin-stock
// Pure validation helpers used by the checkout flow and the image upload
// controls (payment proof + product image). No external dependencies.
//
// Validates: Requirements 4.3, 7.3, 7.4, 7.5, 11.1, 11.2, 11.3

/**
 * Maximum image upload size in bytes (15 MB).
 *
 * Per Requirements 7.5 and 11.3, files strictly larger than this value must
 * be rejected before any chunk is written to Firestore.
 */
export const MAX_IMAGE_UPLOAD_BYTES = 15_728_640;

/**
 * Allowed MIME types for image uploads (payment proofs and product images).
 *
 * Per Requirements 7.3, 7.4, 11.1, and 11.2, only these three image MIME
 * types are accepted; any other value must be rejected before any chunk is
 * written to Firestore.
 */
export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

/**
 * Result of {@link validateImageUpload}.
 *
 * - `accepted: true` — the file passes both MIME and size checks.
 * - `accepted: false` with `reason: 'mime'` — MIME type is not one of the
 *   accepted image types.
 * - `accepted: false` with `reason: 'size'` — file size exceeds the 15 MB
 *   maximum (and MIME is otherwise acceptable).
 *
 * When both rules fail, MIME is reported first; this gives a deterministic
 * rejection reason and matches the order that the requirements list the two
 * validation errors in (7.4 before 7.5; 11.2 before 11.3).
 */
export type ImageUploadValidation =
  | { accepted: true }
  | { accepted: false; reason: "mime" | "size" };

/**
 * Validates a delivery address.
 *
 * Returns `true` iff the trimmed length of `s` is between 10 and 500
 * characters inclusive.
 *
 * Validates: Requirement 4.3 — "fewer than 10 characters or more than 500
 * characters (after trimming leading and trailing whitespace)".
 */
export function isValidAddress(s: string): boolean {
  const len = s.trim().length;
  return len >= 10 && len <= 500;
}

/**
 * Validates an image upload candidate before any chunk is written to
 * Firestore.
 *
 * Accepts iff `mime ∈ {image/jpeg, image/png, image/webp}` AND
 * `size <= 15,728,640` (15 MB). On rejection the result identifies which
 * rule failed: `'mime'` when the MIME type is not allowed, or `'size'` when
 * the MIME type is allowed but the file exceeds 15 MB.
 *
 * Validates: Requirements 7.3, 7.4, 7.5, 11.1, 11.2, 11.3.
 *
 * @param mime The candidate file's MIME type (e.g. `file.type`).
 * @param size The candidate file's size in bytes (e.g. `file.size`).
 *             Negative or non-finite values are treated as invalid sizes
 *             and rejected with `reason: 'size'`.
 */
export function validateImageUpload(
  mime: string,
  size: number
): ImageUploadValidation {
  if (!isAllowedImageMime(mime)) {
    return { accepted: false, reason: "mime" };
  }
  if (!Number.isFinite(size) || size < 0 || size > MAX_IMAGE_UPLOAD_BYTES) {
    return { accepted: false, reason: "size" };
  }
  return { accepted: true };
}

function isAllowedImageMime(mime: string): mime is AllowedImageMime {
  return (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mime);
}
