package stock

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"al-umana/order-fulfillment/internal/common"
)

// Handler is the HTTP boundary for the admin-side inventory API. It
// delegates business logic to Service and is responsible only for request
// decoding, response encoding, and mapping service-layer errors to the
// canonical JSON error envelope.
//
// The admin role check (FORBIDDEN_ADMIN_ONLY → 403) is enforced by the
// auth.AdminGuard middleware applied in the router (task 5.7); handlers
// here therefore assume the authenticated principal is an admin.
type Handler struct {
	service *Service
}

// NewHandler constructs a Handler bound to the supplied Service. The
// service may be nil during early scaffolding; in that case every
// endpoint returns 501 NOT_IMPLEMENTED.
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// InventoryItemInput is the JSON body accepted by Create and Update. It
// mirrors the user-controlled fields of InventoryItem; `id` and
// `updatedAt` are server-controlled and ignored on input.
type InventoryItemInput struct {
	ItemName        string   `json:"itemName"`
	Quantity        int      `json:"quantity"`
	Unit            string   `json:"unit"`
	Price           int64    `json:"price"`
	DiscountPercent int      `json:"discountPercent"`
	Available       bool     `json:"available"`
	Category        string   `json:"category,omitempty"`
	ImageURL        string   `json:"imageUrl,omitempty"`
	DetailImageUrls []string `json:"detailImageUrls,omitempty"`
}

// toModel converts the wire payload into the domain InventoryItem the
// service layer expects. Server-controlled fields (ID, UpdatedAt) are
// left as their zero values; the repository sets UpdatedAt to a
// server-side timestamp on write.
func (in InventoryItemInput) toModel() InventoryItem {
	return InventoryItem{
		ItemName:        in.ItemName,
		Quantity:        in.Quantity,
		Unit:            in.Unit,
		Price:           in.Price,
		DiscountPercent: in.DiscountPercent,
		Available:       in.Available,
		Category:        in.Category,
		ImageURL:        in.ImageURL,
		DetailImageUrls: in.DetailImageUrls,
	}
}

// patchStockRequest is the JSON body for PATCH .../{id}/stock. Quantity
// is the new absolute stock count, not a delta.
type patchStockRequest struct {
	Quantity int `json:"quantity"`
}

// Create handles POST /api/admin/inventory. It decodes an
// InventoryItemInput, persists it via Service.Create, then reads it back
// via Service.Get so the response carries the generated `id` and the
// server-side `updatedAt` timestamp. Returns 201 on success, 400
// VALIDATION_ERROR on field-level validation failure (Requirements 10.1,
// 10.6).
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	if h.service == nil {
		notImplemented(w, "Create")
		return
	}

	var in InventoryItemInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		common.WriteJSONError(w, http.StatusBadRequest, common.CodeValidationError, "invalid JSON body")
		return
	}

	id, err := h.service.Create(r.Context(), in.toModel())
	if err != nil {
		writeServiceError(w, err)
		return
	}

	item, err := h.service.Get(r.Context(), id)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

// List handles GET /api/admin/inventory. The optional `category` query
// parameter restricts the result to inventory items whose `category`
// field equals the supplied value (case sensitive). The 200-item cap is
// enforced at the repository layer (Requirement 10.2).
//
// The response shape `{ "items": [...] }` mirrors the convention used by
// order.Handler.ListOrders (`{ "orders": [...] }`).
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	if h.service == nil {
		notImplemented(w, "List")
		return
	}

	filter := ListFilter{
		Category: strings.TrimSpace(r.URL.Query().Get("category")),
	}

	items, err := h.service.List(r.Context(), filter)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	if items == nil {
		items = []InventoryItem{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// Get handles GET /api/admin/inventory/{id}. Returns 200 with the item
// JSON or 404 NOT_FOUND when no document with the given id exists
// (Requirements 10.9, 10.10, 12.7).
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	if h.service == nil {
		notImplemented(w, "Get")
		return
	}
	id := r.PathValue("id")
	if id == "" {
		common.WriteJSONError(w, http.StatusBadRequest, common.CodeValidationError, "id path param is required")
		return
	}
	item, err := h.service.Get(r.Context(), id)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

// Update handles PUT /api/admin/inventory/{id}. It decodes an
// InventoryItemInput, replaces the existing document via Service.Update,
// then reads it back via Service.Get so the response reflects the
// post-write state including the refreshed `updatedAt` timestamp.
// Returns 200 on success, 400 VALIDATION_ERROR on validation failure
// (Requirement 10.3, 10.6), and 404 NOT_FOUND when the id is unknown.
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	if h.service == nil {
		notImplemented(w, "Update")
		return
	}
	id := r.PathValue("id")
	if id == "" {
		common.WriteJSONError(w, http.StatusBadRequest, common.CodeValidationError, "id path param is required")
		return
	}

	var in InventoryItemInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		common.WriteJSONError(w, http.StatusBadRequest, common.CodeValidationError, "invalid JSON body")
		return
	}

	if err := h.service.Update(r.Context(), id, in.toModel()); err != nil {
		writeServiceError(w, err)
		return
	}

	item, err := h.service.Get(r.Context(), id)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

// PatchStock handles PATCH /api/admin/inventory/{id}/stock. It decodes a
// `{ "quantity": int }` body, applies it via Service.PatchStock, and
// returns 204 on success, 400 VALIDATION_ERROR for an out-of-range
// quantity (Requirement 12.5), or 404 NOT_FOUND when the id is unknown
// (Requirement 12.7).
func (h *Handler) PatchStock(w http.ResponseWriter, r *http.Request) {
	if h.service == nil {
		notImplemented(w, "PatchStock")
		return
	}
	id := r.PathValue("id")
	if id == "" {
		common.WriteJSONError(w, http.StatusBadRequest, common.CodeValidationError, "id path param is required")
		return
	}

	var req patchStockRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		common.WriteJSONError(w, http.StatusBadRequest, common.CodeValidationError, "invalid JSON body")
		return
	}

	if err := h.service.PatchStock(r.Context(), id, req.Quantity); err != nil {
		writeServiceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Delete handles DELETE /api/admin/inventory/{id}. It removes the
// inventory document and cascades the deletion to any linked
// `product_images/{fileId}` parent + chunks (Requirement 11.11). Returns
// 204 on success or 404 NOT_FOUND when the id is unknown (Requirement
// 10.10).
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	if h.service == nil {
		notImplemented(w, "Delete")
		return
	}
	id := r.PathValue("id")
	if id == "" {
		common.WriteJSONError(w, http.StatusBadRequest, common.CodeValidationError, "id path param is required")
		return
	}
	if err := h.service.Delete(r.Context(), id); err != nil {
		writeServiceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ListCategories handles GET /api/admin/inventory/categories. Returns
// the lexicographically sorted set of distinct, trimmed, non-empty
// category strings as a JSON array (Requirements 13.5, 13.6).
func (h *Handler) ListCategories(w http.ResponseWriter, r *http.Request) {
	if h.service == nil {
		notImplemented(w, "ListCategories")
		return
	}
	cats, err := h.service.DistinctCategories(r.Context())
	if err != nil {
		writeServiceError(w, err)
		return
	}
	if cats == nil {
		cats = []string{}
	}
	writeJSON(w, http.StatusOK, cats)
}

// writeServiceError maps a service-layer error to the canonical JSON
// error envelope. It recognises:
//
//	*ValidationError → 400 VALIDATION_ERROR with field details
//	ErrNotFound      → 404 NOT_FOUND
//
// Anything else falls through to 500 INTERNAL_ERROR. The 403 admin role
// check is enforced upstream by auth.AdminGuard.
func writeServiceError(w http.ResponseWriter, err error) {
	var v *ValidationError
	if errors.As(err, &v) {
		common.WriteJSONError(
			w,
			http.StatusBadRequest,
			common.CodeValidationError,
			"request failed validation",
			v.Fields...,
		)
		return
	}
	if errors.Is(err, ErrNotFound) {
		common.WriteJSONError(w, http.StatusNotFound, common.CodeNotFound, "inventory item not found")
		return
	}
	common.WriteJSONError(w, http.StatusInternalServerError, common.CodeInternalError, err.Error())
}

// writeJSON encodes payload as JSON with the given status, setting the
// Content-Type header. Encoding errors are intentionally ignored as the
// status has already been committed.
func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

// notImplemented writes the canonical NOT_IMPLEMENTED error response. It
// is invoked when the handler is constructed without a Service, which
// happens during scaffolding before the wiring task lands.
func notImplemented(w http.ResponseWriter, endpoint string) {
	common.WriteJSONError(
		w,
		http.StatusNotImplemented,
		common.CodeNotImplemented,
		endpoint+" is not yet implemented",
	)
}
