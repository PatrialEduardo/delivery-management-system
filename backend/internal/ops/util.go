package ops

import "strings"

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return strings.TrimSpace(*s)
}

// addressLine builds a compact one-line address for display, e.g.
// "Av. Paulista, 1000 — Bela Vista, São Paulo/SP".
func addressLine(street string, number, district *string, city, state string) string {
	head := strings.TrimSpace(street)
	if n := deref(number); n != "" {
		head += ", " + n
	}
	if d := deref(district); d != "" {
		head += " — " + d
	}
	tail := strings.TrimSpace(city)
	if state != "" {
		tail += "/" + strings.TrimSpace(state)
	}
	if head == "" {
		return tail
	}
	if tail == "" {
		return head
	}
	return head + ", " + tail
}
