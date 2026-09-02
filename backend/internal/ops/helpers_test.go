package ops

import (
	"context"
	"fmt"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// These tests talk to a real Postgres — the one from `docker compose up`.
// Set TEST_DATABASE_URL to point elsewhere; otherwise the compose default
// (host port 5433) is used. When no database is reachable every test in the
// package skips rather than fails, so `go test ./...` stays green offline.
//
// Each test builds its own throwaway company via newFixture and deletes
// everything under that company_id on cleanup, so runs don't collide with
// the dev seed data or with each other.

var testDB *pgxpool.Pool

const defaultTestDSN = "postgres://dms_app:d3l1very_.2026@localhost:5433/dms_dev?sslmode=disable"

func TestMain(m *testing.M) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		dsn = defaultTestDSN
	}
	ctx := context.Background()
	if pool, err := pgxpool.New(ctx, dsn); err == nil {
		if pingErr := pool.Ping(ctx); pingErr == nil {
			testDB = pool
		} else {
			pool.Close()
		}
	}
	code := m.Run()
	if testDB != nil {
		testDB.Close()
	}
	os.Exit(code)
}

func requireDB(t *testing.T) {
	t.Helper()
	if testDB == nil {
		t.Skip("no test database (set TEST_DATABASE_URL or run `docker compose up -d postgres`)")
	}
}

type fixture struct {
	repo       *Repository
	companyID  string
	driverID   string
	adminID    string
	customerID string
	addressID  string
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	requireDB(t)
	ctx := context.Background()
	f := &fixture{repo: NewRepository(testDB)}

	must(t, testDB.QueryRow(ctx,
		`INSERT INTO company (company_name) VALUES ('test-' || gen_random_uuid())
		 RETURNING company_id`).Scan(&f.companyID))

	must(t, testDB.QueryRow(ctx,
		`INSERT INTO app_user (company_id, role_id, full_name, email, password_hash)
		 VALUES ($1, (SELECT role_id FROM role WHERE role_name = 'Driver'),
		         'Test Driver', 'drv-' || gen_random_uuid() || '@test.local', 'x')
		 RETURNING user_id`, f.companyID).Scan(&f.driverID))

	must(t, testDB.QueryRow(ctx,
		`INSERT INTO app_user (company_id, role_id, full_name, email, password_hash)
		 VALUES ($1, (SELECT role_id FROM role WHERE role_name = 'Admin'),
		         'Test Admin', 'adm-' || gen_random_uuid() || '@test.local', 'x')
		 RETURNING user_id`, f.companyID).Scan(&f.adminID))

	must(t, testDB.QueryRow(ctx,
		`INSERT INTO customer (company_id, full_name, phone)
		 VALUES ($1, 'Test Customer', '+55 11 90000-0000')
		 RETURNING customer_id`, f.companyID).Scan(&f.customerID))

	must(t, testDB.QueryRow(ctx,
		`INSERT INTO address (customer_id, street, city, state)
		 VALUES ($1, 'Test St 1', 'Sao Paulo', 'SP')
		 RETURNING address_id`, f.customerID).Scan(&f.addressID))

	t.Cleanup(f.cleanup)
	return f
}

func (f *fixture) cleanup() {
	ctx := context.Background()
	stmts := []string{
		`DELETE FROM delivery_history WHERE delivery_id IN (SELECT delivery_id FROM delivery WHERE company_id = $1)`,
		`DELETE FROM delivery_product WHERE delivery_id IN (SELECT delivery_id FROM delivery WHERE company_id = $1)`,
		`DELETE FROM delivery WHERE company_id = $1`,
		`DELETE FROM delivery_batch WHERE company_id = $1`,
		`DELETE FROM address WHERE customer_id IN (SELECT customer_id FROM customer WHERE company_id = $1)`,
		`DELETE FROM customer WHERE company_id = $1`,
		`DELETE FROM product WHERE company_id = $1`,
		`DELETE FROM app_user WHERE company_id = $1`,
		`DELETE FROM company WHERE company_id = $1`,
	}
	for _, q := range stmts {
		if _, err := testDB.Exec(ctx, q, f.companyID); err != nil {
			fmt.Printf("fixture cleanup: %v\n", err)
		}
	}
}

// newShipping inserts a delivery_batch for the fixture's driver on the given
// date (CURRENT_DATE when empty) and returns its id.
func (f *fixture) newShipping(t *testing.T, date string) int64 {
	t.Helper()
	ctx := context.Background()
	var id int64
	must(t, testDB.QueryRow(ctx, `
		INSERT INTO delivery_batch (company_id, driver_user_id, batch_code, delivery_date)
		VALUES ($1, $2, 'SHP-' || substr(gen_random_uuid()::text, 1, 8),
		        COALESCE(NULLIF($3, '')::date, CURRENT_DATE))
		RETURNING delivery_batch_id`, f.companyID, f.driverID, date).Scan(&id))
	return id
}

// newDelivery appends a delivery to a batch with the given status code.
func (f *fixture) newDelivery(t *testing.T, batchID int64, statusCode string) int64 {
	t.Helper()
	ctx := context.Background()
	var id int64
	must(t, testDB.QueryRow(ctx, `
		INSERT INTO delivery
		  (company_id, delivery_batch_id, customer_id, address_id, driver_user_id,
		   delivery_status_id, delivery_order, attempt_number)
		VALUES (
		  $1, $2, $3, $4, $5,
		  (SELECT delivery_status_id FROM delivery_status WHERE status_code = $6),
		  (SELECT COALESCE(MAX(delivery_order), 0) + 1 FROM delivery WHERE delivery_batch_id = $2),
		  1)
		RETURNING delivery_id`,
		f.companyID, batchID, f.customerID, f.addressID, f.driverID, statusCode).Scan(&id))
	return id
}

func (f *fixture) newProduct(t *testing.T, name string, price float64) string {
	t.Helper()
	ctx := context.Background()
	var id string
	must(t, testDB.QueryRow(ctx, `
		INSERT INTO product (company_id, product_name, unit, price)
		VALUES ($1, $2, 'UN', $3) RETURNING product_id`,
		f.companyID, name, price).Scan(&id))
	return id
}

func (f *fixture) historyCount(t *testing.T, deliveryID int64) int {
	t.Helper()
	var n int
	must(t, testDB.QueryRow(context.Background(),
		`SELECT count(*) FROM delivery_history WHERE delivery_id = $1`, deliveryID).Scan(&n))
	return n
}

func (f *fixture) statusCode(t *testing.T, deliveryID int64) string {
	t.Helper()
	var code string
	must(t, testDB.QueryRow(context.Background(), `
		SELECT s.status_code FROM delivery d
		JOIN delivery_status s ON s.delivery_status_id = d.delivery_status_id
		WHERE d.delivery_id = $1`, deliveryID).Scan(&code))
	return code
}

func must(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatalf("fixture setup: %v", err)
	}
}
