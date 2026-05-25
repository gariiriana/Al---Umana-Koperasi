package order

import (
	"errors"
	"fmt"
)

// ErrInvalidTransition is returned when a state transition is not permitted
// by the order state machine. The service layer translates this into the
// canonical INVALID_STATE_TRANSITION error response (HTTP 409).
var ErrInvalidTransition = errors.New("invalid state transition")

// validTransitions enumerates every legal (from -> to) order status edge.
// Edges not present in this map are rejected by ValidateTransition.
//
// The table mirrors the design's "Valid State Transitions" section:
//
//   PLACING          -> CONFIRMED       (stock available)
//   PLACING          -> FAILED          (out of stock / timeout)
//   CONFIRMED        -> IN_PRODUCTION   (production started)
//   IN_PRODUCTION    -> READY           (production complete)
//   READY            -> READY_TO_DELIVER (QC passed)
//   READY            -> CONFIRMED       (QC failed, re-queue)
//   READY_TO_DELIVER -> OUT_FOR_DELIVERY (dispatched)
//   OUT_FOR_DELIVERY -> READY_TO_DELIVER (rescheduled)
//   OUT_FOR_DELIVERY -> DELIVERED       (proof submitted)
var validTransitions = map[OrderStatus]map[OrderStatus]struct{}{
	StatusPlacing: {
		StatusConfirmed: {},
		StatusFailed:    {},
	},
	StatusConfirmed: {
		StatusInProduction: {},
	},
	StatusInProduction: {
		StatusReady: {},
	},
	StatusReady: {
		StatusReadyToDeliver: {},
		StatusConfirmed:      {},
	},
	StatusReadyToDeliver: {
		StatusOutForDelivery: {},
	},
	StatusOutForDelivery: {
		StatusReadyToDeliver: {},
		StatusDelivered:      {},
	},
}

// ValidateTransition reports whether moving an order from `from` to `to` is
// permitted. It returns ErrInvalidTransition wrapped with a human-readable
// message identifying both states for any disallowed edge, and nil for any
// permitted edge.
func ValidateTransition(from, to OrderStatus) error {
	if from == to {
		return fmt.Errorf("%w: cannot transition from %s to itself", ErrInvalidTransition, from)
	}
	successors, ok := validTransitions[from]
	if !ok {
		return fmt.Errorf("%w: status %s is terminal or unknown", ErrInvalidTransition, from)
	}
	if _, ok := successors[to]; !ok {
		return fmt.Errorf("%w: %s -> %s", ErrInvalidTransition, from, to)
	}
	return nil
}

// IsTerminal reports whether the given status is an end-of-life state with
// no further transitions defined. Terminal statuses are DELIVERED and
// FAILED.
func IsTerminal(s OrderStatus) bool {
	_, ok := validTransitions[s]
	return !ok
}
