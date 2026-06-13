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
	StatusPlacing                 OrderStatus = "PLACING"
	StatusAwaitingPaymentProof    OrderStatus = "AWAITING_PAYMENT_PROOF"
	StatusAwaitingPaymentApproval OrderStatus = "AWAITING_PAYMENT_APPROVAL"
	StatusPaymentRejected         OrderStatus = "PAYMENT_REJECTED"
	StatusConfirmed               OrderStatus = "CONFIRMED"
	StatusInProduction            OrderStatus = "IN_PRODUCTION"
	StatusReady                   OrderStatus = "READY"
	StatusReadyToDeliver          OrderStatus = "READY_TO_DELIVER"
	StatusOutForDelivery          OrderStatus = "OUT_FOR_DELIVERY"
	StatusDelivered               OrderStatus = "DELIVERED"
	StatusFailed                  OrderStatus = "FAILED"
)

// PaymentMethod is a string-typed enumeration of supported payment methods on
// an Order. COD orders bypass the payment-proof workflow; non-COD orders
// (bank transfer, e-wallet) require a customer-uploaded proof and admin
// approval before transitioning to CONFIRMED.
type PaymentMethod string

// Payment method constants. These string values are the canonical wire and
// storage representation.
const (
	PaymentCOD          PaymentMethod = "cod"
	PaymentBankTransfer PaymentMethod = "bank_transfer"
	PaymentEWallet      PaymentMethod = "e_wallet"
)

// PaymentStatus is a string-typed enumeration tracking the payment-proof
// sub-lifecycle for non-COD orders. It is independent of OrderStatus so the
// fulfillment pipeline can advance without being coupled to payment fields.
type PaymentStatus string

// Payment status constants. These string values are the canonical wire and
// storage representation.
const (
	PaymentStatusAwaitingProof    PaymentStatus = "awaiting_proof"
	PaymentStatusAwaitingApproval PaymentStatus = "awaiting_approval"
	PaymentStatusApproved         PaymentStatus = "approved"
	PaymentStatusRejected         PaymentStatus = "rejected"
)

// OrderLineItem represents a single line on an order: a product, its display
// name, and the quantity requested. Quantity must be a positive integer; this
// invariant is enforced by the validation layer rather than by the type
// itself.
type OrderLineItem struct {
	ItemID      string `json:"itemId" firestore:"itemId"`
	ItemName    string `json:"itemName" firestore:"itemName"`
	Quantity    int    `json:"quantity" firestore:"quantity"`
	Ingredients string `json:"ingredients,omitempty" firestore:"ingredients,omitempty"`
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
	IsPreOrder          bool            `json:"isPreOrder" firestore:"isPreOrder"`
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
	// Payment workflow fields. PaymentMethod is required on newly placed
	// orders; the remaining fields are populated as the payment-proof
	// sub-lifecycle advances and use `omitempty` so legacy COD orders that
	// pre-date this feature serialize cleanly.
	PaymentMethod       PaymentMethod `json:"paymentMethod" firestore:"paymentMethod"`
	PaymentStatus       PaymentStatus `json:"paymentStatus,omitempty" firestore:"paymentStatus,omitempty"`
	PaymentProofFileID  string        `json:"paymentProofFileId,omitempty" firestore:"paymentProofFileId,omitempty"`
	PaymentApprovedBy   string        `json:"paymentApprovedBy,omitempty" firestore:"paymentApprovedBy,omitempty"`
	PaymentApprovedAt   *time.Time    `json:"paymentApprovedAt,omitempty" firestore:"paymentApprovedAt,omitempty"`
	PaymentRejectedBy   string        `json:"paymentRejectedBy,omitempty" firestore:"paymentRejectedBy,omitempty"`
	PaymentRejectedAt   *time.Time    `json:"paymentRejectedAt,omitempty" firestore:"paymentRejectedAt,omitempty"`
	PaymentRejectReason string            `json:"paymentRejectionReason,omitempty" firestore:"paymentRejectionReason,omitempty"`
	Kitchen             string            `json:"kitchen,omitempty" firestore:"kitchen,omitempty"`
	ItemKitchens        map[string]string `json:"itemKitchens,omitempty" firestore:"itemKitchens,omitempty"`
	QaStartChecklist    *QaStartChecklist `json:"qaStartChecklist,omitempty" firestore:"qaStartChecklist,omitempty"`
	CreatedAt           time.Time         `json:"createdAt" firestore:"createdAt"`
	UpdatedAt           time.Time         `json:"updatedAt" firestore:"updatedAt"`
}

// QaStartChecklist matches the frontend initial production QA checklist.
type QaStartChecklist struct {
	Kebersihan       bool `json:"kebersihan" firestore:"kebersihan"`
	KelengkapanBahan bool `json:"kelengkapanBahan" firestore:"kelengkapanBahan"`
	SuhuPenyimpanan  bool `json:"suhuPenyimpanan" firestore:"suhuPenyimpanan"`
}
