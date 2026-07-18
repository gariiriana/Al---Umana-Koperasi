package order

import (
	"context"
	"errors"
	"fmt"
	"time"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// ordersCollection is the Firestore collection name for orders.
const ordersCollection = "orders"

// ErrNotFound is returned by Repository methods when the requested order
// document does not exist in Firestore.
var ErrNotFound = errors.New("order not found")

// ListFilter constrains a List query. Each pointer/string-zero field is
// optional: a nil Status, empty CourierID, or nil StartDate/EndDate is
// treated as "no filter on that dimension". Limit ≤ 0 disables the limit.
type ListFilter struct {
	Status    *OrderStatus
	CourierID string
	StartDate *time.Time
	EndDate   *time.Time
	Limit     int
}

// Repository is the persistence layer for orders. It wraps a Firestore
// client and exposes typed CRUD and query operations over the
// "orders" collection.
type Repository struct {
	client *firestore.Client
}

// NewRepository returns an order Repository backed by the given Firestore
// client. The client is owned by the caller and is not closed by the
// repository.
func NewRepository(client *firestore.Client) *Repository {
	return &Repository{client: client}
}

// Create persists a new order document and returns the generated document
// ID. CreatedAt and UpdatedAt are set to a server-side timestamp; any
// values present on the input are overwritten by the sentinel.
//
// The input order's ID field is ignored: Firestore generates the document
// ID, which is returned to the caller.
func (r *Repository) Create(ctx context.Context, o Order) (string, error) {
	doc := r.client.Collection(ordersCollection).NewDoc()

	// Build a map so we can mix typed fields with ServerTimestamp sentinels
	// for createdAt/updatedAt without polluting the Order struct.
	payload := map[string]interface{}{
		"customerId":      o.CustomerID,
		"customerName":    o.CustomerName,
		"items":           o.Items,
		"deliveryAddress": o.DeliveryAddress,
		"status":          o.Status,
		"paymentMethod":   o.PaymentMethod,
		"createdAt":       firestore.ServerTimestamp,
		"updatedAt":       firestore.ServerTimestamp,
	}
	if o.RejectionReason != "" {
		payload["rejectionReason"] = o.RejectionReason
	}
	if len(o.OutOfStockItems) > 0 {
		payload["outOfStockItems"] = o.OutOfStockItems
	}
	if o.AssignedCourierID != "" {
		payload["assignedCourierId"] = o.AssignedCourierID
	}

	if _, err := doc.Set(ctx, payload); err != nil {
		return "", fmt.Errorf("order repository: create: %w", err)
	}
	return doc.ID, nil
}

// Get reads a single order by ID. ErrNotFound is returned when no document
// with the given ID exists.
func (r *Repository) Get(ctx context.Context, id string) (*Order, error) {
	if id == "" {
		return nil, fmt.Errorf("order repository: get: id is required")
	}
	snap, err := r.client.Collection(ordersCollection).Doc(id).Get(ctx)
	if err != nil {
		if status.Code(err) == codes.NotFound {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("order repository: get: %w", err)
	}
	return snapshotToOrder(snap)
}

// Update applies the given field updates to the order document and refreshes
// updatedAt to a server-side timestamp. The updates map is forwarded to
// Firestore unchanged except for the implicit updatedAt assignment.
//
// An attempt to update a missing document returns ErrNotFound.
func (r *Repository) Update(ctx context.Context, id string, updates map[string]interface{}) error {
	if id == "" {
		return fmt.Errorf("order repository: update: id is required")
	}
	if len(updates) == 0 {
		return fmt.Errorf("order repository: update: no fields provided")
	}

	doc := r.client.Collection(ordersCollection).Doc(id)
	fsUpdates := make([]firestore.Update, 0, len(updates)+1)
	for k, v := range updates {
		fsUpdates = append(fsUpdates, firestore.Update{Path: k, Value: v})
	}
	fsUpdates = append(fsUpdates, firestore.Update{Path: "updatedAt", Value: firestore.ServerTimestamp})

	if _, err := doc.Update(ctx, fsUpdates); err != nil {
		if status.Code(err) == codes.NotFound {
			return ErrNotFound
		}
		return fmt.Errorf("order repository: update: %w", err)
	}
	return nil
}

// UpdateStatus is a convenience wrapper around Update that changes only the
// status field. The state machine is enforced by the service layer; this
// method assumes the caller has already validated the transition.
func (r *Repository) UpdateStatus(ctx context.Context, id string, newStatus OrderStatus) error {
	return r.Update(ctx, id, map[string]interface{}{"status": newStatus})
}

// List returns orders matching the given filter, ordered by createdAt
// ascending. An empty filter returns up to Limit (or all if Limit ≤ 0)
// orders.
func (r *Repository) List(ctx context.Context, filter ListFilter) ([]Order, error) {
	q := r.client.Collection(ordersCollection).Query

	if filter.Status != nil {
		q = q.Where("status", "==", string(*filter.Status))
	}
	if filter.CourierID != "" {
		q = q.Where("assignedCourierId", "==", filter.CourierID)
	}
	if filter.StartDate != nil {
		q = q.Where("createdAt", ">=", *filter.StartDate)
	}
	if filter.EndDate != nil {
		q = q.Where("createdAt", "<=", *filter.EndDate)
	}
	q = q.OrderBy("createdAt", firestore.Asc)
	if filter.Limit > 0 {
		q = q.Limit(filter.Limit)
	}

	return r.runQuery(ctx, q)
}

// ListByStatus is a convenience wrapper around List that filters on a single
// status value.
func (r *Repository) ListByStatus(ctx context.Context, s OrderStatus) ([]Order, error) {
	return r.List(ctx, ListFilter{Status: &s})
}

// listByCustomerMaxLimit is the hard cap applied to the per-page limit
// passed to ListByCustomer. Per Requirement 9.2, the customer order
// history endpoint returns at most 50 orders per page.
const listByCustomerMaxLimit = 50

// ListByCustomer returns orders belonging to customerUID, ordered by
// createdAt descending, paginated by an optional cursor. The cursor, when
// non-nil, is the createdAt timestamp of the last order returned by the
// previous page; results begin strictly after it.
//
// limit is clamped to [1, 50]: values ≤ 0 default to 50, and values > 50
// are capped at 50 (Requirement 9.2).
func (r *Repository) ListByCustomer(ctx context.Context, customerUID string, cursor *time.Time, limit int) ([]Order, error) {
	if customerUID == "" {
		return nil, fmt.Errorf("order repository: list by customer: customerUID is required")
	}
	if limit <= 0 || limit > listByCustomerMaxLimit {
		limit = listByCustomerMaxLimit
	}

	q := r.client.Collection(ordersCollection).
		Where("customerId", "==", customerUID).
		OrderBy("createdAt", firestore.Desc)
	if cursor != nil {
		q = q.StartAfter(*cursor)
	}
	q = q.Limit(limit)

	return r.runQuery(ctx, q)
}

// CountByStatus returns a map from each known order status to the count of
// orders currently in that status. Statuses with zero matching orders are
// present in the result with value 0, so dashboards can render every column
// without conditional logic.
//
// Scalability: Uses Firestore COUNT aggregation queries instead of
// scanning the entire collection. This reduces cost from O(N) document
// reads to O(1) per status (1 read per 1000 counted documents, billed as
// a single aggregation). At scale with millions of orders, this is the
// difference between a multi-second timeout and a sub-100ms response.
func (r *Repository) CountByStatus(ctx context.Context) (map[OrderStatus]int, error) {
	statuses := []OrderStatus{
		StatusPlacing,
		StatusConfirmed,
		StatusInProduction,
		StatusReady,
		StatusReadyToDeliver,
		StatusOutForDelivery,
		StatusDelivered,
		StatusFailed,
	}

	// Initialise result map with zeros.
	counts := make(map[OrderStatus]int, len(statuses))
	for _, s := range statuses {
		counts[s] = 0
	}

	// Fire all COUNT aggregation queries concurrently. Each query counts
	// documents with a specific status server-side, avoiding the need to
	// transfer document data over the wire.
	type result struct {
		status OrderStatus
		count  int
		err    error
	}
	ch := make(chan result, len(statuses))

	for _, s := range statuses {
		go func(status OrderStatus) {
			q := r.client.Collection(ordersCollection).
				Where("status", "==", string(status))
			agg := q.NewAggregationQuery().WithCount("count")
			res, err := agg.Get(ctx)
			if err != nil {
				ch <- result{status: status, err: fmt.Errorf("count %s: %w", status, err)}
				return
			}
			countVal, ok := res["count"]
			if !ok || countVal == nil {
				ch <- result{status: status, count: 0}
				return
			}
			
			// Safely extract the count value using a type switch.
			// Production Firestore returns int64; emulator returns a protobuf Value.
			var count int
			switch v := countVal.(type) {
			case int64:
				count = int(v)
			case int:
				count = v
			default:
				if getter, ok := v.(interface{ GetIntegerValue() int64 }); ok {
					count = int(getter.GetIntegerValue())
				} else {
					ch <- result{status: status, err: fmt.Errorf("unexpected count type %T for status %s", v, status)}
					return
				}
			}
			ch <- result{status: status, count: count}
		}(s)
	}

	for range statuses {
		r := <-ch
		if r.err != nil {
			return nil, fmt.Errorf("order repository: count by status: %w", r.err)
		}
		counts[r.status] = r.count
	}
	return counts, nil
}

// runQuery executes q and decodes every snapshot into an Order.
func (r *Repository) runQuery(ctx context.Context, q firestore.Query) ([]Order, error) {
	iter := q.Documents(ctx)
	defer iter.Stop()

	var orders []Order
	for {
		snap, err := iter.Next()
		if errors.Is(err, iterator.Done) {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("order repository: list: %w", err)
		}
		o, err := snapshotToOrder(snap)
		if err != nil {
			return nil, err
		}
		orders = append(orders, *o)
	}
	return orders, nil
}

// snapshotToOrder decodes a Firestore snapshot into an Order, attaching the
// document ID (which the struct tag excludes from DataTo).
func snapshotToOrder(snap *firestore.DocumentSnapshot) (*Order, error) {
	var o Order
	if err := snap.DataTo(&o); err != nil {
		return nil, fmt.Errorf("order repository: decode %s: %w", snap.Ref.ID, err)
	}
	o.ID = snap.Ref.ID
	return &o, nil
}
