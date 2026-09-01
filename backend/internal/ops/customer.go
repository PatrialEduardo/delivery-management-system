package ops

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/PatrialEduardo/delivery-management-system/backend/internal/httpx"
)

var errNotFound = errors.New("not found")

// Customers returns the company's active customers with their addresses.
// A non-empty search filters on the customer name (case-insensitive).
func (r *Repository) Customers(ctx context.Context, companyID, search string) ([]Customer, error) {
	const q = `
		SELECT c.customer_id, c.full_name, c.phone,
		       a.address_id, a.zip_code, a.street, a.number, a.district,
		       a.city, a.state, a.complement
		FROM customer c
		LEFT JOIN address a ON a.customer_id = c.customer_id
		WHERE c.company_id = $1
		  AND c.is_active
		  AND ($2 = '' OR c.full_name ILIKE '%' || $2 || '%')
		ORDER BY c.full_name, a.created_at`

	rows, err := r.db.Query(ctx, q, companyID, strings.TrimSpace(search))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	order := []string{}
	byID := map[string]*Customer{}

	for rows.Next() {
		var (
			custID, fullName           string
			phone                      *string
			addrID                     *string
			zip, street, num, district *string
			city, state, complement    *string
		)
		if err := rows.Scan(
			&custID, &fullName, &phone,
			&addrID, &zip, &street, &num, &district, &city, &state, &complement,
		); err != nil {
			return nil, err
		}

		c, seen := byID[custID]
		if !seen {
			c = &Customer{ID: custID, FullName: fullName, Phone: phone, Addresses: []Address{}}
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
	return out, nil
}

func (r *Repository) CreateCustomer(ctx context.Context, companyID string, in createCustomerReq) (*Customer, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var custID string
	if err := tx.QueryRow(ctx,
		`INSERT INTO customer (company_id, full_name, phone)
		 VALUES ($1, $2, $3) RETURNING customer_id`,
		companyID, strings.TrimSpace(in.FullName), in.Phone,
	).Scan(&custID); err != nil {
		return nil, err
	}

	c := &Customer{ID: custID, FullName: strings.TrimSpace(in.FullName), Phone: in.Phone, Addresses: []Address{}}

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
	return insertAddress(ctx, r.db, customerID, in)
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
	customers, err := h.repo.Customers(r.Context(), cid, r.URL.Query().Get("q"))
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
