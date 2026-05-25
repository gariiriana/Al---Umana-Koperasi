package order

import (
	"strings"

	"al-umana/order-fulfillment/internal/common"
)

// Field-level validation limits per Requirement 1.1.
const (
	MaxCustomerNameLen    = 200
	MaxDeliveryAddressLen = 500
	MaxDeliveryTimeLen    = 100
	MinQuantity           = 1
)

// Reason strings returned in field-specific validation errors. Keeping these
// as constants makes them easy to assert in tests and easy to translate.
const (
	reasonCustomerNameRequired = "must not be empty"
	reasonCustomerNameTooLong  = "must be at most 200 characters"
	reasonAddressRequired      = "must not be empty"
	reasonAddressTooLong       = "must be at most 500 characters"
	reasonTimeRequired         = "must not be empty"
	reasonTimeTooLong          = "must be at most 100 characters"
	reasonItemsRequired        = "at least one item is required"
	reasonItemIDRequired       = "item identifier must not be empty"
	reasonItemNameRequired     = "item name must not be empty"
	reasonQuantityNotPositive  = "quantity must be a positive integer"
	reasonQuantityBelowMinimum = "quantity must be at least 1"
	reasonDuplicateItemID      = "duplicate item identifier in request"
)

// ValidateCreateOrder validates a CreateOrderRequest and returns a slice of
// field-specific errors. An empty result indicates the request is valid.
//
// Validation rules (Requirement 1.1):
//   - customerName: non-empty, ≤ 200 characters (after trimming whitespace)
//   - deliveryAddress: non-empty, ≤ 500 characters (after trimming)
//   - deliveryTime: non-empty, ≤ 100 characters (after trimming)
//   - items: at least one entry; each item has a non-empty itemId and
//     itemName, and a quantity ≥ 1; itemId values must be unique within
//     the request
func ValidateCreateOrder(req CreateOrderRequest) []common.FieldError {
	errs := make([]common.FieldError, 0, 4)

	name := strings.TrimSpace(req.CustomerName)
	switch {
	case name == "":
		errs = append(errs, common.FieldError{Field: "customerName", Reason: reasonCustomerNameRequired})
	case len(name) > MaxCustomerNameLen:
		errs = append(errs, common.FieldError{Field: "customerName", Reason: reasonCustomerNameTooLong})
	}

	addr := strings.TrimSpace(req.DeliveryAddress)
	switch {
	case addr == "":
		errs = append(errs, common.FieldError{Field: "deliveryAddress", Reason: reasonAddressRequired})
	case len(addr) > MaxDeliveryAddressLen:
		errs = append(errs, common.FieldError{Field: "deliveryAddress", Reason: reasonAddressTooLong})
	}

	devTime := strings.TrimSpace(req.DeliveryTime)
	switch {
	case devTime == "":
		errs = append(errs, common.FieldError{Field: "deliveryTime", Reason: reasonTimeRequired})
	case len(devTime) > MaxDeliveryTimeLen:
		errs = append(errs, common.FieldError{Field: "deliveryTime", Reason: reasonTimeTooLong})
	}

	if len(req.Items) == 0 {
		errs = append(errs, common.FieldError{Field: "items", Reason: reasonItemsRequired})
		return errs
	}

	seen := make(map[string]struct{}, len(req.Items))
	for i, it := range req.Items {
		fieldPrefix := "items[" + itoa(i) + "]"

		id := strings.TrimSpace(it.ItemID)
		if id == "" {
			errs = append(errs, common.FieldError{Field: fieldPrefix + ".itemId", Reason: reasonItemIDRequired})
		} else if _, dup := seen[id]; dup {
			errs = append(errs, common.FieldError{Field: fieldPrefix + ".itemId", Reason: reasonDuplicateItemID})
		} else {
			seen[id] = struct{}{}
		}

		if strings.TrimSpace(it.ItemName) == "" {
			errs = append(errs, common.FieldError{Field: fieldPrefix + ".itemName", Reason: reasonItemNameRequired})
		}

		switch {
		case it.Quantity < MinQuantity && it.Quantity > 0:
			errs = append(errs, common.FieldError{Field: fieldPrefix + ".quantity", Reason: reasonQuantityBelowMinimum})
		case it.Quantity <= 0:
			errs = append(errs, common.FieldError{Field: fieldPrefix + ".quantity", Reason: reasonQuantityNotPositive})
		}
	}

	return errs
}

// itoa is a tiny strconv.Itoa replacement that avoids pulling strconv into
// a hot validation path (and keeps the import list short). It supports
// non-negative ints which is all this package uses.
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	if n < 0 {
		// Defensive: validation indices are always ≥ 0.
		n = -n
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[i:])
}

// ValidateQCFailReason validates the reason supplied with a QC fail decision
// (Requirement 3.5). The reason must be non-empty (after trimming) and at
// most 500 characters. An empty FieldError slice indicates a valid reason.
func ValidateQCFailReason(reason string) []common.FieldError {
	trimmed := strings.TrimSpace(reason)
	if trimmed == "" {
		return []common.FieldError{{Field: "reason", Reason: "fail reason must not be empty"}}
	}
	if len(reason) > 500 {
		return []common.FieldError{{Field: "reason", Reason: "fail reason must be at most 500 characters"}}
	}
	return nil
}
