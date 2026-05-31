package stock

import (
	"strings"
	"testing"

	"al-umana/order-fulfillment/internal/common"
)

// validItem returns an InventoryItem that passes every validation rule. Tests
// mutate a single field to assert that violation produces exactly one error
// for the offending field.
func validItem() InventoryItem {
	return InventoryItem{
		ItemName: "Nasi Goreng",
		Quantity: 10,
		Unit:     "porsi",
		Price:    25_000,
		Category: "Makanan",
		ImageURL: "product_images/abc123",
	}
}

func fieldsOf(errs []common.FieldError) []string {
	out := make([]string, len(errs))
	for i, e := range errs {
		out[i] = e.Field
	}
	return out
}

func TestValidateInventoryItem_Valid(t *testing.T) {
	t.Parallel()

	if errs := ValidateInventoryItem(validItem()); len(errs) != 0 {
		t.Fatalf("expected no errors, got %+v", errs)
	}
}

func TestValidateInventoryItem_EmptyImageURLAllowed(t *testing.T) {
	t.Parallel()

	item := validItem()
	item.ImageURL = ""
	if errs := ValidateInventoryItem(item); len(errs) != 0 {
		t.Fatalf("expected no errors when imageURL is empty, got %+v", errs)
	}
}

func TestValidateInventoryItem_FieldRules(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name     string
		mutate   func(*InventoryItem)
		expected string
	}{
		{
			name:     "itemName empty after trim",
			mutate:   func(i *InventoryItem) { i.ItemName = "   " },
			expected: "itemName",
		},
		{
			name:     "itemName too long",
			mutate:   func(i *InventoryItem) { i.ItemName = strings.Repeat("a", 201) },
			expected: "itemName",
		},
		{
			name:     "quantity negative",
			mutate:   func(i *InventoryItem) { i.Quantity = -1 },
			expected: "quantity",
		},
		{
			name:     "quantity above max",
			mutate:   func(i *InventoryItem) { i.Quantity = 100_000 },
			expected: "quantity",
		},
		{
			name:     "unit empty after trim",
			mutate:   func(i *InventoryItem) { i.Unit = " " },
			expected: "unit",
		},
		{
			name:     "unit too long",
			mutate:   func(i *InventoryItem) { i.Unit = strings.Repeat("u", 51) },
			expected: "unit",
		},
		{
			name:     "price negative",
			mutate:   func(i *InventoryItem) { i.Price = -1 },
			expected: "price",
		},
		{
			name:     "category empty after trim",
			mutate:   func(i *InventoryItem) { i.Category = "" },
			expected: "category",
		},
		{
			name:     "category too long",
			mutate:   func(i *InventoryItem) { i.Category = strings.Repeat("c", 51) },
			expected: "category",
		},
		{
			name:     "imageURL too long",
			mutate:   func(i *InventoryItem) { i.ImageURL = "product_images/" + strings.Repeat("x", 2048) },
			expected: "imageURL",
		},
		{
			name:     "imageURL wrong prefix",
			mutate:   func(i *InventoryItem) { i.ImageURL = "https://example.com/image.png" },
			expected: "imageURL",
		},
		{
			name:     "imageURL empty fileId",
			mutate:   func(i *InventoryItem) { i.ImageURL = "product_images/" },
			expected: "imageURL",
		},
		{
			name:     "imageURL nested fileId",
			mutate:   func(i *InventoryItem) { i.ImageURL = "product_images/foo/bar" },
			expected: "imageURL",
		},
		{
			name:     "discountPercent negative",
			mutate:   func(i *InventoryItem) { i.DiscountPercent = -1 },
			expected: "discountPercent",
		},
		{
			name:     "discountPercent above max",
			mutate:   func(i *InventoryItem) { i.DiscountPercent = 101 },
			expected: "discountPercent",
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			item := validItem()
			tc.mutate(&item)

			errs := ValidateInventoryItem(item)
			if len(errs) != 1 {
				t.Fatalf("expected exactly 1 error, got %d: %+v", len(errs), errs)
			}
			if errs[0].Field != tc.expected {
				t.Errorf("expected field %q, got %q (reason=%q)", tc.expected, errs[0].Field, errs[0].Reason)
			}
		})
	}
}

func TestValidateInventoryItem_MultipleViolations(t *testing.T) {
	t.Parallel()

	item := InventoryItem{
		ItemName:        "",
		Quantity:        -5,
		Unit:            "",
		Price:           -100,
		DiscountPercent: -5,
		Category:        "",
		ImageURL:        "not-a-product-images-url",
	}

	errs := ValidateInventoryItem(item)
	gotFields := fieldsOf(errs)

	wantFields := map[string]bool{
		"itemName":        false,
		"quantity":        false,
		"unit":            false,
		"price":           false,
		"discountPercent": false,
		"category":        false,
		"imageURL":        false,
	}

	for _, f := range gotFields {
		if _, ok := wantFields[f]; !ok {
			t.Errorf("unexpected field error %q", f)
			continue
		}
		if wantFields[f] {
			t.Errorf("duplicate error for field %q", f)
		}
		wantFields[f] = true
	}

	for f, seen := range wantFields {
		if !seen {
			t.Errorf("missing error for field %q (got %v)", f, gotFields)
		}
	}
}

func TestValidateInventoryItem_DetailImageUrls(t *testing.T) {
	t.Parallel()

	t.Run("valid detail image urls", func(t *testing.T) {
		item := validItem()
		item.DetailImageUrls = []string{"product_images/def456", "product_images/ghi789"}
		if errs := ValidateInventoryItem(item); len(errs) != 0 {
			t.Fatalf("expected no errors, got %+v", errs)
		}
	})

	t.Run("too many detail image urls", func(t *testing.T) {
		item := validItem()
		item.DetailImageUrls = make([]string, 11)
		for i := 0; i < 11; i++ {
			item.DetailImageUrls[i] = "product_images/img"
		}
		errs := ValidateInventoryItem(item)
		if len(errs) != 1 || errs[0].Field != "detailImageUrls" {
			t.Fatalf("expected exactly 1 detailImageUrls error, got: %+v", errs)
		}
	})

	t.Run("invalid detail image url format", func(t *testing.T) {
		item := validItem()
		item.DetailImageUrls = []string{"product_images/valid1", "invalid-format"}
		errs := ValidateInventoryItem(item)
		if len(errs) != 1 || errs[0].Field != "detailImageUrls" {
			t.Fatalf("expected exactly 1 detailImageUrls error, got: %+v", errs)
		}
	})
}
