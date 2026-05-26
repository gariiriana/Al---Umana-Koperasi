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

	cloudfirestore "cloud.google.com/go/firestore"

	"al-umana/order-fulfillment/internal/auth"
	"al-umana/order-fulfillment/internal/catalog"
	"al-umana/order-fulfillment/internal/dashboard"
	"al-umana/order-fulfillment/internal/file"
	"al-umana/order-fulfillment/internal/firebase"
	fsclient "al-umana/order-fulfillment/internal/firestore"
	"al-umana/order-fulfillment/internal/gps"
	"al-umana/order-fulfillment/internal/middleware"
	"al-umana/order-fulfillment/internal/order"
	"al-umana/order-fulfillment/internal/router"
	"al-umana/order-fulfillment/internal/stock"
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
	envFBProjectID = "FIREBASE_PROJECT_ID"
)

// productImageDeleterAdapter adapts a *file.Repository bound to the
// `product_images` collection onto stock.ProductImageDeleter. The adapter
// lives in main.go so the stock package does not need to import the file
// package, keeping the dependency arrow pointing outward.
type productImageDeleterAdapter struct {
	repo *file.Repository
}

func newProductImageDeleterAdapter(repo *file.Repository) *productImageDeleterAdapter {
	return &productImageDeleterAdapter{repo: repo}
}

// DeleteProductImage removes the parent doc and chunks for the given file
// ID under the `product_images` collection. A nil repository (dev mode
// without Firestore) is treated as a no-op.
func (a *productImageDeleterAdapter) DeleteProductImage(ctx context.Context, fileID string) error {
	if a == nil || a.repo == nil {
		return nil
	}
	return a.repo.DeleteFile(ctx, fileID)
}

// paymentProofDeleterAdapter adapts a *file.Repository bound to the
// `payment_proofs` collection onto order.ProofFileDeleter. Used by the
// order service to clean up a previously-uploaded proof when the
// customer re-uploads from PAYMENT_REJECTED (Requirement 7.12).
type paymentProofDeleterAdapter struct {
	repo *file.Repository
}

func newPaymentProofDeleterAdapter(repo *file.Repository) *paymentProofDeleterAdapter {
	return &paymentProofDeleterAdapter{repo: repo}
}

// DeletePaymentProof removes the parent doc and chunks for the given file
// ID under the `payment_proofs` collection. A nil repository (dev mode
// without Firestore) is treated as a no-op.
func (a *paymentProofDeleterAdapter) DeletePaymentProof(ctx context.Context, fileID string) error {
	if a == nil || a.repo == nil {
		return nil
	}
	return a.repo.DeleteFile(ctx, fileID)
}

func main() {
	rootCtx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	ctx, cancel := context.WithCancel(rootCtx)
	defer cancel()

	port := getEnv(envPort, defaultPort)
	appEnv := getEnv(envAppEnv, defaultEnv)
	corsOrigins := os.Getenv(envCORSOrigins)
	credsPath := os.Getenv(envFBCreds)
	projectID := os.Getenv(envFBProjectID)

	guard := buildAuthGuard(ctx, appEnv, credsPath)
	adminGuard := auth.NewAdminGuard(guard)
	fsConn := buildFirestore(ctx, appEnv, projectID, credsPath)

	// Build domain layers (repositories, services, handlers). When fsConn
	// is nil (dev mode without Firestore), handlers gracefully return 501
	// for endpoints that need persistence.
	var (
		orderRepo   *order.Repository
		gpsRepo     *gps.Repository
		stockSvc    *stock.Service
		orderSvc    *order.Service
		catalogSvc  *catalog.Service
		fileHandler *file.Handler
	)
	if fsConn != nil {
		orderRepo = order.NewRepository(fsConn)
		deliveryFilesRepo := file.NewDeliveryFilesRepository(fsConn)
		productImagesRepo := file.NewProductImagesRepository(fsConn)
		paymentProofsRepo := file.NewPaymentProofsRepository(fsConn)
		gpsRepo = gps.NewRepository(fsConn)

		stockRepo := stock.NewRepository(fsConn)
		productImageDeleter := newProductImageDeleterAdapter(productImagesRepo)
		paymentProofDeleter := newPaymentProofDeleterAdapter(paymentProofsRepo)

		stockSvc = stock.NewService(
			stockRepo,
			stock.WithProductImageDeleter(productImageDeleter),
		)
		orderSvc = order.NewService(
			orderRepo,
			stockSvc,
			order.WithProofDeleter(paymentProofDeleter),
		)
		catalogSvc = catalog.NewService(stockRepo)

		// Multi-collection file handler so the unified per-collection
		// download endpoint can serve product_images and payment_proofs
		// alongside the legacy delivery_files routes. The constructor
		// also seeds the legacy single-collection assembler from the
		// delivery_files repo so the existing AssembleFile, DownloadFile
		// and ListByOrderHandler endpoints keep working unchanged.
		fileHandler = file.NewHandlerMulti(map[string]*file.Repository{
			file.DeliveryFilesCollection: deliveryFilesRepo,
			file.ProductImagesCollection: productImagesRepo,
			file.PaymentProofsCollection: paymentProofsRepo,
		})
	} else {
		// Dev mode: still construct a Handler so registered routes
		// return the canonical 501 NOT_IMPLEMENTED rather than 404.
		fileHandler = file.NewHandler(nil, nil)
	}

	deps := router.Dependencies{
		AuthGuard:  guard,
		AdminGuard: adminGuard,
		CORSConfig: middleware.CORSConfig{
			AllowedOrigins: corsOrigins,
			Env:            appEnv,
		},
		OrderHandler:     order.NewHandler(orderSvc, orderRepo),
		FileHandler:      fileHandler,
		DashboardHandler: dashboard.NewHandler(orderRepo, gpsRepo),
		CatalogHandler:   catalog.NewHandler(catalogSvc),
		StockHandler:     stock.NewHandler(stockSvc),
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

	serverErr := make(chan error, 1)
	go func() {
		log.Printf("server listening on :%s (env=%s)", port, appEnv)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErr <- err
		}
		close(serverErr)
	}()

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
	if fsConn != nil {
		_ = fsConn.Close()
	}
	log.Println("server stopped cleanly")
}

// buildAuthGuard initialises Firebase and returns a real Guard when
// credentials are available, or a stub guard that allows all requests in
// development environments where credentials are missing.
func buildAuthGuard(ctx context.Context, appEnv, credsPath string) *auth.Guard {
	if credsPath == "" {
		if isProduction(appEnv) {
			log.Fatalf("auth: FIREBASE_CREDENTIALS_PATH is required in production")
		}
		return auth.NewStubGuard("FIREBASE_CREDENTIALS_PATH unset; using stub guard for development")
	}

	app, err := firebase.InitFirebaseApp(ctx, credsPath)
	if err != nil {
		if isProduction(appEnv) {
			log.Fatalf("auth: failed to initialise Firebase in production: %v", err)
		}
		log.Printf("auth: Firebase init failed (%v); using stub guard for development", err)
		return auth.NewStubGuard("development environment; Firebase init failed")
	}

	client, err := firebase.InitAuthClient(ctx, app)
	if err != nil {
		if isProduction(appEnv) {
			log.Fatalf("auth: failed to initialise Firebase auth client in production: %v", err)
		}
		log.Printf("auth: Firebase auth client init failed (%v); using stub guard", err)
		return auth.NewStubGuard("development environment; auth client init failed")
	}

	return auth.NewGuard(client)
}

// buildFirestore constructs the Firestore Admin SDK client. In production
// missing credentials or project ID are fatal; in development the function
// logs a warning and returns nil so the server boots without persistence
// (handlers gracefully degrade to 501).
func buildFirestore(ctx context.Context, appEnv, projectID, credsPath string) *cloudfirestore.Client {
	if projectID == "" {
		if isProduction(appEnv) {
			log.Fatalf("firestore: FIREBASE_PROJECT_ID is required in production")
		}
		log.Printf("firestore: FIREBASE_PROJECT_ID unset; running without Firestore (dev mode)")
		return nil
	}
	c, err := fsclient.NewClient(ctx, projectID, credsPath)
	if err != nil {
		if isProduction(appEnv) {
			log.Fatalf("firestore: %v", err)
		}
		log.Printf("firestore: %v; running without Firestore (dev mode)", err)
		return nil
	}
	return c
}

// isProduction reports whether the supplied environment value names the
// production environment.
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
