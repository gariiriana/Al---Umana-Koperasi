package order

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"al-umana/order-fulfillment/internal/common"
)

// StockChecker is the consumer-side interface the order service depends on
// for inventory lookups. The stock package implements it. Defining the
// interface here (rather than importing the concrete type) keeps the
// dependency arrow pointing inward and lets tests swap in fakes.
type StockChecker interface {
	CheckAvailability(ctx context.Context, items []OrderLineItem) (outOfStock []string, err error)
}

// ProofFileDeleter is the consumer-side interface the order service uses to
// remove a previously uploaded payment proof (parent metadata + chunks)
// when a customer re-uploads from PAYMENT_REJECTED. Defining it here keeps
// the dependency arrow pointing inward; the file package supplies a
// concrete adapter.
//
// fileID is the bare document ID of the payment_proofs metadata document
// (i.e. the value persisted on Order.PaymentProofFileID after stripping
// the "payment_proofs/" prefix).
type ProofFileDeleter interface {
	DeletePaymentProof(ctx context.Context, fileID string) error
}

// stockCheckTimeout is the wall-time budget for the stock availability
// query during order placement (Requirement 1.7).
const stockCheckTimeout = 10 * time.Second

// paymentProofPrefix is the canonical prefix persisted on
// Order.PaymentProofFileID; the suffix is the metadata document ID under
// the `payment_proofs` collection.
const paymentProofPrefix = "payment_proofs/"

// Domain errors returned by the service. The handler maps them onto the
// canonical JSON error envelope.
var (
	ErrValidationFailed = errors.New("validation failed")
	ErrNotFoundService  = errors.New("order not found")
	// ErrForbidden is returned by lifecycle methods when the requesting
	// principal is not permitted to act on the target order — for example,
	// when a customer attempts to upload a payment proof for an order
	// owned by a different customer.
	ErrForbidden = errors.New("forbidden")
)

// ValidationError carries a slice of field-level errors so the handler can
// translate them into the response envelope without re-running validation.
type ValidationError struct {
	Fields []common.FieldError
}

func (e *ValidationError) Error() string {
	return fmt.Sprintf("validation failed (%d fields)", len(e.Fields))
}

// CreateOrderResult is the value returned by Service.CreateOrder. The Order
// reflects the post-stock-check terminal status of the placement flow:
// CONFIRMED on success for COD orders, AWAITING_PAYMENT_PROOF on success
// for non-COD orders, or FAILED on out-of-stock or stock service timeout.
type CreateOrderResult struct {
	Order *Order
}

// orderRepository defines the persistence operations needed by the order service.
type orderRepository interface {
	Create(ctx context.Context, o Order) (string, error)
	Get(ctx context.Context, id string) (*Order, error)
	Update(ctx context.Context, id string, updates map[string]interface{}) error
	UpdateStatus(ctx context.Context, id string, newStatus OrderStatus) error
	ListByCustomer(ctx context.Context, customerUID string, cursor *time.Time, limit int) ([]Order, error)
}

// Service encapsulates the order business logic, orchestrating validation,
// persistence, the stock availability check, and state-machine
// transitions.
type Service struct {
	repo         orderRepository
	stock        StockChecker
	proofDeleter ProofFileDeleter
}

// ServiceOption configures optional dependencies on a Service constructed
// via NewService. Options are applied in order; later options override
// earlier ones for the same field.
type ServiceOption func(*Service)

// WithProofDeleter wires a ProofFileDeleter into the Service. When set,
// UploadProof will delete a previously uploaded payment proof before
// transitioning a re-uploading order out of PAYMENT_REJECTED. When unset,
// UploadProof logs a warning and proceeds with the transition.
func WithProofDeleter(d ProofFileDeleter) ServiceOption {
	return func(s *Service) { s.proofDeleter = d }
}

// NewService returns a Service wired to its dependencies. Either of the
// positional dependencies may be nil in tests that only exercise
// validation. Optional dependencies (e.g. ProofFileDeleter) are supplied
// via ServiceOption values.
func NewService(repo orderRepository, stock StockChecker, opts ...ServiceOption) *Service {
	s := &Service{repo: repo, stock: stock}
	for _, opt := range opts {
		if opt != nil {
			opt(s)
		}
	}
	return s
}

// CreateOrder validates the request, persists the order with status
// PLACING, performs a stock availability check (with a 10-second timeout),
// then transitions the order to CONFIRMED on success or FAILED on
// out-of-stock / timeout. The returned Order always reflects the final
// status visible to the API caller.
//
// customerID is taken from the authenticated principal by the handler and
// stored on the order; it is not part of the JSON request body.
func (s *Service) CreateOrder(ctx context.Context, req CreateOrderRequest, customerID string) (*CreateOrderResult, error) {
	if errs := ValidateCreateOrder(req); len(errs) > 0 {
		return nil, &ValidationError{Fields: errs}
	}

	now := time.Now()
	pending := Order{
		CustomerID:      customerID,
		CustomerName:    req.CustomerName,
		Items:           req.Items,
		DeliveryAddress: req.DeliveryAddress,
		DeliveryTime:    req.DeliveryTime,
		PaymentMethod:   req.PaymentMethod,
		Status:          StatusPlacing,
		IsPreOrder:      req.IsPreOrder,
		CreatedAt:       now,
		UpdatedAt:       now,
	}

	id, err := s.repo.Create(ctx, pending)
	if err != nil {
		return nil, fmt.Errorf("order service: create: %w", err)
	}

	// Stock availability check, bounded by stockCheckTimeout.
	stockCtx, cancel := context.WithTimeout(ctx, stockCheckTimeout)
	defer cancel()

	final := pending
	final.ID = id

	if req.IsPreOrder {
		// Skip stock check for pre-orders
		if err := s.transitionAfterStock(ctx, id, &final, nil); err != nil {
			return nil, err
		}
		return &CreateOrderResult{Order: &final}, nil
	}

	if s.stock == nil {
		// No stock checker wired (e.g. tests / dev without inventory). Treat
		// it as "all available" so the happy path still produces CONFIRMED.
		if err := s.transitionAfterStock(ctx, id, &final, nil); err != nil {
			return nil, err
		}
		return &CreateOrderResult{Order: &final}, nil
	}

	outOfStock, stockErr := s.stock.CheckAvailability(stockCtx, req.Items)
	if errors.Is(stockErr, context.DeadlineExceeded) || errors.Is(stockCtx.Err(), context.DeadlineExceeded) {
		final.Status = StatusFailed
		final.RejectionReason = "stock service timeout"
		if uerr := s.repo.Update(ctx, id, map[string]interface{}{
			"status":          StatusFailed,
			"rejectionReason": final.RejectionReason,
		}); uerr != nil {
			return nil, fmt.Errorf("order service: mark failed (timeout): %w", uerr)
		}
		return &CreateOrderResult{Order: &final}, nil
	}
	if stockErr != nil {
		// Best-effort rollback to FAILED so the order is not stuck in PLACING.
		final.Status = StatusFailed
		final.RejectionReason = "stock service error"
		_ = s.repo.Update(ctx, id, map[string]interface{}{
			"status":          StatusFailed,
			"rejectionReason": final.RejectionReason,
		})
		return nil, fmt.Errorf("order service: stock check: %w", stockErr)
	}

	if err := s.transitionAfterStock(ctx, id, &final, outOfStock); err != nil {
		return nil, err
	}
	return &CreateOrderResult{Order: &final}, nil
}

// transitionAfterStock applies the post-stock-check transition. When stock
// is available, COD orders go to CONFIRMED while non-COD orders go to
// AWAITING_PAYMENT_PROOF with paymentStatus = "awaiting_proof"
// (Requirements 6.1, 7.1). When any item is out of stock, the order
// transitions to FAILED. The updated fields are reflected on the
// supplied final order so the caller's view stays in sync with
// persistence.
func (s *Service) transitionAfterStock(ctx context.Context, id string, final *Order, outOfStock []string) error {
	if len(outOfStock) == 0 {
		if final.PaymentMethod == PaymentCOD {
			final.Status = StatusConfirmed
			return s.repo.Update(ctx, id, map[string]interface{}{
				"status": StatusConfirmed,
			})
		}
		// Non-COD: bank transfer or e-wallet. Validation guarantees one of
		// the three known methods, so any non-COD value enters the
		// payment-proof sub-lifecycle.
		final.Status = StatusAwaitingPaymentProof
		final.PaymentStatus = PaymentStatusAwaitingProof
		return s.repo.Update(ctx, id, map[string]interface{}{
			"status":        StatusAwaitingPaymentProof,
			"paymentStatus": PaymentStatusAwaitingProof,
		})
	}
	final.Status = StatusFailed
	final.OutOfStockItems = outOfStock
	final.RejectionReason = "items unavailable: " + joinIDs(outOfStock)
	return s.repo.Update(ctx, id, map[string]interface{}{
		"status":          StatusFailed,
		"outOfStockItems": outOfStock,
		"rejectionReason": final.RejectionReason,
	})
}

// StartProduction transitions an order from CONFIRMED to IN_PRODUCTION,
// recording the actor's UID and the start timestamp. The transition is
// rejected if the order is not currently CONFIRMED.
func (s *Service) StartProduction(ctx context.Context, orderID, actorUID string) (*Order, error) {
	o, err := s.repo.Get(ctx, orderID)
	if err != nil {
		return nil, err
	}
	if err := ValidateTransition(o.Status, StatusInProduction); err != nil {
		return nil, err
	}
	now := time.Now()
	if err := s.repo.Update(ctx, orderID, map[string]interface{}{
		"status":              StatusInProduction,
		"productionStartedBy": actorUID,
		"productionStartedAt": now,
	}); err != nil {
		return nil, err
	}
	o.Status = StatusInProduction
	o.ProductionStartedBy = actorUID
	o.ProductionStartedAt = &now
	return o, nil
}

// CompleteProduction transitions an order from IN_PRODUCTION to READY_TO_DELIVER.
// The transition is rejected if the order is not currently IN_PRODUCTION.
func (s *Service) CompleteProduction(ctx context.Context, orderID string) (*Order, error) {
	o, err := s.repo.Get(ctx, orderID)
	if err != nil {
		return nil, err
	}
	if err := ValidateTransition(o.Status, StatusReadyToDeliver); err != nil {
		return nil, err
	}
	if err := s.repo.UpdateStatus(ctx, orderID, StatusReadyToDeliver); err != nil {
		return nil, err
	}
	o.Status = StatusReadyToDeliver
	return o, nil
}

// QCPass transitions a READY order to READY_TO_DELIVER, recording the
// reviewer's UID and review timestamp.
func (s *Service) QCPass(ctx context.Context, orderID, reviewerUID string) (*Order, error) {
	o, err := s.repo.Get(ctx, orderID)
	if err != nil {
		return nil, err
	}
	if o.Status != StatusReady {
		return nil, fmt.Errorf("%w: QC review requires status READY (got %s)", ErrInvalidTransition, o.Status)
	}
	if err := ValidateTransition(o.Status, StatusReadyToDeliver); err != nil {
		return nil, err
	}
	now := time.Now()
	if err := s.repo.Update(ctx, orderID, map[string]interface{}{
		"status":       StatusReadyToDeliver,
		"qcReviewedBy": reviewerUID,
		"qcReviewedAt": now,
	}); err != nil {
		return nil, err
	}
	o.Status = StatusReadyToDeliver
	o.QCReviewedBy = reviewerUID
	o.QCReviewedAt = &now
	return o, nil
}

// QCFail validates the fail reason and re-queues a READY order to
// CONFIRMED for re-processing. The reason must be non-empty and ≤ 500
// characters per Requirement 3.5.
func (s *Service) QCFail(ctx context.Context, orderID, reviewerUID, reason string) (*Order, error) {
	if errs := ValidateQCFailReason(reason); len(errs) > 0 {
		return nil, &ValidationError{Fields: errs}
	}
	o, err := s.repo.Get(ctx, orderID)
	if err != nil {
		return nil, err
	}
	if o.Status != StatusReady {
		return nil, fmt.Errorf("%w: QC review requires status READY (got %s)", ErrInvalidTransition, o.Status)
	}
	if err := ValidateTransition(o.Status, StatusConfirmed); err != nil {
		return nil, err
	}
	now := time.Now()
	if err := s.repo.Update(ctx, orderID, map[string]interface{}{
		"status":       StatusConfirmed,
		"qcReviewedBy": reviewerUID,
		"qcReviewedAt": now,
		"qcFailReason": reason,
	}); err != nil {
		return nil, err
	}
	o.Status = StatusConfirmed
	o.QCReviewedBy = reviewerUID
	o.QCReviewedAt = &now
	o.QCFailReason = reason
	return o, nil
}

// AssignCourier records a courier assignment against an order in
// READY_TO_DELIVER status. Re-assigning an already-assigned order in
// OUT_FOR_DELIVERY is rejected.
func (s *Service) AssignCourier(ctx context.Context, orderID, courierID string) (*Order, error) {
	if courierID == "" {
		return nil, &ValidationError{Fields: []common.FieldError{{Field: "courierId", Reason: "courierId is required"}}}
	}
	o, err := s.repo.Get(ctx, orderID)
	if err != nil {
		return nil, err
	}
	if o.Status != StatusReadyToDeliver {
		return nil, fmt.Errorf("%w: assign-courier requires status READY_TO_DELIVER (got %s)", ErrInvalidTransition, o.Status)
	}
	if err := s.repo.Update(ctx, orderID, map[string]interface{}{
		"assignedCourierId": courierID,
	}); err != nil {
		return nil, err
	}
	o.AssignedCourierID = courierID
	return o, nil
}

// Dispatch transitions a READY_TO_DELIVER order to OUT_FOR_DELIVERY. The
// order must already have an assigned courier.
func (s *Service) Dispatch(ctx context.Context, orderID string) (*Order, error) {
	o, err := s.repo.Get(ctx, orderID)
	if err != nil {
		return nil, err
	}
	if o.AssignedCourierID == "" {
		return nil, &ValidationError{Fields: []common.FieldError{
			{Field: "assignedCourierId", Reason: "courier must be assigned before dispatch"},
		}}
	}
	if err := ValidateTransition(o.Status, StatusOutForDelivery); err != nil {
		return nil, err
	}
	if err := s.repo.UpdateStatus(ctx, orderID, StatusOutForDelivery); err != nil {
		return nil, err
	}
	o.Status = StatusOutForDelivery
	return o, nil
}

// ConfirmDelivery transitions an OUT_FOR_DELIVERY order to DELIVERED,
// recording the delivery timestamp and the IDs of any proof files
// (photo, signature) uploaded as part of the handover.
func (s *Service) ConfirmDelivery(ctx context.Context, orderID string, proofFileIDs []string) (*Order, error) {
	o, err := s.repo.Get(ctx, orderID)
	if err != nil {
		return nil, err
	}
	if err := ValidateTransition(o.Status, StatusDelivered); err != nil {
		return nil, err
	}
	now := time.Now()
	updates := map[string]interface{}{
		"status":      StatusDelivered,
		"deliveredAt": now,
	}
	if len(proofFileIDs) > 0 {
		updates["proofFileIds"] = proofFileIDs
	}
	if err := s.repo.Update(ctx, orderID, updates); err != nil {
		return nil, err
	}
	o.Status = StatusDelivered
	o.DeliveredAt = &now
	if len(proofFileIDs) > 0 {
		o.ProofFileIDs = proofFileIDs
	}
	return o, nil
}

// Reschedule transitions an OUT_FOR_DELIVERY order back to
// READY_TO_DELIVER. Used by the dispatcher when a delivery cannot be
// completed and must be re-queued.
func (s *Service) Reschedule(ctx context.Context, orderID string) (*Order, error) {
	o, err := s.repo.Get(ctx, orderID)
	if err != nil {
		return nil, err
	}
	if err := ValidateTransition(o.Status, StatusReadyToDeliver); err != nil {
		return nil, err
	}
	if err := s.repo.UpdateStatus(ctx, orderID, StatusReadyToDeliver); err != nil {
		return nil, err
	}
	o.Status = StatusReadyToDeliver
	return o, nil
}

// joinIDs is a tiny strings.Join replacement for short ID slices that keeps
// the import set narrow.
func joinIDs(ids []string) string {
	if len(ids) == 0 {
		return ""
	}
	out := ids[0]
	for _, id := range ids[1:] {
		out += ", " + id
	}
	return out
}

// UploadProof finalizes a customer's payment-proof upload: it transitions
// the order from AWAITING_PAYMENT_PROOF (initial upload) or
// PAYMENT_REJECTED (re-upload) to AWAITING_PAYMENT_APPROVAL, sets
// paymentStatus = "awaiting_approval", and persists the new
// paymentProofFileId in the canonical "payment_proofs/{fileID}" form
// (Requirement 7.9).
//
// Authorization: the order must belong to customerUID; otherwise
// ErrForbidden is returned (Requirement 7.7).
//
// Re-upload from PAYMENT_REJECTED: when the order already carries a
// previous PaymentProofFileID, the prior file (parent + chunks) is
// deleted via the configured ProofFileDeleter before the new ID is
// persisted (Requirement 7.12). When no ProofFileDeleter has been wired,
// a warning is logged and the deletion is skipped — the transition still
// proceeds so the customer is not blocked by infrastructure
// configuration.
func (s *Service) UploadProof(ctx context.Context, orderID, customerUID, fileID string) (*Order, error) {
	if orderID == "" {
		return nil, &ValidationError{Fields: []common.FieldError{{Field: "orderId", Reason: "orderId is required"}}}
	}
	if customerUID == "" {
		return nil, &ValidationError{Fields: []common.FieldError{{Field: "customerUid", Reason: "customerUid is required"}}}
	}
	if strings.TrimSpace(fileID) == "" {
		return nil, &ValidationError{Fields: []common.FieldError{{Field: "fileId", Reason: "fileId is required"}}}
	}

	o, err := s.repo.Get(ctx, orderID)
	if err != nil {
		return nil, err
	}
	if o.CustomerID != customerUID {
		return nil, fmt.Errorf("%w: order %s belongs to a different customer", ErrForbidden, orderID)
	}

	switch o.Status {
	case StatusAwaitingPaymentProof, StatusPaymentRejected:
		// allowed
	default:
		return nil, fmt.Errorf(
			"%w: payment-proof upload requires status AWAITING_PAYMENT_PROOF or PAYMENT_REJECTED (got %s)",
			ErrInvalidTransition, o.Status,
		)
	}

	// Capture the previous proof so we can clean it up on a successful
	// re-upload from PAYMENT_REJECTED (Requirement 7.12). Only the bare
	// document ID (the suffix after "payment_proofs/") is forwarded to
	// the deleter; the prefix is the canonical persisted form.
	previousProofID := ""
	if o.Status == StatusPaymentRejected && o.PaymentProofFileID != "" {
		previousProofID = strings.TrimPrefix(o.PaymentProofFileID, paymentProofPrefix)
	}

	now := time.Now()
	newProofRef := paymentProofPrefix + fileID
	if err := s.repo.Update(ctx, orderID, map[string]interface{}{
		"status":             StatusAwaitingPaymentApproval,
		"paymentStatus":      PaymentStatusAwaitingApproval,
		"paymentProofFileId": newProofRef,
	}); err != nil {
		return nil, err
	}

	if previousProofID != "" {
		if s.proofDeleter != nil {
			if delErr := s.proofDeleter.DeletePaymentProof(ctx, previousProofID); delErr != nil {
				// Log and continue: the order has already advanced and the
				// stale proof becomes orphaned. The handler/operator can
				// reconcile out-of-band rather than the customer being
				// blocked.
				log.Printf("order service: failed to delete previous payment proof %s for order %s: %v", previousProofID, orderID, delErr)
			}
		} else {
			log.Printf("order service: no ProofFileDeleter wired; previous payment proof %s for order %s left in place", previousProofID, orderID)
		}
	}

	o.Status = StatusAwaitingPaymentApproval
	o.PaymentStatus = PaymentStatusAwaitingApproval
	o.PaymentProofFileID = newProofRef
	o.UpdatedAt = now
	return o, nil
}

// ApprovePayment transitions an order from AWAITING_PAYMENT_APPROVAL to
// CONFIRMED, recording the approving admin's UID and a server-side
// approval timestamp (Requirement 8.5). Any other source status is
// rejected with ErrInvalidTransition (Requirement 8.9).
func (s *Service) ApprovePayment(ctx context.Context, orderID, adminUID string) (*Order, error) {
	if orderID == "" {
		return nil, &ValidationError{Fields: []common.FieldError{{Field: "orderId", Reason: "orderId is required"}}}
	}
	if adminUID == "" {
		return nil, &ValidationError{Fields: []common.FieldError{{Field: "adminUid", Reason: "adminUid is required"}}}
	}

	o, err := s.repo.Get(ctx, orderID)
	if err != nil {
		return nil, err
	}
	if o.Status != StatusAwaitingPaymentApproval {
		return nil, fmt.Errorf(
			"%w: approve-payment requires status AWAITING_PAYMENT_APPROVAL (got %s)",
			ErrInvalidTransition, o.Status,
		)
	}
	if err := ValidateTransition(o.Status, StatusConfirmed); err != nil {
		return nil, err
	}

	now := time.Now()
	if err := s.repo.Update(ctx, orderID, map[string]interface{}{
		"status":            StatusConfirmed,
		"paymentStatus":     PaymentStatusApproved,
		"paymentApprovedBy": adminUID,
		"paymentApprovedAt": now,
	}); err != nil {
		return nil, err
	}
	o.Status = StatusConfirmed
	o.PaymentStatus = PaymentStatusApproved
	o.PaymentApprovedBy = adminUID
	o.PaymentApprovedAt = &now
	return o, nil
}

// RejectPayment transitions an order from AWAITING_PAYMENT_APPROVAL to
// PAYMENT_REJECTED, recording the rejecting admin's UID, a server-side
// rejection timestamp, and the (trimmed) rejection reason (Requirement
// 8.8). Any other source status is rejected with ErrInvalidTransition
// (Requirement 8.9).
//
// Reason validation runs first: a reason that fails ValidateRejectionReason
// short-circuits the call with a *ValidationError before the order is
// loaded, so an invalid request leaves the order document untouched
// (Requirement 8.7).
func (s *Service) RejectPayment(ctx context.Context, orderID, adminUID, reason string) (*Order, error) {
	if errs := ValidateRejectionReason(reason); len(errs) > 0 {
		return nil, &ValidationError{Fields: errs}
	}
	if orderID == "" {
		return nil, &ValidationError{Fields: []common.FieldError{{Field: "orderId", Reason: "orderId is required"}}}
	}
	if adminUID == "" {
		return nil, &ValidationError{Fields: []common.FieldError{{Field: "adminUid", Reason: "adminUid is required"}}}
	}

	o, err := s.repo.Get(ctx, orderID)
	if err != nil {
		return nil, err
	}
	if o.Status != StatusAwaitingPaymentApproval {
		return nil, fmt.Errorf(
			"%w: reject-payment requires status AWAITING_PAYMENT_APPROVAL (got %s)",
			ErrInvalidTransition, o.Status,
		)
	}
	if err := ValidateTransition(o.Status, StatusPaymentRejected); err != nil {
		return nil, err
	}

	trimmedReason := strings.TrimSpace(reason)
	now := time.Now()
	if err := s.repo.Update(ctx, orderID, map[string]interface{}{
		"status":                 StatusPaymentRejected,
		"paymentStatus":          PaymentStatusRejected,
		"paymentRejectionReason": trimmedReason,
		"paymentRejectedBy":      adminUID,
		"paymentRejectedAt":      now,
	}); err != nil {
		return nil, err
	}
	o.Status = StatusPaymentRejected
	o.PaymentStatus = PaymentStatusRejected
	o.PaymentRejectReason = trimmedReason
	o.PaymentRejectedBy = adminUID
	o.PaymentRejectedAt = &now
	return o, nil
}

// listByCustomerMaxLimitService is the page-size cap enforced at the
// service boundary. It mirrors the repository-level cap so callers cannot
// request more than 50 orders per page (Requirement 9.2).
const listByCustomerMaxLimitService = 50

// ListByCustomer returns the page of orders belonging to customerUID,
// ordered by createdAt descending. The optional cursor is the createdAt
// timestamp of the previous page's last order; when nil, the first page
// is returned. The result includes nextCursor — the createdAt of the
// last returned order — when more pages may exist (i.e. the page was
// fully populated to the requested limit). nextCursor is nil when the
// caller has reached the end of the customer's order history.
//
// limit is clamped to (0, 50]: values ≤ 0 default to 50 and values > 50
// are capped at 50 (Requirement 9.2).
func (s *Service) ListByCustomer(ctx context.Context, customerUID string, cursor *time.Time, limit int) ([]Order, *time.Time, error) {
	if customerUID == "" {
		return nil, nil, &ValidationError{Fields: []common.FieldError{
			{Field: "customerUid", Reason: "customerUid is required"},
		}}
	}
	effective := limit
	if effective <= 0 || effective > listByCustomerMaxLimitService {
		effective = listByCustomerMaxLimitService
	}

	orders, err := s.repo.ListByCustomer(ctx, customerUID, cursor, effective)
	if err != nil {
		return nil, nil, err
	}

	var nextCursor *time.Time
	if len(orders) == effective {
		last := orders[len(orders)-1].CreatedAt
		nextCursor = &last
	}
	return orders, nextCursor, nil
}
