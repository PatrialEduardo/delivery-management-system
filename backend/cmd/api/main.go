package main

import (
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	appauth "github.com/PatrialEduardo/delivery-management-system/backend/internal/auth"
	"github.com/PatrialEduardo/delivery-management-system/backend/internal/config"
	"github.com/PatrialEduardo/delivery-management-system/backend/internal/database"
	appmw "github.com/PatrialEduardo/delivery-management-system/backend/internal/middleware"
	"github.com/PatrialEduardo/delivery-management-system/backend/internal/ops"
	"github.com/PatrialEduardo/delivery-management-system/backend/internal/user"
)

func main() {
	cfg := config.Load()

	if cfg.JWTSecret == "" {
		log.Fatal("JWT_SECRET is not set — refusing to start")
	}

	db, err := database.NewPool(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("database connection failed: %v", err)
	}
	defer db.Close()

	userRepo := user.NewRepository(db)
	authHandler := appauth.NewHandler(userRepo, cfg.JWTSecret, cfg.AccessTokenTTL)
	opsHandler := ops.NewHandler(db)

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{cfg.AllowedOrigin},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE"},
		AllowedHeaders:   []string{"Accept", "Content-Type", "Authorization"},
		AllowCredentials: true,
	}))

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	// Public
	r.Post("/auth/login", authHandler.Login)

	// Protected — everything behind RequireAuth gets claims in context.
	r.Group(func(pr chi.Router) {
		pr.Use(appmw.RequireAuth(cfg.JWTSecret))
		pr.Get("/auth/me", authHandler.Me)
		opsHandler.Register(pr)
	})

	log.Printf("API listening on :%s", cfg.Port)
	log.Fatal(http.ListenAndServe(":"+cfg.Port, r))
}
