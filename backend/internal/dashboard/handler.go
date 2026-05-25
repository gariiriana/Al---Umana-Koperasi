// Package dashboard provides the HTTP handlers that back the real-time
// monitoring dashboard described in Requirement 9.
package dashboard

import (
	"encoding/json"
	"net/http"
	"time"

	"al-umana/order-fulfillment/internal/common"
	"al-umana/order-fulfillment/internal/gps"
	"al-umana/order-fulfillment/internal/order"
)

// staleCourierThreshold defines how long after the most recent GPS update a
// courier is considered "active". Beyond this window, the dashboard hides
// the courier marker (Requirement 9.4).
const staleCourierThreshold = 5 * time.Minute

// Handler is the HTTP boundary for dashboard aggregation endpoints. It
// delegates persistence to the order and GPS repositories.
type Handler struct {
	orderRepo *order.Repository
	gpsRepo   *gps.Repository
}

// NewHandler constructs a dashboard Handler. Either dependency may be nil
// during scaffolding; the corresponding endpoint will return 501 in that
// case.
func NewHandler(orderRepo *order.Repository, gpsRepo *gps.Repository) *Handler {
	return &Handler{orderRepo: orderRepo, gpsRepo: gpsRepo}
}

// GetStats handles GET /api/dashboard/stats. It returns the count of orders
// in each tracked status. Statuses with zero matching orders are present
// in the result with value 0 so the frontend can render every column
// without conditional logic.
func (h *Handler) GetStats(w http.ResponseWriter, r *http.Request) {
	if h.orderRepo == nil {
		notImplemented(w, "GetDashboardStats")
		return
	}
	counts, err := h.orderRepo.CountByStatus(r.Context())
	if err != nil {
		common.WriteJSONError(w, http.StatusInternalServerError, common.CodeInternalError, err.Error())
		return
	}

	// Translate to a stable, alphabetically-sorted JSON object keyed by the
	// canonical status string so the frontend can render columns by name.
	stringKeyed := make(map[string]int, len(counts))
	for k, v := range counts {
		stringKeyed[string(k)] = v
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"counts":    stringKeyed,
		"generated": time.Now().UTC(),
	})
}

// GetCourierLocations handles GET /api/couriers/locations. It returns the
// most recent GPS coordinate per active courier (timestamp ≤ 5 minutes
// old).
func (h *Handler) GetCourierLocations(w http.ResponseWriter, r *http.Request) {
	if h.gpsRepo == nil {
		notImplemented(w, "GetCourierLocations")
		return
	}
	locations, err := h.gpsRepo.ListActive(r.Context(), staleCourierThreshold)
	if err != nil {
		common.WriteJSONError(w, http.StatusInternalServerError, common.CodeInternalError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"locations": locations,
		"generated": time.Now().UTC(),
	})
}

func writeJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func notImplemented(w http.ResponseWriter, endpoint string) {
	common.WriteJSONError(
		w,
		http.StatusNotImplemented,
		common.CodeNotImplemented,
		endpoint+" is not yet implemented",
	)
}
