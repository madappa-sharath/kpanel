package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	githubRepo      = "madappa-sharath/kpanel"
	releasesURL     = "https://github.com/" + githubRepo + "/releases"
	releasesAPIURL  = "https://api.github.com/repos/" + githubRepo + "/releases?per_page=20"
	releaseAssetURL = "https://github.com/" + githubRepo + "/releases/download/"

	// releaseAgingPeriod is how long a release must be public before kpanel
	// offers it. The delay gives time to catch and pull a compromised release
	// (delete it or mark it prerelease) before users are prompted to install it.
	releaseAgingPeriod = 72 * time.Hour

	// releasePollInterval is how often the release list is refreshed. Aging is
	// measured at fetch time, so a release pulled before it turns 72h old is
	// seen as pulled by the fetch that would otherwise make it eligible.
	releasePollInterval = 6 * time.Hour
)

// releaseTagRe limits offered tags to plain vX.Y.Z, because the tag is put
// into a shell command that users copy and run.
var releaseTagRe = regexp.MustCompile(`^v?\d+\.\d+\.\d+$`)

// ghRelease is the subset of a GitHub release that the update check reads.
type ghRelease struct {
	TagName     string    `json:"tag_name"`
	HTMLURL     string    `json:"html_url"`
	Draft       bool      `json:"draft"`
	Prerelease  bool      `json:"prerelease"`
	PublishedAt time.Time `json:"published_at"`
	Assets      []struct {
		Name string `json:"name"`
	} `json:"assets"`
}

// hasInstallers reports whether the release carries both install scripts
// that installCmd points at.
func (r *ghRelease) hasInstallers() bool {
	var sh, ps1 bool
	for _, a := range r.Assets {
		sh = sh || a.Name == "install.sh"
		ps1 = ps1 || a.Name == "install.ps1"
	}
	return sh && ps1
}

type updateChecker struct {
	current string

	mu        sync.RWMutex
	releases  []ghRelease
	fetchedAt time.Time // when releases was fetched
}

func newUpdateChecker(current string) *updateChecker {
	uc := &updateChecker{current: current}
	go func() {
		uc.check()
		ticker := time.NewTicker(releasePollInterval)
		defer ticker.Stop()
		for range ticker.C {
			uc.check()
		}
	}()
	return uc
}

func (uc *updateChecker) check() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, releasesAPIURL, nil)
	if err != nil {
		return
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return
	}

	var releases []ghRelease
	if err := json.NewDecoder(resp.Body).Decode(&releases); err != nil {
		return
	}

	uc.setReleases(releases, time.Now())
}

func (uc *updateChecker) setReleases(releases []ghRelease, fetchedAt time.Time) {
	uc.mu.Lock()
	uc.releases = releases
	uc.fetchedAt = fetchedAt
	uc.mu.Unlock()
}

// selectRelease picks the highest stable release, with both install scripts
// attached, that had been public for at least releaseAgingPeriod at now.
// Callers pass the time the list was fetched as now, so the age is one that
// GitHub confirmed, not one extrapolated from an old snapshot. It also returns the highest stable release
// newer than that one that is still aging, if any. Either may be nil.
func selectRelease(releases []ghRelease, now time.Time) (eligible, pending *ghRelease) {
	for i := range releases {
		r := &releases[i]
		if r.Draft || r.Prerelease || r.PublishedAt.IsZero() || !releaseTagRe.MatchString(r.TagName) || !r.hasInstallers() {
			continue
		}
		if now.Sub(r.PublishedAt) >= releaseAgingPeriod {
			if eligible == nil || semverGT(r.TagName, eligible.TagName) {
				eligible = r
			}
		} else if pending == nil || semverGT(r.TagName, pending.TagName) {
			pending = r
		}
	}
	if pending != nil && eligible != nil && !semverGT(pending.TagName, eligible.TagName) {
		pending = nil
	}
	return eligible, pending
}

type versionResponse struct {
	Current          string `json:"current"`
	Latest           string `json:"latest,omitempty"`
	UpdateAvailable  bool   `json:"updateAvailable"`
	ReleasesURL      string `json:"releasesURL"`
	LatestReleaseURL string `json:"latestReleaseURL,omitempty"`
	Platform         string `json:"platform"`
	Arch             string `json:"arch"`
	InstallCmd       string `json:"installCmd,omitempty"`
	// Pending is a newer release still in its aging period, and PendingAt is
	// when it becomes eligible. Both are set only when it is newer than Current.
	Pending   string     `json:"pending,omitempty"`
	PendingAt *time.Time `json:"pendingAt,omitempty"`
}

func (h *Handlers) GetVersion(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.updater.versionInfo(runtime.GOOS, runtime.GOARCH))
}

func (uc *updateChecker) versionInfo(goos, goarch string) versionResponse {
	uc.mu.RLock()
	eligible, pending := selectRelease(uc.releases, uc.fetchedAt)
	uc.mu.RUnlock()

	resp := versionResponse{
		Current:     uc.current,
		ReleasesURL: releasesURL,
		Platform:    goos,
		Arch:        goarch,
	}
	if eligible != nil {
		resp.Latest = eligible.TagName
		resp.LatestReleaseURL = eligible.HTMLURL
		if semverGT(eligible.TagName, uc.current) {
			resp.UpdateAvailable = true
			resp.InstallCmd = installCmd(goos, eligible.TagName)
		}
	}
	if pending != nil && semverGT(pending.TagName, uc.current) {
		at := pending.PublishedAt.Add(releaseAgingPeriod).UTC()
		resp.Pending = pending.TagName
		resp.PendingAt = &at
	}
	return resp
}

// installCmd returns a command that installs exactly tag, using the install
// script attached to that release rather than one from a branch.
func installCmd(goos, tag string) string {
	base := releaseAssetURL + tag + "/"
	switch goos {
	case "windows":
		return fmt.Sprintf("$env:VERSION='%s'; irm %sinstall.ps1 | iex", tag, base)
	default:
		return fmt.Sprintf("curl -fsSL %sinstall.sh | VERSION=%s sh", base, tag)
	}
}

// semverGT returns true if a is strictly greater than b (e.g. "v1.2.3" > "v1.1.0").
func semverGT(a, b string) bool {
	parse := func(v string) [3]int {
		v = strings.TrimPrefix(v, "v")
		parts := strings.SplitN(v, ".", 3)
		var nums [3]int
		for i, p := range parts {
			if i >= 3 {
				break
			}
			n, _ := strconv.Atoi(strings.SplitN(p, "-", 2)[0]) // strip pre-release suffix
			nums[i] = n
		}
		return nums
	}
	pa, pb := parse(a), parse(b)
	for i := range pa {
		if pa[i] != pb[i] {
			return pa[i] > pb[i]
		}
	}
	return false
}
