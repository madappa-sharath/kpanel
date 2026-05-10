package api

import (
	"net/http"
	"os"

	"github.com/aws/aws-sdk-go-v2/config"
	awssession "github.com/kpanel/kpanel/internal/aws"
	kconfig "github.com/kpanel/kpanel/internal/config"
)

type awsContextResponse struct {
	Profile  string `json:"profile"`
	Region   string `json:"region"`
	Valid    bool   `json:"valid"`
	Account  string `json:"account,omitempty"`
	UserARN  string `json:"userArn,omitempty"`
	Error    string `json:"error,omitempty"`
	Recovery string `json:"recovery,omitempty"`
}

// AWSContext godoc
// GET /api/aws/context?profile=<name>
//
// When ?profile= is provided, credentials and region are resolved against that
// profile instead of the env-derived default. This is how the discovery UI
// previews credentials for a profile other than the one the app launched in.
func (h *Handlers) AWSContext(w http.ResponseWriter, r *http.Request) {
	profile := r.URL.Query().Get("profile")
	if profile == "" {
		profile = kconfig.ActiveAWSProfile()
	}

	// Resolve region: when a profile is explicitly picked, prefer that profile's
	// configured region over env vars (otherwise switching profiles wouldn't
	// follow the profile's home region). Env vars are still the floor for the
	// env-derived default profile.
	envRegion := os.Getenv("AWS_REGION")
	if envRegion == "" {
		envRegion = os.Getenv("AWS_DEFAULT_REGION")
	}

	region := envRegion
	if r.URL.Query().Get("profile") != "" {
		region = ""
	}
	if region == "" {
		var loadOpts []func(*config.LoadOptions) error
		if profile != "" {
			loadOpts = append(loadOpts, config.WithSharedConfigProfile(profile))
		}
		if awsCfg, err := config.LoadDefaultConfig(r.Context(), loadOpts...); err == nil && awsCfg.Region != "" {
			region = awsCfg.Region
		}
	}
	if region == "" {
		region = envRegion
	}
	if region == "" {
		region = "us-east-1"
	}

	s := awssession.CheckSession(r.Context(), profile, region)
	writeJSON(w, http.StatusOK, awsContextResponse{
		Profile:  s.Profile,
		Region:   region,
		Valid:    s.Valid,
		Account:  s.Account,
		UserARN:  s.UserARN,
		Error:    s.Error,
		Recovery: s.Recovery,
	})
}

// ListAWSProfiles godoc
// GET /api/aws/profiles
//
// Returns AWS profile names parsed from ~/.aws/config (or $AWS_CONFIG_FILE).
// Empty list when the file is missing — that's a normal state, not an error.
func (h *Handlers) ListAWSProfiles(w http.ResponseWriter, r *http.Request) {
	profiles, err := awssession.ListProfiles()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"profiles": profiles})
}
