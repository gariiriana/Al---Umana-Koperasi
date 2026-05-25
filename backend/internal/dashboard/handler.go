// Package dashboard provides the HTTP handlers that back the real-time
// monitoring dashboard described in Requirement 9.
package dashboard

import (
	"net/http"

	"al-umana/order-fulfillment/internal/common"
)

// Handler is the HTTP-facing boundary for dashboard aggregation endpoints.
// Methods are stubs that return 501 Not Implemented; task 19.5 will replace
// them with implementations backed by the order and GPS repositories.
type Handler struct{}

// NewHandler constructs a Handler. Future tasks will extend this signature
// to inject the order and GPS repositories.
func NewHandler() *Handler {
	return &Handler{}
}

// GetStats handles GET /api/dashboard/stats.
func (h *Handler) GetStats(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "GetDashboardStats")
}

// GetCourierLocations handles GET /api/couriers/locations.
func (h *Handler) GetCourierLocations(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "GetCourierLocations")
}

func notImplemented(w http.ResponseWriter, endpoint string) {
	common.WriteJSONError(
		w,
		http.StatusNotImplemented,
		common.CodeNotImplemented,
		endpoint+" is not yet implemented",
	)
}
