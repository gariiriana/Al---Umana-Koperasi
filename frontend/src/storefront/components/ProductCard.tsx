import { Link } from "react-router-dom";
import { ImageOff } from "lucide-react";

import { formatIDR, truncate } from "@/lib/format";
import type { InventoryItem } from "@/types/inventory";

/**
 * Mobile-first product card used by the storefront catalog views (HomePage,
 * CategoryPage, search results). Tapping the card navigates to the product
 * detail page at `/product/{id}`.
 *
 * Visual contract from the design doc:
 *   - 16px rounded corners
 *   - shadow `0 1px 3px rgba(0,0,0,0.1)`
 *   - image occupies the top ~60% of the card
 *   - IDR price below the name
 *   - "Tersedia" badge (Requirement 1.4)
 *   - product name truncated to 80 characters with ellipsis (Requirement 1.4)
 *   - placeholder image when `imageUrl` is empty (Requirement 1.5)
 *
 * Validates: Requirements 1.4, 1.5, 1.7 (consumer-side rendering).
 */

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

/**
 * Resolve a product image's HTTP URL from the `product_images/{fileId}`
 * reference stored on `InventoryItem.imageUrl`. Returns `null` for empty
 * or malformed references so callers can render the placeholder instead.
 */
function resolveProductImageURL(ref: string | undefined): string | null {
  if (!ref) return null;
  // The Firestore reference format is `product_images/{fileId}`. We accept
  // either that or a bare fileId so older data shapes don't break the UI.
  const segments = ref.trim().split("/");
  if (segments.length === 0) return null;
  const fileId = segments[segments.length - 1];
  if (!fileId) return null;
  // The download endpoint takes the collection name and fileId.
  // (See backend `GET /api/files/{collection}/{id}/download`.)
  return `${API_BASE_URL}/api/files/product_images/${encodeURIComponent(fileId)}/download`;
}

export interface ProductCardProps {
  item: InventoryItem;
  /** Optional className for layout-specific overrides (e.g. grid spans). */
  className?: string;
}

export function ProductCard({ item, className }: ProductCardProps) {
  const imageHref = resolveProductImageURL(item.imageUrl);
  const inStock = item.available && item.quantity > 0;

  return (
    <Link
      to={`/product/${encodeURIComponent(item.id)}`}
      className={
        "group block overflow-hidden bg-white rounded-2xl " +
        "shadow-[0_1px_3px_rgba(0,0,0,0.1)] " +
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FBBF24] focus-visible:ring-offset-2 " +
        "transition-transform duration-150 active:scale-[0.99] " +
        (className ?? "")
      }
      aria-label={item.itemName}
    >
      <div className="relative w-full aspect-[5/3] bg-[#F3F4F6]">
        {imageHref ? (
          <img
            src={imageHref}
            alt={item.itemName}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center text-[#9CA3AF]"
          >
            <ImageOff className="h-10 w-10" />
          </div>
        )}
        {inStock ? (
          <span
            className={
              "absolute top-2 left-2 rounded-full bg-emerald-50 " +
              "border border-emerald-200 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
            }
          >
            Tersedia
          </span>
        ) : (
          <span
            className={
              "absolute top-2 left-2 rounded-full bg-red-50 " +
              "border border-red-200 px-2 py-0.5 text-[11px] font-medium text-[#DC2626]"
            }
          >
            Stok Habis
          </span>
        )}
      </div>
      <div className="p-3 space-y-1">
        <h3
          className="font-['Manrope',system-ui,sans-serif] text-sm font-semibold text-[#111827] leading-snug line-clamp-2"
          title={item.itemName}
        >
          {truncate(item.itemName, 80)}
        </h3>
        <p className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">
          {formatIDR(item.price)}
        </p>
      </div>
    </Link>
  );
}

export default ProductCard;
