package order

import (
	"fmt"
	"strings"
	"testing"

	"pgregory.net/rapid"
)

// Generators for rapid

func genValidString(minLength, maxLength int) *rapid.Generator[string] {
	return rapid.StringMatching(`^[a-zA-Z0-9 ]+$`).Filter(func(s string) bool {
		trimmed := strings.TrimSpace(s)
		return len(trimmed) >= minLength && len(trimmed) <= maxLength
	})
}

func genInvalidString(maxLength int) *rapid.Generator[string] {
	regexStr := fmt.Sprintf(`^[a-zA-Z0-9]{%d,%d}$`, maxLength+1, maxLength+100)
	return rapid.OneOf(
		rapid.Just(""),
		rapid.Just("   "),
		// string exceeding max length
		rapid.StringMatching(regexStr),
	)
}

func TestValidationProperty_CreateOrder(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		// Happy Path Generator
		validName := genValidString(1, 200).Draw(rt, "validName")
		validAddress := genValidString(1, 500).Draw(rt, "validAddress")
		validTime := genValidString(1, 100).Draw(rt, "validTime")

		// Create a valid order request
		req := CreateOrderRequest{
			CustomerName:    validName,
			DeliveryAddress: validAddress,
			DeliveryTime:    validTime,
		}

		numItems := rapid.IntRange(1, 5).Draw(rt, "numItems")
		seenIDs := make(map[string]bool)
		for i := 0; i < numItems; i++ {
			itemID := rapid.StringMatching(`^item_[0-9]{4}$`).Filter(func(id string) bool {
				return !seenIDs[id]
			}).Draw(rt, "itemID")
			seenIDs[itemID] = true

			itemName := genValidString(1, 50).Draw(rt, "itemName")
			qty := rapid.IntRange(1, 100).Draw(rt, "quantity")

			req.Items = append(req.Items, OrderLineItem{
				ItemID:   itemID,
				ItemName: itemName,
				Quantity: qty,
			})
		}

		errs := ValidateCreateOrder(req)
		if len(errs) > 0 {
			rt.Fatalf("expected valid order to pass validation, but got errors: %v", errs)
		}
	})
}

func TestValidationProperty_InvalidFields(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		// Generate valid fields
		validName := genValidString(1, 200).Draw(rt, "validName")
		validAddress := genValidString(1, 500).Draw(rt, "validAddress")
		validTime := genValidString(1, 100).Draw(rt, "validTime")

		req := CreateOrderRequest{
			CustomerName:    validName,
			DeliveryAddress: validAddress,
			DeliveryTime:    validTime,
		}

		// Inject at least one validation failure
		failType := rapid.IntRange(0, 7).Draw(rt, "failType")
		switch failType {
		case 0:
			// Invalid name
			req.CustomerName = genInvalidString(200).Draw(rt, "invalidName")
		case 1:
			// Invalid address
			req.DeliveryAddress = genInvalidString(500).Draw(rt, "invalidAddress")
		case 2:
			// Empty items
			req.Items = []OrderLineItem{}
		case 3:
			// Item with empty ID
			req.Items = []OrderLineItem{{ItemID: "", ItemName: "Valid Name", Quantity: 5}}
		case 4:
			// Item with empty name
			req.Items = []OrderLineItem{{ItemID: "item_001", ItemName: "  ", Quantity: 5}}
		case 5:
			// Item with zero/negative quantity
			qty := rapid.IntRange(-10, 0).Draw(rt, "badQty")
			req.Items = []OrderLineItem{{ItemID: "item_001", ItemName: "Valid Name", Quantity: qty}}
		case 6:
			// Duplicate item ID
			req.Items = []OrderLineItem{
				{ItemID: "item_001", ItemName: "Item 1", Quantity: 2},
				{ItemID: "item_001", ItemName: "Item 2", Quantity: 3},
			}
		case 7:
			// Invalid delivery time
			req.DeliveryTime = genInvalidString(100).Draw(rt, "invalidTime")
		}

		// If we didn't inject empty/duplicate items, populate with one valid item just to trigger field specific checks
		if len(req.Items) == 0 && failType != 2 {
			req.Items = []OrderLineItem{{ItemID: "item_001", ItemName: "Valid Name", Quantity: 5}}
		}

		errs := ValidateCreateOrder(req)
		if len(errs) == 0 {
			rt.Fatalf("expected validation failure for failType %d, but it passed", failType)
		}

		// Verify the error points to the correct field
		foundExpected := false
		for _, err := range errs {
			switch failType {
			case 0:
				if err.Field == "customerName" {
					foundExpected = true
				}
			case 1:
				if err.Field == "deliveryAddress" {
					foundExpected = true
				}
			case 2:
				if err.Field == "items" {
					foundExpected = true
				}
			case 3:
				if strings.HasSuffix(err.Field, ".itemId") {
					foundExpected = true
				}
			case 4:
				if strings.HasSuffix(err.Field, ".itemName") {
					foundExpected = true
				}
			case 5:
				if strings.HasSuffix(err.Field, ".quantity") {
					foundExpected = true
				}
			case 6:
				if strings.HasSuffix(err.Field, ".itemId") && err.Reason == "duplicate item identifier in request" {
					foundExpected = true
				}
			case 7:
				if err.Field == "deliveryTime" {
					foundExpected = true
				}
			}
		}

		if !foundExpected {
			rt.Fatalf("expected errors to contain target field for failType %d, got: %v", failType, errs)
		}
	})
}

func TestValidationProperty_QCFailReason(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		validReason := genValidString(1, 500).Draw(rt, "validReason")
		errs := ValidateQCFailReason(validReason)
		if len(errs) > 0 {
			rt.Fatalf("expected valid QC fail reason to pass, got: %v", errs)
		}
	})

	rapid.Check(t, func(rt *rapid.T) {
		invalidReason := rapid.OneOf(
			rapid.Just(""),
			rapid.Just("   "),
			rapid.StringMatching(`^[a-zA-Z0-9]{501,600}$`),
		).Draw(rt, "invalidReason")

		errs := ValidateQCFailReason(invalidReason)
		if len(errs) == 0 {
			rt.Fatalf("expected invalid QC fail reason %q to fail validation, but it passed", invalidReason)
		}

		if errs[0].Field != "reason" {
			rt.Fatalf("expected error field to be 'reason', got: %s", errs[0].Field)
		}
	})
}
