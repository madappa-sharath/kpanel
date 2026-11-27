//go:build integration

package api_test

import (
	"context"
	"log"
	"os"
	"testing"

	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/kafka"
	"github.com/zalando/go-keyring"
)

// testBroker is set by TestMain and used by all integration tests.
var testBroker string

func TestMain(m *testing.M) {
	keyring.MockInit()

	// TEST_KAFKA_BROKER=localhost:9092 → skip container, use local compose.
	// Unset (CI) → spin up confluentinc/confluent-local via testcontainers.
	if b := os.Getenv("TEST_KAFKA_BROKER"); b != "" {
		testBroker = b
		os.Exit(m.Run())
	}

	ctx := context.Background()
	// Run an authorizer so ACL tests exercise create and delete. Every listener
	// is PLAINTEXT, so tests connect as ANONYMOUS, which is a super user.
	c, err := kafka.Run(ctx, "confluentinc/confluent-local:7.5.0",
		testcontainers.WithEnv(map[string]string{
			"KAFKA_AUTHORIZER_CLASS_NAME": "org.apache.kafka.metadata.authorizer.StandardAuthorizer",
			"KAFKA_SUPER_USERS":           "User:ANONYMOUS",
		}),
	)
	if err != nil {
		log.Fatalf("start kafka container: %v", err)
	}

	brokers, err := c.Brokers(ctx)
	if err != nil {
		log.Fatalf("get kafka brokers: %v", err)
	}
	testBroker = brokers[0]

	code := m.Run()
	c.Terminate(ctx) //nolint:errcheck
	os.Exit(code)
}
