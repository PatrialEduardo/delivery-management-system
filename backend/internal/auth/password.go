package auth

import "golang.org/x/crypto/bcrypt"

// Passwords are stored as bcrypt hashes (cost = bcrypt.DefaultCost).
// bcrypt is deliberately slow and salts every hash, so a leaked
// password_hash column can't be reversed with a rainbow table the way a
// bare SHA256 could.

// HashPassword returns a bcrypt hash suitable for app_user.password_hash.
// Used by scripts/seed tooling, not the login path.
func HashPassword(plain string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(plain), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

// CheckPassword reports whether plain matches the stored bcrypt hash.
// A malformed or non-bcrypt hash simply fails the comparison.
func CheckPassword(plain, hash string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain)) == nil
}
