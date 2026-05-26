package firebase

import (
	"context"
	"fmt"

	firebase "firebase.google.com/go/v4"
	firebaseauth "firebase.google.com/go/v4/auth"
	"google.golang.org/api/option"
)

// InitFirebaseApp initialises a Firebase Admin SDK App handle.
//
// If credentialsPath is non-empty, it is used as an explicit service account
// file via option.WithCredentialsFile. If empty, the SDK falls back to its
// default credential discovery, which honours the GOOGLE_APPLICATION_CREDENTIALS
// environment variable as well as workload identity in Google-hosted runtimes.
func InitFirebaseApp(ctx context.Context, credentialsPath string) (*firebase.App, error) {
	var (
		app *firebase.App
		err error
	)

	if credentialsPath != "" {
		app, err = firebase.NewApp(ctx, nil, option.WithCredentialsFile(credentialsPath))
	} else {
		app, err = firebase.NewApp(ctx, nil)
	}

	if err != nil {
		return nil, fmt.Errorf("init firebase app: %w", err)
	}
	return app, nil
}

// InitAuthClient returns the Firebase Admin SDK auth client derived from app.
// The returned client is the verifier used by Guard to validate ID tokens.
func InitAuthClient(ctx context.Context, app *firebase.App) (*firebaseauth.Client, error) {
	if app == nil {
		return nil, fmt.Errorf("init auth client: firebase app is nil")
	}
	client, err := app.Auth(ctx)
	if err != nil {
		return nil, fmt.Errorf("init auth client: %w", err)
	}
	return client, nil
}
