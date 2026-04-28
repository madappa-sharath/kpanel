package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	githubRepo   = "madappa-sharath/kpanel"
	releasesURL  = "https://github.com/" + githubRepo + "/releases"
	installShURL = "https://raw.githubusercontent.com/" + githubRepo + "/main/scripts/install.sh"
	installPs1URL = "https://raw.githubusercontent.com/" + githubRepo + "/main/scripts/install.ps1"
)

type updateChecker struct {
	current string

	mu             sync.RWMutex
	latest         string
	latestReleaseURL string
}

func newUpdateChecker(current string) *updateChecker {
	uc := &updateChecker{current: current}
	go func() {
		uc.check()
		ticker := time.NewTicker(24 * time.Hour)
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

	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		"https://api.github.com/repos/"+githubRepo+"/releases/latest", nil)
	if err != nil {
		return
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")

	resp, err := http.DefaultClient.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		return
	}
	defer resp.Body.Close()

	var payload struct {
		TagName string `json:"tag_name"`
		HTMLURL string `json:"html_url"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil || payload.TagName == "" {
		return
	}

	uc.mu.Lock()
	uc.latest = payload.TagName
	uc.latestReleaseURL = payload.HTMLURL
	uc.mu.Unlock()
}

type versionResponse struct {
	Current          string `json:"current"`
	Latest           string `json:"latest,omitempty"`
	UpdateAvailable  bool   `json:"updateAvailable"`
	ReleasesURL      string `json:"releasesURL"`
	LatestReleaseURL string `json:"latestReleaseURL,omitempty"`
	Platform         string `json:"platform"`
	Arch             string `json:"arch"`
	InstallCmd       string `json:"installCmd"`
}

func (h *Handlers) GetVersion(w http.ResponseWriter, r *http.Request) {
	h.updater.mu.RLock()
	latest := h.updater.latest
	latestReleaseURL := h.updater.latestReleaseURL
	h.updater.mu.RUnlock()

	updateAvailable := latest != "" && semverGT(latest, h.updater.current)

	resp := versionResponse{
		Current:          h.updater.current,
		Latest:           latest,
		UpdateAvailable:  updateAvailable,
		ReleasesURL:      releasesURL,
		LatestReleaseURL: latestReleaseURL,
		Platform:         runtime.GOOS,
		Arch:             runtime.GOARCH,
		InstallCmd:       installCmd(),
	}
	writeJSON(w, http.StatusOK, resp)
}

func installCmd() string {
	switch runtime.GOOS {
	case "windows":
		return fmt.Sprintf("irm %s | iex", installPs1URL)
	default:
		return fmt.Sprintf("curl -fsSL %s | sh", installShURL)
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
