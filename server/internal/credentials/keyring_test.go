package credentials_test

import (
	"os"
	"testing"

	"github.com/zalando/go-keyring"
	"github.com/kpanel/kpanel/internal/credentials"
)

func TestMain(m *testing.M) {
	keyring.MockInit()
	os.Exit(m.Run())
}

func TestSetGet_RoundTrip(t *testing.T) {
	want := credentials.Credential{Username: "alice", Password: "s3cr3t"}
	if err := credentials.Set("test-ref", want); err != nil {
		t.Fatalf("Set: %v", err)
	}

	got, err := credentials.Get("test-ref")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.Username != want.Username {
		t.Errorf("Username: got %q, want %q", got.Username, want.Username)
	}
	if got.Password != want.Password {
		t.Errorf("Password: got %q, want %q", got.Password, want.Password)
	}
}

func TestGet_NotFound(t *testing.T) {
	_, err := credentials.Get("no-such-ref-xyz")
	if err == nil {
		t.Fatal("expected error for missing key")
	}
}

func TestSet_Overwrite(t *testing.T) {
	ref := "overwrite-ref"
	_ = credentials.Set(ref, credentials.Credential{Username: "u", Password: "old"})
	_ = credentials.Set(ref, credentials.Credential{Username: "u", Password: "new"})

	got, err := credentials.Get(ref)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.Password != "new" {
		t.Errorf("expected new password, got %q", got.Password)
	}
}

func TestDelete_RemovesCredential(t *testing.T) {
	ref := "delete-ref"
	_ = credentials.Set(ref, credentials.Credential{Username: "u", Password: "p"})

	if err := credentials.Delete(ref); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	_, err := credentials.Get(ref)
	if err == nil {
		t.Fatal("expected error after Delete, got nil")
	}
}

func TestDelete_NotFound(t *testing.T) {
	err := credentials.Delete("nonexistent-ref-abc")
	if err == nil {
		t.Fatal("expected error deleting non-existent key")
	}
}

func TestSet_EmptyPassword(t *testing.T) {
	ref := "empty-pass-ref"
	if err := credentials.Set(ref, credentials.Credential{Username: "user", Password: ""}); err != nil {
		t.Fatalf("Set with empty password: %v", err)
	}
	got, err := credentials.Get(ref)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.Password != "" {
		t.Errorf("expected empty password, got %q", got.Password)
	}
}
