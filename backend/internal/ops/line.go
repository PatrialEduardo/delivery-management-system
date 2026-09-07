package ops

import (
	"context"
	"errors"
	"math"
	"net/http"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/PatrialEduardo/delivery-management-system/backend/internal/httpx"
)

var (
	errBadLine        = errors.New("each line needs a product and a quantity greater than 0")
	errDeliveryLocked = errors.New("this delivery has started — its items can no longer be changed")
)

const lineCols = `
	dp.delivery_product_id, dp.product_id, p.product_name, p.sku, p.unit,
	dp.quantity::float8, dp.unit_price::float8, dp.notes`

func scanLine(s scanner) (int64, DeliveryLine, error) {
	var (
		deliveryID int64
		l          DeliveryLine
	)
	err := s.Scan(&deliveryID, &l.ID, &l.ProductID, &l.ProductName, &l.SKU, &l.Unit,
		&l.Quantity, &l.UnitPrice, &l.Notes)
	return deliveryID, l, err
}

func round2(f float64) float64 { return math.Round(f*100) / 100 }

func lineTotal(lines []DeliveryLine) float64 {
	var t float64
	for _, l := range lines {
		if l.UnitPrice != nil {
			t += l.Quantity * *l.UnitPrice
		}
	}
	return round2(t)
}

// attachLines fills Products/ItemCount/ItemTotal on every delivery in the
// slice with one query. Deliveries with no lines get an empty slice, not
// null. Mutates in place.
func (r *Repository) attachLines(ctx context.Context, companyID string, deliveries []Delivery) error {
	for i := range deliveries {
		deliveries[i].Products = []DeliveryLine{}
	}
	if len(deliveries) == 0 {
		return nil
	}
	ids := make([]int64, len(deliveries))
	for i := range deliveries {
		ids[i] = deliveries[i].ID
	}

	rows, err := r.db.Query(ctx, `
		SELECT dp.delivery_id,`+lineCols+`
		FROM delivery_product dp
		JOIN product p ON p.product_id = dp.product_id
		JOIN delivery d ON d.delivery_id = dp.delivery_id
		WHERE d.company_id = $1 AND dp.delivery_id = ANY($2)
		ORDER BY dp.delivery_id, dp.delivery_product_id`, companyID, ids)
	if err != nil {
		return err
	}
	defer rows.Close()

	byDelivery := map[int64][]DeliveryLine{}
	for rows.Next() {
		did, l, err := scanLine(rows)
		if err != nil {
			return err
		}
		byDelivery[did] = append(byDelivery[did], l)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	for i := range deliveries {
		lines := byDelivery[deliveries[i].ID]
		if lines == nil {
			lines = []DeliveryLine{}
		}
		deliveries[i].Products = lines
		deliveries[i].ItemCount = len(lines)
		deliveries[i].ItemTotal = lineTotal(lines)
	}
	return nil
}

// attachLinesOne is attachLines for a single delivery pointer.
func (r *Repository) attachLinesOne(ctx context.Context, companyID string, d *Delivery) error {
	arr := []Delivery{*d}
	if err := r.attachLines(ctx, companyID, arr); err != nil {
		return err
	}
	*d = arr[0]
	return nil
}

// rollUpShipping sums the per-delivery totals onto the shipping.
func rollUpShipping(s *Shipping) {
	s.ItemCount = 0
	var total float64
	for _, d := range s.Deliveries {
		s.ItemCount += d.ItemCount
		total += d.ItemTotal
	}
	s.ItemTotal = round2(total)
}

// linesFor returns one delivery's line items.
func (r *Repository) linesFor(ctx context.Context, companyID string, deliveryID int64) ([]DeliveryLine, error) {
	rows, err := r.db.Query(ctx, `
		SELECT dp.delivery_id,`+lineCols+`
		FROM delivery_product dp
		JOIN product p ON p.product_id = dp.product_id
		JOIN delivery d ON d.delivery_id = dp.delivery_id
		WHERE d.company_id = $1 AND dp.delivery_id = $2
		ORDER BY dp.delivery_product_id`, companyID, deliveryID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []DeliveryLine{}
	for rows.Next() {
		_, l, err := scanLine(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

// SetDeliveryLines replaces a delivery's line items wholesale.
func (r *Repository) SetDeliveryLines(ctx context.Context, companyID string, deliveryID int64, in []lineInput) ([]DeliveryLine, error) {
	// Delivery must exist in the company, and must still be pending — once a
	// driver has started (or finished) a stop its line items are frozen.
	var statusCode string
	err := r.db.QueryRow(ctx, `
		SELECT s.status_code
		FROM delivery d
		JOIN delivery_status s ON s.delivery_status_id = d.delivery_status_id
		WHERE d.delivery_id = $1 AND d.company_id = $2`,
		deliveryID, companyID).Scan(&statusCode)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errNotFound
	}
	if err != nil {
		return nil, err
	}
	if !isEditableStatus(statusCode) {
		return nil, errDeliveryLocked
	}

	clean := make([]lineInput, 0, len(in))
	for _, l := range in {
		if strings.TrimSpace(l.ProductID) == "" || l.Quantity <= 0 {
			return nil, errBadLine
		}
		if l.UnitPrice != nil && *l.UnitPrice < 0 {
			return nil, errBadLine
		}
		clean = append(clean, l)
	}

	// Every product referenced must belong to the company.
	for _, l := range clean {
		var ok bool
		if err := r.db.QueryRow(ctx,
			`SELECT EXISTS (SELECT 1 FROM product WHERE product_id = $1 AND company_id = $2)`,
			l.ProductID, companyID).Scan(&ok); err != nil {
			return nil, err
		}
		if !ok {
			return nil, errNotFound
		}
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	setAuditUser(ctx, tx)

	if _, err := tx.Exec(ctx,
		`DELETE FROM delivery_product WHERE delivery_id = $1`, deliveryID); err != nil {
		return nil, err
	}
	for _, l := range clean {
		if _, err := tx.Exec(ctx, `
			INSERT INTO delivery_product (delivery_id, product_id, quantity, unit_price, notes)
			VALUES ($1, $2, $3, $4, $5)`,
			deliveryID, l.ProductID, l.Quantity, l.UnitPrice, trimPtr(l.Notes)); err != nil {
			return nil, err
		}
	}
	if _, err := tx.Exec(ctx,
		`UPDATE delivery SET updated_at = now() WHERE delivery_id = $1`, deliveryID); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return r.linesFor(ctx, companyID, deliveryID)
}

// ---------------------------------------------------------------------
// handlers
// ---------------------------------------------------------------------

func (h *Handler) getDeliveryLines(w http.ResponseWriter, r *http.Request) {
	cid, ok := requireCompany(w, r)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(chiURLParam(r, "deliveryID"), 10, 64)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "bad delivery id")
		return
	}
	lines, err := h.repo.linesFor(r.Context(), cid, id)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "could not load line items")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"lines": lines, "itemCount": len(lines), "itemTotal": lineTotal(lines),
	})
}

func (h *Handler) putDeliveryLines(w http.ResponseWriter, r *http.Request) {
	cid, ok := requireCompany(w, r)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(chiURLParam(r, "deliveryID"), 10, 64)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "bad delivery id")
		return
	}
	var body setLinesReq
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	lines, err := h.repo.SetDeliveryLines(r.Context(), cid, id, body.Lines)
	switch {
	case errors.Is(err, errNotFound):
		httpx.WriteError(w, http.StatusNotFound, "delivery or product not found")
	case errors.Is(err, errDeliveryLocked):
		httpx.WriteError(w, http.StatusConflict, errDeliveryLocked.Error())
	case errors.Is(err, errBadLine):
		httpx.WriteError(w, http.StatusUnprocessableEntity, errBadLine.Error())
	case err != nil:
		httpx.WriteError(w, http.StatusInternalServerError, "could not save line items")
	default:
		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"lines": lines, "itemCount": len(lines), "itemTotal": lineTotal(lines),
		})
	}
}
