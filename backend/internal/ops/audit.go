package ops

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/PatrialEduardo/delivery-management-system/backend/internal/auth"
)

// setAuditUser tags the current transaction with the acting user id so the
// audit_log triggers (migration 000007) can record *who* made a change.
// Best-effort: no claims, no tag — the triggers still log the change and
// its timestamp, just with a null author. Uses set_config(..., is_local =
// true) so the setting dies with the transaction and never leaks to the
// next borrower of this pooled connection.
func setAuditUser(ctx context.Context, tx pgx.Tx) {
	claims, ok := auth.ClaimsFromContext(ctx)
	if !ok || claims.UserID == "" {
		return
	}
	_, _ = tx.Exec(ctx, `SELECT set_config('app.user_id', $1, true)`, claims.UserID)
}

// auditExec runs a single mutating statement inside its own transaction,
// tagged with the acting user for the audit_log triggers. Use it for the
// one-statement UPDATE/DELETE paths that would otherwise not open a tx.
func (r *Repository) auditExec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return pgconn.CommandTag{}, err
	}
	defer tx.Rollback(ctx)

	setAuditUser(ctx, tx)
	tag, err := tx.Exec(ctx, sql, args...)
	if err != nil {
		return tag, err
	}
	return tag, tx.Commit(ctx)
}
