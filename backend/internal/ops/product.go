package ops

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/PatrialEduardo/delivery-management-system/backend/internal/httpx"
)

const productCols = `product_id, product_name, sku, unit, price::float8, is_active`

func scanProduct(s scanner) (Product, error) {
	var p Product
	err := s.Scan(&p.ID, &p.Name, &p.SKU, &p.Unit, &p.Price, &p.IsActive)
	return p, err
}

// Products lists a company's catalogue. Active only unless includeInactive.
func (r *Repository) Products(ctx context.Context, companyID string, includeInactive bool) ([]Product, error) {
	q := `SELECT ` + productCols + ` FROM product WHERE company_id = $1`
	if !includeInactive {
		q += ` AND is_active`
	}
	q += ` ORDER BY is_active DESC, product_name`

	rows, err := r.db.Query(ctx, q, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Product{}
	for rows.Next() {
		p, err := scanProduct(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *Repository) productByID(ctx context.Context, companyID, id string) (*Product, error) {
	row := r.db.QueryRow(ctx,
		`SELECT `+productCols+` FROM product WHERE product_id = $1 AND company_id = $2`, id, companyID)
	p, err := scanProduct(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errNotFound
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *Repository) CreateProduct(ctx context.Context, companyID string, in createProductReq) (*Product, error) {
	var id string
	err := r.db.QueryRow(ctx, `
		INSERT INTO product (company_id, product_name, sku, unit, price)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING product_id`,
		companyID, strings.TrimSpace(in.Name), trimPtr(in.SKU), trimPtr(in.Unit), in.Price,
	).Scan(&id)
	if err != nil {
		return nil, err
	}
	return r.productByID(ctx, companyID, id)
}

func (r *Repository) UpdateProduct(ctx context.Context, companyID, id string, in updateProductReq) (*Product, error) {
	tag, err := r.db.Exec(ctx, `
		UPDATE product SET
		  product_name = $3, sku = $4, unit = $5, price = $6, is_active = $7,
		  updated_at = now()
		WHERE product_id = $1 AND company_id = $2`,
		id, companyID, strings.TrimSpace(in.Name), trimPtr(in.SKU), trimPtr(in.Unit), in.Price, in.IsActive)
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() == 0 {
		return nil, errNotFound
	}
	return r.productByID(ctx, companyID, id)
}

// DeleteProduct is a soft delete — product rows are referenced by
// delivery_product, so they are deactivated, not removed.
func (r *Repository) DeleteProduct(ctx context.Context, companyID, id string) error {
	tag, err := r.db.Exec(ctx,
		`UPDATE product SET is_active = false, updated_at = now()
		 WHERE product_id = $1 AND company_id = $2`, id, companyID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errNotFound
	}
	return nil
}

// trimPtr trims a *string, collapsing "" (or all-whitespace) to nil.
func trimPtr(s *string) *string {
	if s == nil {
		return nil
	}
	t := strings.TrimSpace(*s)
	if t == "" {
		return nil
	}
	return &t
}

// ---------------------------------------------------------------------
// handlers
// ---------------------------------------------------------------------

func (h *Handler) listProducts(w http.ResponseWriter, r *http.Request) {
	cid, ok := requireCompany(w, r)
	if !ok {
		return
	}
	includeInactive := r.URL.Query().Get("all") == "1"
	list, err := h.repo.Products(r.Context(), cid, includeInactive)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "could not load products")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, list)
}

func (h *Handler) createProduct(w http.ResponseWriter, r *http.Request) {
	cid, ok := requireCompany(w, r)
	if !ok {
		return
	}
	var body createProductReq
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(body.Name) == "" {
		httpx.WriteError(w, http.StatusBadRequest, "name is required")
		return
	}
	if body.Price != nil && *body.Price < 0 {
		httpx.WriteError(w, http.StatusBadRequest, "price cannot be negative")
		return
	}
	p, err := h.repo.CreateProduct(r.Context(), cid, body)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "could not create product")
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, p)
}

func (h *Handler) updateProduct(w http.ResponseWriter, r *http.Request) {
	cid, ok := requireCompany(w, r)
	if !ok {
		return
	}
	id := chiURLParam(r, "productID")
	var body updateProductReq
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(body.Name) == "" {
		httpx.WriteError(w, http.StatusBadRequest, "name is required")
		return
	}
	if body.Price != nil && *body.Price < 0 {
		httpx.WriteError(w, http.StatusBadRequest, "price cannot be negative")
		return
	}
	p, err := h.repo.UpdateProduct(r.Context(), cid, id, body)
	switch {
	case errors.Is(err, errNotFound):
		httpx.WriteError(w, http.StatusNotFound, "product not found")
	case err != nil:
		httpx.WriteError(w, http.StatusInternalServerError, "could not update product")
	default:
		httpx.WriteJSON(w, http.StatusOK, p)
	}
}

func (h *Handler) deleteProduct(w http.ResponseWriter, r *http.Request) {
	cid, ok := requireCompany(w, r)
	if !ok {
		return
	}
	err := h.repo.DeleteProduct(r.Context(), cid, chiURLParam(r, "productID"))
	switch {
	case errors.Is(err, errNotFound):
		httpx.WriteError(w, http.StatusNotFound, "product not found")
	case err != nil:
		httpx.WriteError(w, http.StatusInternalServerError, "could not delete product")
	default:
		httpx.WriteJSON(w, http.StatusNoContent, nil)
	}
}
