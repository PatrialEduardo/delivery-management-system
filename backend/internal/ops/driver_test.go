package ops

import (
	"context"
	"errors"
	"testing"
)

func TestStartDelivery_BlocksASecondActiveStop(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	batch := f.newShipping(t, "")
	d1 := f.newDelivery(t, batch, "PENDING")
	d2 := f.newDelivery(t, batch, "PENDING")

	if _, err := f.repo.StartDelivery(ctx, f.companyID, f.driverID, d1, geoBody{}); err != nil {
		t.Fatalf("start d1: %v", err)
	}
	if got := f.statusCode(t, d1); got != "IN_TRANSIT" {
		t.Fatalf("d1 status = %s, want IN_TRANSIT", got)
	}

	_, err := f.repo.StartDelivery(ctx, f.companyID, f.driverID, d2, geoBody{})
	if !errors.Is(err, errActiveElsewhere) {
		t.Fatalf("start d2 while d1 open: err = %v, want errActiveElsewhere", err)
	}
	if got := f.statusCode(t, d2); got != "PENDING" {
		t.Fatalf("d2 status = %s, want unchanged PENDING", got)
	}

	// Closing d1 frees the driver to start d2.
	if _, err := f.repo.FinishDelivery(ctx, f.companyID, f.driverID, d1, finishReq{Outcome: "COMPLETE"}); err != nil {
		t.Fatalf("finish d1: %v", err)
	}
	if _, err := f.repo.StartDelivery(ctx, f.companyID, f.driverID, d2, geoBody{}); err != nil {
		t.Fatalf("start d2 after finishing d1: %v", err)
	}
}

func TestStartDelivery_ReStartIsIdempotent(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	batch := f.newShipping(t, "")
	d := f.newDelivery(t, batch, "PENDING")

	if _, err := f.repo.StartDelivery(ctx, f.companyID, f.driverID, d, geoBody{}); err != nil {
		t.Fatalf("first start: %v", err)
	}
	after1 := f.historyCount(t, d)
	if after1 != 1 {
		t.Fatalf("history rows after first start = %d, want 1", after1)
	}

	if _, err := f.repo.StartDelivery(ctx, f.companyID, f.driverID, d, geoBody{}); err != nil {
		t.Fatalf("second start: %v", err)
	}
	if after2 := f.historyCount(t, d); after2 != after1 {
		t.Fatalf("history rows after re-start = %d, want %d (no new event)", after2, after1)
	}
}

func TestStartDelivery_OtherDriverStopDoesNotBlock(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()

	// A second driver in the same company with an open stop must not stop
	// our driver from starting theirs.
	var otherDriver string
	must(t, testDB.QueryRow(ctx,
		`INSERT INTO app_user (company_id, role_id, full_name, email, password_hash)
		 VALUES ($1, (SELECT role_id FROM role WHERE role_name = 'Driver'),
		         'Other Driver', 'other-' || gen_random_uuid() || '@test.local', 'x')
		 RETURNING user_id`, f.companyID).Scan(&otherDriver))

	otherBatch := f.newShipping(t, "")
	if _, err := testDB.Exec(ctx,
		`UPDATE delivery_batch SET driver_user_id = $1 WHERE delivery_batch_id = $2`,
		otherDriver, otherBatch); err != nil {
		t.Fatalf("reassign batch: %v", err)
	}
	otherStop := f.newDelivery(t, otherBatch, "PENDING")
	if _, err := testDB.Exec(ctx,
		`UPDATE delivery SET driver_user_id = $1, started_at = now(),
		   delivery_status_id = (SELECT delivery_status_id FROM delivery_status WHERE status_code = 'IN_TRANSIT')
		 WHERE delivery_id = $2`, otherDriver, otherStop); err != nil {
		t.Fatalf("open other stop: %v", err)
	}

	batch := f.newShipping(t, "")
	d := f.newDelivery(t, batch, "PENDING")
	if _, err := f.repo.StartDelivery(ctx, f.companyID, f.driverID, d, geoBody{}); err != nil {
		t.Fatalf("start own stop while another driver is busy: %v", err)
	}
}
