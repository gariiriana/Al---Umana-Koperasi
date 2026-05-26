// Package catalog implements the public, read-only product catalog API
// consumed by the customer storefront. All read traffic is satisfied
// through the stock.Repository read methods; this package adds the
// optional filtering, recommendation, and grouping that are specific to
// the storefront experience and that have no analogue on the admin side.
package catalog

import (
	"context"
	"sort"

	"al-umana/order-fulfillment/internal/stock"
)

// Service implements the public, read-only catalog operations.
//
// The service depends on the stock.Repository read methods (ListAvailable,
// Get, DistinctCategories) rather than on the stock.Service so the
// storefront read path stays free of the admin-side write logic. Instances
// are safe for concurrent use because the underlying Firestore client is.
type Service struct {
	stockRepo *stock.Repository
}

// NewService returns a catalog Service that reads inventory data through
// the supplied stock.Repository. The repository is owned by the caller and
// is not closed by the service.
func NewService(stockRepo *stock.Repository) *Service {
	return &Service{stockRepo: stockRepo}
}

// CategoryGroup is a grouping of inventory items belonging to a single
// category. The storefront homepage renders one section per CategoryGroup
// to satisfy Requirement 1.2 (products grouped by Category).
type CategoryGroup struct {
	Category string                `json:"category"`
	Items    []stock.InventoryItem `json:"items"`
}

// recommendedLimit caps the size of the "Sering Direkomendasikan" banner
// per Requirement 14.8 (the 5 most recently updated available products).
const recommendedLimit = 5

// ListAvailable returns inventory items eligible for display on the public
// catalog: those with `available = true` and `quantity > 0`. When category
// is non-empty, the result is additionally restricted to items whose
// `Category` field equals the supplied value (Requirements 1.1, 1.3,
// 13.5).
//
// The repository already enforces the availability and quantity filters
// via Firestore Where clauses; this method only adds the optional category
// narrowing in memory, which keeps the public catalog query free of an
// additional composite index.
func (s *Service) ListAvailable(ctx context.Context, category string) ([]stock.InventoryItem, error) {
	items, err := s.stockRepo.ListAvailable(ctx)
	if err != nil {
		return nil, err
	}
	if category == "" {
		return items, nil
	}
	filtered := make([]stock.InventoryItem, 0, len(items))
	for _, it := range items {
		if it.Category == category {
			filtered = append(filtered, it)
		}
	}
	return filtered, nil
}

// Get returns the inventory item with the given ID. Items are returned
// regardless of availability so the storefront product-detail page can
// render a "Stok Habis" badge for unavailable items rather than hiding
// them entirely (Requirements 2.1, 2.3). Returns stock.ErrNotFound when
// no such item exists.
func (s *Service) Get(ctx context.Context, id string) (*stock.InventoryItem, error) {
	return s.stockRepo.Get(ctx, id)
}

// ListCategories returns the lexicographically sorted set of distinct,
// trimmed, non-empty category strings currently stored across all
// inventory documents (Requirement 13.6). Requirement 13.6 specifies the
// full distinct-category list — it does not narrow to "categories with
// available items" — so this method is a thin pass-through to the
// repository.
func (s *Service) ListCategories(ctx context.Context) ([]string, error) {
	return s.stockRepo.DistinctCategories(ctx)
}

// Recommended returns the top recommendedLimit available inventory items
// ordered by `UpdatedAt` descending. It powers the "Sering
// Direkomendasikan" homepage banner described in Requirement 14.8.
//
// Items are loaded via the repository's ListAvailable (so the same
// `available = true ∧ quantity > 0` filter applies) and then sorted by
// `UpdatedAt` in memory. The repository orders by `quantity` to avoid
// requiring a composite Firestore index on (available, quantity,
// updatedAt); the recency sort is therefore performed here on the result
// set, which is bounded by the public catalog size.
func (s *Service) Recommended(ctx context.Context) ([]stock.InventoryItem, error) {
	items, err := s.stockRepo.ListAvailable(ctx)
	if err != nil {
		return nil, err
	}
	sort.SliceStable(items, func(i, j int) bool {
		return items[i].UpdatedAt.After(items[j].UpdatedAt)
	})
	if len(items) > recommendedLimit {
		items = items[:recommendedLimit]
	}
	return items, nil
}

// GroupedItems partitions the supplied items into category groups for the
// storefront homepage (Requirement 1.2). Categories are returned sorted
// alphabetically and items within each group are sorted alphabetically by
// `ItemName`.
//
// Items whose `Category` field is empty are grouped together under the
// empty string and appear first in the slice; callers that want to hide
// uncategorized items can filter the group out before rendering. The
// function is pure (no I/O), is safe for concurrent use, and does not
// mutate the input slice.
func GroupedItems(items []stock.InventoryItem) []CategoryGroup {
	if len(items) == 0 {
		return nil
	}
	bucket := make(map[string][]stock.InventoryItem)
	for _, it := range items {
		bucket[it.Category] = append(bucket[it.Category], it)
	}

	categories := make([]string, 0, len(bucket))
	for c := range bucket {
		categories = append(categories, c)
	}
	sort.Strings(categories)

	groups := make([]CategoryGroup, 0, len(categories))
	for _, c := range categories {
		group := bucket[c]
		sort.SliceStable(group, func(i, j int) bool {
			return group[i].ItemName < group[j].ItemName
		})
		groups = append(groups, CategoryGroup{Category: c, Items: group})
	}
	return groups
}
