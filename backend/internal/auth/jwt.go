package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Claims carries exactly what downstream handlers need to enforce
// multi-tenancy and RBAC (company_id, role_id, role name) without a DB
// round trip on every request.
type Claims struct {
	UserID    string `json:"userId"`
	CompanyID string `json:"companyId"`
	RoleID    string `json:"roleId"`
	Role      string `json:"role"` // human-readable role name, e.g. "Driver"
	// SessionStart is the moment the user actually logged in. Unlike iat it
	// is *preserved* across the sliding re-issue in RequireAuth, so the
	// middleware can enforce an absolute cap on how long one login lasts.
	SessionStart *jwt.NumericDate `json:"sessionStart,omitempty"`
	jwt.RegisteredClaims
}

// GenerateToken mints a brand new session token (called on login).
func GenerateToken(userID, companyID, roleID, role, secret string, ttl time.Duration, sessionStart time.Time) (string, error) {
	claims := Claims{
		UserID:       userID,
		CompanyID:    companyID,
		RoleID:       roleID,
		Role:         role,
		SessionStart: jwt.NewNumericDate(sessionStart),
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(ttl)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

// ReissueToken stamps a fresh expiry onto an already-verified set of claims,
// keeping the original SessionStart. It is how the sliding session works:
// each authenticated request buys the user another ttl of inactivity.
func ReissueToken(prev *Claims, secret string, ttl time.Duration) (string, time.Time, error) {
	exp := time.Now().Add(ttl)
	claims := Claims{
		UserID:       prev.UserID,
		CompanyID:    prev.CompanyID,
		RoleID:       prev.RoleID,
		Role:         prev.Role,
		SessionStart: prev.SessionStart,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(exp),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(secret))
	return signed, exp, err
}

func ParseToken(tokenString, secret string) (*Claims, error) {
	claims := &Claims{}

	token, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(secret), nil
	})
	if err != nil {
		return nil, err
	}
	if !token.Valid {
		return nil, errors.New("invalid token")
	}

	return claims, nil
}
