package stock

import "time"

// InventoryItem represents a single product / menu item in the inventory
// collection. The Firestore document ID is used as the canonical item
// identifier; it matches the OrderLineItem.ItemID field on orders.
type InventoryItem struct {
	ID       string `json:"id" firestore:"-"`
	ItemName string `json:"itemName" firestore:"itemName"`
	Quantity int    `json:"quantity" firestore:"quantity"`
	Unit     string `json:"unit" firestore:"unit"`
	// Price is stored in the smallest currency unit (e.g. IDR integer).
	Price     int64     `json:"price" firestore:"price"`
	Available bool      `json:"available" firestore:"available"`
	Category  string    `json:"category,omitempty" firestore:"category,omitempty"`
	ImageURL  string    `json:"imageUrl,omitempty" firestore:"imageUrl,omitempty"`
	UpdatedAt time.Time `json:"updatedAt" firestore:"updatedAt"`
}

// StockCheckTimeout is the maximum wall-time the stock service will wait
// for inventory queries before aborting with a timeout error.
const StockCheckTimeout = 10 * time.Second
