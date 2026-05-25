package order

// CreateOrderRequest is the JSON body accepted by POST /api/orders. The
// customer ID is taken from the authenticated principal rather than the
// request body, so it does not appear here.
type CreateOrderRequest struct {
	CustomerName    string          `json:"customerName"`
	DeliveryAddress string          `json:"deliveryAddress"`
	Items           []OrderLineItem `json:"items"`
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
