// Package httpx holds the small JSON request/response helpers shared by
// every HTTP handler, so each package doesn't re-invent them.
package httpx

import (
	"encoding/json"
	"net/http"
)

// WriteJSON writes v as a JSON body with the given status code.
func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if v != nil {
		_ = json.NewEncoder(w).Encode(v)
	}
}

// WriteError writes {"error": message} with the given status code.
func WriteError(w http.ResponseWriter, status int, message string) {
	WriteJSON(w, status, map[string]string{"error": message})
}

// DecodeJSON reads the request body into dst. Unknown fields are ignored
// so the frontend can send extra keys during development without a 400.
func DecodeJSON(r *http.Request, dst any) error {
	defer r.Body.Close()
	return json.NewDecoder(r.Body).Decode(dst)
}
