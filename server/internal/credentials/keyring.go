package credentials

import (
	"encoding/json"
	"fmt"

	"github.com/zalando/go-keyring"
)

const service = "kpanel"

// Credential holds a username/password pair stored in the OS keychain.
type Credential struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// Set stores cred as a JSON blob under the given ref key.
func Set(ref string, cred Credential) error {
	data, err := json.Marshal(cred)
	if err != nil {
		return fmt.Errorf("marshal credential: %w", err)
	}
	if err := keyring.Set(service, ref, string(data)); err != nil {
		return fmt.Errorf("keyring set %q: %w", ref, err)
	}
	return nil
}

// Get retrieves and unmarshals the credential stored under ref.
func Get(ref string) (Credential, error) {
	data, err := keyring.Get(service, ref)
	if err != nil {
		return Credential{}, fmt.Errorf("keyring get %q: %w", ref, err)
	}
	var cred Credential
	if err := json.Unmarshal([]byte(data), &cred); err != nil {
		return Credential{}, fmt.Errorf("unmarshal credential: %w", err)
	}
	return cred, nil
}

// Delete removes the credential stored under ref.
func Delete(ref string) error {
	if err := keyring.Delete(service, ref); err != nil {
		return fmt.Errorf("keyring delete %q: %w", ref, err)
	}
	return nil
}
