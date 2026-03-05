package kafka

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"os"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kgo"
	kaws "github.com/twmb/franz-go/pkg/sasl/aws"
	"github.com/twmb/franz-go/pkg/sasl/plain"
	"github.com/twmb/franz-go/pkg/sasl/scram"
	"github.com/kpanel/kpanel/internal/config"
	"github.com/kpanel/kpanel/internal/credentials"
)

// buildOpts assembles kgo.Opt for seed brokers, TLS, and SASL auth from the
// cluster config. ctx is only used for AWS credential loading.
func buildOpts(ctx context.Context, cluster *config.Cluster) ([]kgo.Opt, error) {
	opts := []kgo.Opt{
		kgo.SeedBrokers(cluster.Brokers...),
		kgo.ClientID("kpanel"),
	}

	// aws_iam always requires TLS; explicit TLS config also requires it.
	awsIAM := cluster.Auth != nil && cluster.Auth.Mechanism == "aws_iam"
	tlsNeeded := awsIAM || (cluster.TLS != nil && cluster.TLS.Enabled)

	if tlsNeeded {
		// Use a custom CA pool when a cert file has been uploaded; otherwise use the system pool.
		if cluster.TLS != nil && cluster.TLS.CACertPath != "" {
			pem, err := os.ReadFile(cluster.TLS.CACertPath)
			if err != nil {
				return nil, fmt.Errorf("read CA cert %q: %w", cluster.TLS.CACertPath, err)
			}
			pool := x509.NewCertPool()
			if !pool.AppendCertsFromPEM(pem) {
				return nil, fmt.Errorf("CA cert %q: no valid PEM blocks found", cluster.TLS.CACertPath)
			}
			opts = append(opts, kgo.DialTLSConfig(&tls.Config{RootCAs: pool}))
		} else {
			opts = append(opts, kgo.DialTLS())
		}
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
			if awsCfg.Profile != "" {
				loadOpts = append(loadOpts, awsconfig.WithSharedConfigProfile(awsCfg.Profile))
			}
			cfg, err := awsconfig.LoadDefaultConfig(ctx, loadOpts...)
			if err != nil {
				return nil, fmt.Errorf("load AWS config: %w", err)
			}
			creds := cfg.Credentials
			opts = append(opts, kgo.SASL(kaws.ManagedStreamingIAM(func(ctx context.Context) (kaws.Auth, error) {
				v, err := creds.Retrieve(ctx)
				if err != nil {
					return kaws.Auth{}, err
				}
				return kaws.Auth{
					AccessKey:    v.AccessKeyID,
					SecretKey:    v.SecretAccessKey,
					SessionToken: v.SessionToken,
				}, nil
			})))
			// TLS was already added above via tlsNeeded — do not add again.

		case "none", "":
			// no auth — skip

		default:
			return nil, fmt.Errorf("unknown auth mechanism: %s", cluster.Auth.Mechanism)
		}
	}

	return opts, nil
}

// NewClient creates a franz-go kadm admin client configured for the given cluster.
// The caller is responsible for calling Close() when done.
func NewClient(ctx context.Context, cluster *config.Cluster) (*kadm.Client, error) {
	opts, err := buildOpts(ctx, cluster)
	if err != nil {
		return nil, err
	}
	cl, err := kgo.NewClient(opts...)
	if err != nil {
		return nil, fmt.Errorf("create kafka client: %w", err)
	}
	return kadm.NewClient(cl), nil
}

// NewRawClient creates a franz-go kgo.Client with the same auth config as
// NewClient, plus any additional options (e.g. kgo.ConsumePartitions for
// message fetching). The caller is responsible for calling Close() when done.
func NewRawClient(ctx context.Context, cluster *config.Cluster, extraOpts ...kgo.Opt) (*kgo.Client, error) {
	opts, err := buildOpts(ctx, cluster)
	if err != nil {
		return nil, err
	}
	opts = append(opts, extraOpts...)
	cl, err := kgo.NewClient(opts...)
	if err != nil {
		return nil, fmt.Errorf("create kafka consumer client: %w", err)
	}
	return cl, nil
}
