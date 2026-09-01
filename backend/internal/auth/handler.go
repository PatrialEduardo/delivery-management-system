package auth

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/PatrialEduardo/delivery-management-system/backend/internal/user"
)

type Handler struct {
	users     *user.Repository
	jwtSecret string
	tokenTTL  time.Duration
}

func NewHandler(users *user.Repository, jwtSecret string, tokenTTL time.Duration) *Handler {
	return &Handler{users: users, jwtSecret: jwtSecret, tokenTTL: tokenTTL}
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type loginResponse struct {
	AccessToken string     `json:"accessToken"`
	ExpiresIn   int        `json:"expiresIn"`
	User        userSummary `json:"user"`
}

type userSummary struct {
	UserID   string `json:"userId"`
	FullName string `json:"fullName"`
	Email    string `json:"email"`
}

// Login is intentionally chatty in its comments: this endpoint is the one
// piece of the API every other feature depends on, so the "why" behind
// each check matters for whoever edits it next.
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Email == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "email and password are required")
		return
	}

	u, err := h.users.GetByEmail(r.Context(), req.Email)
	if err != nil {
		// Same error for "no such user" and "wrong password" on purpose —
		// don't leak which one it was.
		writeError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}

	if !u.IsActive {
		writeError(w, http.StatusUnauthorized, "this account is inactive")
		return
	}

	if !CheckPassword(req.Password, u.PasswordHash) {
		writeError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}

	token, err := GenerateToken(u.UserID, u.CompanyID, u.RoleID, h.jwtSecret, h.tokenTTL)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not issue token")
		return
	}

	_ = h.users.TouchLastLogin(r.Context(), u.UserID)

	writeJSON(w, http.StatusOK, loginResponse{
		AccessToken: token,
		ExpiresIn:   int(h.tokenTTL.Seconds()),
		User: userSummary{
			UserID:   u.UserID,
			FullName: u.FullName,
			Email:    u.Email,
		},
	})
}

// Me proves the whole chain works end to end: no valid token, no response.
// It reads claims injected by the RequireAuth middleware (see middleware
// package) rather than hitting the DB again.
func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"userId":    claims.UserID,
		"companyId": claims.CompanyID,
		"roleId":    claims.RoleID,
	})
}

func writeJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
