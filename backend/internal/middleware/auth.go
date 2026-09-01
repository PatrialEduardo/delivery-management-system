package middleware

import (
	"net/http"
	"strings"

	"github.com/PatrialEduardo/delivery-management-system/backend/internal/auth"
)

// RequireAuth is the gate every protected route sits behind. It only
// checks the token's signature and expiry here — RBAC (which role_id can
// do what) is a separate, later concern per-route, not baked into this
// middleware.
func RequireAuth(jwtSecret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			header := r.Header.Get("Authorization")
			if !strings.HasPrefix(header, "Bearer ") {
				http.Error(w, `{"error":"missing bearer token"}`, http.StatusUnauthorized)
				return
			}

			tokenString := strings.TrimPrefix(header, "Bearer ")
			claims, err := auth.ParseToken(tokenString, jwtSecret)
			if err != nil {
				http.Error(w, `{"error":"invalid or expired token"}`, http.StatusUnauthorized)
				return
			}

			ctx := auth.ContextWithClaims(r.Context(), claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
