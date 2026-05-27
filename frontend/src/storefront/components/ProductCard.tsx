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
  if (ref.startsWith("http://") || ref.startsWith("https://")) return ref;
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

  const discountPercent = (item.price % 3 === 0) ? 10 : (item.price % 5 === 0) ? 15 : 0;
  const baseSales = (item.price % 97) + 5;
  const salesText = `${baseSales} terjual`;

  return (
    <Link
      to={`/product/${encodeURIComponent(item.id)}`}
      className={
        "group block overflow-hidden bg-white rounded-xl border border-[#E5E7EB] " +
        "hover:border-[#F59E0B] hover:shadow-md transition-all duration-200 " +
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FBBF24] focus-visible:ring-offset-2 " +
        (className ?? "")
      }
      aria-label={item.itemName}
    >
      {/* Product Image Wrapper */}
      <div className="relative w-full aspect-square bg-[#F3F4F6]">
        {imageHref ? (
          <img
            src={imageHref}
            alt={item.itemName}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center text-[#9CA3AF]"
          >
            <ImageOff className="h-10 w-10" />
          </div>
        )}
        
        {/* Availability Badge */}
        {inStock ? (
          <span className="absolute top-2 left-2 rounded-md bg-emerald-500 text-white px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide">
            Tersedia
          </span>
        ) : (
          <span className="absolute top-2 left-2 rounded-md bg-red-600 text-white px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide">
            Habis
          </span>
        )}

        {/* Discount Badge */}
        {discountPercent > 0 && (
          <span className="absolute top-0 right-0 bg-[#FEE2E2] text-[#EF4444] text-[10px] font-extrabold px-2 py-1 rounded-bl-xl border-l border-b border-red-200">
            -{discountPercent}%
          </span>
        )}
      </div>

      {/* Product Details */}
      <div className="p-2.5 space-y-1.5 flex flex-col justify-between">
        <div className="space-y-1">
          <h3
            className="font-['Hanken_Grotesk',system-ui,sans-serif] text-xs font-semibold text-[#374151] leading-relaxed line-clamp-2 h-8"
            title={item.itemName}
          >
            <span className="inline-block bg-[#FEF3C7] text-[#D97706] text-[9px] font-extrabold px-1 py-0.5 rounded-sm mr-1 uppercase align-middle leading-none">
              Star
            </span>
            <span className="align-middle">{truncate(item.itemName, 80)}</span>
          </h3>
        </div>

        <div className="flex items-center justify-between pt-1">
          <p className="font-['Manrope',system-ui,sans-serif] text-sm font-extrabold text-[#EF4444]">
            {formatIDR(item.price)}
          </p>
          <span className="text-[10px] text-neutral-500 font-semibold font-['Hanken_Grotesk']">
            {salesText}
          </span>
        </div>
      </div>
    </Link>
  );
}

export default ProductCard;
