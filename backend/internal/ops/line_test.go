package ops

import (
	"context"
	"errors"
	"testing"
)

func TestSetDeliveryLines_ReplaceAndTotals(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	batch := f.newShipping(t, "")
	d := f.newDelivery(t, batch, "PENDING")
	water := f.newProduct(t, "Water 20L", 12.5)
	gas := f.newProduct(t, "Gas P13", 120)

	lines, err := f.repo.SetDeliveryLines(ctx, f.companyID, d, []lineInput{
		{ProductID: water, Quantity: 3, UnitPrice: ptrF64(12.5)},
		{ProductID: gas, Quantity: 1, UnitPrice: ptrF64(120)},
	})
	if err != nil {
		t.Fatalf("set: %v", err)
	}
	if len(lines) != 2 {
		t.Fatalf("got %d lines, want 2", len(lines))
	}
	if got := lineTotal(lines); got != 157.5 {
		t.Fatalf("lineTotal = %v, want 157.5", got)
	}

	// The totals must show up on the board payload.
	one, err := f.repo.deliveryByID(ctx, f.companyID, d)
	if err != nil {
		t.Fatalf("deliveryByID: %v", err)
	}
	if one.ItemCount != 2 || one.ItemTotal != 157.5 {
		t.Fatalf("delivery roll-up = count %d total %v, want 2 / 157.5", one.ItemCount, one.ItemTotal)
	}

	// Replace with a single line.
	lines, err = f.repo.SetDeliveryLines(ctx, f.companyID, d, []lineInput{
		{ProductID: water, Quantity: 2, UnitPrice: ptrF64(12.5)},
	})
	if err != nil {
		t.Fatalf("replace: %v", err)
	}
	if len(lines) != 1 || lineTotal(lines) != 25 {
		t.Fatalf("after replace = %d lines total %v, want 1 / 25", len(lines), lineTotal(lines))
	}

	// Clear.
	lines, err = f.repo.SetDeliveryLines(ctx, f.companyID, d, []lineInput{})
	if err != nil {
		t.Fatalf("clear: %v", err)
	}
	if len(lines) != 0 {
		t.Fatalf("after clear = %d lines, want 0", len(lines))
	}
}

func TestSetDeliveryLines_Validation(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	batch := f.newShipping(t, "")
	d := f.newDelivery(t, batch, "PENDING")
	p := f.newProduct(t, "Thing", 1)

	cases := map[string]struct {
		in   []lineInput
		want error
	}{
		"zero quantity":   {[]lineInput{{ProductID: p, Quantity: 0}}, errBadLine},
		"negative price":  {[]lineInput{{ProductID: p, Quantity: 1, UnitPrice: ptrF64(-1)}}, errBadLine},
		"empty product":   {[]lineInput{{ProductID: "", Quantity: 1}}, errBadLine},
		"unknown product": {[]lineInput{{ProductID: "00000000-0000-0000-0000-0000000009ff", Quantity: 1}}, errNotFound},
	}
	for name, c := range cases {
		if _, err := f.repo.SetDeliveryLines(ctx, f.companyID, d, c.in); !errors.Is(err, c.want) {
			t.Errorf("%s: err = %v, want %v", name, err, c.want)
		}
	}

	if _, err := f.repo.SetDeliveryLines(ctx, f.companyID, 999999999, []lineInput{
		{ProductID: p, Quantity: 1},
	}); !errors.Is(err, errNotFound) {
		t.Errorf("unknown delivery: err = %v, want errNotFound", err)
	}
}

func TestSetDeliveryLines_ShippingRollup(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	const day = "2027-03-15"
	batch := f.newShipping(t, day)
	d1 := f.newDelivery(t, batch, "PENDING")
	d2 := f.newDelivery(t, batch, "PENDING")
	a := f.newProduct(t, "A", 10)
	b := f.newProduct(t, "B", 2.5)

	if _, err := f.repo.SetDeliveryLines(ctx, f.companyID, d1, []lineInput{
		{ProductID: a, Quantity: 2, UnitPrice: ptrF64(10)}, // 20
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.repo.SetDeliveryLines(ctx, f.companyID, d2, []lineInput{
		{ProductID: b, Quantity: 4, UnitPrice: ptrF64(2.5)}, // 10
		{ProductID: a, Quantity: 1, UnitPrice: ptrF64(10)},  // 10
	}); err != nil {
		t.Fatal(err)
	}

	payload, err := f.repo.Home(ctx, f.companyID, day, day)
	if err != nil {
		t.Fatalf("home: %v", err)
	}
	if len(payload.Shippings) != 1 {
		t.Fatalf("got %d shippings, want 1", len(payload.Shippings))
	}
	s := payload.Shippings[0]
	if s.ItemCount != 3 {
		t.Fatalf("shipping ItemCount = %d, want 3", s.ItemCount)
	}
	if s.ItemTotal != 40 {
		t.Fatalf("shipping ItemTotal = %v, want 40", s.ItemTotal)
	}
}

func TestSetDeliveryLines_CrossCompany(t *testing.T) {
	f := newFixture(t)
	other := newFixture(t)
	ctx := context.Background()
	batch := other.newShipping(t, "")
	d := other.newDelivery(t, batch, "PENDING")
	p := other.newProduct(t, "Theirs", 1)

	if _, err := f.repo.SetDeliveryLines(ctx, f.companyID, d, []lineInput{
		{ProductID: p, Quantity: 1},
	}); !errors.Is(err, errNotFound) {
		t.Fatalf("cross-company set: err = %v, want errNotFound", err)
	}
}
