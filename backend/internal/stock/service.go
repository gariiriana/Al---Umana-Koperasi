package stock

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"al-umana/order-fulfillment/internal/common"
	"al-umana/order-fulfillment/internal/order"
)

// StockChecker is the interface consumed by the order service to verify
// item availability before confirming an order. It is defined here (rather
// than in the order package) to keep the dependency arrow pointing inward:
// the order package declares the interface it needs, and the stock package
// provides the implementation.
//
// NOTE: the interface is re-exported here for convenience, but the
// canonical consumer-side declaration lives in the order package.
type StockChecker interface {
	CheckAvailability(ctx context.Context, items []order.OrderLineItem) (outOfStock []string, err error)
}

// ValidationError carries a slice of field-level errors so the handler can
// translate them into the response envelope without re-running validation.
// Mirrors the pattern used by the order service.
type ValidationError struct {
	Fields []common.FieldError
}

func (e *ValidationError) Error() string {
	return fmt.Sprintf("validation failed (%d fields)", len(e.Fields))
}

// ProductImageDeleter abstracts cascade-deletion of `product_images/{fileId}`
// parent + chunks. The stock Service uses it to clean up Firestore image
// documents when an InventoryItem is deleted, when its image is replaced,
// or when its image is explicitly removed.
//
// The implementation lives outside this package (handler / main composes
// it from a *file.Repository) so the stock package does not need to import
// the file package, keeping the dependency arrow pointing outward.
type ProductImageDeleter interface {
	// DeleteProductImage removes the parent doc and chunks for the given
	// fileId under the `product_images` collection. Implementations should
	// be tolerant of an already-deleted file (treat as no-op).
	DeleteProductImage(ctx context.Context, fileID string) error
}

// Service implements the stock checking and inventory administration
// business logic. CheckAvailability remains the public hot path consumed
// by the order service; the admin operations (Create, Update, Delete,
// PatchStock, List, Get, DistinctCategories, SetItemImage,
// RemoveItemImage) wrap the repository with validation and image cascade
// cleanup.
type Service struct {
	repo                *Repository
	productImageDeleter ProductImageDeleter
}

// ServiceOption configures optional Service dependencies. Using the
// functional-options pattern keeps NewService backwards compatible with
// the existing `stock.NewService(stockRepo)` call site in main.go while
// allowing the admin handler layer to inject a ProductImageDeleter.
type ServiceOption func(*Service)

// WithProductImageDeleter wires the product-image cascade deleter into the
// Service. When nil, image cascade cleanup is silently skipped — the
// current image reference on the InventoryItem is updated in place. This
// is the right behaviour for development environments without Firestore.
func WithProductImageDeleter(d ProductImageDeleter) ServiceOption {
	return func(s *Service) {
		s.productImageDeleter = d
	}
}

// NewService returns a Service backed by the given inventory repository.
// Optional dependencies (notably the product-image cascade deleter) are
// supplied via ServiceOption variadic args so the existing call site in
// cmd/server/main.go (`stock.NewService(stockRepo)`) keeps working
// unchanged.
func NewService(repo *Repository, opts ...ServiceOption) *Service {
	s := &Service{repo: repo}
	for _, opt := range opts {
		if opt != nil {
			opt(s)
		}
	}
	return s
}

// CheckAvailability verifies that all items in the order are available in
// sufficient quantity. It returns a (possibly empty) list of item IDs that
// are out of stock or not found.
//
// The caller is responsible for wrapping ctx with a timeout (e.g.
// context.WithTimeout(ctx, StockCheckTimeout)) before calling this method.
func (s *Service) CheckAvailability(ctx context.Context, items []order.OrderLineItem) ([]string, error) {
	if len(items) == 0 {
		return nil, nil
	}

	// Collect unique item IDs.
	ids := make([]string, 0, len(items))
	wantQty := make(map[string]int, len(items))
	for _, item := range items {
		if _, exists := wantQty[item.ItemID]; !exists {
			ids = append(ids, item.ItemID)
		}
		wantQty[item.ItemID] += item.Quantity
	}

	// Batch-fetch all inventory items.
	invItems, err := s.repo.GetItems(ctx, ids)
	if err != nil {
		return nil, fmt.Errorf("stock service: check availability: %w", err)
	}

	// Index found items by ID.
	found := make(map[string]*InventoryItem, len(invItems))
	for i := range invItems {
		found[invItems[i].ID] = &invItems[i]
	}

	// Check each requested item.
	var outOfStock []string
	for id, qty := range wantQty {
		inv, ok := found[id]
		if !ok {
			// Item not found in inventory at all.
			outOfStock = append(outOfStock, id)
			continue
		}
		if !inv.Available {
			outOfStock = append(outOfStock, id)
			continue
		}
		if inv.Quantity < qty {
			outOfStock = append(outOfStock, id)
		}
	}

	return outOfStock, nil
}

// Create validates the supplied InventoryItem and persists it. Returns a
// *ValidationError on field-level validation failure (Requirements 10.1,
// 10.6) and the generated document ID otherwise.
func (s *Service) Create(ctx context.Context, item InventoryItem) (string, error) {
	if errs := ValidateInventoryItem(item); len(errs) > 0 {
		return "", &ValidationError{Fields: errs}
	}
	id, err := s.repo.Create(ctx, item)
	if err != nil {
		return "", fmt.Errorf("stock service: create: %w", err)
	}
	return id, nil
}

// Update validates the supplied InventoryItem and replaces the existing
// document at id. Returns a *ValidationError on field-level validation
// failure, and ErrNotFound when no document with the given id exists.
func (s *Service) Update(ctx context.Context, id string, item InventoryItem) error {
	if errs := ValidateInventoryItem(item); len(errs) > 0 {
		return &ValidationError{Fields: errs}
	}
	if err := s.repo.Update(ctx, id, item); err != nil {
		if errors.Is(err, ErrNotFound) {
			return err
		}
		return fmt.Errorf("stock service: update: %w", err)
	}
	return nil
}

// PatchStock validates the supplied quantity (0 ≤ qty ≤ 99,999) and
// updates the inventory item's stock count. Returns a *ValidationError on
// out-of-range qty (Requirement 12.5), and ErrNotFound when no document
// with the given id exists.
func (s *Service) PatchStock(ctx context.Context, id string, qty int) error {
	if qty < MinQuantity || qty > MaxQuantity {
		return &ValidationError{Fields: []common.FieldError{{
			Field:  "quantity",
			Reason: reasonQuantityOutOfRange,
		}}}
	}
	if err := s.repo.PatchStock(ctx, id, qty); err != nil {
		if errors.Is(err, ErrNotFound) {
			return err
		}
		return fmt.Errorf("stock service: patch stock: %w", err)
	}
	return nil
}

// Delete removes the inventory item document with the given id. When the
// item's ImageURL is set in `product_images/{fileId}` format, the linked
// product-image parent document and chunks are deleted first
// (Requirement 11.11). Returns ErrNotFound when no such document exists.
func (s *Service) Delete(ctx context.Context, id string) error {
	if id == "" {
		return fmt.Errorf("stock service: delete: id is required")
	}

	item, err := s.repo.Get(ctx, id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return err
		}
		return fmt.Errorf("stock service: delete: %w", err)
	}

	if fileID, ok := extractProductImageFileID(item.ImageURL); ok {
		if err := s.deleteProductImage(ctx, fileID); err != nil {
			return fmt.Errorf("stock service: delete: cascade image: %w", err)
		}
	}

	if err := s.repo.Delete(ctx, id); err != nil {
		return fmt.Errorf("stock service: delete: %w", err)
	}
	return nil
}

// List returns inventory items for the admin view, filtered by
// filter.Category when non-empty. The 200-item cap (Requirement 10.2) is
// enforced by the repository.
func (s *Service) List(ctx context.Context, filter ListFilter) ([]InventoryItem, error) {
	items, err := s.repo.ListAll(ctx, filter)
	if err != nil {
		return nil, fmt.Errorf("stock service: list: %w", err)
	}
	return items, nil
}

// Get returns a single inventory item by id. Returns ErrNotFound when no
// document with the given id exists.
func (s *Service) Get(ctx context.Context, id string) (*InventoryItem, error) {
	item, err := s.repo.Get(ctx, id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, err
		}
		return nil, fmt.Errorf("stock service: get: %w", err)
	}
	return item, nil
}

// DistinctCategories returns the lexicographically sorted set of distinct,
// trimmed, non-empty category values across the inventory collection
// (Requirement 13.6).
func (s *Service) DistinctCategories(ctx context.Context) ([]string, error) {
	cats, err := s.repo.DistinctCategories(ctx)
	if err != nil {
		return nil, fmt.Errorf("stock service: distinct categories: %w", err)
	}
	return cats, nil
}

// SetItemImage attaches a new product image to the inventory item. When
// the item already references a previous `product_images/{old}` image,
// the old parent doc and chunks are deleted first (Requirements 11.7,
// 11.9). The InventoryItem's `imageURL` is then updated to
// `product_images/{newFileID}`.
func (s *Service) SetItemImage(ctx context.Context, id, newFileID string) error {
	if id == "" {
		return fmt.Errorf("stock service: set image: id is required")
	}
	if strings.TrimSpace(newFileID) == "" {
		return &ValidationError{Fields: []common.FieldError{{
			Field:  "fileId",
			Reason: "fileId must not be empty",
		}}}
	}
	if strings.Contains(newFileID, "/") {
		return &ValidationError{Fields: []common.FieldError{{
			Field:  "fileId",
			Reason: "fileId must not contain a path separator",
		}}}
	}

	item, err := s.repo.Get(ctx, id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return err
		}
		return fmt.Errorf("stock service: set image: %w", err)
	}

	if oldFileID, ok := extractProductImageFileID(item.ImageURL); ok && oldFileID != newFileID {
		if err := s.deleteProductImage(ctx, oldFileID); err != nil {
			return fmt.Errorf("stock service: set image: cascade previous: %w", err)
		}
	}

	updated := *item
	updated.ImageURL = imageURLPrefix + newFileID
	if err := s.repo.Update(ctx, id, updated); err != nil {
		if errors.Is(err, ErrNotFound) {
			return err
		}
		return fmt.Errorf("stock service: set image: %w", err)
	}
	return nil
}

// RemoveItemImage clears the inventory item's image. When the item
// currently references a `product_images/{fileId}` image, the parent doc
// and chunks are deleted (Requirement 11.11) before clearing
// `imageURL` to the empty string. A no-op (return nil) when the item has
// no image attached.
func (s *Service) RemoveItemImage(ctx context.Context, id string) error {
	if id == "" {
		return fmt.Errorf("stock service: remove image: id is required")
	}

	item, err := s.repo.Get(ctx, id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return err
		}
		return fmt.Errorf("stock service: remove image: %w", err)
	}

	if item.ImageURL == "" {
		return nil
	}

	if fileID, ok := extractProductImageFileID(item.ImageURL); ok {
		if err := s.deleteProductImage(ctx, fileID); err != nil {
			return fmt.Errorf("stock service: remove image: cascade: %w", err)
		}
	}

	updated := *item
	updated.ImageURL = ""
	if err := s.repo.Update(ctx, id, updated); err != nil {
		if errors.Is(err, ErrNotFound) {
			return err
		}
		return fmt.Errorf("stock service: remove image: %w", err)
	}
	return nil
}

// deleteProductImage invokes the configured ProductImageDeleter, treating
// a nil deleter as a no-op so the service can be constructed without
// Firestore wiring (development mode) and so callers that have already
// cleaned up the image out of band do not see spurious errors.
func (s *Service) deleteProductImage(ctx context.Context, fileID string) error {
	if s.productImageDeleter == nil {
		return nil
	}
	return s.productImageDeleter.DeleteProductImage(ctx, fileID)
}

// extractProductImageFileID returns the {fileId} portion of an imageURL of
// the form `product_images/{fileId}` and reports whether the URL matched
// the expected format. URLs that do not match (including empty strings
// and legacy HTTP URLs) cause it to return ("", false), signalling
// callers to skip cascade cleanup.
func extractProductImageFileID(imageURL string) (string, bool) {
	if !strings.HasPrefix(imageURL, imageURLPrefix) {
		return "", false
	}
	fileID := imageURL[len(imageURLPrefix):]
	if fileID == "" || strings.Contains(fileID, "/") {
		return "", false
	}
	return fileID, true
}
