package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"text/tabwriter"
	"time"

	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/sasl/plain"
)

// devACLs are the bindings `make kafka-acls` seeds on the local broker.
// The broker is deny-by-default, so alice and bob can do only what is listed
// here. admin and ANONYMOUS (PLAINTEXT :9092) are super users.
func devACLs() []*kadm.ACLBuilder {
	return []*kadm.ACLBuilder{
		// alice: producer and consumer for orders, using group orders-processor.
		// Read and Write each imply Describe, so no Describe binding is needed.
		kadm.NewACLs().Topics("orders").Allow("User:alice").
			Operations(kadm.OpWrite, kadm.OpRead).
			ResourcePatternType(kadm.ACLPatternLiteral),
		kadm.NewACLs().Groups("orders-processor").Allow("User:alice").
			Operations(kadm.OpRead).
			ResourcePatternType(kadm.ACLPatternLiteral),
		// alice: read every topic whose name starts with "logs-".
		kadm.NewACLs().Topics("logs-").Allow("User:alice").
			Operations(kadm.OpRead).
			ResourcePatternType(kadm.ACLPatternPrefixed),
		// bob: read any topic ("*" is the literal wildcard) except orders.
		// The explicit Deny wins over the wildcard Allow.
		kadm.NewACLs().Topics("*").Allow("User:bob").
			Operations(kadm.OpRead).
			ResourcePatternType(kadm.ACLPatternLiteral),
		kadm.NewACLs().Topics("orders").Deny("User:bob").
			Operations(kadm.OpRead).
			ResourcePatternType(kadm.ACLPatternLiteral),
	}
}

func seedACLs(ctx context.Context, adm *kadm.Client) {
	for _, b := range devACLs() {
		results, err := adm.CreateACLs(ctx, b)
		if err != nil {
			log.Fatalf("create acls: %v", err)
		}
		for _, r := range results {
			if r.Err != nil {
				if errors.Is(r.Err, kerr.SecurityDisabled) {
					log.Fatalf("the broker has no authorizer configured; recreate it with `docker compose up -d --force-recreate`")
				}
				log.Fatalf("create acl %s %s %s %s:%s: %v", r.Principal, r.Permission, r.Operation, r.Type, r.Name, r.Err)
			}
			log.Printf("  acl %-10s %-5s %-8s %s:%s (%s)", r.Principal, r.Permission, r.Operation, r.Type, r.Name, r.Pattern)
		}
	}
}

type aclCheck struct {
	user   string
	action string
	target string
	allow  bool
	run    func(ctx context.Context, user string) error
}

func verifyChecks() []aclCheck {
	return []aclCheck{
		{"alice", "produce", "orders", true, produceCheck("orders")},
		{"alice", "consume", "orders", true, consumeCheck("orders")},
		{"alice", "fetch-offsets", "group orders-processor", true, offsetsCheck("orders-processor")},
		{"alice", "consume", "logs-aggregated", true, consumeCheck("logs-aggregated")},
		{"alice", "produce", "payments", false, produceCheck("payments")},
		{"alice", "consume", "payments", false, consumeCheck("payments")},
		{"alice", "fetch-offsets", "group analytics-pipeline", false, offsetsCheck("analytics-pipeline")},
		{"alice", "list-acls", "cluster", false, listACLsCheck},
		{"bob", "consume", "payments", true, consumeCheck("payments")},
		{"bob", "consume", "orders", false, consumeCheck("orders")},
		{"bob", "produce", "payments", false, produceCheck("payments")},
	}
}

var devPasswords = map[string]string{
	"alice": "alice-secret",
	"bob":   "bob-secret",
}

func userClient(user string, opts ...kgo.Opt) (*kgo.Client, error) {
	base := []kgo.Opt{
		kgo.SeedBrokers(*saslBroker),
		kgo.ClientID("kafkaseed-verify-" + user),
		kgo.SASL(plain.Auth{User: user, Pass: devPasswords[user]}.AsMechanism()),
	}
	return kgo.NewClient(append(base, opts...)...)
}

func produceCheck(topic string) func(context.Context, string) error {
	return func(ctx context.Context, user string) error {
		cl, err := userClient(user)
		if err != nil {
			return err
		}
		defer cl.Close()
		return cl.ProduceSync(ctx, &kgo.Record{Topic: topic, Value: []byte("acl-verify")}).FirstErr()
	}
}

func consumeCheck(topic string) func(context.Context, string) error {
	return func(ctx context.Context, user string) error {
		cl, err := userClient(user, kgo.ConsumeTopics(topic), kgo.ConsumeResetOffset(kgo.NewOffset().AtStart()))
		if err != nil {
			return err
		}
		defer cl.Close()
		for {
			fetches := cl.PollFetches(ctx)
			if errs := fetches.Errors(); len(errs) > 0 {
				return errs[0].Err
			}
			if fetches.NumRecords() > 0 {
				return nil
			}
			if ctx.Err() != nil {
				return fmt.Errorf("no records from %s: %w", topic, ctx.Err())
			}
		}
	}
}

func offsetsCheck(group string) func(context.Context, string) error {
	return func(ctx context.Context, user string) error {
		cl, err := userClient(user)
		if err != nil {
			return err
		}
		defer cl.Close()
		resp, err := kadm.NewClient(cl).FetchOffsets(ctx, group)
		if err != nil {
			return err
		}
		return resp.Error()
	}
}

func listACLsCheck(ctx context.Context, user string) error {
	cl, err := userClient(user)
	if err != nil {
		return err
	}
	defer cl.Close()
	all := kadm.NewACLs().AnyResource().Allow().AllowHosts().Deny().DenyHosts().
		Operations().ResourcePatternType(kadm.ACLPatternAny)
	results, err := kadm.NewClient(cl).DescribeACLs(ctx, all)
	if err != nil {
		return err
	}
	for _, r := range results {
		if r.Err != nil {
			return r.Err
		}
	}
	return nil
}

func isAuthorizationError(err error) bool {
	return errors.Is(err, kerr.TopicAuthorizationFailed) ||
		errors.Is(err, kerr.GroupAuthorizationFailed) ||
		errors.Is(err, kerr.ClusterAuthorizationFailed) ||
		errors.Is(err, kerr.TransactionalIDAuthorizationFailed)
}

// verifyACLs connects as each dev user and checks that the broker allows and
// denies operations as devACLs describes. It exits non-zero on any mismatch.
func verifyACLs(ctx context.Context, adm *kadm.Client) {
	// The consume checks read seeded records; without them an allowed read
	// would look like a failure.
	if !hasSeedData(ctx, adm) {
		log.Fatalf("no seed data on %s; run `make kafka-seed` first", *broker)
	}
	tw := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(tw, "USER\tACTION\tTARGET\tEXPECT\tGOT\tRESULT")
	failed := 0
	for _, c := range verifyChecks() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		err := c.run(ctx, c.user)
		cancel()

		got := "ALLOW"
		switch {
		case err == nil:
		case isAuthorizationError(err):
			got = "DENY"
		default:
			got = "ERROR"
		}
		expect := "DENY"
		if c.allow {
			expect = "ALLOW"
		}
		result := "ok"
		if got != expect {
			result = "FAIL"
			if err != nil {
				result += " (" + err.Error() + ")"
			}
			failed++
		}
		fmt.Fprintf(tw, "%s\t%s\t%s\t%s\t%s\t%s\n", c.user, c.action, c.target, expect, got, result)
	}
	tw.Flush() //nolint:errcheck
	if failed > 0 {
		fmt.Printf("\n%d check(s) failed\n", failed)
		os.Exit(1)
	}
}
