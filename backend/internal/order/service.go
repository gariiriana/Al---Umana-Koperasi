package order

import (
	"context"
	"errors"
	"fmt"
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

// stockCheckTimeout is the wall-time budget for the stock availability
// query during order placement (Requirement 1.7).
const stockCheckTimeout = 10 * time.Second

// Domain errors returned by the service. The handler maps them onto the
// canonical JSON error envelope.
var (
	ErrValidationFailed = errors.New("validation failed")
	ErrNotFoundService  = errors.New("order not found")
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
// CONFIRMED on success, FAILED on out-of-stock or stock service timeout.
type CreateOrderResult struct {
	Order *Order
}

// orderRepository defines the persistence operations needed by the order service.
type orderRepository interface {
	Create(ctx context.Context, o Order) (string, error)
	Get(ctx context.Context, id string) (*Order, error)
	Update(ctx context.Context, id string, updates map[string]interface{}) error
	UpdateStatus(ctx context.Context, id string, newStatus OrderStatus) error
}

// Service encapsulates the order business logic, orchestrating validation,
// persistence, the stock availability check, and state-machine
// transitions.
type Service struct {
	repo  orderRepository
	stock StockChecker
}

// NewService returns a Service wired to its dependencies. Either dependency
// may be nil in tests that only exercise validation.
func NewService(repo orderRepository, stock StockChecker) *Service {
	return &Service{repo: repo, stock: stock}
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
		Status:          StatusPlacing,
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

// transitionAfterStock applies the post-stock-check transition: CONFIRMED
// when outOfStock is empty, FAILED otherwise. The updated fields are
// reflected on the supplied final order so the caller's view stays in
// sync with persistence.
func (s *Service) transitionAfterStock(ctx context.Context, id string, final *Order, outOfStock []string) error {
	if len(outOfStock) == 0 {
		final.Status = StatusConfirmed
		return s.repo.Update(ctx, id, map[string]interface{}{
			"status": StatusConfirmed,
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

// CompleteProduction transitions an order from IN_PRODUCTION to READY,
// signalling the QC team via the order's status change. The transition is
// rejected if the order is not currently IN_PRODUCTION.
func (s *Service) CompleteProduction(ctx context.Context, orderID string) (*Order, error) {
	o, err := s.repo.Get(ctx, orderID)
	if err != nil {
		return nil, err
	}
	if err := ValidateTransition(o.Status, StatusReady); err != nil {
		return nil, err
	}
	if err := s.repo.UpdateStatus(ctx, orderID, StatusReady); err != nil {
		return nil, err
	}
	o.Status = StatusReady
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
