package stock

import (
	"context"
	"errors"
	"fmt"

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
