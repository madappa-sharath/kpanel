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
// GET /api/aws/context
func (h *Handlers) AWSContext(w http.ResponseWriter, r *http.Request) {
	profile := kconfig.ActiveAWSProfile()

	// Resolve region: env vars → profile config → fallback to us-east-1
	region := os.Getenv("AWS_REGION")
	if region == "" {
		region = os.Getenv("AWS_DEFAULT_REGION")
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
