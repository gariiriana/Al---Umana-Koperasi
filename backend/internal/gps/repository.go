package gps

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

// Firestore collection and subcollection names for courier GPS data.
const (
	courierLocationsCollection = "courier_locations"
	locationHistorySubcoll     = "location_history"
)

// ErrInvalidCoordinate is returned by WriteLocation when the supplied
// latitude/longitude pair is outside the ranges defined by Requirement 5.5.
var ErrInvalidCoordinate = errors.New("invalid GPS coordinate")

// ErrNotFound is returned when a courier location document is requested
// but does not exist.
var ErrNotFound = errors.New("courier location not found")

// Repository persists courier GPS data in the courier_locations collection.
// The latest position per (orderId, courierId) pair is keyed by the
// composite document ID "{orderId}_{courierId}"; historical positions are
// appended to a location_history subcollection beneath the same document.
type Repository struct {
	client *firestore.Client
}

// NewRepository returns a GPS Repository backed by the given Firestore
// client. The client is owned by the caller and is not closed by the
// repository.
func NewRepository(client *firestore.Client) *Repository {
	return &Repository{client: client}
}

// WriteLocation persists a new courier coordinate for the given order. It
// validates the coordinate ranges per Requirement 5.5 and rejects invalid
// values with ErrInvalidCoordinate without writing anything.
//
// The "latest" document at courier_locations/{orderId}_{courierId} is
// overwritten on each call; the same data is also appended to the
// location_history subcollection so the full track is retained.
//
// Both writes use a server-side timestamp so client clock skew cannot
// affect ordering.
func (r *Repository) WriteLocation(ctx context.Context, orderID, courierID string, lat, lng float64) error {
	if orderID == "" || courierID == "" {
		return fmt.Errorf("gps repository: write: orderID and courierID are required")
	}
	if !ValidCoordinate(lat, lng) {
		return ErrInvalidCoordinate
	}

	docID := docID(orderID, courierID)
	doc := r.client.Collection(courierLocationsCollection).Doc(docID)

	payload := map[string]interface{}{
		"orderId":   orderID,
		"courierId": courierID,
		"latitude":  lat,
		"longitude": lng,
		"timestamp": firestore.ServerTimestamp,
	}

	if _, err := doc.Set(ctx, payload); err != nil {
		return fmt.Errorf("gps repository: write latest: %w", err)
	}

	// Append the same point to the history subcollection.
	if _, _, err := doc.Collection(locationHistorySubcoll).Add(ctx, payload); err != nil {
		return fmt.Errorf("gps repository: write history: %w", err)
	}
	return nil
}

// GetLatest returns the most recent courier position for the given order.
// When several couriers are associated with the same order this returns
// the lexicographically first matching document; in normal operation only
// one assigned courier exists per order.
//
// ErrNotFound is returned when no courier location exists for the order.
func (r *Repository) GetLatest(ctx context.Context, orderID string) (*CourierGPS, error) {
	if orderID == "" {
		return nil, fmt.Errorf("gps repository: get latest: orderID is required")
	}

	iter := r.client.
		Collection(courierLocationsCollection).
		Where("orderId", "==", orderID).
		OrderBy("timestamp", firestore.Desc).
		Limit(1).
		Documents(ctx)
	defer iter.Stop()

	snap, err := iter.Next()
	if errors.Is(err, iterator.Done) {
		return nil, ErrNotFound
	}
	if err != nil {
		if status.Code(err) == codes.NotFound {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("gps repository: get latest: %w", err)
	}

	var loc CourierGPS
	if err := snap.DataTo(&loc); err != nil {
		return nil, fmt.Errorf("gps repository: decode %s: %w", snap.Ref.ID, err)
	}
	return &loc, nil
}

// ListActive returns every courier whose latest GPS update has a timestamp
// newer than time.Now() - staleThreshold. A non-positive staleThreshold is
// treated as "no threshold" and returns all known courier locations.
//
// The query relies on the timestamp field on the latest-position document;
// the location_history subcollection is not consulted.
func (r *Repository) ListActive(ctx context.Context, staleThreshold time.Duration) ([]CourierGPS, error) {
	q := r.client.Collection(courierLocationsCollection).Query
	if staleThreshold > 0 {
		cutoff := time.Now().Add(-staleThreshold)
		q = q.Where("timestamp", ">=", cutoff)
	}

	iter := q.Documents(ctx)
	defer iter.Stop()

	var out []CourierGPS
	for {
		snap, err := iter.Next()
		if errors.Is(err, iterator.Done) {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("gps repository: list active: %w", err)
		}
		var loc CourierGPS
		if err := snap.DataTo(&loc); err != nil {
			return nil, fmt.Errorf("gps repository: decode %s: %w", snap.Ref.ID, err)
		}
		out = append(out, loc)
	}
	return out, nil
}

// docID composes the canonical Firestore document ID for the latest
// position record of an (order, courier) pair.
func docID(orderID, courierID string) string {
	return orderID + "_" + courierID
}
