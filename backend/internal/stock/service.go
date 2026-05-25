package stock

import (
	"context"
	"fmt"

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

// Service implements the stock checking business logic. It queries the
// inventory repository to determine whether every requested item has
// sufficient stock.
type Service struct {
	repo *Repository
}

// NewService returns a Service backed by the given inventory repository.
func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
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
