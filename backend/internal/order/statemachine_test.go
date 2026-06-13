package order

import (
	"testing"

	"pgregory.net/rapid"
)

func TestStateMachineProperty_ValidateTransitions(t *testing.T) {
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

	rapid.Check(t, func(rt *rapid.T) {
		from := rapid.SampledFrom(statuses).Draw(rt, "from")
		to := rapid.SampledFrom(statuses).Draw(rt, "to")

		err := ValidateTransition(from, to)

		// Self-transition is always invalid
		if from == to {
			if err == nil {
				rt.Fatalf("expected transition from %s to itself to be invalid", from)
			}
			return
		}

		// Check against expected transitions
		expectedValid := false
		switch from {
		case StatusPlacing:
			expectedValid = (to == StatusConfirmed || to == StatusFailed)
		case StatusConfirmed:
			expectedValid = (to == StatusInProduction)
		case StatusInProduction:
			expectedValid = (to == StatusReady || to == StatusReadyToDeliver)
		case StatusReady:
			expectedValid = (to == StatusReadyToDeliver || to == StatusConfirmed)
		case StatusReadyToDeliver:
			expectedValid = (to == StatusOutForDelivery)
		case StatusOutForDelivery:
			expectedValid = (to == StatusReadyToDeliver || to == StatusDelivered)
		}

		if expectedValid {
			if err != nil {
				rt.Fatalf("expected transition %s -> %s to be valid, but got error: %v", from, to, err)
			}
		} else {
			if err == nil {
				rt.Fatalf("expected transition %s -> %s to be invalid, but it was accepted", from, to)
			}
		}
	})
}

func TestStateMachineProperty_IsTerminal(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		s := rapid.SampledFrom([]OrderStatus{
			StatusPlacing,
			StatusConfirmed,
			StatusInProduction,
			StatusReady,
			StatusReadyToDeliver,
			StatusOutForDelivery,
			StatusDelivered,
			StatusFailed,
		}).Draw(rt, "status")

		terminal := IsTerminal(s)
		expectedTerminal := (s == StatusDelivered || s == StatusFailed)

		if terminal != expectedTerminal {
			rt.Fatalf("expected IsTerminal(%s) to be %t, got %t", s, expectedTerminal, terminal)
		}
	})
}
