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

	// Soft delete: gone from the default list, still there with all=1.
	if err := f.repo.DeleteProduct(ctx, f.companyID, created.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	active, _ := f.repo.Products(ctx, f.companyID, false)
	if len(active) != 0 {
		t.Fatalf("active list after delete = %+v, want empty", active)
	}
	all, _ := f.repo.Products(ctx, f.companyID, true)
	if len(all) != 1 || all[0].IsActive {
		t.Fatalf("all list after delete = %+v, want one inactive", all)
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
