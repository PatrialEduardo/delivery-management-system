// Package ops holds the delivery-operations API that backs the homepage:
// shippings (delivery_batch), their deliveries, reordering, linking, plus
// the reference data (statuses, drivers) and minimal customer management.
//
// Every query is scoped to the company on the caller's JWT — there is no
// cross-tenant read or write path here.
package ops

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/PatrialEduardo/delivery-management-system/backend/internal/auth"
	"github.com/PatrialEduardo/delivery-management-system/backend/internal/httpx"
)

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

type Handler struct {
	repo *Repository
}

func NewHandler(db *pgxpool.Pool) *Handler {
	return &Handler{repo: NewRepository(db)}
}

// Register mounts every ops route onto r. r is expected to already carry
// the RequireAuth middleware.
func (h *Handler) Register(r chi.Router) {
	r.Get("/delivery-statuses", h.listStatuses)
	r.Get("/drivers", h.listDrivers)

	r.Get("/customers", h.listCustomers)
	r.Post("/customers", h.createCustomer)
	r.Post("/customers/{customerID}/addresses", h.addAddress)

	r.Get("/shippings", h.listShippings)
	r.Post("/shippings", h.createShipping)
	r.Post("/shippings/{shippingID}/deliveries", h.quickAddDelivery)
	r.Post("/shippings/{shippingID}/deliveries/{deliveryID}/link", h.linkDelivery)
	r.Patch("/shippings/{shippingID}/deliveries/order", h.reorderDeliveries)

	r.Get("/deliveries", h.listLinkableDeliveries)

	// Driver-facing: scoped to the shippings assigned to the caller.
	r.Get("/me/shippings", h.myShippings)
	r.Get("/me/shippings/{shippingID}", h.myShipping)
	r.Get("/me/active-delivery", h.myActiveDelivery)
	r.Post("/deliveries/{deliveryID}/start", h.startDelivery)
	r.Post("/deliveries/{deliveryID}/finish", h.finishDelivery)
}

func chiURLParam(r *http.Request, key string) string {
	return chi.URLParam(r, key)
}

// companyID pulls the tenant id off the request's JWT claims. The second
// return is false when there are somehow no claims (RequireAuth should
// make that impossible on these routes).
func companyID(ctx context.Context) (string, bool) {
	claims, ok := auth.ClaimsFromContext(ctx)
	if !ok || claims.CompanyID == "" {
		return "", false
	}
	return claims.CompanyID, true
}

// requireCompany writes a 401 and returns ("", false) when the caller has
// no usable company claim.
func requireCompany(w http.ResponseWriter, r *http.Request) (string, bool) {
	cid, ok := companyID(r.Context())
	if !ok {
		httpx.WriteError(w, http.StatusUnauthorized, "not authenticated")
		return "", false
	}
	return cid, true
}

// requireClaims writes a 401 and returns (nil, false) when there are no
// usable JWT claims. Driver routes need the user id, not just the company.
func requireClaims(w http.ResponseWriter, r *http.Request) (*auth.Claims, bool) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok || claims.CompanyID == "" || claims.UserID == "" {
		httpx.WriteError(w, http.StatusUnauthorized, "not authenticated")
		return nil, false
	}
	return claims, true
}
