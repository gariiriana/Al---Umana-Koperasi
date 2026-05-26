/**
 * "Sering Direkomendasikan" homepage banner.
 *
 * Renders the up-to-5 most recently updated available products returned
 * by `getRecommended()` from `catalogService` as a horizontally scrollable
 * carousel of product cards.
 *
 * Validates: Requirement 14.8.
 */

import type { InventoryItem } from "@/types/inventory";
import { ProductCard } from "@/storefront/components/ProductCard";

export interface RecommendedBannerProps {
  /** Pre-fetched list of recommended items (max 5, already sorted). */
  items: InventoryItem[];
}

export function RecommendedBanner({ items }: RecommendedBannerProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="recommended-heading"
      className="space-y-2"
    >
      <h2
        id="recommended-heading"
        className="px-4 font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]"
      >
        Sering Direkomendasikan
      </h2>
      <div
        className={
          "flex gap-3 overflow-x-auto px-4 pb-2 " +
          "snap-x snap-mandatory scroll-px-4 " +
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        }
      >
        {items.map((item) => (
          <ProductCard
            key={item.id}
            item={item}
            className="snap-start shrink-0 w-40"
          />
        ))}
      </div>
    </section>
  );
}

export default RecommendedBanner;
