package aws

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/sts"
)

// SessionStatus describes the result of an AWS credential validity check.
type SessionStatus struct {
	Valid    bool   `json:"valid"`
	Profile  string `json:"profile"`
	Account  string `json:"account,omitempty"`
	UserARN  string `json:"userArn,omitempty"`
	Error    string `json:"error,omitempty"`
	Recovery string `json:"recovery,omitempty"`
}

// CheckSession calls sts:GetCallerIdentity to validate credentials for the given profile.
// Returns within 5 seconds regardless of outcome.
func CheckSession(ctx context.Context, profile, region string) SessionStatus {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	loadOpts := []func(*config.LoadOptions) error{}
	if region != "" {
		loadOpts = append(loadOpts, config.WithRegion(region))
	}
	if profile != "" {
		loadOpts = append(loadOpts, config.WithSharedConfigProfile(profile))
	}

	awsCfg, err := config.LoadDefaultConfig(ctx, loadOpts...)
	if err != nil {
		return SessionStatus{
			Valid:    false,
			Profile:  profile,
			Error:    fmt.Sprintf("load AWS config: %v", err),
			Recovery: recoveryHint(profile, err),
		}
	}

	stsClient := sts.NewFromConfig(awsCfg)
	identity, err := stsClient.GetCallerIdentity(ctx, &sts.GetCallerIdentityInput{})
	if err != nil {
		return SessionStatus{
			Valid:    false,
			Profile:  profile,
			Error:    err.Error(),
			Recovery: recoveryHint(profile, err),
		}
	}

	status := SessionStatus{
		Valid:   true,
		Profile: profile,
	}
	if identity.Account != nil {
		status.Account = *identity.Account
	}
	if identity.Arn != nil {
		status.UserARN = *identity.Arn
	}

	return status
}

// recoveryHint returns a suggested CLI command when SSO credentials appear expired.
func recoveryHint(profile string, err error) string {
	if err == nil {
		return ""
	}
	msg := strings.ToLower(err.Error())
	if strings.Contains(msg, "sso") || strings.Contains(msg, "token") ||
		strings.Contains(msg, "expired") || strings.Contains(msg, "not authorized") {
		if profile != "" {
			return fmt.Sprintf("aws sso login --profile %s", profile)
		}
		return "aws sso login"
	}
	return ""
}
