package aws

import (
	"bufio"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// ListProfiles returns the AWS profile names defined in ~/.aws/config (or the
// path in $AWS_CONFIG_FILE if set). Sections look like "[default]" or
// "[profile foo]" — the "profile " prefix is stripped. Returns an empty slice
// (not an error) when the file is missing, since that's a common dev-laptop
// state, not a failure.
//
// Note: the credentials file (~/.aws/credentials) is intentionally NOT read.
// On a developer machine, profiles live in ~/.aws/config; the credentials
// file is rare in practice and tends to contain raw long-lived keys we'd
// rather not advertise in a UI dropdown.
func ListProfiles() ([]string, error) {
	path := configFilePath()
	if path == "" {
		return []string{}, nil
	}

	f, err := os.Open(path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return []string{}, nil
		}
		return nil, err
	}
	defer f.Close()

	seen := map[string]struct{}{}
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if !strings.HasPrefix(line, "[") || !strings.HasSuffix(line, "]") {
			continue
		}
		name := strings.TrimSpace(line[1 : len(line)-1])
		name = strings.TrimPrefix(name, "profile ")
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		// Skip non-profile sections like [sso-session foo], [services bar].
		if strings.ContainsRune(name, ' ') {
			continue
		}
		seen[name] = struct{}{}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}

	profiles := make([]string, 0, len(seen))
	for name := range seen {
		profiles = append(profiles, name)
	}
	sort.Strings(profiles)
	return profiles, nil
}

func configFilePath() string {
	if p := os.Getenv("AWS_CONFIG_FILE"); p != "" {
		return p
	}
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return ""
	}
	return filepath.Join(home, ".aws", "config")
}
