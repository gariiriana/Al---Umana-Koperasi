package order

import (
	"context"
	"fmt"
	"testing"
	"time"

	"pgregory.net/rapid"
)

type mockOrderRepo struct {
	orders           map[string]*Order
	createFunc       func(ctx context.Context, o Order) (string, error)
	getFunc          func(ctx context.Context, id string) (*Order, error)
	updateFunc       func(ctx context.Context, id string, updates map[string]interface{}) error
	updateStatusFunc func(ctx context.Context, id string, newStatus OrderStatus) error
}

func (m *mockOrderRepo) Create(ctx context.Context, o Order) (string, error) {
	if m.createFunc != nil {
		return m.createFunc(ctx, o)
	}
	id := fmt.Sprintf("ord_%d", len(m.orders)+1)
	o.ID = id
	m.orders[id] = &o
	return id, nil
}

func (m *mockOrderRepo) Get(ctx context.Context, id string) (*Order, error) {
	if m.getFunc != nil {
		return m.getFunc(ctx, id)
	}
	o, ok := m.orders[id]
	if !ok {
		return nil, ErrNotFound
	}
	// return a copy
	oCopy := *o
	return &oCopy, nil
}

func (m *mockOrderRepo) Update(ctx context.Context, id string, updates map[string]interface{}) error {
	if m.updateFunc != nil {
		return m.updateFunc(ctx, id, updates)
	}
	o, ok := m.orders[id]
	if !ok {
		return ErrNotFound
	}
	if s, ok := updates["status"]; ok {
		o.Status = s.(OrderStatus)
	}
	if r, ok := updates["rejectionReason"]; ok {
		o.RejectionReason = r.(string)
	}
	if oos, ok := updates["outOfStockItems"]; ok {
		o.OutOfStockItems = oos.([]string)
	}
	if actor, ok := updates["productionStartedBy"]; ok {
		o.ProductionStartedBy = actor.(string)
	}
	if t, ok := updates["productionStartedAt"]; ok {
		tm := t.(time.Time)
		o.ProductionStartedAt = &tm
	}
	if reviewer, ok := updates["qcReviewedBy"]; ok {
		o.QCReviewedBy = reviewer.(string)
	}
	if t, ok := updates["qcReviewedAt"]; ok {
		tm := t.(time.Time)
		o.QCReviewedAt = &tm
	}
	if reason, ok := updates["qcFailReason"]; ok {
		o.QCFailReason = reason.(string)
	}
	return nil
}

func (m *mockOrderRepo) UpdateStatus(ctx context.Context, id string, newStatus OrderStatus) error {
	if m.updateStatusFunc != nil {
		return m.updateStatusFunc(ctx, id, newStatus)
	}
	return m.Update(ctx, id, map[string]interface{}{"status": newStatus})
}

type mockStockChecker struct {
	checkFunc func(ctx context.Context, items []OrderLineItem) ([]string, error)
}

func (m *mockStockChecker) CheckAvailability(ctx context.Context, items []OrderLineItem) ([]string, error) {
	return m.checkFunc(ctx, items)
}

func TestServiceProperty_CreateOrderPersistenceAndStockCheck(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		customerName := genValidString(1, 200).Draw(rt, "customerName")
		address := genValidString(1, 500).Draw(rt, "address")
		customerID := rapid.StringMatching(`^cust_[0-9]{5}$`).Draw(rt, "customerID")
		validTime := genValidString(1, 100).Draw(rt, "deliveryTime")

		req := CreateOrderRequest{
			CustomerName:    customerName,
			DeliveryAddress: address,
			DeliveryTime:    validTime,
		}

		numItems := rapid.IntRange(1, 3).Draw(rt, "numItems")
		seenIDs := make(map[string]bool)
		for i := 0; i < numItems; i++ {
			itemID := rapid.StringMatching(`^item_[0-9]{4}$`).Filter(func(id string) bool {
				return !seenIDs[id]
			}).Draw(rt, "itemID")
			seenIDs[itemID] = true
			req.Items = append(req.Items, OrderLineItem{
				ItemID:   itemID,
				ItemName: "Test Item",
				Quantity: 2,
			})
		}

		// Draw stock outcome: 0 = all available, 1 = some out of stock, 2 = stock check timeout
		stockOutcome := rapid.IntRange(0, 2).Draw(rt, "stockOutcome")

		var expectedStatus OrderStatus
		var mockStock mockStockChecker

		switch stockOutcome {
		case 0:
			expectedStatus = StatusConfirmed
			mockStock = mockStockChecker{
				checkFunc: func(ctx context.Context, items []OrderLineItem) ([]string, error) {
					return nil, nil
				},
			}
		case 1:
			expectedStatus = StatusFailed
			// Select a subset of item IDs as out of stock
			var outOfStock []string
			for id := range seenIDs {
				outOfStock = append(outOfStock, id)
				break // just pick one
			}
			mockStock = mockStockChecker{
				checkFunc: func(ctx context.Context, items []OrderLineItem) ([]string, error) {
					return outOfStock, nil
				},
			}
		case 2:
			expectedStatus = StatusFailed
			mockStock = mockStockChecker{
				checkFunc: func(ctx context.Context, items []OrderLineItem) ([]string, error) {
					return nil, context.DeadlineExceeded
				},
			}
		}

		repo := &mockOrderRepo{orders: make(map[string]*Order)}
		svc := NewService(repo, &mockStock)

		res, err := svc.CreateOrder(context.Background(), req, customerID)
		if err != nil {
			rt.Fatalf("CreateOrder failed unexpectedly: %v", err)
		}

		order := res.Order
		if order.Status != expectedStatus {
			rt.Fatalf("expected order status %s, got %s", expectedStatus, order.Status)
		}

		// Verify initial persistence fields
		if order.CustomerID != customerID || order.CustomerName != customerName || order.DeliveryAddress != address || order.DeliveryTime != req.DeliveryTime {
			rt.Fatalf("persisted order fields mismatched: expected %s, got %s", req.DeliveryTime, order.DeliveryTime)
		}

		if stockOutcome == 2 && order.RejectionReason != "stock service timeout" {
			rt.Fatalf("expected rejection reason 'stock service timeout', got %q", order.RejectionReason)
		}
	})
}

func TestServiceProperty_StartProduction(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		actorUID := rapid.StringMatching(`^[a-zA-Z0-9]{28}$`).Draw(rt, "actorUID")
		initialStatus := rapid.SampledFrom([]OrderStatus{
			StatusPlacing,
			StatusConfirmed,
			StatusInProduction,
			StatusReady,
			StatusReadyToDeliver,
			StatusOutForDelivery,
			StatusDelivered,
			StatusFailed,
		}).Draw(rt, "initialStatus")

		repo := &mockOrderRepo{orders: make(map[string]*Order)}
		o := &Order{
			CustomerID: "cust_123",
			Status:     initialStatus,
		}
		id := "ord_123"
		repo.orders[id] = o

		svc := NewService(repo, nil)
		res, err := svc.StartProduction(context.Background(), id, actorUID)

		if initialStatus == StatusConfirmed {
			if err != nil {
				rt.Fatalf("expected StartProduction to succeed from CONFIRMED status, got: %v", err)
			}
			if res.Status != StatusInProduction {
				rt.Fatalf("expected status to transition to IN_PRODUCTION, got %s", res.Status)
			}
			if res.ProductionStartedBy != actorUID {
				rt.Fatalf("expected ProductionStartedBy to be %s, got %s", actorUID, res.ProductionStartedBy)
			}
			if res.ProductionStartedAt == nil || time.Since(*res.ProductionStartedAt) > 5*time.Second {
				rt.Fatalf("expected ProductionStartedAt to be close to now, got %v", res.ProductionStartedAt)
			}
		} else {
			if err == nil {
				rt.Fatalf("expected StartProduction to fail from %s status", initialStatus)
			}
		}
	})
}

func TestServiceProperty_QCReview(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		reviewerUID := rapid.StringMatching(`^[a-zA-Z0-9]{28}$`).Draw(rt, "reviewerUID")
		initialStatus := rapid.SampledFrom([]OrderStatus{
			StatusPlacing,
			StatusConfirmed,
			StatusInProduction,
			StatusReady,
			StatusReadyToDeliver,
			StatusOutForDelivery,
			StatusDelivered,
			StatusFailed,
		}).Draw(rt, "initialStatus")

		// Draw QC decision: 0 = pass, 1 = fail
		qcDecision := rapid.IntRange(0, 1).Draw(rt, "qcDecision")
		failReason := genValidString(1, 500).Draw(rt, "failReason")

		repo := &mockOrderRepo{orders: make(map[string]*Order)}
		o := &Order{
			CustomerID: "cust_123",
			Status:     initialStatus,
		}
		id := "ord_123"
		repo.orders[id] = o

		svc := NewService(repo, nil)

		var res *Order
		var err error

		if qcDecision == 0 {
			res, err = svc.QCPass(context.Background(), id, reviewerUID)
		} else {
			res, err = svc.QCFail(context.Background(), id, reviewerUID, failReason)
		}

		if initialStatus == StatusReady {
			if err != nil {
				rt.Fatalf("expected QC decision to succeed from READY status, got: %v", err)
			}
			if qcDecision == 0 {
				if res.Status != StatusReadyToDeliver {
					rt.Fatalf("expected status to transition to READY_TO_DELIVER, got %s", res.Status)
				}
			} else {
				if res.Status != StatusConfirmed {
					rt.Fatalf("expected status to transition to CONFIRMED, got %s", res.Status)
				}
				if res.QCFailReason != failReason {
					rt.Fatalf("expected QCFailReason to be %q, got %q", failReason, res.QCFailReason)
				}
			}
			if res.QCReviewedBy != reviewerUID {
				rt.Fatalf("expected QCReviewedBy to be %s, got %s", reviewerUID, res.QCReviewedBy)
			}
			if res.QCReviewedAt == nil {
				rt.Fatalf("expected QCReviewedAt to be recorded")
			}
		} else {
			if err == nil {
				rt.Fatalf("expected QC decision to fail from %s status", initialStatus)
			}
		}
	})
}
