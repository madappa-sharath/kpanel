package config

import "os"

// ProfileMatch summarises which clusters match the current AWS profile.
type ProfileMatch struct {
	Profile     string
	MatchedIDs  []string
	AutoSelect  bool // true when exactly one cluster matches
}

// ActiveAWSProfile returns the current AWS profile name from environment variables.
func ActiveAWSProfile() string {
	if p := os.Getenv("AWS_PROFILE"); p != "" {
		return p
	}
	if p := os.Getenv("AWS_DEFAULT_PROFILE"); p != "" {
		return p
	}
	return "default"
}

// FilterByProfile returns clusters whose AWS platform config matches the given profile.
// Non-AWS clusters are excluded.
func FilterByProfile(clusters []Cluster, profile string) []Cluster {
	var matched []Cluster
	for _, c := range clusters {
		awsCfg, ok := c.GetAWSConfig()
		if !ok {
			continue
		}
		if awsCfg.Profile == profile {
			matched = append(matched, c)
		}
	}
	return matched
}

// ProfileMatchResult returns profile match info for the current AWS profile.
func ProfileMatchResult(clusters []Cluster) ProfileMatch {
	profile := ActiveAWSProfile()
	matched := FilterByProfile(clusters, profile)
	ids := make([]string, 0, len(matched))
	for _, c := range matched {
		ids = append(ids, c.ID)
	}
	return ProfileMatch{
		Profile:    profile,
		MatchedIDs: ids,
		AutoSelect: len(ids) == 1,
	}
}
