package ops

import (
	"context"
	"net/http"

	"github.com/PatrialEduardo/delivery-management-system/backend/internal/httpx"
)

func (r *Repository) Statuses(ctx context.Context) ([]DeliveryStatus, error) {
	const q = `
		SELECT delivery_status_id, status_code, status_name, status_type,
		       color_hex, icon, display_order, finishes_delivery, allows_reschedule
		FROM delivery_status
		WHERE is_active
		ORDER BY display_order`

	rows, err := r.db.Query(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []DeliveryStatus{}
	for rows.Next() {
		var s DeliveryStatus
		if err := rows.Scan(
			&s.ID, &s.Code, &s.Name, &s.Type, &s.ColorHex, &s.Icon,
			&s.DisplayOrder, &s.FinishesDelivery, &s.AllowsReschedule,
		); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// Drivers lists the active Driver-role users in a company, for assigning
// a shipping.
func (r *Repository) Drivers(ctx context.Context, companyID string) ([]Driver, error) {
	const q = `
		SELECT u.user_id, u.full_name, u.email
		FROM app_user u
		JOIN role r ON r.role_id = u.role_id
		WHERE u.company_id = $1 AND u.is_active AND r.role_name = 'Driver'
		ORDER BY u.full_name`

	rows, err := r.db.Query(ctx, q, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Driver{}
	for rows.Next() {
		var d Driver
		if err := rows.Scan(&d.ID, &d.FullName, &d.Email); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (h *Handler) listStatuses(w http.ResponseWriter, r *http.Request) {
	if _, ok := requireCompany(w, r); !ok {
		return
	}
	statuses, err := h.repo.Statuses(r.Context())
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "could not load statuses")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, statuses)
}

func (h *Handler) listDrivers(w http.ResponseWriter, r *http.Request) {
	cid, ok := requireCompany(w, r)
	if !ok {
		return
	}
	drivers, err := h.repo.Drivers(r.Context(), cid)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "could not load drivers")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, drivers)
}
