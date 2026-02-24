package kafka

import (
	"context"
	"fmt"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kgo"
	kaws "github.com/twmb/franz-go/pkg/sasl/aws"
	"github.com/twmb/franz-go/pkg/sasl/plain"
	"github.com/twmb/franz-go/pkg/sasl/scram"
	"github.com/kpanel/kpanel/internal/config"
	"github.com/kpanel/kpanel/internal/credentials"
)

// NewClient creates a franz-go kadm admin client configured for the given cluster.
// The caller is responsible for calling Close() when done.
func NewClient(ctx context.Context, cluster *config.Cluster) (*kadm.Client, error) {
	opts := []kgo.Opt{
		kgo.SeedBrokers(cluster.Brokers...),
		kgo.ClientID("kpanel"),
	}

	// TLS (non-IAM)
	if cluster.TLS != nil && cluster.TLS.Enabled {
		opts = append(opts, kgo.DialTLS())
	}

	if cluster.Auth != nil {
		switch cluster.Auth.Mechanism {
		case "sasl_plain":
			cred, err := credentials.Get(cluster.Auth.CredentialRef)
			if err != nil {
				return nil, fmt.Errorf("get credential %q: %w", cluster.Auth.CredentialRef, err)
			}
			opts = append(opts, kgo.SASL(plain.Auth{
				User: cred.Username,
				Pass: cred.Password,
			}.AsMechanism()))

		case "sasl_scram_sha256":
			cred, err := credentials.Get(cluster.Auth.CredentialRef)
			if err != nil {
				return nil, fmt.Errorf("get credential %q: %w", cluster.Auth.CredentialRef, err)
			}
			opts = append(opts, kgo.SASL(scram.Auth{
				User: cred.Username,
				Pass: cred.Password,
			}.AsSha256Mechanism()))

		case "sasl_scram_sha512":
			cred, err := credentials.Get(cluster.Auth.CredentialRef)
			if err != nil {
				return nil, fmt.Errorf("get credential %q: %w", cluster.Auth.CredentialRef, err)
			}
			opts = append(opts, kgo.SASL(scram.Auth{
				User: cred.Username,
				Pass: cred.Password,
			}.AsSha512Mechanism()))

		case "aws_iam":
			awsCfg, ok := cluster.GetAWSConfig()
			if !ok {
				return nil, fmt.Errorf("cluster %q has aws_iam auth but no AWS platform config", cluster.ID)
			}
			loadOpts := []func(*awsconfig.LoadOptions) error{
				awsconfig.WithRegion(awsCfg.Region),
			}
			if awsCfg.Profile != "" && awsCfg.Profile != "default" {
				loadOpts = append(loadOpts, awsconfig.WithSharedConfigProfile(awsCfg.Profile))
			}
			cfg, err := awsconfig.LoadDefaultConfig(ctx, loadOpts...)
			if err != nil {
				return nil, fmt.Errorf("load AWS config: %w", err)
			}
			creds := cfg.Credentials
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
			return nil, fmt.Errorf("unknown auth mechanism: %s", cluster.Auth.Mechanism)
		}
	}

	cl, err := kgo.NewClient(opts...)
	if err != nil {
		return nil, fmt.Errorf("create kafka client: %w", err)
	}
	return kadm.NewClient(cl), nil
}
