package api

import (
	"net/http"
	"os"

	awssession "github.com/kpanel/kpanel/internal/aws"
	"github.com/kpanel/kpanel/internal/config"
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
	profile := config.ActiveAWSProfile()

	region := os.Getenv("AWS_REGION")
	if region == "" {
		region = os.Getenv("AWS_DEFAULT_REGION")
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
