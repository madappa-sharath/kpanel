package aws

import (
	"context"
	"errors"
	"testing"
)

// recoveryHint is unexported; tested here via white-box test (package aws).

var recoveryHintCases = []struct {
	name    string
	profile string
	err     error
	want    string
}{
	{"nil error", "prod", nil, ""},
	{"sso keyword", "prod", errors.New("sso token expired"), "aws sso login --profile prod"},
	{"token keyword", "prod", errors.New("token is invalid"), "aws sso login --profile prod"},
	{"expired keyword", "prod", errors.New("credentials expired"), "aws sso login --profile prod"},
	{"not authorized keyword", "prod", errors.New("not authorized to perform this action"), "aws sso login --profile prod"},
	{"uppercase SSO", "prod", errors.New("SSO session expired"), "aws sso login --profile prod"},
	{"default profile", "default", errors.New("sso expired"), "aws sso login --profile default"},
	{"empty profile", "", errors.New("sso expired"), "aws sso login"},
	{"generic network error", "prod", errors.New("connection refused"), ""},
	{"timeout error", "prod", errors.New("request timed out"), ""},
}

func TestRecoveryHint(t *testing.T) {
	for _, tc := range recoveryHintCases {
		t.Run(tc.name, func(t *testing.T) {
			got := recoveryHint(tc.profile, tc.err)
			if got != tc.want {
				t.Errorf("recoveryHint(%q, %q) = %q, want %q", tc.profile, tc.err, got, tc.want)
			}
		})
	}
}

func TestCheckSession_ProfileFieldAlwaysSet(t *testing.T) {
	// Use an already-cancelled context so the STS call fails immediately
	// without making any network requests.
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	got := CheckSession(ctx, "my-profile", "us-east-1")

	if got.Profile != "my-profile" {
		t.Errorf("Profile: got %q, want %q", got.Profile, "my-profile")
	}
}

func TestCheckSession_ValidFalseOnError(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	got := CheckSession(ctx, "any-profile", "us-east-1")

	if got.Valid {
		t.Error("expected Valid=false with a cancelled context")
	}
	if got.Error == "" {
		t.Error("expected Error to be non-empty on failure")
	}
}

func TestCheckSession_AccountAndARNEmptyOnFailure(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	got := CheckSession(ctx, "p", "us-east-1")
	if got.Account != "" {
		t.Errorf("Account should be empty on failure, got %q", got.Account)
	}
	if got.UserARN != "" {
		t.Errorf("UserARN should be empty on failure, got %q", got.UserARN)
	}
}
