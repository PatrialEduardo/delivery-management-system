package ops

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/PatrialEduardo/delivery-management-system/backend/internal/httpx"
)

var (
	errForbidden       = errors.New("not your shipping")
	errAlreadyFinished = errors.New("this delivery is already finished")
	errActiveElsewhere = errors.New("finish your current delivery before starting another")
	errBadOutcome      = errors.New("outcome must be COMPLETE, ABSENT or TROUBLE")
	errTroubleNote     = errors.New("a trouble needs a description of at least 15 characters")
)

// outcomeStatus maps a driver's finish choice to a delivery_status code.
var outcomeStatus = map[string]string{
	"COMPLETE": "DELIVERED",
	"ABSENT":   "ABSENT",
	"TROUBLE":  "FAILED",
}

// ---------------------------------------------------------------------
// GET /me/shippings?date=YYYY-MM-DD
// ---------------------------------------------------------------------

func (h *Handler) myShippings(w http.ResponseWriter, r *http.Request) {
	claims, ok := requireClaims(w, r)
	if !ok {
		return
	}
	day, err := normalizeDate(r.URL.Query().Get("date"))
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "date must be YYYY-MM-DD")
		return
	}
	shippings, err := h.repo.DriverDay(r.Context(), claims.CompanyID, claims.UserID, day)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "could not load shippings")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"date": day, "shippings": shippings})
}

// ---------------------------------------------------------------------
// GET /me/shippings/{shippingID}
// ---------------------------------------------------------------------

func (r *Repository) DriverShipping(ctx context.Context, companyID, driverID string, shippingID int64) (*Shipping, error) {
	var (
		s        Shipping
		dateOnly string
	)
	err := r.db.QueryRow(ctx, `
		SELECT b.delivery_batch_id, b.batch_code, to_char(b.delivery_date, 'YYYY-MM-DD'),
		       b.driver_user_id, u.full_name, b.notes
		FROM delivery_batch b
		JOIN app_user u ON u.user_id = b.driver_user_id
		WHERE b.delivery_batch_id = $1 AND b.company_id = $2`,
		shippingID, companyID,
	).Scan(&s.ID, &s.BatchCode, &dateOnly, &s.DriverUserID, &s.DriverName, &s.Notes)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errNotFound
	}
	if err != nil {
		return nil, err
	}
	if s.DriverUserID != driverID {
		return nil, errForbidden
	}
	s.DeliveryDate = dateOnly
	s.Deliveries = []Delivery{}

	rows, err := r.db.Query(ctx,
		`SELECT `+deliveryCols+deliveryJoins+`
		 WHERE d.delivery_batch_id = $1 AND d.company_id = $2
		 ORDER BY d.delivery_order, d.delivery_id`, shippingID, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		d, err := scanDelivery(rows)
		if err != nil {
			return nil, err
		}
		s.Deliveries = append(s.Deliveries, d)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if err := r.attachLines(ctx, companyID, s.Deliveries); err != nil {
		return nil, err
	}
	rollUpShipping(&s)
	return &s, nil
}

func (h *Handler) myShipping(w http.ResponseWriter, r *http.Request) {
	claims, ok := requireClaims(w, r)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(chiURLParam(r, "shippingID"), 10, 64)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "bad shipping id")
		return
	}
	s, err := h.repo.DriverShipping(r.Context(), claims.CompanyID, claims.UserID, id)
	switch {
	case errors.Is(err, errNotFound):
		httpx.WriteError(w, http.StatusNotFound, "shipping not found")
	case errors.Is(err, errForbidden):
		httpx.WriteError(w, http.StatusForbidden, "that shipping isn't assigned to you")
	case err != nil:
		httpx.WriteError(w, http.StatusInternalServerError, "could not load shipping")
	default:
		httpx.WriteJSON(w, http.StatusOK, s)
	}
}

// ---------------------------------------------------------------------
// GET /me/active-delivery
// ---------------------------------------------------------------------

func (r *Repository) ActiveDelivery(ctx context.Context, companyID, driverID string) (*ActiveDelivery, error) {
	var a ActiveDelivery
	err := r.db.QueryRow(ctx, `
		SELECT d.delivery_id, d.delivery_batch_id
		FROM delivery d
		JOIN delivery_batch b ON b.delivery_batch_id = d.delivery_batch_id
		WHERE d.company_id = $1 AND b.driver_user_id = $2
		  AND d.started_at IS NOT NULL AND d.finished_at IS NULL
		ORDER BY d.started_at DESC
		LIMIT 1`, companyID, driverID,
	).Scan(&a.DeliveryID, &a.ShippingID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (h *Handler) myActiveDelivery(w http.ResponseWriter, r *http.Request) {
	claims, ok := requireClaims(w, r)
	if !ok {
		return
	}
	a, err := h.repo.ActiveDelivery(r.Context(), claims.CompanyID, claims.UserID)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "could not check active delivery")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"active": a})
}

// ---------------------------------------------------------------------
// guard: does this delivery belong to a shipping assigned to the driver?
// ---------------------------------------------------------------------

func (r *Repository) assertDeliveryDriver(ctx context.Context, companyID, driverID string, deliveryID int64) (started, finished bool, err error) {
	var (
		batchDriver string
		startedAt   *time.Time
		finishedAt  *time.Time
	)
	err = r.db.QueryRow(ctx, `
		SELECT b.driver_user_id, d.started_at, d.finished_at
		FROM delivery d
		JOIN delivery_batch b ON b.delivery_batch_id = d.delivery_batch_id
		WHERE d.delivery_id = $1 AND d.company_id = $2`, deliveryID, companyID,
	).Scan(&batchDriver, &startedAt, &finishedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, false, errNotFound
	}
	if err != nil {
		return false, false, err
	}
	if batchDriver != driverID {
		return false, false, errForbidden
	}
	return startedAt != nil, finishedAt != nil, nil
}

// hasOtherActiveDelivery reports whether the driver already has a delivery
// that is started but not finished, other than the one given. A driver runs
// one stop at a time, so starting a second is rejected until the first is
// closed.
func (r *Repository) hasOtherActiveDelivery(ctx context.Context, companyID, driverID string, exceptDeliveryID int64) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM delivery d
			JOIN delivery_batch b ON b.delivery_batch_id = d.delivery_batch_id
			WHERE d.company_id = $1 AND b.driver_user_id = $2
			  AND d.delivery_id <> $3
			  AND d.started_at IS NOT NULL AND d.finished_at IS NULL
		)`, companyID, driverID, exceptDeliveryID).Scan(&exists)
	return exists, err
}

// ---------------------------------------------------------------------
// POST /deliveries/{deliveryID}/start
// ---------------------------------------------------------------------

func (r *Repository) StartDelivery(ctx context.Context, companyID, driverID string, deliveryID int64, geo geoBody) (*Delivery, error) {
	started, finished, err := r.assertDeliveryDriver(ctx, companyID, driverID, deliveryID)
	if err != nil {
		return nil, err
	}
	if finished {
		return nil, errAlreadyFinished
	}
	// Re-tapping Start on the stop already in progress is a no-op — return
	// its current state without logging another "Started" event.
	if started {
		return r.deliveryByID(ctx, companyID, deliveryID)
	}
	// One stop at a time: block starting a second while another is open.
	busyElsewhere, err := r.hasOtherActiveDelivery(ctx, companyID, driverID, deliveryID)
	if err != nil {
		return nil, err
	}
	if busyElsewhere {
		return nil, errActiveElsewhere
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	// started_at is set once; re-tapping Start just keeps the first time.
	if _, err := tx.Exec(ctx, `
		UPDATE delivery SET
		  started_at = COALESCE(started_at, now()),
		  delivery_status_id = (SELECT delivery_status_id FROM delivery_status WHERE status_code = 'IN_TRANSIT')
		WHERE delivery_id = $1`, deliveryID); err != nil {
		return nil, err
	}

	if err := insertHistory(ctx, tx, deliveryID, driverID, "IN_TRANSIT", "Started", geo.Lat, geo.Lng); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return r.deliveryByID(ctx, companyID, deliveryID)
}

func (h *Handler) startDelivery(w http.ResponseWriter, r *http.Request) {
	claims, ok := requireClaims(w, r)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(chiURLParam(r, "deliveryID"), 10, 64)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "bad delivery id")
		return
	}
	var body geoBody
	_ = httpx.DecodeJSON(r, &body) // body is optional

	d, err := h.repo.StartDelivery(r.Context(), claims.CompanyID, claims.UserID, id, body)
	switch {
	case errors.Is(err, errNotFound):
		httpx.WriteError(w, http.StatusNotFound, "delivery not found")
	case errors.Is(err, errForbidden):
		httpx.WriteError(w, http.StatusForbidden, "that delivery isn't on one of your shippings")
	case errors.Is(err, errAlreadyFinished):
		httpx.WriteError(w, http.StatusConflict, "that delivery is already finished")
	case errors.Is(err, errActiveElsewhere):
		httpx.WriteError(w, http.StatusConflict, errActiveElsewhere.Error())
	case err != nil:
		httpx.WriteError(w, http.StatusInternalServerError, "could not start the delivery")
	default:
		httpx.WriteJSON(w, http.StatusOK, d)
	}
}

// ---------------------------------------------------------------------
// POST /deliveries/{deliveryID}/finish
// ---------------------------------------------------------------------

func (r *Repository) FinishDelivery(ctx context.Context, companyID, driverID string, deliveryID int64, in finishReq) (*Delivery, error) {
	outcome := strings.ToUpper(strings.TrimSpace(in.Outcome))
	statusCode, ok := outcomeStatus[outcome]
	if !ok {
		return nil, errBadOutcome
	}
	note := strings.TrimSpace(in.Note)
	if outcome == "TROUBLE" && len([]rune(note)) < 15 {
		return nil, errTroubleNote
	}
	if note == "" {
		switch outcome {
		case "COMPLETE":
			note = "Delivered"
		case "ABSENT":
			note = "Client absent"
		}
	}

	_, finished, err := r.assertDeliveryDriver(ctx, companyID, driverID, deliveryID)
	if err != nil {
		return nil, err
	}
	if finished {
		return nil, errAlreadyFinished
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		UPDATE delivery SET
		  finished_at = now(),
		  started_at = COALESCE(started_at, now()),
		  delivery_status_id = (SELECT delivery_status_id FROM delivery_status WHERE status_code = $2),
		  notes = $3
		WHERE delivery_id = $1`, deliveryID, statusCode, note); err != nil {
		return nil, err
	}

	if err := insertHistory(ctx, tx, deliveryID, driverID, statusCode, note, in.Lat, in.Lng); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return r.deliveryByID(ctx, companyID, deliveryID)
}

func (h *Handler) finishDelivery(w http.ResponseWriter, r *http.Request) {
	claims, ok := requireClaims(w, r)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(chiURLParam(r, "deliveryID"), 10, 64)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "bad delivery id")
		return
	}
	var body finishReq
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	d, err := h.repo.FinishDelivery(r.Context(), claims.CompanyID, claims.UserID, id, body)
	switch {
	case errors.Is(err, errNotFound):
		httpx.WriteError(w, http.StatusNotFound, "delivery not found")
	case errors.Is(err, errForbidden):
		httpx.WriteError(w, http.StatusForbidden, "that delivery isn't on one of your shippings")
	case errors.Is(err, errAlreadyFinished):
		httpx.WriteError(w, http.StatusConflict, "that delivery is already finished")
	case errors.Is(err, errBadOutcome):
		httpx.WriteError(w, http.StatusBadRequest, errBadOutcome.Error())
	case errors.Is(err, errTroubleNote):
		httpx.WriteError(w, http.StatusUnprocessableEntity, errTroubleNote.Error())
	case err != nil:
		httpx.WriteError(w, http.StatusInternalServerError, "could not finish the delivery")
	default:
		httpx.WriteJSON(w, http.StatusOK, d)
	}
}

// insertHistory appends one delivery_history row inside a transaction.
func insertHistory(
	ctx context.Context, tx pgx.Tx,
	deliveryID int64, userID, statusCode, description string,
	lat, lng *float64,
) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO delivery_history
		  (delivery_id, user_id, delivery_status_id, description, latitude, longitude)
		VALUES (
		  $1, $2,
		  (SELECT delivery_status_id FROM delivery_status WHERE status_code = $3),
		  $4, $5, $6
		)`, deliveryID, userID, statusCode, description, lat, lng)
	return err
}
