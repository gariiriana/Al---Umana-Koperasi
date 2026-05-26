package stock

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// inventoryCollection is the Firestore collection storing menu / inventory
// items managed by the admin.
const inventoryCollection = "inventory"

// ErrNotFound is returned when an inventory item does not exist.
var ErrNotFound = errors.New("inventory item not found")

// Repository is the persistence layer for the inventory collection. It wraps
// a Firestore client and exposes typed query operations.
type Repository struct {
	client *firestore.Client
}

// NewRepository returns an inventory Repository backed by the given
// Firestore client. The client is owned by the caller and is not closed by
// the repository.
func NewRepository(client *firestore.Client) *Repository {
	return &Repository{client: client}
}

// GetItem reads a single inventory item by ID. Returns ErrNotFound when the
// document does not exist.
func (r *Repository) GetItem(ctx context.Context, itemID string) (*InventoryItem, error) {
	if itemID == "" {
		return nil, fmt.Errorf("stock repository: get item: id is required")
	}
	snap, err := r.client.Collection(inventoryCollection).Doc(itemID).Get(ctx)
	if err != nil {
		if status.Code(err) == codes.NotFound {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("stock repository: get item: %w", err)
	}
	var item InventoryItem
	if err := snap.DataTo(&item); err != nil {
		return nil, fmt.Errorf("stock repository: decode %s: %w", snap.Ref.ID, err)
	}
	item.ID = snap.Ref.ID
	return &item, nil
}

// GetItems reads multiple inventory items by ID in a single batch. Items
// that do not exist are silently omitted from the result — callers should
// compare the returned slice length against the input to detect missing
// items.
func (r *Repository) GetItems(ctx context.Context, itemIDs []string) ([]InventoryItem, error) {
	if len(itemIDs) == 0 {
		return nil, nil
	}

	refs := make([]*firestore.DocumentRef, len(itemIDs))
	for i, id := range itemIDs {
		refs[i] = r.client.Collection(inventoryCollection).Doc(id)
	}

	snaps, err := r.client.GetAll(ctx, refs)
	if err != nil {
		return nil, fmt.Errorf("stock repository: get items: %w", err)
	}

	var items []InventoryItem
	for _, snap := range snaps {
		if !snap.Exists() {
			continue
		}
		var item InventoryItem
		if err := snap.DataTo(&item); err != nil {
			return nil, fmt.Errorf("stock repository: decode %s: %w", snap.Ref.ID, err)
		}
		item.ID = snap.Ref.ID
		items = append(items, item)
	}
	return items, nil
}

// ListAvailable returns all inventory items that are marked available and
// have a positive stock quantity, ordered by category then item name.
func (r *Repository) ListAvailable(ctx context.Context) ([]InventoryItem, error) {
	iter := r.client.Collection(inventoryCollection).
		Where("available", "==", true).
		Where("quantity", ">", 0).
		OrderBy("quantity", firestore.Asc).
		Documents(ctx)
	defer iter.Stop()

	var items []InventoryItem
	for {
		snap, err := iter.Next()
		if errors.Is(err, iterator.Done) {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("stock repository: list available: %w", err)
		}
		var item InventoryItem
		if err := snap.DataTo(&item); err != nil {
			return nil, fmt.Errorf("stock repository: decode %s: %w", snap.Ref.ID, err)
		}
		item.ID = snap.Ref.ID
		items = append(items, item)
	}
	return items, nil
}

// ListFilter constrains an admin-side ListAll query. Empty fields disable
// the corresponding filter dimension.
type ListFilter struct {
	// Category, when non-empty, restricts results to inventory items whose
	// `category` field is exactly equal to this value (case sensitive).
	Category string
}

// adminListCap caps the number of items returned by ListAll. Mirrors the
// `Stock_API` listing contract from Requirement 10.2.
const adminListCap = 200

// applyAvailabilityInvariant enforces the design invariant
// `available = true ⇒ quantity > 0` on a payload map prior to write. When
// `quantity` is set to 0, `available` is forced to false. The function
// mutates the provided map in place and is safe to call when only one of
// the two fields is present (it is a no-op when `quantity` is absent).
func applyAvailabilityInvariant(payload map[string]interface{}) {
	q, ok := payload["quantity"]
	if !ok {
		return
	}
	qty, ok := toInt(q)
	if !ok {
		return
	}
	if qty == 0 {
		payload["available"] = false
	}
}

// toInt coerces a numeric value into an int. Firestore uses int64 for
// integers; tests and callers may pass int. Returns false for non-numeric
// values.
func toInt(v interface{}) (int, bool) {
	switch n := v.(type) {
	case int:
		return n, true
	case int32:
		return int(n), true
	case int64:
		return int(n), true
	}
	return 0, false
}

// Get reads a single inventory item by ID. Returns ErrNotFound when the
// document does not exist. Mirrors GetItem under the canonical name
// expected by the admin handler layer.
func (r *Repository) Get(ctx context.Context, id string) (*InventoryItem, error) {
	return r.GetItem(ctx, id)
}

// Create persists a new inventory item document and returns the generated
// document ID. UpdatedAt is replaced with a server-side timestamp; any
// value present on the input is overwritten by the sentinel.
//
// The input item's ID field is ignored: Firestore generates the document
// ID, which is returned to the caller.
//
// The `available = true ⇒ quantity > 0` invariant is enforced: when
// `Quantity` is 0, `Available` is forced to false before persisting.
func (r *Repository) Create(ctx context.Context, item InventoryItem) (string, error) {
	doc := r.client.Collection(inventoryCollection).NewDoc()

	payload := map[string]interface{}{
		"itemName":  item.ItemName,
		"quantity":  item.Quantity,
		"unit":      item.Unit,
		"price":     item.Price,
		"available": item.Available,
		"updatedAt": firestore.ServerTimestamp,
	}
	if item.Category != "" {
		payload["category"] = item.Category
	}
	if item.ImageURL != "" {
		payload["imageUrl"] = item.ImageURL
	}
	applyAvailabilityInvariant(payload)

	if _, err := doc.Set(ctx, payload); err != nil {
		return "", fmt.Errorf("stock repository: create: %w", err)
	}
	return doc.ID, nil
}

// Update replaces the user-controlled fields of an existing inventory
// item and refreshes `updatedAt` to a server-side timestamp. Returns
// ErrNotFound when no document with the given ID exists.
//
// The `available = true ⇒ quantity > 0` invariant is enforced: when
// `Quantity` is 0, `Available` is forced to false before persisting.
func (r *Repository) Update(ctx context.Context, id string, item InventoryItem) error {
	if id == "" {
		return fmt.Errorf("stock repository: update: id is required")
	}

	doc := r.client.Collection(inventoryCollection).Doc(id)

	// Pre-flight existence check so we can return ErrNotFound consistently
	// regardless of the underlying Firestore error code surfaced by the
	// emulator vs production.
	if _, err := doc.Get(ctx); err != nil {
		if status.Code(err) == codes.NotFound {
			return ErrNotFound
		}
		return fmt.Errorf("stock repository: update: %w", err)
	}

	payload := map[string]interface{}{
		"itemName":  item.ItemName,
		"quantity":  item.Quantity,
		"unit":      item.Unit,
		"price":     item.Price,
		"available": item.Available,
		"category":  item.Category,
		"imageUrl":  item.ImageURL,
		"updatedAt": firestore.ServerTimestamp,
	}
	applyAvailabilityInvariant(payload)

	if _, err := doc.Set(ctx, payload, firestore.MergeAll); err != nil {
		if status.Code(err) == codes.NotFound {
			return ErrNotFound
		}
		return fmt.Errorf("stock repository: update: %w", err)
	}
	return nil
}

// Delete removes the inventory item document with the given ID. Returns
// ErrNotFound when no such document exists.
func (r *Repository) Delete(ctx context.Context, id string) error {
	if id == "" {
		return fmt.Errorf("stock repository: delete: id is required")
	}

	doc := r.client.Collection(inventoryCollection).Doc(id)
	if _, err := doc.Get(ctx); err != nil {
		if status.Code(err) == codes.NotFound {
			return ErrNotFound
		}
		return fmt.Errorf("stock repository: delete: %w", err)
	}
	if _, err := doc.Delete(ctx); err != nil {
		return fmt.Errorf("stock repository: delete: %w", err)
	}
	return nil
}

// ListAll returns inventory items for the admin view. When filter.Category
// is non-empty, the result is restricted to items whose `category` field
// equals that value. The result is capped at 200 items per the
// `Stock_API` listing contract.
func (r *Repository) ListAll(ctx context.Context, filter ListFilter) ([]InventoryItem, error) {
	q := r.client.Collection(inventoryCollection).Query
	if filter.Category != "" {
		q = q.Where("category", "==", filter.Category)
	}
	q = q.Limit(adminListCap)

	iter := q.Documents(ctx)
	defer iter.Stop()

	var items []InventoryItem
	for {
		snap, err := iter.Next()
		if errors.Is(err, iterator.Done) {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("stock repository: list all: %w", err)
		}
		var item InventoryItem
		if err := snap.DataTo(&item); err != nil {
			return nil, fmt.Errorf("stock repository: decode %s: %w", snap.Ref.ID, err)
		}
		item.ID = snap.Ref.ID
		items = append(items, item)
	}
	return items, nil
}

// PatchStock updates only the `quantity` field of an inventory item and
// refreshes `updatedAt`. Returns ErrNotFound when no document with the
// given ID exists.
//
// The `available = true ⇒ quantity > 0` invariant is enforced: when
// `qty` is 0, `available` is forced to false in the same write.
func (r *Repository) PatchStock(ctx context.Context, id string, qty int) error {
	if id == "" {
		return fmt.Errorf("stock repository: patch stock: id is required")
	}

	doc := r.client.Collection(inventoryCollection).Doc(id)
	if _, err := doc.Get(ctx); err != nil {
		if status.Code(err) == codes.NotFound {
			return ErrNotFound
		}
		return fmt.Errorf("stock repository: patch stock: %w", err)
	}

	updates := []firestore.Update{
		{Path: "quantity", Value: qty},
		{Path: "updatedAt", Value: firestore.ServerTimestamp},
	}
	if qty == 0 {
		updates = append(updates, firestore.Update{Path: "available", Value: false})
	}

	if _, err := doc.Update(ctx, updates); err != nil {
		if status.Code(err) == codes.NotFound {
			return ErrNotFound
		}
		return fmt.Errorf("stock repository: patch stock: %w", err)
	}
	return nil
}

// DistinctCategories returns the lexicographically sorted set of distinct,
// trimmed, non-empty `category` values across all inventory documents.
// Categories that decode to an empty string after trimming whitespace are
// skipped, and duplicates are collapsed.
func (r *Repository) DistinctCategories(ctx context.Context) ([]string, error) {
	iter := r.client.Collection(inventoryCollection).Select("category").Documents(ctx)
	defer iter.Stop()

	seen := make(map[string]struct{})
	for {
		snap, err := iter.Next()
		if errors.Is(err, iterator.Done) {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("stock repository: distinct categories: %w", err)
		}
		raw, err := snap.DataAt("category")
		if err != nil {
			// Field absent on this doc.
			continue
		}
		s, ok := raw.(string)
		if !ok {
			continue
		}
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		seen[s] = struct{}{}
	}

	out := make([]string, 0, len(seen))
	for c := range seen {
		out = append(out, c)
	}
	sort.Strings(out)
	return out, nil
}
