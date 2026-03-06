package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/kpanel/kpanel/internal/config"
)

// Mount registers all API routes on the provided router.
func Mount(r chi.Router, store *config.Store) {
	h := NewHandlers(store)

	r.Use(corsMiddleware)

	r.Get("/api/health", h.Health)

	r.Route("/api/connections", func(r chi.Router) {
		r.Use(middleware.SetHeader("Content-Type", "application/json"))
		r.Get("/", h.ListConnections)
		r.Post("/", h.AddConnection)
		r.Put("/{id}", h.UpdateConnection)
		r.Delete("/{id}", h.DeleteConnection)
		r.Get("/{id}/status", h.ConnectionStatus)
		r.Get("/{id}/session", h.ConnectionSession)
		r.Get("/{id}/topics", h.ListTopics)
		r.Post("/{id}/topics", h.CreateTopic)
		r.Get("/{id}/topics/{name}", h.GetTopic)
		r.Delete("/{id}/topics/{name}", h.DeleteTopic)
		r.Post("/{id}/topics/{name}/peek", h.PeekMessages)
		r.Put("/{id}/topics/{name}/config", h.UpdateTopicConfig)
		r.Put("/{id}/topics/{name}/partitions", h.UpdateTopicPartitions)
		r.Get("/{id}/groups", h.ListGroups)
		r.Get("/{id}/groups/{name}", h.GetGroup)
		r.Get("/{id}/groups/{name}/lag-history", h.GetLagHistory)
		r.Post("/{id}/groups/{name}/reset-offsets", h.ResetOffsets)
		r.Get("/{id}/overview", h.ClusterOverview)
		r.Get("/{id}/brokers", h.ListBrokers)
		r.Get("/{id}/metrics", h.GetMetrics)
	})

	r.Route("/api/msk", func(r chi.Router) {
		r.Use(middleware.SetHeader("Content-Type", "application/json"))
		r.Get("/clusters", h.DiscoverMSK)
		r.Post("/clusters/{arn}/import", h.ImportMSKCluster)
	})
}

// corsMiddleware allows requests from the Bun dev server in development.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
