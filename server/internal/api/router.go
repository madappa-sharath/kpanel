package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/kpanel/kpanel/internal/config"
)

// Mount registers all API routes on the provided router.
func Mount(r chi.Router, store *config.Store, version string) {
	h := NewHandlers(store, version)

	r.Use(corsMiddleware)

	r.Get("/api/health", h.Health)
	r.Get("/api/version", h.GetVersion)

	r.Route("/api/connections", func(r chi.Router) {
		r.Get("/", h.ListConnections)
		r.Post("/", h.AddConnection)

		r.Route("/{id}", func(r chi.Router) {
			r.Put("/", h.UpdateConnection)
			r.Delete("/", h.DeleteConnection)
			r.Get("/status", h.ConnectionStatus)
			r.Get("/session", h.ConnectionSession)
			r.Get("/overview", h.ClusterOverview)
			r.Get("/brokers", h.ListBrokers)
			r.Get("/metrics", h.GetMetrics)

			r.Route("/topics", func(r chi.Router) {
				r.Get("/", h.ListTopics)
				r.Post("/", h.CreateTopic)

				r.Route("/{name}", func(r chi.Router) {
					r.Get("/", h.GetTopic)
					r.Delete("/", h.DeleteTopic)
					r.Post("/peek", h.PeekMessages)
				r.Post("/search", h.SearchMessages)
					r.Put("/config", h.UpdateTopicConfig)
					r.Put("/partitions", h.UpdateTopicPartitions)
				})
			})

			r.Route("/groups", func(r chi.Router) {
				r.Get("/", h.ListGroups)

				r.Route("/{name}", func(r chi.Router) {
					r.Get("/", h.GetGroup)
					r.Get("/lag-history", h.GetLagHistory)
					r.Post("/reset-offsets", h.ResetOffsets)
				})
			})
		})
	})

	r.Route("/api/aws", func(r chi.Router) {
		r.Get("/context", h.AWSContext)
	})

	r.Route("/api/msk", func(r chi.Router) {
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
