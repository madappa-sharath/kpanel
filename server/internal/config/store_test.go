package config_test

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/kpanel/kpanel/internal/config"
)

func newTestStore(t *testing.T) *config.Store {
	t.Helper()
	s, err := config.NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	return s
}

func makeCluster(id string) config.Cluster {
	return config.Cluster{
		ID:       id,
		Name:     id + "-name",
		Platform: "generic",
		Brokers:  []string{"localhost:9092"},
	}
}

// --- NewStore ---

func TestNewStore_EmptyOnFirstOpen(t *testing.T) {
	s := newTestStore(t)
	if got := s.List(); len(got) != 0 {
		t.Errorf("expected empty list, got %d clusters", len(got))
	}
}

func TestNewStore_LoadsExistingConfig(t *testing.T) {
	dir := t.TempDir()
	s, _ := config.NewStore(dir)
	_ = s.Add(makeCluster("alpha"))

	// Re-open the same dir — data must persist.
	s2, err := config.NewStore(dir)
	if err != nil {
		t.Fatalf("re-open: %v", err)
	}
	got, ok := s2.Get("alpha")
	if !ok {
		t.Fatal("cluster not found after re-open")
	}
	if got.Name != "alpha-name" {
		t.Errorf("Name: got %q, want %q", got.Name, "alpha-name")
	}
}

// --- Add ---

func TestStore_Add_Append(t *testing.T) {
	s := newTestStore(t)
	if err := s.Add(makeCluster("a")); err != nil {
		t.Fatalf("Add: %v", err)
	}
	if n := len(s.List()); n != 1 {
		t.Errorf("expected 1 cluster, got %d", n)
	}
}

func TestStore_Add_Upsert(t *testing.T) {
	s := newTestStore(t)
	_ = s.Add(config.Cluster{ID: "same", Name: "original", Platform: "generic", Brokers: []string{"b1"}})
	_ = s.Add(config.Cluster{ID: "same", Name: "updated", Platform: "generic", Brokers: []string{"b1"}})

	if n := len(s.List()); n != 1 {
		t.Errorf("expected 1 cluster after upsert, got %d", n)
	}
	got, _ := s.Get("same")
	if got.Name != "updated" {
		t.Errorf("Name: got %q, want %q", got.Name, "updated")
	}
}

// --- Get ---

func TestStore_Get_Found(t *testing.T) {
	s := newTestStore(t)
	_ = s.Add(makeCluster("find-me"))

	got, ok := s.Get("find-me")
	if !ok {
		t.Fatal("expected cluster to be found")
	}
	if got.ID != "find-me" {
		t.Errorf("ID: got %q, want %q", got.ID, "find-me")
	}
}

func TestStore_Get_NotFound(t *testing.T) {
	s := newTestStore(t)
	_, ok := s.Get("ghost")
	if ok {
		t.Error("expected not-found for unknown ID")
	}
}

// --- Remove ---

func TestStore_Remove_Success(t *testing.T) {
	s := newTestStore(t)
	_ = s.Add(makeCluster("rm"))
	if err := s.Remove("rm"); err != nil {
		t.Fatalf("Remove: %v", err)
	}
	if _, ok := s.Get("rm"); ok {
		t.Error("cluster still present after Remove")
	}
}

func TestStore_Remove_NotFound(t *testing.T) {
	s := newTestStore(t)
	err := s.Remove("nobody")
	if err == nil {
		t.Fatal("expected error removing non-existent cluster")
	}
	if !errors.Is(err, config.ErrNotFound) {
		t.Errorf("expected ErrNotFound, got: %v", err)
	}
}

func TestStore_Remove_ClearsActiveCluster(t *testing.T) {
	s := newTestStore(t)
	_ = s.Add(makeCluster("active"))
	_ = s.SetActive("active")

	_ = s.Remove("active")
	if id := s.GetActive(); id != "" {
		t.Errorf("expected empty active after removing active cluster, got %q", id)
	}
}

func TestStore_Remove_DoesNotClearOtherActive(t *testing.T) {
	s := newTestStore(t)
	_ = s.Add(makeCluster("stay"))
	_ = s.Add(makeCluster("gone"))
	_ = s.SetActive("stay")

	_ = s.Remove("gone")
	if id := s.GetActive(); id != "stay" {
		t.Errorf("expected active=stay, got %q", id)
	}
}

// --- SetActive / GetActive ---

func TestStore_SetActive_Success(t *testing.T) {
	s := newTestStore(t)
	_ = s.Add(makeCluster("a"))
	_ = s.Add(makeCluster("b"))

	if err := s.SetActive("b"); err != nil {
		t.Fatalf("SetActive: %v", err)
	}
	if got := s.GetActive(); got != "b" {
		t.Errorf("GetActive: got %q, want %q", got, "b")
	}
}

func TestStore_SetActive_UnknownID(t *testing.T) {
	s := newTestStore(t)
	err := s.SetActive("nobody")
	if err == nil {
		t.Fatal("expected error for unknown cluster")
	}
	if !errors.Is(err, config.ErrNotFound) {
		t.Errorf("expected ErrNotFound, got: %v", err)
	}
}

func TestStore_GetActive_DefaultEmpty(t *testing.T) {
	s := newTestStore(t)
	if id := s.GetActive(); id != "" {
		t.Errorf("expected empty active on fresh store, got %q", id)
	}
}

// --- Persistence ---

func TestStore_Persists_AddAndRemove(t *testing.T) {
	dir := t.TempDir()
	s1, _ := config.NewStore(dir)
	_ = s1.Add(makeCluster("keep"))
	_ = s1.Add(makeCluster("drop"))
	_ = s1.Remove("drop")

	s2, _ := config.NewStore(dir)
	if _, ok := s2.Get("keep"); !ok {
		t.Error("cluster 'keep' should persist")
	}
	if _, ok := s2.Get("drop"); ok {
		t.Error("cluster 'drop' should not persist after Remove")
	}
}

func TestStore_Persists_ActiveCluster(t *testing.T) {
	dir := t.TempDir()
	s1, _ := config.NewStore(dir)
	_ = s1.Add(makeCluster("x"))
	_ = s1.SetActive("x")

	s2, _ := config.NewStore(dir)
	if id := s2.GetActive(); id != "x" {
		t.Errorf("active cluster: got %q, want %q", id, "x")
	}
}

// --- Atomic write ---

func TestStore_AtomicWrite_NoTempFileLeft(t *testing.T) {
	dir := t.TempDir()
	s, _ := config.NewStore(dir)
	_ = s.Add(makeCluster("x"))

	tmp := filepath.Join(dir, "config.json.tmp")
	if _, err := os.Stat(tmp); !os.IsNotExist(err) {
		t.Error("temp file should not exist after successful write")
	}
}

func TestStore_FilePermissions(t *testing.T) {
	dir := t.TempDir()
	s, _ := config.NewStore(dir)
	_ = s.Add(makeCluster("perm"))

	info, err := os.Stat(filepath.Join(dir, "config.json"))
	if err != nil {
		t.Fatalf("stat config.json: %v", err)
	}
	if perm := info.Mode().Perm(); perm != 0600 {
		t.Errorf("file permissions: got %o, want %o", perm, 0600)
	}
}
