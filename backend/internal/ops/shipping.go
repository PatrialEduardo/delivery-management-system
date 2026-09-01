package ops

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/PatrialEduardo/delivery-management-system/backend/internal/httpx"
)

const dateLayout = "2006-01-02"

// scanner is satisfied by both pgx.Row and pgx.Rows.
type scanner interface{ Scan(dest ...any) error }

const deliveryCols = `
	d.delivery_id, d.delivery_order,
	d.customer_id, c.full_name,
	d.address_id, a.street, a.number, a.district, a.city, a.state,
	d.delivery_status_id, s.status_code, s.status_name, s.color_hex,
	d.attempt_number, d.notes`

const deliveryJoins = `
	FROM delivery d
	JOIN customer c ON c.customer_id = d.customer_id
	JOIN address a ON a.address_id = d.address_id
	JOIN delivery_status s ON s.delivery_status_id = d.delivery_status_id`

func scanDelivery(s scanner) (Delivery, error) {
	var d Delivery
	var street, city, state string
	var number, district *string
	if err := s.Scan(
		&d.ID, &d.Order,
		&d.CustomerID, &d.CustomerName,
		&d.AddressID, &street, &number, &district, &city, &state,
		&d.StatusID, &d.StatusCode, &d.StatusName, &d.StatusColor,
		&d.AttemptNumber, &d.Notes,
	); err != nil {
		return d, err
	}
	d.AddressLine = addressLine(street, number, district, city, state)
	return d, nil
}

// normalizeDate returns a canonical YYYY-MM-DD string. Empty input means
// today (UTC — the container's clock and Postgres CURRENT_DATE agree on
// UTC). Every SQL comparison casts the param with $n::date so there is no
// timezone in play.
func normalizeDate(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return time.Now().UTC().Format(dateLayout), nil
	}
	t, err := time.Parse(dateLayout, raw)
	if err != nil {
		return "", err
	}
	return t.Format(dateLayout), nil
}

// ---------------------------------------------------------------------
// GET /shippings?date=YYYY-MM-DD
// ---------------------------------------------------------------------

func (r *Repository) Home(ctx context.Context, companyID, day string) (*HomePayload, error) {
	shippings, err := r.shippingsForDay(ctx, companyID, day)
	if err != nil {
		return nil, err
	}
	summary, err := r.statusSummary(ctx, companyID, day)
	if err != nil {
		return nil, err
	}
	return &HomePayload{Date: day, Shippings: shippings, StatusSummary: summary}, nil
}

func (r *Repository) shippingsForDay(ctx context.Context, companyID, day string) ([]Shipping, error) {
	const shipQ = `
		SELECT b.delivery_batch_id, b.batch_code, b.delivery_date,
		       b.driver_user_id, u.full_name, b.notes
		FROM delivery_batch b
		JOIN app_user u ON u.user_id = b.driver_user_id
		WHERE b.company_id = $1 AND b.delivery_date = $2::date
		ORDER BY b.batch_code`

	rows, err := r.db.Query(ctx, shipQ, companyID, day)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	order := []int64{}
	byID := map[int64]*Shipping{}
	for rows.Next() {
		var (
			s    Shipping
			date time.Time
		)
		if err := rows.Scan(&s.ID, &s.BatchCode, &date, &s.DriverUserID, &s.DriverName, &s.Notes); err != nil {
			return nil, err
		}
		s.DeliveryDate = date.Format(dateLayout)
		s.Deliveries = []Delivery{}
		byID[s.ID] = &s
		order = append(order, s.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(order) == 0 {
		return []Shipping{}, nil
	}

	const delQ = `
		SELECT d.delivery_batch_id,` + deliveryCols + deliveryJoins + `
		JOIN delivery_batch b ON b.delivery_batch_id = d.delivery_batch_id
		WHERE d.company_id = $1 AND b.delivery_date = $2::date
		ORDER BY d.delivery_batch_id, d.delivery_order, d.delivery_id`

	drows, err := r.db.Query(ctx, delQ, companyID, day)
	if err != nil {
		return nil, err
	}
	defer drows.Close()

	for drows.Next() {
		var batchID int64
		var street, city, state string
		var number, district *string
		var d Delivery
		if err := drows.Scan(
			&batchID,
			&d.ID, &d.Order,
			&d.CustomerID, &d.CustomerName,
			&d.AddressID, &street, &number, &district, &city, &state,
			&d.StatusID, &d.StatusCode, &d.StatusName, &d.StatusColor,
			&d.AttemptNumber, &d.Notes,
		); err != nil {
			return nil, err
		}
		d.AddressLine = addressLine(street, number, district, city, state)
		if s, ok := byID[batchID]; ok {
			s.Deliveries = append(s.Deliveries, d)
		}
	}
	if err := drows.Err(); err != nil {
		return nil, err
	}

	out := make([]Shipping, 0, len(order))
	for _, id := range order {
		out = append(out, *byID[id])
	}
	return out, nil
}

func (r *Repository) statusSummary(ctx context.Context, companyID, day string) ([]StatusCount, error) {
	const q = `
		SELECT s.delivery_status_id, s.status_code, s.status_name, s.color_hex,
		       count(d.delivery_id)
		FROM delivery_status s
		LEFT JOIN delivery d
		  ON d.delivery_status_id = s.delivery_status_id
		 AND d.company_id = $1
		 AND d.delivery_batch_id IN (
		       SELECT delivery_batch_id FROM delivery_batch
		       WHERE company_id = $1 AND delivery_date = $2::date
		     )
		WHERE s.is_active
		GROUP BY s.delivery_status_id, s.status_code, s.status_name, s.color_hex, s.display_order
		ORDER BY s.display_order`

	rows, err := r.db.Query(ctx, q, companyID, day)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []StatusCount{}
	for rows.Next() {
		var c StatusCount
		if err := rows.Scan(&c.StatusID, &c.Code, &c.Name, &c.ColorHex, &c.Count); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (h *Handler) listShippings(w http.ResponseWriter, r *http.Request) {
	cid, ok := requireCompany(w, r)
	if !ok {
		return
	}
	day, err := normalizeDate(r.URL.Query().Get("date"))
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "date must be YYYY-MM-DD")
		return
	}
	payload, err := h.repo.Home(r.Context(), cid, day)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "could not load shippings")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, payload)
}

// ---------------------------------------------------------------------
// POST /shippings
// ---------------------------------------------------------------------

func (r *Repository) driverInCompany(ctx context.Context, companyID, driverID string) (bool, error) {
	var ok bool
	err := r.db.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM app_user u
			JOIN role rl ON rl.role_id = u.role_id
			WHERE u.user_id = $1 AND u.company_id = $2
			  AND u.is_active AND rl.role_name = 'Driver'
		)`, driverID, companyID).Scan(&ok)
	return ok, err
}

func (r *Repository) CreateShipping(ctx context.Context, companyID, day string, in createShippingReq) (*Shipping, error) {
	var (
		id   int64
		code string
	)
	for attempt := 0; attempt < 4; attempt++ {
		if err := r.db.QueryRow(ctx, `
			SELECT 'SHP-' || lpad((count(*) + 1)::text, 4, '0')
			FROM delivery_batch WHERE company_id = $1`, companyID).Scan(&code); err != nil {
			return nil, err
		}

		err := r.db.QueryRow(ctx, `
			INSERT INTO delivery_batch (company_id, driver_user_id, batch_code, delivery_date, notes)
			VALUES ($1, $2, $3, $4::date, $5)
			RETURNING delivery_batch_id`,
			companyID, in.DriverUserID, code, day, in.Notes,
		).Scan(&id)

		if err == nil {
			break
		}
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			continue // batch_code raced; recompute and retry
		}
		return nil, err
	}
	if id == 0 {
		return nil, errors.New("could not allocate a batch code")
	}

	var driverName string
	if err := r.db.QueryRow(ctx,
		`SELECT full_name FROM app_user WHERE user_id = $1`, in.DriverUserID,
	).Scan(&driverName); err != nil {
		return nil, err
	}

	return &Shipping{
		ID:           id,
		BatchCode:    code,
		DeliveryDate: day,
		DriverUserID: in.DriverUserID,
		DriverName:   driverName,
		Notes:        in.Notes,
		Deliveries:   []Delivery{},
	}, nil
}

func (h *Handler) createShipping(w http.ResponseWriter, r *http.Request) {
	cid, ok := requireCompany(w, r)
	if !ok {
		return
	}
	var body createShippingReq
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(body.DriverUserID) == "" {
		httpx.WriteError(w, http.StatusBadRequest, "driverUserId is required")
		return
	}
	day, err := normalizeDate(body.DeliveryDate)
	if err != nil || strings.TrimSpace(body.DeliveryDate) == "" {
		httpx.WriteError(w, http.StatusBadRequest, "deliveryDate must be YYYY-MM-DD")
		return
	}

	okDriver, err := h.repo.driverInCompany(r.Context(), cid, body.DriverUserID)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "could not validate driver")
		return
	}
	if !okDriver {
		httpx.WriteError(w, http.StatusBadRequest, "that driver isn't in your company")
		return
	}

	s, err := h.repo.CreateShipping(r.Context(), cid, day, body)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "could not create shipping")
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, s)
}

// ---------------------------------------------------------------------
// POST /shippings/{shippingID}/deliveries   (quick add)
// ---------------------------------------------------------------------

type shippingCore struct {
	ID       int64
	DriverID string
	Date     time.Time
}

func (r *Repository) loadShipping(ctx context.Context, companyID string, id int64) (shippingCore, error) {
	var c shippingCore
	err := r.db.QueryRow(ctx, `
		SELECT delivery_batch_id, driver_user_id, delivery_date
		FROM delivery_batch WHERE delivery_batch_id = $1 AND company_id = $2`,
		id, companyID,
	).Scan(&c.ID, &c.DriverID, &c.Date)
	if errors.Is(err, pgx.ErrNoRows) {
		return c, errNotFound
	}
	return c, err
}

func (r *Repository) QuickAddDelivery(ctx context.Context, companyID string, shippingID int64, in quickDeliveryReq) (*Delivery, error) {
	ship, err := r.loadShipping(ctx, companyID, shippingID)
	if err != nil {
		return nil, err
	}

	var addrOK bool
	if err := r.db.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM address a
			JOIN customer c ON c.customer_id = a.customer_id
			WHERE a.address_id = $1 AND c.customer_id = $2 AND c.company_id = $3
		)`, in.AddressID, in.CustomerID, companyID).Scan(&addrOK); err != nil {
		return nil, err
	}
	if !addrOK {
		return nil, errNotFound
	}

	var newID int64
	if err := r.db.QueryRow(ctx, `
		INSERT INTO delivery
		  (company_id, delivery_batch_id, customer_id, address_id, driver_user_id,
		   delivery_status_id, delivery_order, attempt_number)
		VALUES (
		  $1, $2, $3, $4, $5,
		  (SELECT delivery_status_id FROM delivery_status WHERE status_code = 'PENDING'),
		  (SELECT COALESCE(MAX(delivery_order), 0) + 1 FROM delivery WHERE delivery_batch_id = $2),
		  1
		)
		RETURNING delivery_id`,
		companyID, shippingID, in.CustomerID, in.AddressID, ship.DriverID,
	).Scan(&newID); err != nil {
		return nil, err
	}

	return r.deliveryByID(ctx, companyID, newID)
}

func (r *Repository) deliveryByID(ctx context.Context, companyID string, id int64) (*Delivery, error) {
	row := r.db.QueryRow(ctx,
		`SELECT `+deliveryCols+deliveryJoins+`
		 WHERE d.delivery_id = $1 AND d.company_id = $2`, id, companyID)
	d, err := scanDelivery(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errNotFound
	}
	if err != nil {
		return nil, err
	}
	return &d, nil
}

func (h *Handler) quickAddDelivery(w http.ResponseWriter, r *http.Request) {
	cid, ok := requireCompany(w, r)
	if !ok {
		return
	}
	shippingID, err := strconv.ParseInt(chiURLParam(r, "shippingID"), 10, 64)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "bad shipping id")
		return
	}
	var body quickDeliveryReq
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(body.CustomerID) == "" || strings.TrimSpace(body.AddressID) == "" {
		httpx.WriteError(w, http.StatusBadRequest, "customerId and addressId are required")
		return
	}

	d, err := h.repo.QuickAddDelivery(r.Context(), cid, shippingID, body)
	if errors.Is(err, errNotFound) {
		httpx.WriteError(w, http.StatusNotFound, "shipping, customer or address not found")
		return
	}
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "could not add delivery")
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, d)
}

// ---------------------------------------------------------------------
// POST /shippings/{shippingID}/deliveries/{deliveryID}/link
// ---------------------------------------------------------------------

var (
	errDateMismatch  = errors.New("delivery date does not match this shipping")
	errAlreadyLinked = errors.New("delivery is already in this shipping")
)

func (r *Repository) LinkDelivery(ctx context.Context, companyID string, shippingID, deliveryID int64) (*Delivery, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var (
		targetDriver string
		targetDate   time.Time
	)
	err = tx.QueryRow(ctx, `
		SELECT driver_user_id, delivery_date FROM delivery_batch
		WHERE delivery_batch_id = $1 AND company_id = $2`, shippingID, companyID,
	).Scan(&targetDriver, &targetDate)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errNotFound
	}
	if err != nil {
		return nil, err
	}

	var (
		sourceBatch int64
		sourceDate  time.Time
	)
	err = tx.QueryRow(ctx, `
		SELECT d.delivery_batch_id, b.delivery_date
		FROM delivery d
		JOIN delivery_batch b ON b.delivery_batch_id = d.delivery_batch_id
		WHERE d.delivery_id = $1 AND d.company_id = $2`, deliveryID, companyID,
	).Scan(&sourceBatch, &sourceDate)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errNotFound
	}
	if err != nil {
		return nil, err
	}

	if sourceBatch == shippingID {
		return nil, errAlreadyLinked
	}
	if !sourceDate.Equal(targetDate) {
		return nil, errDateMismatch
	}

	if _, err := tx.Exec(ctx, `
		UPDATE delivery SET
		  delivery_batch_id = $1,
		  driver_user_id    = $2,
		  delivery_order    = (SELECT COALESCE(MAX(delivery_order), 0) + 1
		                       FROM delivery WHERE delivery_batch_id = $1)
		WHERE delivery_id = $3`, shippingID, targetDriver, deliveryID); err != nil {
		return nil, err
	}

	// Close the gap left in the source shipping.
	if _, err := tx.Exec(ctx, `
		WITH ranked AS (
			SELECT delivery_id, row_number() OVER (ORDER BY delivery_order, delivery_id) AS rn
			FROM delivery WHERE delivery_batch_id = $1
		)
		UPDATE delivery d SET delivery_order = ranked.rn
		FROM ranked WHERE d.delivery_id = ranked.delivery_id`, sourceBatch); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return r.deliveryByID(ctx, companyID, deliveryID)
}

func (h *Handler) linkDelivery(w http.ResponseWriter, r *http.Request) {
	cid, ok := requireCompany(w, r)
	if !ok {
		return
	}
	shippingID, err1 := strconv.ParseInt(chiURLParam(r, "shippingID"), 10, 64)
	deliveryID, err2 := strconv.ParseInt(chiURLParam(r, "deliveryID"), 10, 64)
	if err1 != nil || err2 != nil {
		httpx.WriteError(w, http.StatusBadRequest, "bad id")
		return
	}

	d, err := h.repo.LinkDelivery(r.Context(), cid, shippingID, deliveryID)
	switch {
	case errors.Is(err, errNotFound):
		httpx.WriteError(w, http.StatusNotFound, "shipping or delivery not found")
	case errors.Is(err, errAlreadyLinked):
		httpx.WriteError(w, http.StatusConflict, "that delivery is already in this shipping")
	case errors.Is(err, errDateMismatch):
		httpx.WriteError(w, http.StatusUnprocessableEntity, "that delivery is for a different day")
	case err != nil:
		httpx.WriteError(w, http.StatusInternalServerError, "could not link delivery")
	default:
		httpx.WriteJSON(w, http.StatusOK, d)
	}
}

// ---------------------------------------------------------------------
// PATCH /shippings/{shippingID}/deliveries/order
// ---------------------------------------------------------------------

var errOrderSetMismatch = errors.New("deliveryIds must be exactly the deliveries in this shipping")

func (r *Repository) Reorder(ctx context.Context, companyID string, shippingID int64, ids []int64) ([]Delivery, error) {
	if _, err := r.loadShipping(ctx, companyID, shippingID); err != nil {
		return nil, err
	}

	rows, err := r.db.Query(ctx,
		`SELECT delivery_id FROM delivery WHERE delivery_batch_id = $1`, shippingID)
	if err != nil {
		return nil, err
	}
	current := map[int64]bool{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return nil, err
		}
		current[id] = true
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if len(ids) != len(current) {
		return nil, errOrderSetMismatch
	}
	seen := map[int64]bool{}
	for _, id := range ids {
		if !current[id] || seen[id] {
			return nil, errOrderSetMismatch
		}
		seen[id] = true
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	for pos, id := range ids {
		if _, err := tx.Exec(ctx,
			`UPDATE delivery SET delivery_order = $1 WHERE delivery_id = $2 AND delivery_batch_id = $3`,
			pos+1, id, shippingID); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	drows, err := r.db.Query(ctx,
		`SELECT `+deliveryCols+deliveryJoins+`
		 WHERE d.delivery_batch_id = $1 AND d.company_id = $2
		 ORDER BY d.delivery_order, d.delivery_id`, shippingID, companyID)
	if err != nil {
		return nil, err
	}
	defer drows.Close()

	out := []Delivery{}
	for drows.Next() {
		d, err := scanDelivery(drows)
		if err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, drows.Err()
}

func (h *Handler) reorderDeliveries(w http.ResponseWriter, r *http.Request) {
	cid, ok := requireCompany(w, r)
	if !ok {
		return
	}
	shippingID, err := strconv.ParseInt(chiURLParam(r, "shippingID"), 10, 64)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "bad shipping id")
		return
	}
	var body reorderReq
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(body.DeliveryIDs) == 0 {
		httpx.WriteError(w, http.StatusBadRequest, "deliveryIds is required")
		return
	}

	list, err := h.repo.Reorder(r.Context(), cid, shippingID, body.DeliveryIDs)
	switch {
	case errors.Is(err, errNotFound):
		httpx.WriteError(w, http.StatusNotFound, "shipping not found")
	case errors.Is(err, errOrderSetMismatch):
		httpx.WriteError(w, http.StatusUnprocessableEntity, errOrderSetMismatch.Error())
	case err != nil:
		httpx.WriteError(w, http.StatusInternalServerError, "could not reorder")
	default:
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"deliveries": list})
	}
}

// ---------------------------------------------------------------------
// GET /deliveries?date=YYYY-MM-DD&excludeShipping=ID   (link picker)
// ---------------------------------------------------------------------

func (r *Repository) LinkableDeliveries(ctx context.Context, companyID, day string, excludeShipping int64) ([]LinkableDelivery, error) {
	const q = `
		SELECT d.delivery_id, c.full_name,
		       a.street, a.number, a.district, a.city, a.state,
		       s.status_code, s.status_name, s.color_hex,
		       b.delivery_batch_id, b.batch_code
		FROM delivery d
		JOIN delivery_batch b ON b.delivery_batch_id = d.delivery_batch_id
		JOIN customer c ON c.customer_id = d.customer_id
		JOIN address a ON a.address_id = d.address_id
		JOIN delivery_status s ON s.delivery_status_id = d.delivery_status_id
		WHERE d.company_id = $1
		  AND b.delivery_date = $2::date
		  AND ($3 = 0 OR b.delivery_batch_id <> $3)
		ORDER BY b.batch_code, d.delivery_order, d.delivery_id`

	rows, err := r.db.Query(ctx, q, companyID, day, excludeShipping)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []LinkableDelivery{}
	for rows.Next() {
		var (
			ld                  LinkableDelivery
			street, city, state string
			number, district    *string
		)
		if err := rows.Scan(
			&ld.ID, &ld.CustomerName,
			&street, &number, &district, &city, &state,
			&ld.StatusCode, &ld.StatusName, &ld.StatusColor,
			&ld.ShippingID, &ld.BatchCode,
		); err != nil {
			return nil, err
		}
		ld.AddressLine = addressLine(street, number, district, city, state)
		out = append(out, ld)
	}
	return out, rows.Err()
}

func (h *Handler) listLinkableDeliveries(w http.ResponseWriter, r *http.Request) {
	cid, ok := requireCompany(w, r)
	if !ok {
		return
	}
	day, err := normalizeDate(r.URL.Query().Get("date"))
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "date must be YYYY-MM-DD")
		return
	}
	var exclude int64
	if raw := strings.TrimSpace(r.URL.Query().Get("excludeShipping")); raw != "" {
		if exclude, err = strconv.ParseInt(raw, 10, 64); err != nil {
			httpx.WriteError(w, http.StatusBadRequest, "excludeShipping must be a number")
			return
		}
	}

	list, err := h.repo.LinkableDeliveries(r.Context(), cid, day, exclude)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "could not load deliveries")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, list)
}
