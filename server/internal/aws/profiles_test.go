package aws

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestListProfiles_ReadsConfigFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config")
	contents := `[default]
region = us-east-1

[profile prod]
region = us-west-2
sso_session = my-sso

[profile staging]
region = eu-central-1

# a comment
[sso-session my-sso]
sso_start_url = https://example.awsapps.com/start
`
	if err := os.WriteFile(path, []byte(contents), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("AWS_CONFIG_FILE", path)

	got, err := ListProfiles()
	if err != nil {
		t.Fatalf("ListProfiles: %v", err)
	}
	want := []string{"default", "prod", "staging"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
}

func TestListProfiles_MissingFileReturnsEmpty(t *testing.T) {
	t.Setenv("AWS_CONFIG_FILE", filepath.Join(t.TempDir(), "does-not-exist"))

	got, err := ListProfiles()
	if err != nil {
		t.Fatalf("ListProfiles: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("expected empty slice, got %v", got)
	}
}

func TestListProfiles_DedupesAndSorts(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config")
	contents := `[profile zeta]
[profile alpha]
[default]
[profile alpha]
`
	if err := os.WriteFile(path, []byte(contents), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("AWS_CONFIG_FILE", path)

	got, err := ListProfiles()
	if err != nil {
		t.Fatalf("ListProfiles: %v", err)
	}
	want := []string{"alpha", "default", "zeta"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
}

func TestListProfiles_SkipsNonProfileSections(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config")
	// "[services foo]" and "[sso-session bar]" are valid AWS config sections
	// that should NOT appear as selectable profiles.
	contents := `[default]
[profile prod]
[services my-services]
[sso-session my-sso]
`
	if err := os.WriteFile(path, []byte(contents), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("AWS_CONFIG_FILE", path)

	got, err := ListProfiles()
	if err != nil {
		t.Fatalf("ListProfiles: %v", err)
	}
	want := []string{"default", "prod"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
}
