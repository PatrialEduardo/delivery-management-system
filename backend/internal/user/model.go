package user

import "time"

// User mirrors the `app_user` table from the ERD. Only the fields the
// auth flow needs right now — extend as other features land.
type User struct {
	UserID        string
	CompanyID     string
	RoleID        string
	RoleName      string
	FullName      string
	Email         string
	PasswordHash  string
	IsActive      bool
	InactivatedAt *time.Time
}
