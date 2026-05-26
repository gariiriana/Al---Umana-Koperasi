package order

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"al-umana/order-fulfillment/internal/auth"
	"al-umana/order-fulfillment/internal/common"
)

// Handler is the HTTP boundary for the order domain. It delegates business
// logic to Service and Repository and is responsible only for request
// decoding, response encoding, and error mapping.
type Handler struct {
	service *Service
	repo    *Repository
}

// NewHandler constructs a Handler. Either dependency may be nil during the
// scaffolding phase; the corresponding endpoints will return 501 in that
// case.
func NewHandler(service *Service, repo *Repository) *Handler {
	return &Handler{service: service, repo: repo}
}

// CreateOrder handles POST /api/orders.
//
// Body: CreateOrderRequest. The customer ID is taken from the authenticated
// principal placed on the request context by the auth guard. On success the
// fully-populated Order is returned with HTTP 201.
func (h *Handler) CreateOrder(w http.ResponseWriter, r *http.Request) {
	if h.service == nil {
		notImplemented(w, "CreateOrder")
		return
	}

	var req CreateOrderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		common.WriteJSONError(w, http.StatusBadRequest, common.CodeValidationError, "invalid JSON body")
		return
	}

	customerID := uidFromContext(r)

	res, err := h.service.CreateOrder(r.Context(), req, customerID)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, res.Order)
}

// ListOrders handles GET /api/orders.
//
// Optional query params:
//
//	status      — filter by exact status (case-insensitive)
//	courierId   — filter by assigned courier
//	startDate   — RFC 3339 lower bound on createdAt
//	endDate     — RFC 3339 upper bound on createdAt
//	limit       — positive integer cap on result size
func (h *Handler) ListOrders(w http.ResponseWriter, r *http.Request) {
	if h.repo == nil {
		notImplemented(w, "ListOrders")
		return
	}

	filter := ListFilter{}
	q := r.URL.Query()
	if s := strings.TrimSpace(q.Get("status")); s != "" {
		st := OrderStatus(strings.ToUpper(s))
		filter.Status = &st
	}
	filter.CourierID = strings.TrimSpace(q.Get("courierId"))
	if v := q.Get("startDate"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			filter.StartDate = &t
		}
	}
	if v := q.Get("endDate"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			filter.EndDate = &t
		}
	}
	if v := q.Get("limit"); v != "" {
		// best-effort: ignore malformed limit
		var n int
		for _, c := range v {
			if c < '0' || c > '9' {
				n = 0
				break
			}
			n = n*10 + int(c-'0')
		}
		if n > 0 {
			filter.Limit = n
		}
	}

	orders, err := h.repo.List(r.Context(), filter)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"orders": orders})
}

// GetOrder handles GET /api/orders/{id}.
func (h *Handler) GetOrder(w http.ResponseWriter, r *http.Request) {
	if h.repo == nil {
		notImplemented(w, "GetOrder")
		return
	}
	id := r.PathValue("id")
	if id == "" {
		common.WriteJSONError(w, http.StatusBadRequest, common.CodeValidationError, "id path param is required")
		return
	}
	o, err := h.repo.Get(r.Context(), id)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, o)
}

// TransitionStatus handles PATCH /api/orders/{id}/status. The body carries
// the action to perform. Supported actions:
//
//	start-production    CONFIRMED        -> IN_PRODUCTION
//	complete-production IN_PRODUCTION    -> READY
//	qc-pass             READY            -> READY_TO_DELIVER
//	qc-fail             READY            -> CONFIRMED      (reason required)
//	reschedule          OUT_FOR_DELIVERY -> READY_TO_DELIVER
func (h *Handler) TransitionStatus(w http.ResponseWriter, r *http.Request) {
	if h.service == nil {
		notImplemented(w, "TransitionStatus")
		return
	}
	id := r.PathValue("id")
	if id == "" {
		common.WriteJSONError(w, http.StatusBadRequest, common.CodeValidationError, "id path param is required")
		return
	}

	var body struct {
		Action string `json:"action"`
		Reason string `json:"reason,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		common.WriteJSONError(w, http.StatusBadRequest, common.CodeValidationError, "invalid JSON body")
		return
	}

	uid := uidFromContext(r)
	ctx := r.Context()

	var (
		updated *Order
		err     error
	)
	switch strings.ToLower(strings.TrimSpace(body.Action)) {
	case "start-production":
		updated, err = h.service.StartProduction(ctx, id, uid)
	case "complete-production":
		updated, err = h.service.CompleteProduction(ctx, id)
	case "qc-pass":
		updated, err = h.service.QCPass(ctx, id, uid)
	case "qc-fail":
		updated, err = h.service.QCFail(ctx, id, uid, body.Reason)
	case "reschedule":
		updated, err = h.service.Reschedule(ctx, id)
	default:
		common.WriteJSONError(
			w,
			http.StatusBadRequest,
			common.CodeValidationError,
			"unknown action; expected one of: start-production, complete-production, qc-pass, qc-fail, reschedule",
		)
		return
	}
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

// AssignCourier handles POST /api/orders/{id}/assign-courier.
func (h *Handler) AssignCourier(w http.ResponseWriter, r *http.Request) {
	if h.service == nil {
		notImplemented(w, "AssignCourier")
		return
	}
	id := r.PathValue("id")
	if id == "" {
		common.WriteJSONError(w, http.StatusBadRequest, common.CodeValidationError, "id path param is required")
		return
	}
	var req AssignCourierRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		common.WriteJSONError(w, http.StatusBadRequest, common.CodeValidationError, "invalid JSON body")
		return
	}
	updated, err := h.service.AssignCourier(r.Context(), id, req.CourierID)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

// DispatchOrder handles POST /api/orders/{id}/dispatch.
func (h *Handler) DispatchOrder(w http.ResponseWriter, r *http.Request) {
	if h.service == nil {
		notImplemented(w, "DispatchOrder")
		return
	}
	id := r.PathValue("id")
	if id == "" {
		common.WriteJSONError(w, http.StatusBadRequest, common.CodeValidationError, "id path param is required")
		return
	}
	updated, err := h.service.Dispatch(r.Context(), id)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

// ConfirmDelivery handles POST /api/orders/{id}/deliver. The body may carry
// a list of proof file IDs already uploaded via the chunking protocol.
func (h *Handler) ConfirmDelivery(w http.ResponseWriter, r *http.Request) {
	if h.service == nil {
		notImplemented(w, "ConfirmDelivery")
		return
	}
	id := r.PathValue("id")
	if id == "" {
		common.WriteJSONError(w, http.StatusBadRequest, common.CodeValidationError, "id path param is required")
		return
	}
	var body struct {
		ProofFileIDs []string `json:"proofFileIds,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil && err.Error() != "EOF" {
		common.WriteJSONError(w, http.StatusBadRequest, common.CodeValidationError, "invalid JSON body")
		return
	}
	updated, err := h.service.ConfirmDelivery(r.Context(), id, body.ProofFileIDs)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

// ListOrderFiles handles GET /api/orders/{id}/files. Implementation is
// provided by the file handler; this stub remains until task 17.x wires
// the cross-package call.
func (h *Handler) ListOrderFiles(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "ListOrderFiles")
}

// ListMine handles GET /api/orders/mine. The customer ID is taken from the
// authenticated principal; the endpoint never returns orders belonging to
// another customer.
//
// Optional query params:
//
//	cursor — RFC 3339 createdAt of the last order on the previous page
//	limit  — positive integer, capped at 50 by the service layer
//
// Response shape: { "orders": [...], "nextCursor": "..." | null } where
// nextCursor is the createdAt of the last returned order when more pages
// may exist, or null when the caller has reached the end of the customer's
// order history (Requirement 9.2).
func (h *Handler) ListMine(w http.ResponseWriter, r *http.Request) {
	if h.service == nil {
		notImplemented(w, "ListMine")
		return
	}

	customerUID := uidFromContext(r)
	if customerUID == "" {
		common.WriteJSONError(w, http.StatusUnauthorized, common.CodeUnauthorized, "authentication required")
		return
	}

	q := r.URL.Query()
	var cursor *time.Time
	if v := strings.TrimSpace(q.Get("cursor")); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			common.WriteJSONError(
				w,
				http.StatusBadRequest,
				common.CodeValidationError,
				"cursor must be an RFC 3339 timestamp",
				common.FieldError{Field: "cursor", Reason: "must be an RFC 3339 timestamp"},
			)
			return
		}
		cursor = &t
	}
	limit := 0
	if v := strings.TrimSpace(q.Get("limit")); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n <= 0 {
			common.WriteJSONError(
				w,
				http.StatusBadRequest,
				common.CodeValidationError,
				"limit must be a positive integer",
				common.FieldError{Field: "limit", Reason: "must be a positive integer"},
			)
			return
		}
		limit = n
	}

	orders, nextCursor, err := h.service.ListByCustomer(r.Context(), customerUID, cursor, limit)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	if orders == nil {
		orders = []Order{}
	}

	var nextCursorOut interface{}
	if nextCursor != nil {
		nextCursorOut = nextCursor.UTC().Format(time.RFC3339Nano)
	} else {
		nextCursorOut = nil
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"orders":     orders,
		"nextCursor": nextCursorOut,
	})
}

// UploadPaymentProof handles POST /api/orders/{id}/payment-proof. The body
// carries the chunked-file fileId; the customer UID is taken from the
// authenticated principal. The service finalizes the upload by attaching
// the proof to the order and transitioning it to AWAITING_PAYMENT_APPROVAL
// (Requirement 7.9).
//
// Errors:
//
//	customer not the order's owner   -> 403 FORBIDDEN
//	wrong source status              -> 409 INVALID_STATE_TRANSITION
//	missing/invalid fileId           -> 400 VALIDATION_ERROR
func (h *Handler) UploadPaymentProof(w http.ResponseWriter, r *http.Request) {
	if h.service == nil {
		notImplemented(w, "UploadPaymentProof")
		return
	}
	id := r.PathValue("id")
	if id == "" {
		common.WriteJSONError(w, http.StatusBadRequest, common.CodeValidationError, "id path param is required")
		return
	}

	var req UploadPaymentProofRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		common.WriteJSONError(w, http.StatusBadRequest, common.CodeValidationError, "invalid JSON body")
		return
	}

	customerUID := uidFromContext(r)
	if customerUID == "" {
		common.WriteJSONError(w, http.StatusUnauthorized, common.CodeUnauthorized, "authentication required")
		return
	}

	updated, err := h.service.UploadProof(r.Context(), id, customerUID, req.FileID)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

// ApprovePayment handles POST /api/orders/{id}/payment/approve. The endpoint
// is admin-only; the AdminGuard middleware enforces the role check. The
// service transitions the order from AWAITING_PAYMENT_APPROVAL to CONFIRMED
// and records the approving admin's UID and timestamp (Requirement 8.5).
func (h *Handler) ApprovePayment(w http.ResponseWriter, r *http.Request) {
	if h.service == nil {
		notImplemented(w, "ApprovePayment")
		return
	}
	id := r.PathValue("id")
	if id == "" {
		common.WriteJSONError(w, http.StatusBadRequest, common.CodeValidationError, "id path param is required")
		return
	}

	adminUID := uidFromContext(r)
	if adminUID == "" {
		common.WriteJSONError(w, http.StatusUnauthorized, common.CodeUnauthorized, "authentication required")
		return
	}

	updated, err := h.service.ApprovePayment(r.Context(), id, adminUID)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

// RejectPayment handles POST /api/orders/{id}/payment/reject. The endpoint
// is admin-only; the AdminGuard middleware enforces the role check. Body:
// RejectPaymentRequest. The reason is validated by the service layer
// (1–500 characters after trim, Requirement 8.7) and a wrong source status
// returns INVALID_STATE_TRANSITION (Requirement 8.9).
func (h *Handler) RejectPayment(w http.ResponseWriter, r *http.Request) {
	if h.service == nil {
		notImplemented(w, "RejectPayment")
		return
	}
	id := r.PathValue("id")
	if id == "" {
		common.WriteJSONError(w, http.StatusBadRequest, common.CodeValidationError, "id path param is required")
		return
	}

	var req RejectPaymentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		common.WriteJSONError(w, http.StatusBadRequest, common.CodeValidationError, "invalid JSON body")
		return
	}

	adminUID := uidFromContext(r)
	if adminUID == "" {
		common.WriteJSONError(w, http.StatusUnauthorized, common.CodeUnauthorized, "authentication required")
		return
	}

	updated, err := h.service.RejectPayment(r.Context(), id, adminUID, req.Reason)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

// uidFromContext extracts the authenticated user's UID, or returns an empty
// string when no token is attached (development stub guard mode).
func uidFromContext(r *http.Request) string {
	if claims, ok := auth.ClaimsFrom(r.Context()); ok && claims != nil {
		return claims.UID
	}
	return ""
}

// writeServiceError maps a service-layer error to the canonical JSON error
// envelope. It recognises:
//
//	*ValidationError       -> 400 VALIDATION_ERROR with field details
//	  (or 400 INVALID_PAYMENT_METHOD when the only failing field is
//	  "paymentMethod"; the design's "Backend Error Categories" table
//	  surfaces this as a top-level code)
//	ErrInvalidTransition   -> 409 INVALID_STATE_TRANSITION
//	ErrForbidden           -> 403 FORBIDDEN
//	ErrNotFound (repo)     -> 404 NOT_FOUND
//
// Anything else falls through to 500 INTERNAL_ERROR.
func writeServiceError(w http.ResponseWriter, err error) {
	var v *ValidationError
	if errors.As(err, &v) {
		if isPaymentMethodOnlyError(v) {
			common.WriteJSONError(
				w,
				http.StatusBadRequest,
				common.CodeInvalidPaymentMethod,
				"paymentMethod must be one of: cod, bank_transfer, e_wallet",
				v.Fields...,
			)
			return
		}
		common.WriteJSONError(w, http.StatusBadRequest, common.CodeValidationError, "request failed validation", v.Fields...)
		return
	}
	if errors.Is(err, ErrInvalidTransition) {
		common.WriteJSONError(w, http.StatusConflict, common.CodeInvalidStateTransition, err.Error())
		return
	}
	if errors.Is(err, ErrForbidden) {
		common.WriteJSONError(w, http.StatusForbidden, common.CodeForbidden, err.Error())
		return
	}
	if errors.Is(err, ErrNotFound) {
		common.WriteJSONError(w, http.StatusNotFound, common.CodeNotFound, "order not found")
		return
	}
	common.WriteJSONError(w, http.StatusInternalServerError, common.CodeInternalError, err.Error())
}

// isPaymentMethodOnlyError reports whether v carries exactly one field
// error and that field is "paymentMethod". When true the handler surfaces
// the top-level code as INVALID_PAYMENT_METHOD so the frontend can react
// to the specific problem without parsing the details slice; when false
// the handler keeps the generic VALIDATION_ERROR code with full field
// details.
func isPaymentMethodOnlyError(v *ValidationError) bool {
	if v == nil || len(v.Fields) != 1 {
		return false
	}
	return v.Fields[0].Field == "paymentMethod"
}

// writeJSON encodes payload as JSON with the given status, setting the
// Content-Type header. Encoding errors are intentionally ignored as the
// status has already been committed.
func writeJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

// notImplemented writes the canonical NOT_IMPLEMENTED error response.
func notImplemented(w http.ResponseWriter, endpoint string) {
	common.WriteJSONError(
		w,
		http.StatusNotImplemented,
		common.CodeNotImplemented,
		endpoint+" is not yet implemented",
	)
}
