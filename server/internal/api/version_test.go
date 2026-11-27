package api

import (
	"testing"
	"time"
)

var testNow = time.Date(2026, 11, 24, 12, 0, 0, 0, time.UTC)

func rel(tag string, age time.Duration) ghRelease {
	r := ghRelease{
		TagName:     tag,
		HTMLURL:     "https://github.com/" + githubRepo + "/releases/tag/" + tag,
		PublishedAt: testNow.Add(-age),
	}
	r.Assets = append(r.Assets, struct {
		Name string `json:"name"`
	}{"install.sh"}, struct {
		Name string `json:"name"`
	}{"install.ps1"})
	return r
}

func tagOf(r *ghRelease) string {
	if r == nil {
		return ""
	}
	return r.TagName
}

func TestSelectRelease(t *testing.T) {
	draft := rel("v9.0.0", 30*24*time.Hour)
	draft.Draft = true
	pre := rel("v8.0.0", 30*24*time.Hour)
	pre.Prerelease = true
	unpublished := rel("v7.0.0", 0)
	unpublished.PublishedAt = time.Time{}
	noScripts := rel("v6.0.0", 30*24*time.Hour)
	noScripts.Assets = noScripts.Assets[:1] // install.sh only

	cases := []struct {
		name         string
		releases     []ghRelease
		wantEligible string
		wantPending  string
	}{
		{
			name:     "empty list",
			releases: nil,
		},
		{
			name:        "nothing aged yet",
			releases:    []ghRelease{rel("v1.1.0", 71*time.Hour), rel("v1.0.0", time.Hour)},
			wantPending: "v1.1.0",
		},
		{
			name:         "exactly 72h is eligible",
			releases:     []ghRelease{rel("v1.1.0", 72*time.Hour)},
			wantEligible: "v1.1.0",
		},
		{
			name:         "newest aged release wins, newer unaged is pending",
			releases:     []ghRelease{rel("v1.3.0", time.Hour), rel("v1.2.0", 100*time.Hour), rel("v1.1.0", 200*time.Hour)},
			wantEligible: "v1.2.0",
			wantPending:  "v1.3.0",
		},
		{
			name:         "draft and prerelease excluded",
			releases:     []ghRelease{draft, pre, rel("v1.0.0", 100*time.Hour)},
			wantEligible: "v1.0.0",
		},
		{
			name:         "missing published_at excluded",
			releases:     []ghRelease{unpublished, rel("v1.0.0", 100*time.Hour)},
			wantEligible: "v1.0.0",
		},
		{
			name:         "release missing an install script excluded",
			releases:     []ghRelease{noScripts, rel("v1.0.0", 100*time.Hour)},
			wantEligible: "v1.0.0",
		},
		{
			name:         "semver ordering, not list or string order",
			releases:     []ghRelease{rel("v1.9.0", 100*time.Hour), rel("v1.10.0", 200*time.Hour), rel("v1.2.0", 300*time.Hour)},
			wantEligible: "v1.10.0",
		},
		{
			name:         "unaged older release is not pending",
			releases:     []ghRelease{rel("v1.0.1", time.Hour), rel("v1.2.0", 100*time.Hour)},
			wantEligible: "v1.2.0",
		},
		{
			name:         "non-semver tags rejected",
			releases:     []ghRelease{rel("v2.0.0; rm -rf ~", 100*time.Hour), rel("nightly", 100*time.Hour), rel("v1.0.0", 100*time.Hour)},
			wantEligible: "v1.0.0",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			eligible, pending := selectRelease(tc.releases, testNow)
			if got := tagOf(eligible); got != tc.wantEligible {
				t.Errorf("eligible = %q, want %q", got, tc.wantEligible)
			}
			if got := tagOf(pending); got != tc.wantPending {
				t.Errorf("pending = %q, want %q", got, tc.wantPending)
			}
		})
	}
}

func TestVersionInfo(t *testing.T) {
	uc := &updateChecker{current: "v1.0.0"}
	uc.setReleases([]ghRelease{rel("v1.2.0", time.Hour), rel("v1.1.0", 100*time.Hour)}, testNow)

	got := uc.versionInfo("darwin", "arm64")
	if !got.UpdateAvailable || got.Latest != "v1.1.0" {
		t.Fatalf("got updateAvailable=%v latest=%q, want true v1.1.0", got.UpdateAvailable, got.Latest)
	}
	wantCmd := "curl -fsSL https://github.com/madappa-sharath/kpanel/releases/download/v1.1.0/install.sh | VERSION=v1.1.0 sh"
	if got.InstallCmd != wantCmd {
		t.Errorf("installCmd = %q, want %q", got.InstallCmd, wantCmd)
	}
	if got.Pending != "v1.2.0" || got.PendingAt == nil || !got.PendingAt.Equal(testNow.Add(71*time.Hour)) {
		t.Errorf("pending = %q at %v, want v1.2.0 at %v", got.Pending, got.PendingAt, testNow.Add(71*time.Hour))
	}

	// A fetch after the aging period confirms v1.2.0 and makes it eligible.
	uc.setReleases(uc.releases, testNow.Add(71*time.Hour))
	later := uc.versionInfo("windows", "amd64")
	if later.Latest != "v1.2.0" || later.Pending != "" {
		t.Errorf("after aging: latest=%q pending=%q, want v1.2.0 and none", later.Latest, later.Pending)
	}
	wantPs := "$env:VERSION='v1.2.0'; irm https://github.com/madappa-sharath/kpanel/releases/download/v1.2.0/install.ps1 | iex"
	if later.InstallCmd != wantPs {
		t.Errorf("windows installCmd = %q, want %q", later.InstallCmd, wantPs)
	}

	// In the container image the offer is the image tag for that release.
	uc.installMethod = "docker"
	if got := uc.versionInfo("linux", "arm64").InstallCmd; got != "docker pull ghcr.io/madappa-sharath/kpanel:v1.2.0" {
		t.Errorf("docker installCmd = %q", got)
	}
	uc.installMethod = ""

	// Up to date: no update and no install command.
	uc.current = "v1.2.0"
	if cur := uc.versionInfo("linux", "amd64"); cur.UpdateAvailable || cur.InstallCmd != "" || cur.Pending != "" {
		t.Errorf("up to date: got %+v", cur)
	}
}

// A release that ages past 72h only in an old snapshot (because later fetches
// failed, or have not happened yet) must not be offered: it may have been
// pulled in the meantime.
func TestVersionInfoNeedsFreshFetchToAge(t *testing.T) {
	uc := &updateChecker{current: "v1.0.0"}
	uc.setReleases([]ghRelease{rel("v1.1.0", 71*time.Hour)}, testNow)

	// No new fetch; only the wall clock moves. Nothing is offered.
	if got := uc.versionInfo("linux", "amd64"); got.UpdateAvailable || got.InstallCmd != "" {
		t.Fatalf("stale snapshot offered %q (%q)", got.Latest, got.InstallCmd)
	}

	// The next fetch shows it was pulled (marked prerelease).
	pulled := rel("v1.1.0", 73*time.Hour)
	pulled.Prerelease = true
	uc.setReleases([]ghRelease{pulled}, testNow.Add(2*time.Hour))
	if got := uc.versionInfo("linux", "amd64"); got.UpdateAvailable || got.Pending != "" {
		t.Errorf("pulled release still surfaced: %+v", got)
	}
}

func TestSemverGT(t *testing.T) {
	cases := []struct {
		a, b string
		want bool
	}{
		{"v1.2.3", "v1.1.0", true},
		{"v1.10.0", "v1.9.0", true},
		{"v1.0.0", "v1.0.0", false},
		{"v1.0.0", "v1.0.1", false},
		{"1.2.0", "v1.1.9", true},
		{"v1.2.0-rc1", "v1.2.0", false},
	}
	for _, tc := range cases {
		if got := semverGT(tc.a, tc.b); got != tc.want {
			t.Errorf("semverGT(%q, %q) = %v, want %v", tc.a, tc.b, got, tc.want)
		}
	}
}
