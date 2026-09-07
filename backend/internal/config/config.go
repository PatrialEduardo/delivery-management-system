package config

import (
	"os"
	"time"
)

// Config holds everything the API needs at boot, read once from the
// environment. Nothing here is hardcoded — see .env.example.
type Config struct {
	Port           string
	DatabaseURL    string
	JWTSecret      string
	AccessTokenTTL time.Duration
	// SessionMaxLifetime caps how long a session can be kept alive by the
	// sliding re-issue in RequireAuth, no matter how active the user is.
	SessionMaxLifetime time.Duration
	AllowedOrigin      string
}

func Load() Config {
	return Config{
		// PORT is the port the API binds *inside* its container/host. It is
		// deliberately separate from BACKEND_PORT in .env, which only maps a
		// host port to this one in docker-compose.
		Port:        getEnv("PORT", "8080"),
		DatabaseURL: getEnv("DATABASE_URL", ""),
		JWTSecret:   getEnv("JWT_SECRET", ""),
		// The token is a *sliding* session: every authenticated request mints
		// a fresh token good for another AccessTokenTTL, so a user is only
		// logged out after AccessTokenTTL with zero API calls. Kept in check
		// by SessionMaxLifetime.
		AccessTokenTTL:     30 * time.Minute,
		SessionMaxLifetime: 12 * time.Hour,
		AllowedOrigin:      getEnv("FRONTEND_ORIGIN", "http://localhost:5173"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
