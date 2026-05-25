// Package firestore provides a thin wrapper around the Firestore Admin SDK
// client constructor. It exists so callers across the service can obtain a
// configured *firestore.Client without each importing google.golang.org/api
// option machinery directly.
package firestore

import (
	"context"
	"fmt"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/option"
)

// NewClient returns a Firestore Admin SDK client for the given project.
//
// If credentialsPath is non-empty, it is used as an explicit service account
// JSON file. If empty, the SDK falls back to Application Default Credentials,
// which honour GOOGLE_APPLICATION_CREDENTIALS as well as workload identity
// in Google-hosted runtimes.
//
// The caller owns the returned client and is responsible for invoking
// (*firestore.Client).Close during shutdown.
func NewClient(ctx context.Context, projectID, credentialsPath string) (*firestore.Client, error) {
	if projectID == "" {
		return nil, fmt.Errorf("firestore: project ID is required")
	}

	var (
		client *firestore.Client
		err    error
	)
	if credentialsPath != "" {
		client, err = firestore.NewClient(ctx, projectID, option.WithCredentialsFile(credentialsPath))
	} else {
		client, err = firestore.NewClient(ctx, projectID)
	}
	if err != nil {
		return nil, fmt.Errorf("firestore: new client: %w", err)
	}
	return client, nil
}
