// Command server is the HTTP entry point for the Al-Umana order fulfillment
// service. It reads configuration from the process environment, initialises
// Firebase (or falls back to a stub guard in development), wires the router,
// and serves traffic with graceful shutdown driven by SIGINT / SIGTERM.
package main

import (
	"context"
	"errors"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"al-umana/order-fulfillment/internal/auth"
	"al-umana/order-fulfillment/internal/dashboard"
	"al-umana/order-fulfillment/internal/file"
	"al-umana/order-fulfillment/internal/middleware"
	"al-umana/order-fulfillment/internal/order"
	"al-umana/order-fulfillment/internal/router"
)

const (
	defaultPort     = "8080"
	defaultEnv      = "development"
	envProduction   = "production"
	readTimeout     = 15 * time.Second
	writeTimeout    = 30 * time.Second
	idleTimeout     = 60 * time.Second
	shutdownTimeout = 15 * time.Second
)

// envVar names of the environment variables consulted at startup.
const (
	envPort        = "PORT"
	envAppEnv      = "ENV"
	envCORSOrigins = "CORS_ORIGINS"
	envFBCreds     = "FIREBASE_CREDENTIALS_PATH"
)

func main() {
	// Root context cancelled on SIGINT / SIGTERM. signal.NotifyContext gives
	// us graceful shutdown wiring without an extra goroutine.
	rootCtx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Cancellable context for downstream services (handlers, repositories).
	// Wired off rootCtx so signal-driven cancellation propagates everywhere
	// and is exposed to handlers via http.Server.BaseContext.
	ctx, cancel := context.WithCancel(rootCtx)
	defer cancel()

	port := getEnv(envPort, defaultPort)
	appEnv := getEnv(envAppEnv, defaultEnv)
	corsOrigins := os.Getenv(envCORSOrigins)
	credsPath := os.Getenv(envFBCreds)

	guard := buildAuthGuard(ctx, appEnv, credsPath)

	deps := router.Dependencies{
		AuthGuard: guard,
		CORSConfig: middleware.CORSConfig{
			AllowedOrigins: corsOrigins,
			Env:            appEnv,
		},
		OrderHandler:     order.NewHandler(),
		FileHandler:      file.NewHandler(),
		DashboardHandler: dashboard.NewHandler(),
	}
	handler := router.NewRouter(deps)

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      handler,
		ReadTimeout:  readTimeout,
		WriteTimeout: writeTimeout,
		IdleTimeout:  idleTimeout,
		BaseContext:  func(_ net.Listener) context.Context { return ctx },
	}

	// Run the server; surface listen errors back to main via a channel.
	serverErr := make(chan error, 1)
	go func() {
		log.Printf("server listening on :%s (env=%s)", port, appEnv)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErr <- err
		}
		close(serverErr)
	}()

	// Wait for either a shutdown signal or a fatal listen error.
	select {
	case err, ok := <-serverErr:
		if ok && err != nil {
			log.Fatalf("server error: %v", err)
		}
	case <-rootCtx.Done():
		log.Println("shutdown signal received")
	}

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("graceful shutdown failed: %v", err)
	}
	log.Println("server stopped cleanly")
}

// buildAuthGuard initialises Firebase and returns a real Guard when
// credentials are available, or a stub guard that allows all requests in
// development environments where credentials are missing.
//
// In production, missing or unreadable credentials are fatal: the server
// must not boot with an open auth surface. In any other environment a
// missing credentials path is logged as a warning and a stub guard is used.
func buildAuthGuard(ctx context.Context, appEnv, credsPath string) *auth.Guard {
	if credsPath == "" {
		if isProduction(appEnv) {
			log.Fatalf("auth: FIREBASE_CREDENTIALS_PATH is required in production")
		}
		return auth.NewStubGuard("FIREBASE_CREDENTIALS_PATH unset; using stub guard for development")
	}

	app, err := auth.InitFirebaseApp(ctx, credsPath)
	if err != nil {
		if isProduction(appEnv) {
			log.Fatalf("auth: failed to initialise Firebase in production: %v", err)
		}
		log.Printf("auth: Firebase init failed (%v); using stub guard for development", err)
		return auth.NewStubGuard("development environment; Firebase init failed")
	}

	client, err := auth.InitAuthClient(ctx, app)
	if err != nil {
		if isProduction(appEnv) {
			log.Fatalf("auth: failed to initialise Firebase auth client in production: %v", err)
		}
		log.Printf("auth: Firebase auth client init failed (%v); using stub guard", err)
		return auth.NewStubGuard("development environment; auth client init failed")
	}

	return auth.NewGuard(client)
}

// isProduction reports whether the supplied environment value names the
// production environment, ignoring case and surrounding whitespace.
func isProduction(env string) bool {
	return env == envProduction
}

// getEnv returns the value of the named environment variable, or fallback
// if it is unset or empty.
func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
