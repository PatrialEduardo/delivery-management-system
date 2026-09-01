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
	jwt.RegisteredClaims
}

func GenerateToken(userID, companyID, roleID, role, secret string, ttl time.Duration) (string, error) {
	claims := Claims{
		UserID:    userID,
		CompanyID: companyID,
		RoleID:    roleID,
		Role:      role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(ttl)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
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
