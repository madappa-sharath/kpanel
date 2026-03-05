package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

// ErrNotFound is returned when a cluster ID does not exist in the store.
var ErrNotFound = fmt.Errorf("not found")

// Store provides thread-safe access to the kpanel config.
type Store struct {
	mu   sync.RWMutex
	path string
	cfg  Config
}

// Dir returns the directory that holds config.json and related files.
func (s *Store) Dir() string {
	return filepath.Dir(s.path)
}

// NewStore loads (or creates) config.json in configDir and returns a Store.
func NewStore(configDir string) (*Store, error) {
	s := &Store{
		path: filepath.Join(configDir, "config.json"),
	}
	if err := s.load(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Store) load() error {
	data, err := os.ReadFile(s.path)
	if os.IsNotExist(err) {
		s.cfg = Config{Version: 1, Clusters: []Cluster{}}
		return nil
	}
	if err != nil {
		return fmt.Errorf("read config file: %w", err)
	}

	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return fmt.Errorf("parse config file: %w", err)
	}
	if cfg.Version == 0 {
		cfg.Version = 1
	}
	if cfg.Clusters == nil {
		cfg.Clusters = []Cluster{}
	}
	s.cfg = cfg
	return nil
}

func (s *Store) save() error {
	if s.cfg.Clusters == nil {
		s.cfg.Clusters = []Cluster{}
	}
	data, err := json.MarshalIndent(s.cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal config: %w", err)
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0600); err != nil {
		return fmt.Errorf("write config file: %w", err)
	}
	if err := os.Rename(tmp, s.path); err != nil {
		return fmt.Errorf("replace config file: %w", err)
	}
	return nil
}

// List returns all clusters.
func (s *Store) List() []Cluster {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Cluster, len(s.cfg.Clusters))
	copy(out, s.cfg.Clusters)
	return out
}

// Get returns a cluster by ID.
func (s *Store) Get(id string) (*Cluster, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for i := range s.cfg.Clusters {
		if s.cfg.Clusters[i].ID == id {
			c := s.cfg.Clusters[i]
			return &c, true
		}
	}
	return nil, false
}

// Add inserts or replaces a cluster and persists to disk.
func (s *Store) Add(c Cluster) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.cfg.Clusters {
		if s.cfg.Clusters[i].ID == c.ID {
			old := s.cfg.Clusters[i]
			s.cfg.Clusters[i] = c
			if err := s.save(); err != nil {
				s.cfg.Clusters[i] = old
				return err
			}
			return nil
		}
	}
	s.cfg.Clusters = append(s.cfg.Clusters, c)
	if err := s.save(); err != nil {
		s.cfg.Clusters = s.cfg.Clusters[:len(s.cfg.Clusters)-1]
		return err
	}
	return nil
}

// Remove deletes a cluster by ID and persists to disk.
func (s *Store) Remove(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, c := range s.cfg.Clusters {
		if c.ID == id {
			prevClusters := make([]Cluster, len(s.cfg.Clusters))
			copy(prevClusters, s.cfg.Clusters)
			prevActive := s.cfg.ActiveCluster
			s.cfg.Clusters = append(s.cfg.Clusters[:i], s.cfg.Clusters[i+1:]...)
			if s.cfg.ActiveCluster == id {
				s.cfg.ActiveCluster = ""
			}
			if err := s.save(); err != nil {
				s.cfg.Clusters = prevClusters
				s.cfg.ActiveCluster = prevActive
				return err
			}
			return nil
		}
	}
	return fmt.Errorf("cluster %q: %w", id, ErrNotFound)
}

// SetActive marks a cluster as the active one.
func (s *Store) SetActive(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, c := range s.cfg.Clusters {
		if c.ID == id {
			prev := s.cfg.ActiveCluster
			s.cfg.ActiveCluster = id
			if err := s.save(); err != nil {
				s.cfg.ActiveCluster = prev
				return err
			}
			return nil
		}
	}
	return fmt.Errorf("cluster %q: %w", id, ErrNotFound)
}

// GetActive returns the active cluster ID.
func (s *Store) GetActive() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.cfg.ActiveCluster
}
