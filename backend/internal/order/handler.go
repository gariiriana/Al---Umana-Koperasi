package order

import (
	"net/http"

	"al-umana/order-fulfillment/internal/common"
)

// Handler is the HTTP-facing boundary for the order domain. The methods on
// it are stubs that return 501 Not Implemented; subsequent tasks (7.x, 10.x,
// 11.x, 12.x, 17.x) will replace each with a real implementation backed by
// the order service and Firestore repository.
//
// The struct intentionally has no fields yet: tasks that need a service or
// repository will add them via constructor injection without breaking the
// router wiring that depends on this concrete type.
type Handler struct{}

// NewHandler constructs a Handler. Future tasks will extend this signature
// to accept an order service and any other dependencies.
func NewHandler() *Handler {
	return &Handler{}
}

// CreateOrder handles POST /api/orders.
func (h *Handler) CreateOrder(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "CreateOrder")
}

// ListOrders handles GET /api/orders.
func (h *Handler) ListOrders(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "ListOrders")
}

// GetOrder handles GET /api/orders/{id}.
func (h *Handler) GetOrder(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "GetOrder")
}

// TransitionStatus handles PATCH /api/orders/{id}/status.
func (h *Handler) TransitionStatus(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "TransitionStatus")
}

// AssignCourier handles POST /api/orders/{id}/assign-courier.
func (h *Handler) AssignCourier(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "AssignCourier")
}

// DispatchOrder handles POST /api/orders/{id}/dispatch.
func (h *Handler) DispatchOrder(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "DispatchOrder")
}

// ConfirmDelivery handles POST /api/orders/{id}/deliver.
func (h *Handler) ConfirmDelivery(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "ConfirmDelivery")
}

// ListOrderFiles handles GET /api/orders/{id}/files.
func (h *Handler) ListOrderFiles(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "ListOrderFiles")
}

// notImplemented writes the canonical NOT_IMPLEMENTED error response. The
// endpoint name is included in the message so client logs and dev tools can
// distinguish stub responses across the API surface.
func notImplemented(w http.ResponseWriter, endpoint string) {
	common.WriteJSONError(
		w,
		http.StatusNotImplemented,
		common.CodeNotImplemented,
		endpoint+" is not yet implemented",
	)
}
