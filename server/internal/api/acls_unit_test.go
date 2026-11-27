package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kpanel/kpanel/internal/config"
	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kmsg"
)

func TestParseNewBinding_Defaults(t *testing.T) {
	p, err := parseNewBinding(aclBinding{
		Principal:    "alice",
		ResourceType: "Topic",
		ResourceName: " orders ",
		Operation:    "WRITE",
		Permission:   "allow",
	})
	if err != nil {
		t.Fatalf("parseNewBinding: %v", err)
	}
	want := parsedBinding{
		principal:  "User:alice",
		host:       "*",
		resType:    kmsg.ACLResourceTypeTopic,
		name:       "orders",
		pattern:    kmsg.ACLResourcePatternTypeLiteral,
		op:         kmsg.ACLOperationWrite,
		permission: kmsg.ACLPermissionTypeAllow,
	}
	if p != want {
		t.Errorf("got %+v, want %+v", p, want)
	}
}

func TestParseNewBinding_KeepsPrincipalType(t *testing.T) {
	p, err := parseNewBinding(aclBinding{
		Principal: "Group:ops", ResourceType: "group", ResourceName: "g",
		Operation: "read", Permission: "deny", Host: "10.0.0.1", PatternType: "prefixed",
	})
	if err != nil {
		t.Fatalf("parseNewBinding: %v", err)
	}
	if p.principal != "Group:ops" || p.host != "10.0.0.1" || p.pattern != kmsg.ACLResourcePatternTypePrefixed || p.permission != kmsg.ACLPermissionTypeDeny {
		t.Errorf("unexpected parse: %+v", p)
	}
}

func TestParseNewBinding_Cluster(t *testing.T) {
	p, err := parseNewBinding(aclBinding{
		Principal: "User:a", ResourceType: "cluster", ResourceName: "ignored", PatternType: "prefixed",
		Operation: "idempotent_write", Permission: "allow",
	})
	if err != nil {
		t.Fatalf("parseNewBinding: %v", err)
	}
	if p.name != clusterResourceName || p.pattern != kmsg.ACLResourcePatternTypeLiteral {
		t.Errorf("cluster binding: got name %q pattern %s", p.name, p.pattern)
	}
}

func TestParseNewBinding_Rejects(t *testing.T) {
	valid := aclBinding{Principal: "User:a", ResourceType: "topic", ResourceName: "t", Operation: "read", Permission: "allow"}
	tests := []struct {
		name   string
		mutate func(*aclBinding)
	}{
		{"empty principal", func(b *aclBinding) { b.Principal = " " }},
		{"user resource type", func(b *aclBinding) { b.ResourceType = "user" }},
		{"any resource type", func(b *aclBinding) { b.ResourceType = "any" }},
		{"unknown resource type", func(b *aclBinding) { b.ResourceType = "schema" }},
		{"missing resource name", func(b *aclBinding) { b.ResourceName = "" }},
		{"any pattern", func(b *aclBinding) { b.PatternType = "any" }},
		{"match pattern", func(b *aclBinding) { b.PatternType = "match" }},
		{"any operation", func(b *aclBinding) { b.Operation = "any" }},
		{"unknown operation", func(b *aclBinding) { b.Operation = "publish" }},
		{"any permission", func(b *aclBinding) { b.Permission = "any" }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			b := valid
			tt.mutate(&b)
			if _, err := parseNewBinding(b); err == nil {
				t.Errorf("expected error for %+v", b)
			}
		})
	}
}

func TestParseExistingBinding_Verbatim(t *testing.T) {
	// Delete must target exactly the listed binding: no trimming, no
	// principal type added, no cluster name substituted.
	in := aclBinding{
		Principal: "alice", Host: " 10.0.0.1", ResourceType: "group", ResourceName: "billing ",
		PatternType: "literal", Operation: "read", Permission: "allow",
	}
	p, err := parseExistingBinding(in)
	if err != nil {
		t.Fatalf("parseExistingBinding: %v", err)
	}
	if out := p.binding(); out != in {
		t.Errorf("got %+v, want %+v", out, in)
	}
	f := p.deleteFilter()
	if *f.Principal != "alice" || *f.Host != " 10.0.0.1" || *f.ResourceName != "billing " {
		t.Errorf("filter not verbatim: %+v", f)
	}

	cluster, err := parseExistingBinding(aclBinding{
		Principal: "User:a", Host: "*", ResourceType: "cluster", ResourceName: "kafka-cluster",
		PatternType: "literal", Operation: "alter", Permission: "allow",
	})
	if err != nil {
		t.Fatal(err)
	}
	if f := cluster.deleteFilter(); f.ResourceName == nil || *f.ResourceName != "kafka-cluster" {
		t.Errorf("cluster filter must name the resource, got %v", f.ResourceName)
	}
}

func TestParseExistingBinding_AcceptsListedTypes(t *testing.T) {
	// A user-resource ACL can be listed, so it must be deletable.
	p, err := parseExistingBinding(aclBinding{
		Principal: "User:a", Host: "*", ResourceType: "user", ResourceName: "User:b",
		PatternType: "literal", Operation: "describe_tokens", Permission: "allow",
	})
	if err != nil {
		t.Fatalf("parseExistingBinding: %v", err)
	}
	if p.resType != kmsg.ACLResourceTypeUser || p.op != kmsg.ACLOperationDescribeTokens {
		t.Errorf("unexpected parse: %+v", p)
	}
	if _, err := parseExistingBinding(aclBinding{
		Principal: "User:a", Host: "", ResourceType: "topic", ResourceName: "t",
		PatternType: "literal", Operation: "read", Permission: "allow",
	}); err == nil {
		t.Error("empty host must be rejected for delete")
	}
}

func TestBindingRoundTrip(t *testing.T) {
	// Every listed value must parse and format back to itself, so the UI can
	// send a listed binding straight back to the delete endpoint.
	for rt := kmsg.ACLResourceTypeTopic; rt <= kmsg.ACLResourceTypeUser; rt++ {
		for _, pt := range []kmsg.ACLResourcePatternType{kmsg.ACLResourcePatternTypeLiteral, kmsg.ACLResourcePatternTypePrefixed} {
			for op := kmsg.ACLOperationAll; op <= kmsg.ACLOperationDescribeTokens; op++ {
				for _, perm := range []kmsg.ACLPermissionType{kmsg.ACLPermissionTypeAllow, kmsg.ACLPermissionTypeDeny} {
					in := describedToBinding(kadm.DescribedACL{
						Principal: "User:x", Host: "*", Type: rt, Name: "n", Pattern: pt, Operation: op, Permission: perm,
					})
					p, err := parseExistingBinding(in)
					if err != nil {
						t.Fatalf("parse %+v: %v", in, err)
					}
					if out := p.binding(); out != in {
						t.Fatalf("round trip: got %+v, want %+v", out, in)
					}
				}
			}
		}
	}
}

func TestDescribedToBinding(t *testing.T) {
	got := describedToBinding(kadm.DescribedACL{
		Principal:  "User:bob",
		Host:       "*",
		Type:       kmsg.ACLResourceTypeTransactionalId,
		Name:       "tx-",
		Pattern:    kmsg.ACLResourcePatternTypePrefixed,
		Operation:  kmsg.ACLOperationDescribeConfigs,
		Permission: kmsg.ACLPermissionTypeDeny,
	})
	want := aclBinding{
		Principal: "User:bob", Host: "*", ResourceType: "transactional_id", ResourceName: "tx-",
		PatternType: "prefixed", Operation: "describe_configs", Permission: "deny",
	}
	if got != want {
		t.Errorf("got %+v, want %+v", got, want)
	}
}

func TestDeleteResult(t *testing.T) {
	p, _ := parseExistingBinding(aclBinding{
		Principal: "User:a", Host: "*", ResourceType: "topic", ResourceName: "t",
		PatternType: "literal", Operation: "read", Permission: "allow",
	})
	msg := "denied"
	tests := []struct {
		name    string
		resp    kmsg.DeleteACLsResponseResult
		deleted int
		wantErr error
	}{
		{"one match deleted", kmsg.DeleteACLsResponseResult{MatchingACLs: make([]kmsg.DeleteACLsResponseResultMatchingACL, 1)}, 1, nil},
		{"no match", kmsg.DeleteACLsResponseResult{}, 0, nil},
		{"filter error", kmsg.DeleteACLsResponseResult{ErrorCode: kerr.ClusterAuthorizationFailed.Code}, 0, kerr.ClusterAuthorizationFailed},
		{"match error is not a deletion", kmsg.DeleteACLsResponseResult{MatchingACLs: []kmsg.DeleteACLsResponseResultMatchingACL{
			{ErrorCode: kerr.InvalidRequest.Code, ErrorMessage: &msg},
		}}, 0, kerr.InvalidRequest},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res, err := deleteResult(p, tt.resp)
			if res.Deleted != tt.deleted {
				t.Errorf("deleted: got %d, want %d", res.Deleted, tt.deleted)
			}
			if !errors.Is(err, tt.wantErr) || (tt.wantErr == nil) != (res.Error == "") {
				t.Errorf("err: got %v (result %q), want %v", err, res.Error, tt.wantErr)
			}
		})
	}
}

func TestWriteACLResults(t *testing.T) {
	results := []aclResult{{}, {}}
	tests := []struct {
		name   string
		errs   []error
		status int
		code   string
	}{
		{"all succeeded", []error{nil, nil}, http.StatusOK, ""},
		{"all not authorized", []error{kerr.ClusterAuthorizationFailed, kerr.ClusterAuthorizationFailed}, http.StatusForbidden, "unauthorized"},
		{"mixed success keeps per-binding results", []error{nil, kerr.ClusterAuthorizationFailed}, http.StatusOK, ""},
		{"mixed classified errors", []error{kerr.SecurityDisabled, kerr.ClusterAuthorizationFailed}, http.StatusOK, ""},
		{"per-binding error", []error{kerr.InvalidRequest, kerr.InvalidRequest}, http.StatusOK, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			writeACLResults(w, results, tt.errs)
			if w.Code != tt.status {
				t.Fatalf("status %d, want %d", w.Code, tt.status)
			}
			var body map[string]any
			_ = json.Unmarshal(w.Body.Bytes(), &body)
			if tt.code != "" && body["code"] != tt.code {
				t.Errorf("code %v, want %s", body["code"], tt.code)
			}
			if tt.code == "" && body["results"] == nil {
				t.Errorf("expected results, got %v", body)
			}
		})
	}
}

func TestClassifyACLError(t *testing.T) {
	tests := []struct {
		name   string
		err    error
		status int
		code   string
	}{
		{"security disabled", kerr.SecurityDisabled, http.StatusConflict, "security_disabled"},
		{"wrapped security disabled", fmt.Errorf("describe: %w", kerr.SecurityDisabled), http.StatusConflict, "security_disabled"},
		{"cluster authorization", kerr.ClusterAuthorizationFailed, http.StatusForbidden, "unauthorized"},
		{"per-binding error", kerr.InvalidRequest, 0, ""},
		{"network error", fmt.Errorf("dial tcp: refused"), 0, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			e := classifyACLError(tt.err)
			if tt.code == "" {
				if e != nil {
					t.Errorf("expected nil, got %+v", e)
				}
				return
			}
			if e == nil || e.status != tt.status || e.code != tt.code {
				t.Errorf("got %+v, want status %d code %q", e, tt.status, tt.code)
			}
		})
	}
}

func TestIsIAMManaged(t *testing.T) {
	if isIAMManaged(&config.Cluster{}) {
		t.Error("cluster without auth reported as IAM")
	}
	if isIAMManaged(&config.Cluster{Auth: &config.ClusterAuth{Mechanism: "sasl_plain"}}) {
		t.Error("sasl_plain reported as IAM")
	}
	if !isIAMManaged(&config.Cluster{Auth: &config.ClusterAuth{Mechanism: "aws_iam"}}) {
		t.Error("aws_iam not reported as IAM")
	}
}

func TestSortBindings(t *testing.T) {
	bs := []aclBinding{
		{Principal: "User:bob", ResourceType: "topic", ResourceName: "a", Operation: "read"},
		{Principal: "User:alice", ResourceType: "topic", ResourceName: "b", Operation: "write"},
		{Principal: "User:alice", ResourceType: "group", ResourceName: "z", Operation: "read"},
		{Principal: "User:alice", ResourceType: "topic", ResourceName: "b", Operation: "describe"},
	}
	sortBindings(bs)
	order := []string{"group/z/read", "topic/b/describe", "topic/b/write", "topic/a/read"}
	for i, b := range bs {
		if got := b.ResourceType + "/" + b.ResourceName + "/" + b.Operation; got != order[i] {
			t.Errorf("position %d: got %s, want %s", i, got, order[i])
		}
	}
}
