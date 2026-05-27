/**
 * Category-grouped catalog grid for the Storefront homepage.
 *
 * Given a list of `InventoryItem`s, groups them by `category`, sorts the
 * categories alphabetically, sorts items inside each category alphabetically
 * by `itemName`, and renders one section per category with a Manrope-bold
 * heading followed by a 2-column grid of `ProductCard`s.
 *
 * Validates: Requirements 1.2, 1.3, 13.6.
 */

import { useMemo } from "react";

import type { InventoryItem } from "@/types/inventory";
import { ProductCard } from "@/storefront/components/ProductCard";

export interface CategoryGridProps {
  items: InventoryItem[];
}

interface CategoryGroup {
  category: string;
  items: InventoryItem[];
}

/**
 * Pure helper — buckets `items` by `category` and
 * applies the alphabetical sort orders required by Requirement 1.2.
 */
function groupByCategory(items: InventoryItem[]): CategoryGroup[] {
  const buckets = new Map<string, InventoryItem[]>();
  for (const item of items) {
    const key = item.category.trim();
    if (key.length === 0) continue;
    const list = buckets.get(key);
    if (list) {
      list.push(item);
    } else {
      buckets.set(key, [item]);
    }
  }

  const groups: CategoryGroup[] = [];
  for (const [category, bucket] of buckets) {
    const sorted = [...bucket].sort((a, b) =>
      a.itemName.localeCompare(b.itemName, "id-ID", { sensitivity: "base" }),
    );
    groups.push({ category, items: sorted });
  }
  groups.sort((a, b) =>
    a.category.localeCompare(b.category, "id-ID", { sensitivity: "base" }),
  );
  return groups;
}

export function CategoryGrid({ items }: CategoryGridProps) {
  const groups = useMemo(() => groupByCategory(items), [items]);

  if (groups.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section
          key={group.category}
          aria-labelledby={`category-heading-${slugify(group.category)}`}
          className="space-y-2"
        >
          <h2
            id={`category-heading-${slugify(group.category)}`}
            className="px-4 font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]"
          >
            {group.category}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 px-4">
            {group.items.map((item) => (
              <ProductCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Produces a stable, lower-case slug suitable for use in `id` attributes. */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default CategoryGrid;
