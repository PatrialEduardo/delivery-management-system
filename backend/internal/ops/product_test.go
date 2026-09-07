package ops

import (
	"context"
	"errors"
	"testing"
)

func ptrStr(s string) *string   { return &s }
func ptrF64(f float64) *float64 { return &f }

func TestProduct_CRUDLifecycle(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()

	created, err := f.repo.CreateProduct(ctx, f.companyID, createProductReq{
		Name:  "  Água 20L  ",
		SKU:   ptrStr("AGU-20"),
		Unit:  ptrStr("UN"),
		Price: ptrF64(12.5),
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if created.Name != "Água 20L" {
		t.Fatalf("name = %q, want trimmed %q", created.Name, "Água 20L")
	}
	if created.Price == nil || *created.Price != 12.5 {
		t.Fatalf("price = %v, want 12.5", created.Price)
	}
	if !created.IsActive {
		t.Fatalf("new product should be active")
	}

	list, err := f.repo.Products(ctx, f.companyID, false)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(list) != 1 || list[0].ID != created.ID {
		t.Fatalf("list = %+v, want just the created product", list)
	}

	updated, err := f.repo.UpdateProduct(ctx, f.companyID, created.ID, updateProductReq{
		Name:     "Galão 20L",
		SKU:      ptrStr("AGU-20"),
		Unit:     ptrStr("UN"),
		Price:    ptrF64(13),
		IsActive: true,
	})
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if updated.Name != "Galão 20L" || updated.Price == nil || *updated.Price != 13 {
		t.Fatalf("after update = %+v", updated)
	}

	// Blank SKU should collapse to NULL.
	blanked, err := f.repo.UpdateProduct(ctx, f.companyID, created.ID, updateProductReq{
		Name: "Galão 20L", SKU: ptrStr("   "), IsActive: true,
	})
	if err != nil {
		t.Fatalf("update blank sku: %v", err)
	}
	if blanked.SKU != nil {
		t.Fatalf("sku = %v, want nil after blank", *blanked.SKU)
	}

	// With no line items, delete removes the product outright.
	if err := f.repo.DeleteProduct(ctx, f.companyID, created.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	all, _ := f.repo.Products(ctx, f.companyID, true)
	if len(all) != 0 {
		t.Fatalf("all list after hard delete = %+v, want empty", all)
	}
}

// TestProduct_LockedAfterActivity pins the "used product" rules: identity
// fields freeze, price stays editable, and delete downgrades to deactivate.
func TestProduct_LockedAfterActivity(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()

	p, err := f.repo.CreateProduct(ctx, f.companyID, createProductReq{
		Name: "Water 20L", SKU: ptrStr("W20"), Unit: ptrStr("UN"), Price: ptrF64(10),
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	batch := f.newShipping(t, "")
	d := f.newDelivery(t, batch, "PENDING")
	if _, err := f.repo.SetDeliveryLines(ctx, f.companyID, d, []lineInput{
		{ProductID: p.ID, Quantity: 1, UnitPrice: ptrF64(10)},
	}); err != nil {
		t.Fatalf("set lines: %v", err)
	}

	reloaded, _ := f.repo.Products(ctx, f.companyID, true)
	if len(reloaded) != 1 || !reloaded[0].HasActivity {
		t.Fatalf("want product flagged HasActivity, got %+v", reloaded)
	}

	// Renaming (or changing SKU/unit) is refused.
	if _, err := f.repo.UpdateProduct(ctx, f.companyID, p.ID, updateProductReq{
		Name: "Renamed", SKU: ptrStr("W20"), Unit: ptrStr("UN"), Price: ptrF64(10), IsActive: true,
	}); !errors.Is(err, errProductFieldsLocked) {
		t.Fatalf("rename err = %v, want errProductFieldsLocked", err)
	}

	// A price change with the identity fields untouched is allowed.
	upd, err := f.repo.UpdateProduct(ctx, f.companyID, p.ID, updateProductReq{
		Name: "Water 20L", SKU: ptrStr("W20"), Unit: ptrStr("UN"), Price: ptrF64(12), IsActive: true,
	})
	if err != nil {
		t.Fatalf("price update: %v", err)
	}
	if upd.Price == nil || *upd.Price != 12 {
		t.Fatalf("price = %v, want 12", upd.Price)
	}

	// Hard delete is refused for a used product.
	if err := f.repo.DeleteProduct(ctx, f.companyID, p.ID); !errors.Is(err, errProductHasActivity) {
		t.Fatalf("delete err = %v, want errProductHasActivity", err)
	}
}

func TestProduct_ScopedToCompany(t *testing.T) {
	f := newFixture(t)
	other := newFixture(t)
	ctx := context.Background()

	p, err := other.repo.CreateProduct(ctx, other.companyID, createProductReq{Name: "Not yours"})
	if err != nil {
		t.Fatalf("create in other company: %v", err)
	}

	list, _ := f.repo.Products(ctx, f.companyID, true)
	if len(list) != 0 {
		t.Fatalf("f sees other company's products: %+v", list)
	}

	if _, err := f.repo.UpdateProduct(ctx, f.companyID, p.ID, updateProductReq{Name: "hijack", IsActive: true}); !errors.Is(err, errNotFound) {
		t.Fatalf("cross-company update err = %v, want errNotFound", err)
	}
	if err := f.repo.DeleteProduct(ctx, f.companyID, p.ID); !errors.Is(err, errNotFound) {
		t.Fatalf("cross-company delete err = %v, want errNotFound", err)
	}
}
