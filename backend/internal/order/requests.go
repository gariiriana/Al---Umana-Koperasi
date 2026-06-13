package order

// CreateOrderRequest is the JSON body accepted by POST /api/orders. The
// customer ID is taken from the authenticated principal rather than the
// request body, so it does not appear here.
//
// PaymentMethod is required and must be one of the values in the
// PaymentMethod enum (see models.go); validation is enforced by
// ValidateCreateOrder.
type CreateOrderRequest struct {
	CustomerName    string          `json:"customerName"`
	DeliveryAddress string          `json:"deliveryAddress"`
	DeliveryTime    string          `json:"deliveryTime"`
	PaymentMethod   PaymentMethod   `json:"paymentMethod"`
	Items           []OrderLineItem `json:"items"`
	IsPreOrder      bool            `json:"isPreOrder"`
}

// QC decision values accepted by QCDecisionRequest.Decision.
const (
	QCDecisionPass = "pass"
	QCDecisionFail = "fail"
)

// QCDecisionRequest is the JSON body for QC pass/fail submissions. Reason is
// required when Decision is "fail" and ignored when Decision is "pass"; the
// constraint is enforced by the validation layer.
type QCDecisionRequest struct {
	Decision string `json:"decision"`
	Reason   string `json:"reason,omitempty"`
}

// AssignCourierRequest is the JSON body for assigning a courier to an order
// in READY_TO_DELIVER status.
type AssignCourierRequest struct {
	CourierID string `json:"courierId"`
}

// UploadPaymentProofRequest is the JSON body for finalizing a customer's
// payment-proof upload. FileID is the bare document ID returned by the
// chunked-file upload protocol against the `payment_proofs` collection;
// the service prepends the canonical `payment_proofs/` prefix when
// persisting it on the Order (Requirement 7.9).
type UploadPaymentProofRequest struct {
	FileID string `json:"fileId"`
}

// RejectPaymentRequest is the JSON body for an admin rejecting a payment
// proof on an Order in AWAITING_PAYMENT_APPROVAL. Reason must be 1–500
// characters after trimming whitespace; the validation is enforced by
// the service layer (Requirement 8.7).
type RejectPaymentRequest struct {
	Reason string `json:"reason"`
}
