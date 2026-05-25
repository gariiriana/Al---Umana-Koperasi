// Package gps contains the domain types and repository for courier GPS
// tracking data persisted in the Firestore courier_locations collection.
package gps

import "time"

// Coordinate range constants. Latitude is bound to the closed interval
// [-90, 90] and longitude to [-180, 180] per Requirement 5.5.
const (
	MinLatitude  = -90.0
	MaxLatitude  = 90.0
	MinLongitude = -180.0
	MaxLongitude = 180.0
)

// CourierGPS is the latest known position of a courier for a single order.
//
// Documents in the courier_locations collection use the composite ID
// "{orderId}_{courierId}". Historical positions are written to a
// location_history subcollection beneath the same document.
type CourierGPS struct {
	OrderID   string    `json:"orderId" firestore:"orderId"`
	CourierID string    `json:"courierId" firestore:"courierId"`
	Latitude  float64   `json:"latitude" firestore:"latitude"`
	Longitude float64   `json:"longitude" firestore:"longitude"`
	Timestamp time.Time `json:"timestamp" firestore:"timestamp"`
}

// ValidCoordinate reports whether the given latitude/longitude pair lies
// within the valid coordinate ranges defined by Requirement 5.5.
func ValidCoordinate(lat, lng float64) bool {
	return lat >= MinLatitude && lat <= MaxLatitude &&
		lng >= MinLongitude && lng <= MaxLongitude
}
