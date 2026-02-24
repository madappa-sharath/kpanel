package main

import (
	"embed"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/kpanel/kpanel/internal/api"
	"github.com/kpanel/kpanel/internal/config"
)

// publicFiles embeds the built React frontend.
// In dev (go run), this directory only has a .gitkeep placeholder — Bun
// serves the frontend on :3000 instead. In production (make build), the
// web/dist output is copied here before go build runs.
//
//go:embed all:public
var publicFiles embed.FS

func main() {
	port := os.Getenv("KPANEL_PORT")
	if port == "" {
		port = "8080"
	}

	configDir := os.Getenv("KPANEL_CONFIG_DIR")
	if configDir == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			log.Fatalf("failed to get home dir: %v", err)
		}
		configDir = filepath.Join(home, ".kpanel")
	}

	if err := os.MkdirAll(configDir, 0755); err != nil {
		log.Fatalf("failed to create config dir: %v", err)
	}

	store, err := config.NewStore(configDir)
	if err != nil {
		log.Fatalf("failed to initialize config store: %v", err)
	}

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	api.Mount(r, store)

	// Serve embedded frontend for all non-API routes.
	// In dev mode this serves the .gitkeep placeholder (harmless — Bun handles frontend on :3000).
	// In production this serves the full React app.
	publicFS, err := fs.Sub(publicFiles, "public")
	if err == nil {
		r.Handle("/*", http.FileServer(http.FS(publicFS)))
	}

	addr := fmt.Sprintf(":%s", port)
	log.Printf("kpanel listening on http://localhost%s", addr)
	log.Printf("config dir: %s", configDir)

	if err := http.ListenAndServe(addr, r); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
