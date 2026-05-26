package stock

import (
	"strings"

	"al-umana/order-fulfillment/internal/common"
)

// Field-level validation limits for InventoryItem documents per
// Requirements 10.1, 10.6, 12.5, 13.3, 13.4.
const (
	MinItemNameLen = 1
	MaxItemNameLen = 200

	MinQuantity = 0
	MaxQuantity = 99_999

	MinUnitLen = 1
	MaxUnitLen = 50

	MinPrice = 0

	MinCategoryLen = 1
	MaxCategoryLen = 50

	MaxImageURLLen = 2048

	imageURLPrefix = "product_images/"
)

// Reason strings returned in field-specific validation errors. Keeping these
// as constants makes them easy to assert in tests and easy to translate.
const (
	reasonItemNameRequired   = "item name must not be empty"
	reasonItemNameTooLong    = "item name must be at most 200 characters"
	reasonQuantityOutOfRange = "quantity must be between 0 and 99999"
	reasonUnitRequired       = "unit must not be empty"
	reasonUnitTooLong        = "unit must be at most 50 characters"
	reasonPriceNegative      = "price must be greater than or equal to 0"
	reasonCategoryRequired   = "category must not be empty"
	reasonCategoryTooLong    = "category must be at most 50 characters"
	reasonImageURLTooLong    = "imageURL must be at most 2048 characters"
	reasonImageURLFormat     = "imageURL must have the format product_images/{fileId}"
)

// ValidateInventoryItem validates an InventoryItem and returns a slice of
// field-specific errors. An empty result indicates the item is valid.
//
// Validation rules (Requirements 10.1, 10.6, 12.5, 13.3, 13.4):
//   - itemName: 1–200 characters after trimming whitespace
//   - quantity: integer in the range [0, 99,999]
//   - unit: 1–50 characters after trimming whitespace
//   - price: int64 ≥ 0
//   - category: 1–50 characters after trimming whitespace
//   - imageURL: ≤ 2048 characters; when non-empty, must match the format
//     "product_images/{fileId}" with a non-empty fileId that does not
//     contain a path separator
//
// At most one entry per violated field is returned, named after the field.
func ValidateInventoryItem(item InventoryItem) []common.FieldError {
	errs := make([]common.FieldError, 0, 6)

	name := strings.TrimSpace(item.ItemName)
	switch {
	case len(name) < MinItemNameLen:
		errs = append(errs, common.FieldError{Field: "itemName", Reason: reasonItemNameRequired})
	case len(name) > MaxItemNameLen:
		errs = append(errs, common.FieldError{Field: "itemName", Reason: reasonItemNameTooLong})
	}

	if item.Quantity < MinQuantity || item.Quantity > MaxQuantity {
		errs = append(errs, common.FieldError{Field: "quantity", Reason: reasonQuantityOutOfRange})
	}

	unit := strings.TrimSpace(item.Unit)
	switch {
	case len(unit) < MinUnitLen:
		errs = append(errs, common.FieldError{Field: "unit", Reason: reasonUnitRequired})
	case len(unit) > MaxUnitLen:
		errs = append(errs, common.FieldError{Field: "unit", Reason: reasonUnitTooLong})
	}

	if item.Price < MinPrice {
		errs = append(errs, common.FieldError{Field: "price", Reason: reasonPriceNegative})
	}

	category := strings.TrimSpace(item.Category)
	switch {
	case len(category) < MinCategoryLen:
		errs = append(errs, common.FieldError{Field: "category", Reason: reasonCategoryRequired})
	case len(category) > MaxCategoryLen:
		errs = append(errs, common.FieldError{Field: "category", Reason: reasonCategoryTooLong})
	}

	if e, ok := validateImageURL(item.ImageURL); !ok {
		errs = append(errs, e)
	}

	return errs
}

// validateImageURL applies Requirement 11.7 / 10.1 imageURL formatting rules:
// when set, the value must be at most 2048 characters and match
// "product_images/{fileId}" where fileId is non-empty and contains no "/".
// An empty string is valid (image is optional).
//
// Returns the error and ok=false when invalid; ok=true otherwise.
func validateImageURL(imageURL string) (common.FieldError, bool) {
	if len(imageURL) > MaxImageURLLen {
		return common.FieldError{Field: "imageURL", Reason: reasonImageURLTooLong}, false
	}
	if imageURL == "" {
		return common.FieldError{}, true
	}
	if !strings.HasPrefix(imageURL, imageURLPrefix) {
		return common.FieldError{Field: "imageURL", Reason: reasonImageURLFormat}, false
	}
	fileID := imageURL[len(imageURLPrefix):]
	if fileID == "" || strings.Contains(fileID, "/") {
		return common.FieldError{Field: "imageURL", Reason: reasonImageURLFormat}, false
	}
	return common.FieldError{}, true
}
