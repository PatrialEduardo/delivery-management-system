package ops

import (
	"context"
	"errors"
	"math"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/PatrialEduardo/delivery-management-system/backend/internal/httpx"
)

var (
	errNotFound = errors.New("not found")

	// errCustomerNameLocked: once a customer has any delivery, their name is
	// frozen (historical paperwork must keep matching).
	errCustomerNameLocked = errors.New("this customer already has deliveries — their name can't be changed")
	// errCustomerHasActivity: a customer with deliveries can be deactivated
	// but not deleted.
	errCustomerHasActivity = errors.New("this customer already has deliveries — deactivate them instead of deleting")
	// errAddressInProgress: address edits wait until the running delivery is done.
	errAddressInProgress = errors.New("a delivery to this address is in progress — the address can only be changed once that delivery is completed")
	// errAddressInUse: an address referenced by any delivery can't be removed.
	errAddressInUse = errors.New("this address is used by a delivery and can't be removed")
)

// ---------------------------------------------------------------------
// read
// ---------------------------------------------------------------------

// Customers returns the company's customers with their addresses. A
// non-empty search filters on the customer name (case-insensitive).
// includeInactive brings deactivated customers back; withStats attaches the
// per-customer delivery roll-up used by the management screen.
func (r *Repository) Customers(ctx context.Context, companyID, search string, includeInactive, withStats bool) ([]Customer, error) {
	const q = `
		SELECT c.customer_id, c.full_name, c.phone, c.notes, c.is_active,
		       EXISTS (SELECT 1 FROM delivery d WHERE d.customer_id = c.customer_id) AS has_activity,
		       a.address_id, a.zip_code, a.street, a.number, a.district,
		       a.city, a.state, a.complement
		FROM customer c
		LEFT JOIN address a ON a.customer_id = c.customer_id
		WHERE c.company_id = $1
		  AND ($3::boolean OR c.is_active)
		  AND ($2 = '' OR c.full_name ILIKE '%' || $2 || '%')
		ORDER BY c.full_name, a.created_at`

	rows, err := r.db.Query(ctx, q, companyID, strings.TrimSpace(search), includeInactive)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	order := []string{}
	byID := map[string]*Customer{}

	for rows.Next() {
		var (
			custID, fullName           string
			phone, notes               *string
			isActive, hasActivity      bool
			addrID                     *string
			zip, street, num, district *string
			city, state, complement    *string
		)
		if err := rows.Scan(
			&custID, &fullName, &phone, &notes, &isActive, &hasActivity,
			&addrID, &zip, &street, &num, &district, &city, &state, &complement,
		); err != nil {
			return nil, err
		}

		c, seen := byID[custID]
		if !seen {
			c = &Customer{
				ID: custID, FullName: fullName, Phone: phone, Notes: notes,
				IsActive: isActive, HasActivity: hasActivity, Addresses: []Address{},
			}
			byID[custID] = c
			order = append(order, custID)
		}
		if addrID != nil {
			c.Addresses = append(c.Addresses, Address{
				ID:         *addrID,
				ZipCode:    zip,
				Street:     deref(street),
				Number:     num,
				District:   district,
				City:       deref(city),
				State:      deref(state),
				Complement: complement,
				Line:       addressLine(deref(street), num, district, deref(city), deref(state)),
			})
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	out := make([]Customer, 0, len(order))
	for _, id := range order {
		out = append(out, *byID[id])
	}

	if withStats {
		stats, err := r.customerStats(ctx, companyID)
		if err != nil {
			return nil, err
		}
		for i := range out {
			if s, ok := stats[out[i].ID]; ok {
				out[i].Stats = s
			} else {
				out[i].Stats = &CustomerStats{}
			}
		}
	}
	return out, nil
}

// customerStats builds the delivery roll-up for every customer in a company,
// keyed by customer_id.
func (r *Repository) customerStats(ctx context.Context, companyID string) (map[string]*CustomerStats, error) {
	out := map[string]*CustomerStats{}

	countRows, err := r.db.Query(ctx, `
		SELECT d.customer_id,
		       count(*)::int,
		       count(*) FILTER (WHERE s.status_code = 'DELIVERED')::int,
		       count(*) FILTER (WHERE s.status_code = 'FAILED')::int,
		       count(*) FILTER (WHERE s.status_code = 'ABSENT')::int,
		       count(*) FILTER (WHERE s.status_code = 'IN_TRANSIT')::int,
		       count(*) FILTER (WHERE s.status_code IN ('PENDING', 'ASSIGNED'))::int,
		       to_char(max(b.delivery_date), 'YYYY-MM-DD')
		FROM delivery d
		JOIN delivery_batch b ON b.delivery_batch_id = d.delivery_batch_id
		JOIN delivery_status s ON s.delivery_status_id = d.delivery_status_id
		WHERE d.company_id = $1
		GROUP BY d.customer_id`, companyID)
	if err != nil {
		return nil, err
	}
	defer countRows.Close()

	for countRows.Next() {
		var (
			id       string
			st       CustomerStats
			lastDate *string
		)
		if err := countRows.Scan(&id, &st.Total, &st.Delivered, &st.Failed, &st.Absent,
			&st.InProgress, &st.Pending, &lastDate); err != nil {
			return nil, err
		}
		st.LastDeliveryDate = lastDate
		finished := st.Delivered + st.Failed + st.Absent
		if finished > 0 {
			st.SuccessRate = math.Round(float64(st.Delivered)/float64(finished)*1000) / 10
		}
		s := st
		out[id] = &s
	}
	if err := countRows.Err(); err != nil {
		return nil, err
	}

	valRows, err := r.db.Query(ctx, `
		SELECT d.customer_id, COALESCE(SUM(dp.quantity * dp.unit_price), 0)::float8
		FROM delivery d
		JOIN delivery_status s ON s.delivery_status_id = d.delivery_status_id
		JOIN delivery_product dp ON dp.delivery_id = d.delivery_id
		WHERE d.company_id = $1 AND s.status_code = 'DELIVERED'
		GROUP BY d.customer_id`, companyID)
	if err != nil {
		return nil, err
	}
	defer valRows.Close()

	for valRows.Next() {
		var (
			id  string
			val float64
		)
		if err := valRows.Scan(&id, &val); err != nil {
			return nil, err
		}
		if s, ok := out[id]; ok {
			s.DeliveredValue = round2(val)
		} else {
			out[id] = &CustomerStats{DeliveredValue: round2(val)}
		}
	}
	return out, valRows.Err()
}

func (r *Repository) customerByID(ctx context.Context, companyID, id string) (*Customer, error) {
	var c Customer
	err := r.db.QueryRow(ctx, `
		SELECT c.customer_id, c.full_name, c.phone, c.notes, c.is_active,
		       EXISTS (SELECT 1 FROM delivery d WHERE d.customer_id = c.customer_id) AS has_activity
		FROM customer c
		WHERE c.customer_id = $1 AND c.company_id = $2`, id, companyID,
	).Scan(&c.ID, &c.FullName, &c.Phone, &c.Notes, &c.IsActive, &c.HasActivity)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errNotFound
	}
	if err != nil {
		return nil, err
	}

	c.Addresses, err = r.addressesFor(ctx, id)
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *Repository) addressesFor(ctx context.Context, customerID string) ([]Address, error) {
	rows, err := r.db.Query(ctx, `
		SELECT address_id, zip_code, street, number, district, city, state, complement
		FROM address WHERE customer_id = $1 ORDER BY created_at`, customerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Address{}
	for rows.Next() {
		var (
			a                   Address
			zip, num, district  *string
			street, city, state string
			complement          *string
		)
		if err := rows.Scan(&a.ID, &zip, &street, &num, &district, &city, &state, &complement); err != nil {
			return nil, err
		}
		a.ZipCode, a.Street, a.Number, a.District = zip, street, num, district
		a.City, a.State, a.Complement = city, state, complement
		a.Line = addressLine(street, num, district, city, state)
		out = append(out, a)
	}
	return out, rows.Err()
}

// ---------------------------------------------------------------------
// write
// ---------------------------------------------------------------------

func (r *Repository) CreateCustomer(ctx context.Context, companyID string, in createCustomerReq) (*Customer, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	setAuditUser(ctx, tx)

	var custID string
	if err := tx.QueryRow(ctx,
		`INSERT INTO customer (company_id, full_name, phone)
		 VALUES ($1, $2, $3) RETURNING customer_id`,
		companyID, strings.TrimSpace(in.FullName), in.Phone,
	).Scan(&custID); err != nil {
		return nil, err
	}

	c := &Customer{ID: custID, FullName: strings.TrimSpace(in.FullName), Phone: in.Phone, IsActive: true, Addresses: []Address{}}

	if in.Address != nil {
		addr, err := insertAddress(ctx, tx, custID, *in.Address)
		if err != nil {
			return nil, err
		}
		c.Addresses = append(c.Addresses, *addr)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return c, nil
}

func (r *Repository) UpdateCustomer(ctx context.Context, companyID, id string, in updateCustomerReq) (*Customer, error) {
	cur, err := r.customerByID(ctx, companyID, id)
	if err != nil {
		return nil, err
	}
	name := strings.TrimSpace(in.FullName)
	if cur.HasActivity && name != cur.FullName {
		return nil, errCustomerNameLocked
	}

	tag, err := r.auditExec(ctx, `
		UPDATE customer SET
		  full_name = $3, phone = $4, notes = $5, is_active = $6, updated_at = now()
		WHERE customer_id = $1 AND company_id = $2`,
		id, companyID, name, trimPtr(in.Phone), trimPtr(in.Notes), in.IsActive)
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() == 0 {
		return nil, errNotFound
	}
	return r.customerByID(ctx, companyID, id)
}

// DeleteCustomer removes a customer (and their addresses) outright when they
// have no deliveries; otherwise it refuses and the caller should deactivate.
func (r *Repository) DeleteCustomer(ctx context.Context, companyID, id string) error {
	cur, err := r.customerByID(ctx, companyID, id)
	if err != nil {
		return err
	}
	if cur.HasActivity {
		return errCustomerHasActivity
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	setAuditUser(ctx, tx)

	if _, err := tx.Exec(ctx, `DELETE FROM address WHERE customer_id = $1`, id); err != nil {
		return err
	}
	tag, err := tx.Exec(ctx, `DELETE FROM customer WHERE customer_id = $1 AND company_id = $2`, id, companyID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errNotFound
	}
	return tx.Commit(ctx)
}

// AddAddress attaches a new address to a customer the company owns.
func (r *Repository) AddAddress(ctx context.Context, companyID, customerID string, in addressInput) (*Address, error) {
	var owned bool
	if err := r.db.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM customer WHERE customer_id = $1 AND company_id = $2)`,
		customerID, companyID,
	).Scan(&owned); err != nil {
		return nil, err
	}
	if !owned {
		return nil, errNotFound
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	setAuditUser(ctx, tx)

	addr, err := insertAddress(ctx, tx, customerID, in)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return addr, nil
}

// UpdateAddress edits an address, unless a delivery to it is currently in
// progress (started, not finished) — then it's frozen until that completes.
func (r *Repository) UpdateAddress(ctx context.Context, companyID, customerID, addressID string, in addressInput) (*Address, error) {
	var owned bool
	if err := r.db.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM address a
			JOIN customer c ON c.customer_id = a.customer_id
			WHERE a.address_id = $1 AND a.customer_id = $2 AND c.company_id = $3
		)`, addressID, customerID, companyID).Scan(&owned); err != nil {
		return nil, err
	}
	if !owned {
		return nil, errNotFound
	}

	var inProgress bool
	if err := r.db.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM delivery
			WHERE address_id = $1 AND company_id = $2
			  AND started_at IS NOT NULL AND finished_at IS NULL
		)`, addressID, companyID).Scan(&inProgress); err != nil {
		return nil, err
	}
	if inProgress {
		return nil, errAddressInProgress
	}

	street := strings.TrimSpace(in.Street)
	city := strings.TrimSpace(in.City)
	state := strings.ToUpper(strings.TrimSpace(in.State))
	tag, err := r.auditExec(ctx, `
		UPDATE address SET
		  zip_code = $2, street = $3, number = $4, district = $5,
		  city = $6, state = $7, complement = $8, updated_at = now()
		WHERE address_id = $1`,
		addressID, in.ZipCode, street, in.Number, in.District, city, state, in.Complement)
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() == 0 {
		return nil, errNotFound
	}
	return &Address{
		ID: addressID, ZipCode: in.ZipCode, Street: street, Number: in.Number,
		District: in.District, City: city, State: state, Complement: in.Complement,
		Line: addressLine(street, in.Number, in.District, city, state),
	}, nil
}

// DeleteAddress removes an address that no delivery references.
func (r *Repository) DeleteAddress(ctx context.Context, companyID, customerID, addressID string) error {
	var owned bool
	if err := r.db.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM address a
			JOIN customer c ON c.customer_id = a.customer_id
			WHERE a.address_id = $1 AND a.customer_id = $2 AND c.company_id = $3
		)`, addressID, customerID, companyID).Scan(&owned); err != nil {
		return err
	}
	if !owned {
		return errNotFound
	}

	var used bool
	if err := r.db.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM delivery WHERE address_id = $1 AND company_id = $2)`,
		addressID, companyID).Scan(&used); err != nil {
		return err
	}
	if used {
		return errAddressInUse
	}

	tag, err := r.auditExec(ctx, `DELETE FROM address WHERE address_id = $1`, addressID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errNotFound
	}
	return nil
}

// querier is the subset of pgxpool.Pool / pgx.Tx that insertAddress needs.
type querier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

func insertAddress(ctx context.Context, q querier, customerID string, in addressInput) (*Address, error) {
	var id string
	if err := q.QueryRow(ctx,
		`INSERT INTO address
		   (customer_id, zip_code, street, number, district, city, state, complement)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 RETURNING address_id`,
		customerID, in.ZipCode, strings.TrimSpace(in.Street), in.Number, in.District,
		strings.TrimSpace(in.City), strings.ToUpper(strings.TrimSpace(in.State)), in.Complement,
	).Scan(&id); err != nil {
		return nil, err
	}
	return &Address{
		ID:         id,
		ZipCode:    in.ZipCode,
		Street:     strings.TrimSpace(in.Street),
		Number:     in.Number,
		District:   in.District,
		City:       strings.TrimSpace(in.City),
		State:      strings.ToUpper(strings.TrimSpace(in.State)),
		Complement: in.Complement,
		Line:       addressLine(in.Street, in.Number, in.District, in.City, strings.ToUpper(in.State)),
	}, nil
}

// ---- handlers ----

func (h *Handler) listCustomers(w http.ResponseWriter, r *http.Request) {
	cid, ok := requireCompany(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()
	customers, err := h.repo.Customers(r.Context(), cid, q.Get("q"), q.Get("all") == "1", q.Get("stats") == "1")
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "could not load customers")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, customers)
}

func (h *Handler) createCustomer(w http.ResponseWriter, r *http.Request) {
	cid, ok := requireCompany(w, r)
	if !ok {
		return
	}
	var body createCustomerReq
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(body.FullName) == "" {
		httpx.WriteError(w, http.StatusBadRequest, "full name is required")
		return
	}
	if body.Address != nil && (strings.TrimSpace(body.Address.Street) == "" ||
		strings.TrimSpace(body.Address.City) == "" || strings.TrimSpace(body.Address.State) == "") {
		httpx.WriteError(w, http.StatusBadRequest, "address needs at least street, city and state")
		return
	}

	c, err := h.repo.CreateCustomer(r.Context(), cid, body)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "could not create customer")
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, c)
}

func (h *Handler) updateCustomer(w http.ResponseWriter, r *http.Request) {
	cid, ok := requireCompany(w, r)
	if !ok {
		return
	}
	var body updateCustomerReq
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(body.FullName) == "" {
		httpx.WriteError(w, http.StatusBadRequest, "full name is required")
		return
	}

	c, err := h.repo.UpdateCustomer(r.Context(), cid, chiURLParam(r, "customerID"), body)
	switch {
	case errors.Is(err, errNotFound):
		httpx.WriteError(w, http.StatusNotFound, "customer not found")
	case errors.Is(err, errCustomerNameLocked):
		httpx.WriteError(w, http.StatusConflict, errCustomerNameLocked.Error())
	case err != nil:
		httpx.WriteError(w, http.StatusInternalServerError, "could not update customer")
	default:
		httpx.WriteJSON(w, http.StatusOK, c)
	}
}

func (h *Handler) deleteCustomer(w http.ResponseWriter, r *http.Request) {
	cid, ok := requireCompany(w, r)
	if !ok {
		return
	}
	err := h.repo.DeleteCustomer(r.Context(), cid, chiURLParam(r, "customerID"))
	switch {
	case errors.Is(err, errNotFound):
		httpx.WriteError(w, http.StatusNotFound, "customer not found")
	case errors.Is(err, errCustomerHasActivity):
		httpx.WriteError(w, http.StatusConflict, errCustomerHasActivity.Error())
	case err != nil:
		httpx.WriteError(w, http.StatusInternalServerError, "could not delete customer")
	default:
		httpx.WriteJSON(w, http.StatusNoContent, nil)
	}
}

func (h *Handler) addAddress(w http.ResponseWriter, r *http.Request) {
	cid, ok := requireCompany(w, r)
	if !ok {
		return
	}
	customerID := chiURLParam(r, "customerID")

	var body addressInput
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(body.Street) == "" || strings.TrimSpace(body.City) == "" ||
		strings.TrimSpace(body.State) == "" {
		httpx.WriteError(w, http.StatusBadRequest, "street, city and state are required")
		return
	}

	addr, err := h.repo.AddAddress(r.Context(), cid, customerID, body)
	if errors.Is(err, errNotFound) {
		httpx.WriteError(w, http.StatusNotFound, "customer not found")
		return
	}
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "could not add address")
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, addr)
}

func (h *Handler) updateAddress(w http.ResponseWriter, r *http.Request) {
	cid, ok := requireCompany(w, r)
	if !ok {
		return
	}
	var body addressInput
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(body.Street) == "" || strings.TrimSpace(body.City) == "" ||
		strings.TrimSpace(body.State) == "" {
		httpx.WriteError(w, http.StatusBadRequest, "street, city and state are required")
		return
	}

	addr, err := h.repo.UpdateAddress(r.Context(), cid,
		chiURLParam(r, "customerID"), chiURLParam(r, "addressID"), body)
	switch {
	case errors.Is(err, errNotFound):
		httpx.WriteError(w, http.StatusNotFound, "address not found")
	case errors.Is(err, errAddressInProgress):
		httpx.WriteError(w, http.StatusConflict, errAddressInProgress.Error())
	case err != nil:
		httpx.WriteError(w, http.StatusInternalServerError, "could not update address")
	default:
		httpx.WriteJSON(w, http.StatusOK, addr)
	}
}

func (h *Handler) deleteAddress(w http.ResponseWriter, r *http.Request) {
	cid, ok := requireCompany(w, r)
	if !ok {
		return
	}
	err := h.repo.DeleteAddress(r.Context(), cid,
		chiURLParam(r, "customerID"), chiURLParam(r, "addressID"))
	switch {
	case errors.Is(err, errNotFound):
		httpx.WriteError(w, http.StatusNotFound, "address not found")
	case errors.Is(err, errAddressInUse):
		httpx.WriteError(w, http.StatusConflict, errAddressInUse.Error())
	case err != nil:
		httpx.WriteError(w, http.StatusInternalServerError, "could not delete address")
	default:
		httpx.WriteJSON(w, http.StatusNoContent, nil)
	}
}
