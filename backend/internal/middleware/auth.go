package middleware

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/PatrialEduardo/delivery-management-system/backend/internal/auth"
)

// RequireAuth is the gate every protected route sits behind. It checks the
// token's signature and expiry, enforces an absolute session cap, and then
// — because the session is *sliding* — mints a fresh token good for another
// `ttl` and hands it back on the `X-Access-Token` response header. The
// frontend swaps that in, so a user is only logged out after `ttl` with no
// API calls at all. RBAC (which role can do what) is still a separate,
// per-route concern, not baked in here.
func RequireAuth(jwtSecret string, ttl, maxLifetime time.Duration) func(http.Handler) http.Handler {
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

			// Absolute cap: a single login can be kept warm by activity for
			// at most maxLifetime, then the user must sign in again.
			start := claims.SessionStart
			if start != nil && maxLifetime > 0 && time.Since(start.Time) > maxLifetime {
				http.Error(w, `{"error":"session expired, please sign in again"}`, http.StatusUnauthorized)
				return
			}

			// Sliding re-issue. Best-effort: if signing somehow fails the
			// request still proceeds on the current (valid) token.
			if fresh, exp, rerr := auth.ReissueToken(claims, jwtSecret, ttl); rerr == nil {
				w.Header().Set("X-Access-Token", fresh)
				w.Header().Set("X-Access-Token-Expires", strconv.FormatInt(exp.Unix(), 10))
			}

			ctx := auth.ContextWithClaims(r.Context(), claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
