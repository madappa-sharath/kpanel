package connections

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

// AuthConfig holds authentication settings for a Kafka connection.
type AuthConfig struct {
	Type        string `json:"type"` // "none" | "sasl-plain" | "sasl-scram-256" | "sasl-scram-512" | "sasl-ssl" | "aws-iam"
	Username    string `json:"username,omitempty"`
	Password    string `json:"password,omitempty"`
	TLSEnabled  bool   `json:"tlsEnabled"`
	TLSCaFile   string `json:"tlsCaFile,omitempty"`
	TLSCertFile string `json:"tlsCertFile,omitempty"`
	TLSKeyFile  string `json:"tlsKeyFile,omitempty"`
	AWSRegion   string `json:"awsRegion,omitempty"`
}

// MSKMetadata holds extra info available for MSK-sourced connections.
type MSKMetadata struct {
	ClusterArn string `json:"clusterArn"`
	Region     string `json:"region"`
}

// Connection represents a named Kafka cluster that kpanel can connect to.
type Connection struct {
	ID      string       `json:"id"`
	Name    string       `json:"name"`
	Brokers []string     `json:"brokers"`
	Auth    AuthConfig   `json:"auth"`
	Source  string       `json:"source"` // "manual" | "msk-discovery"
	MSK     *MSKMetadata `json:"msk,omitempty"`
}

// Store persists connections to a local JSON file and provides thread-safe access.
type Store struct {
	mu    sync.RWMutex
	path  string
	conns map[string]*Connection
}

// NewStore creates a Store backed by configDir/connections.json.
func NewStore(configDir string) (*Store, error) {
	s := &Store{
		path:  filepath.Join(configDir, "connections.json"),
		conns: make(map[string]*Connection),
	}
	if err := s.Load(); err != nil {
		return nil, err
	}
	return s, nil
}

// Load reads connections from disk. If the file doesn't exist, the store starts empty.
func (s *Store) Load() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.path)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("read connections file: %w", err)
	}

	var list []*Connection
	if err := json.Unmarshal(data, &list); err != nil {
		return fmt.Errorf("parse connections file: %w", err)
	}

	s.conns = make(map[string]*Connection, len(list))
	for _, c := range list {
		s.conns[c.ID] = c
	}
	return nil
}

func (s *Store) save() error {
	list := make([]*Connection, 0, len(s.conns))
	for _, c := range s.conns {
		list = append(list, c)
	}
	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal connections: %w", err)
	}
	// Write to a temp file then rename for atomic replacement.
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0600); err != nil {
		return fmt.Errorf("write connections file: %w", err)
	}
	if err := os.Rename(tmp, s.path); err != nil {
		return fmt.Errorf("replace connections file: %w", err)
	}
	return nil
}

// List returns all connections.
func (s *Store) List() []*Connection {
	s.mu.RLock()
	defer s.mu.RUnlock()

	list := make([]*Connection, 0, len(s.conns))
	for _, c := range s.conns {
		list = append(list, c)
	}
	return list
}

// Get returns a connection by ID.
func (s *Store) Get(id string) (*Connection, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	c, ok := s.conns[id]
	return c, ok
}

// Add inserts or replaces a connection and persists to disk.
func (s *Store) Add(c *Connection) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.conns[c.ID] = c
	return s.save()
}

// Remove deletes a connection by ID and persists to disk.
// Returns an error wrapping ErrNotFound if the ID doesn't exist.
func (s *Store) Remove(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.conns[id]; !ok {
		return fmt.Errorf("connection %q: %w", id, ErrNotFound)
	}
	delete(s.conns, id)
	return s.save()
}

// ErrNotFound is returned when a connection ID does not exist in the store.
var ErrNotFound = fmt.Errorf("not found")
