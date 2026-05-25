// Package order contains the domain types, validation, state-machine, and
// service layer for orders in the Al-Umana fulfillment pipeline.
package order

import "time"

// OrderStatus is a string-typed enumeration of the valid lifecycle states an
// order can occupy. Transitions between statuses are governed by the order
// state machine.
type OrderStatus string

// Order status constants. These string values are the canonical wire and
// storage representation; both the JSON API and Firestore documents use them
// verbatim.
const (
	StatusPlacing        OrderStatus = "PLACING"
	StatusConfirmed      OrderStatus = "CONFIRMED"
	StatusInProduction   OrderStatus = "IN_PRODUCTION"
	StatusReady          OrderStatus = "READY"
	StatusReadyToDeliver OrderStatus = "READY_TO_DELIVER"
	StatusOutForDelivery OrderStatus = "OUT_FOR_DELIVERY"
	StatusDelivered      OrderStatus = "DELIVERED"
	StatusFailed         OrderStatus = "FAILED"
)

// OrderLineItem represents a single line on an order: a product, its display
// name, and the quantity requested. Quantity must be a positive integer; this
// invariant is enforced by the validation layer rather than by the type
// itself.
type OrderLineItem struct {
	ItemID   string `json:"itemId" firestore:"itemId"`
	ItemName string `json:"itemName" firestore:"itemName"`
	Quantity int    `json:"quantity" firestore:"quantity"`
}

// Order is the canonical record for an order moving through the fulfillment
// pipeline. Optional fields (those that are only populated at certain stages
// of the lifecycle) use `omitempty` JSON and Firestore tags so that absent
// values are not serialized as zero values.
//
// Timestamp fields use time.Time; the JSON encoder emits RFC 3339 by default,
// which matches the design's ISO 8601 contract.
type Order struct {
	ID                  string          `json:"id" firestore:"-"`
	CustomerID          string          `json:"customerId" firestore:"customerId"`
	CustomerName        string          `json:"customerName" firestore:"customerName"`
	Items               []OrderLineItem `json:"items" firestore:"items"`
	DeliveryAddress     string          `json:"deliveryAddress" firestore:"deliveryAddress"`
	DeliveryTime        string          `json:"deliveryTime" firestore:"deliveryTime"`
	Status              OrderStatus     `json:"status" firestore:"status"`
	RejectionReason     string          `json:"rejectionReason,omitempty" firestore:"rejectionReason,omitempty"`
	OutOfStockItems     []string        `json:"outOfStockItems,omitempty" firestore:"outOfStockItems,omitempty"`
	AssignedCourierID   string          `json:"assignedCourierId,omitempty" firestore:"assignedCourierId,omitempty"`
	ProductionStartedBy string          `json:"productionStartedBy,omitempty" firestore:"productionStartedBy,omitempty"`
	ProductionStartedAt *time.Time      `json:"productionStartedAt,omitempty" firestore:"productionStartedAt,omitempty"`
	QCReviewedBy        string          `json:"qcReviewedBy,omitempty" firestore:"qcReviewedBy,omitempty"`
	QCReviewedAt        *time.Time      `json:"qcReviewedAt,omitempty" firestore:"qcReviewedAt,omitempty"`
	QCFailReason        string          `json:"qcFailReason,omitempty" firestore:"qcFailReason,omitempty"`
	DeliveredAt         *time.Time      `json:"deliveredAt,omitempty" firestore:"deliveredAt,omitempty"`
	ProofFileIDs        []string        `json:"proofFileIds,omitempty" firestore:"proofFileIds,omitempty"`
	CreatedAt           time.Time       `json:"createdAt" firestore:"createdAt"`
	UpdatedAt           time.Time       `json:"updatedAt" firestore:"updatedAt"`
}
