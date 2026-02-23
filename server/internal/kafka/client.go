package kafka

import (
	"context"
	"fmt"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kgo"
	kaws "github.com/twmb/franz-go/pkg/sasl/aws"
	"github.com/twmb/franz-go/pkg/sasl/plain"
	"github.com/twmb/franz-go/pkg/sasl/scram"
	"github.com/kpanel/kpanel/internal/connections"
)

// NewClient creates a franz-go kadm admin client configured for the given auth type.
// The caller is responsible for calling Close() when done.
func NewClient(ctx context.Context, brokers []string, auth connections.AuthConfig) (*kadm.Client, error) {
	opts := []kgo.Opt{
		kgo.SeedBrokers(brokers...),
		kgo.ClientID("kpanel"),
	}

	switch auth.Type {
	case "none", "":
		// no auth

	case "sasl-plain":
		opts = append(opts, kgo.SASL(plain.Auth{
			User: auth.Username,
			Pass: auth.Password,
		}.AsMechanism()))

	case "sasl-scram-256":
		opts = append(opts, kgo.SASL(scram.Auth{
			User: auth.Username,
			Pass: auth.Password,
		}.AsSha256Mechanism()))

	case "sasl-scram-512":
		opts = append(opts, kgo.SASL(scram.Auth{
			User: auth.Username,
			Pass: auth.Password,
		}.AsSha512Mechanism()))

	case "aws-iam":
		awsCfg, err := config.LoadDefaultConfig(ctx, config.WithRegion(auth.AWSRegion))
		if err != nil {
			return nil, fmt.Errorf("load AWS config: %w", err)
		}
		creds := awsCfg.Credentials
		opts = append(opts,
			kgo.SASL(kaws.ManagedStreamingIAM(func(ctx context.Context) (kaws.Auth, error) {
				v, err := creds.Retrieve(ctx)
				if err != nil {
					return kaws.Auth{}, err
				}
				return kaws.Auth{
					AccessKey:    v.AccessKeyID,
					SecretKey:    v.SecretAccessKey,
					SessionToken: v.SessionToken,
				}, nil
			})),
			kgo.DialTLS(),
		)

	default:
		return nil, fmt.Errorf("unknown auth type: %s", auth.Type)
	}

	if auth.TLSEnabled && auth.Type != "aws-iam" {
		opts = append(opts, kgo.DialTLS())
	}

	cl, err := kgo.NewClient(opts...)
	if err != nil {
		return nil, fmt.Errorf("create kafka client: %w", err)
	}
	return kadm.NewClient(cl), nil
}
