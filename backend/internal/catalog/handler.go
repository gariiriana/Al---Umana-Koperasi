// Package catalog HTTP boundary.
//
// Handler exposes the public, read-only catalog endpoints consumed by the
// customer storefront:
//
//	GET /api/catalog/items            — list available items, optional ?category=
//	GET /api/catalog/items/{id}       — fetch a single item by id
//	GET /api/catalog/categories       — distinct, sorted, non-empty categories
//
// All three endpoints are public per the design's "API Endpoints" table
// (auth = optional) and per Requirement 16.2; the router mounts them
// outside the auth guard. Errors flow through common.WriteJSONError so
// the JSON envelope matches the rest of the API.
package catalog

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"al-umana/order-fulfillment/internal/common"
	"al-umana/order-fulfillment/internal/stock"
)

// Handler is the HTTP boundary for the catalog domain. It delegates all
// business logic to Service and is responsible only for request parsing,
// response encoding, and error mapping.
type Handler struct {
	service *Service
}

// NewHandler constructs a catalog Handler over the given Service. The
// service may be nil during scaffolding; the corresponding endpoints will
// return 501 NOT_IMPLEMENTED in that case, mirroring the convention used
// by the order and dashboard handlers.
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// ListItems handles GET /api/catalog/items.
//
// Reads an optional `category` query parameter and delegates to
// Service.ListAvailable. The response is always a JSON array (possibly
// empty) so the storefront never has to special-case a `null` body
// (Requirements 1.1, 1.2, 1.3, 13.6).
func (h *Handler) ListItems(w http.ResponseWriter, r *http.Request) {
	if h.service == nil {
		notImplemented(w, "ListCatalogItems")
		return
	}
	category := strings.TrimSpace(r.URL.Query().Get("category"))
	items, err := h.service.ListAvailable(r.Context(), category)
	if err != nil {
		common.WriteJSONError(w, http.StatusInternalServerError, common.CodeInternalError, err.Error())
		return
	}
	if items == nil {
		items = []stock.InventoryItem{}
	}
	writeJSON(w, http.StatusOK, items)
}

// GetItem handles GET /api/catalog/items/{id}.
//
// Returns the item document regardless of availability so the storefront
// product-detail page can render a "Stok Habis" badge for unavailable
// items (Requirement 2.1). When no such item exists, responds with 404
// NOT_FOUND.
func (h *Handler) GetItem(w http.ResponseWriter, r *http.Request) {
	if h.service == nil {
		notImplemented(w, "GetCatalogItem")
		return
	}
	id := r.PathValue("id")
	if id == "" {
		common.WriteJSONError(w, http.StatusBadRequest, common.CodeValidationError, "id path param is required")
		return
	}
	item, err := h.service.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, stock.ErrNotFound) {
			common.WriteJSONError(w, http.StatusNotFound, common.CodeNotFound, "inventory item not found")
			return
		}
		common.WriteJSONError(w, http.StatusInternalServerError, common.CodeInternalError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, item)
}

// ListCategories handles GET /api/catalog/categories.
//
// Returns a JSON array of distinct, lexicographically sorted, trimmed,
// non-empty category strings (Requirement 13.6). The body is always an
// array — empty if no inventory documents define a category.
func (h *Handler) ListCategories(w http.ResponseWriter, r *http.Request) {
	if h.service == nil {
		notImplemented(w, "ListCatalogCategories")
		return
	}
	categories, err := h.service.ListCategories(r.Context())
	if err != nil {
		common.WriteJSONError(w, http.StatusInternalServerError, common.CodeInternalError, err.Error())
		return
	}
	if categories == nil {
		categories = []string{}
	}
	writeJSON(w, http.StatusOK, categories)
}

// writeJSON encodes payload as JSON with the given status, setting the
// Content-Type header. Encoding errors are intentionally ignored as the
// status has already been committed; this mirrors the helper used by the
// order and dashboard handlers.
func writeJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

// notImplemented writes the canonical NOT_IMPLEMENTED error response used
// when a handler is invoked before its dependencies have been wired.
func notImplemented(w http.ResponseWriter, endpoint string) {
	common.WriteJSONError(
		w,
		http.StatusNotImplemented,
		common.CodeNotImplemented,
		endpoint+" is not yet implemented",
	)
}
