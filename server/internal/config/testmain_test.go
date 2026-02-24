package config_test

import (
	"os"
	"testing"

	"github.com/zalando/go-keyring"
)

func TestMain(m *testing.M) {
	// Use an in-memory keyring so tests don't touch the OS keychain.
	keyring.MockInit()
	os.Exit(m.Run())
}
