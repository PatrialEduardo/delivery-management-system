package user

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("user not found")

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

// GetByEmail is intentionally global on email today, matching the current
// schema (see doc section 28.E). If email uniqueness later becomes
// tenant-scoped, this query gains a company_id filter and the handler
// gains a company selector step.
func (r *Repository) GetByEmail(ctx context.Context, email string) (*User, error) {
	const q = `
		SELECT u.user_id, u.company_id, u.role_id, r.role_name, u.full_name,
		       u.email, u.password_hash, u.is_active, u.inactivated_at
		FROM app_user u
		JOIN role r ON r.role_id = u.role_id
		WHERE u.email = $1
	`

	var u User
	err := r.db.QueryRow(ctx, q, email).Scan(
		&u.UserID, &u.CompanyID, &u.RoleID, &u.RoleName, &u.FullName, &u.Email,
		&u.PasswordHash, &u.IsActive, &u.InactivatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	return &u, nil
}

func (r *Repository) TouchLastLogin(ctx context.Context, userID string) error {
	const q = `UPDATE app_user SET last_login_at = now() WHERE user_id = $1`
	_, err := r.db.Exec(ctx, q, userID)
	return err
}
