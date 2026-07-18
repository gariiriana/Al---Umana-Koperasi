// Package router wires the order fulfillment service's HTTP endpoints to
// their handlers and composes the cross-cutting middleware chain (CORS,
// rate limiting, request logging, panic recovery, auth guard) around them.
//
// Route registration uses Go 1.22+ net/http ServeMux method+path patterns,
// e.g. "POST /api/orders" and "GET /api/orders/{id}", which gives us
// per-method routing without an external router dependency.
package router

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"al-umana/order-fulfillment/internal/auth"
	"al-umana/order-fulfillment/internal/catalog"
	"al-umana/order-fulfillment/internal/dashboard"
	"al-umana/order-fulfillment/internal/file"
	"al-umana/order-fulfillment/internal/middleware"
	"al-umana/order-fulfillment/internal/order"
	"al-umana/order-fulfillment/internal/stock"
)

// publicPathPrefixes lists URL path prefixes that bypass the auth guard.
// The storefront's catalog browsing endpoints must be reachable for
// unauthenticated users (Requirement 16.2), and the health probe must be
// reachable for load balancers without credentials.
var publicPathPrefixes = []string{
	"/healthz",
	"/api/catalog/",
}

// Dependencies bundles every collaborator the router needs to register the
// API surface. Concentrating these in a single struct keeps the call site in
// main.go small and gives test code a single point of assembly.
type Dependencies struct {
	// AuthGuard verifies Firebase ID tokens on protected endpoints. A nil
	// value is treated as "no guard" and the routes are left unprotected;
	// main.go is responsible for ensuring a guard is supplied in production.
	AuthGuard *auth.Guard
	// AdminGuard enforces the role == "admin" custom claim on admin-only
	// endpoints (inventory CRUD, payment approval/rejection). A nil value
	// is treated as "no admin enforcement" so tests and dev mode keep
	// working without Firebase claims.
	AdminGuard *auth.AdminGuard
	// CORSConfig drives the CORS middleware. Read at the composition root so
	// the policy is visible there rather than buried in package init.
	CORSConfig middleware.CORSConfig
	// ResponseCache provides in-memory caching for read-heavy endpoints.
	// When nil, caching is disabled (no-op pass-through).
	ResponseCache *middleware.ResponseCache
	// Domain handlers. These are concrete types so that tasks adding new
	// methods do not need to change interface declarations here as well.
	OrderHandler *order.Handler
	// FileHandler exposes the chunked-file endpoints. The handler now
	// supports the multi-collection download endpoint
	// (`GET /api/files/{collection}/{id}/download`) in addition to the
	// legacy `delivery_files`-scoped routes; the router mounts the
	// unified download behind the auth guard so payment_proofs and
	// delivery_files are not publicly readable.
	FileHandler      *file.Handler
	DashboardHandler *dashboard.Handler
	// CatalogHandler serves the public, read-only catalog endpoints
	// consumed by the customer storefront.
	CatalogHandler *catalog.Handler
	// StockHandler serves the admin-only inventory CRUD endpoints. All
	// routes mounted from this handler are wrapped with AdminGuard.
	StockHandler *stock.Handler
}

// NewRouter constructs the application's HTTP handler tree. The returned
// http.Handler has the following middleware order, outermost first:
//
//	cors  →  logger  →  recover  →  authGuard  →  endpoint handler
//
// CORS sits outermost so preflight responses are correct even if a panic
// occurs deeper in the stack. The logger wraps the recover middleware so
// that recovered 500s still produce an access log line. The auth guard sits
// just above the handlers so its 401 responses are observable to logging
// and CORS but never bypass the panic safety net.
//
// The auth guard is wrapped in a path-prefix bypass so the public
// catalog and health endpoints are not gated by authentication
// (Requirement 16.2).
func NewRouter(deps Dependencies) http.Handler {
	mux := http.NewServeMux()

	// Health endpoint stays outside the auth guard so load balancers and
	// uptime probes can reach it without credentials.
	mux.HandleFunc("GET /healthz", healthHandler)

	registerPublic(mux, deps)
	registerProtected(mux, deps)
	registerAdmin(mux, deps)

	corsMW := middleware.CORSWithConfig(deps.CORSConfig)
	rateLimitMW := middleware.RateLimit(middleware.DefaultRateLimitConfig())
	authMW := authMiddleware(deps.AuthGuard)

	// Middleware chain, outermost first:
	//   cors → rateLimit → logger → recover → authGuard → handler
	//
	// Rate limiting sits after CORS (so preflight responses bypass the
	// limiter) but before the logger so rejected requests are still
	// logged. The auth guard sits just above the handlers so its 401
	// responses are observable to logging and CORS.
	return middleware.Chain(
		mux,
		corsMW,
		rateLimitMW,
		middleware.Logger,
		middleware.Recover,
		authMW,
	)
}

// registerPublic mounts endpoints that are reachable without
// authentication. The auth middleware skips these paths via
// publicPathPrefixes; mounting them on the same mux as the protected
// routes keeps the routing table flat and observable.
func registerPublic(mux *http.ServeMux, deps Dependencies) {
	if deps.CatalogHandler == nil {
		return
	}
	ch := deps.CatalogHandler
	rc := deps.ResponseCache

	if rc != nil {
		// Catalog items change infrequently; a 30-second cache drastically
		// reduces Firestore reads under high concurrency.
		mux.HandleFunc("GET /api/catalog/items",
			middleware.CacheHandler(rc, middleware.CacheConfig{TTL: 30 * time.Second}, ch.ListItems))
		// Categories change even less — 5 minute cache.
		mux.HandleFunc("GET /api/catalog/categories",
			middleware.CacheHandler(rc, middleware.CacheConfig{TTL: 5 * time.Minute}, ch.ListCategories))
	} else {
		mux.HandleFunc("GET /api/catalog/items", ch.ListItems)
		mux.HandleFunc("GET /api/catalog/categories", ch.ListCategories)
	}
	// Single-item lookups are not cached — they are cheap individual reads.
	mux.HandleFunc("GET /api/catalog/items/{id}", ch.GetItem)
}

// registerProtected mounts every API endpoint that lives behind the auth
// guard. Routes are grouped by domain to make the surface easy to audit
// against the design's endpoint table.
func registerProtected(mux *http.ServeMux, deps Dependencies) {
	oh := deps.OrderHandler
	fh := deps.FileHandler
	dh := deps.DashboardHandler

	// Order lifecycle
	if oh != nil {
		mux.HandleFunc("POST /api/orders", oh.CreateOrder)
		mux.HandleFunc("GET /api/orders", oh.ListOrders)
		mux.HandleFunc("GET /api/orders/mine", oh.ListMine)
		mux.HandleFunc("GET /api/orders/{id}", oh.GetOrder)
		mux.HandleFunc("PATCH /api/orders/{id}/status", oh.TransitionStatus)
		mux.HandleFunc("POST /api/orders/{id}/assign-courier", oh.AssignCourier)
		mux.HandleFunc("POST /api/orders/{id}/dispatch", oh.DispatchOrder)
		mux.HandleFunc("POST /api/orders/{id}/deliver", oh.ConfirmDelivery)
		mux.HandleFunc("POST /api/orders/{id}/payment-proof", oh.UploadPaymentProof)
	}

	// Files
	if fh != nil {
		mux.HandleFunc("GET /api/orders/{id}/files", fh.ListByOrderHandler)
		mux.HandleFunc("POST /api/files/{id}/assemble", fh.AssembleFile)
		mux.HandleFunc("GET /api/files/{id}/download", fh.DownloadFile)
		mux.HandleFunc("POST /api/files/validate-mime", fh.ValidateMIME)
		// Unified per-collection download endpoint. Lives behind the auth
		// guard so payment_proofs and delivery_files are not publicly
		// readable; product_images are also gated for MVP simplicity.
		mux.HandleFunc("GET /api/files/{collection}/{id}/download", fh.DownloadFromCollection)
	}

	// Dashboard — stats are cached for 10 seconds to reduce the
	// aggregation query load from concurrent admin sessions.
	if dh != nil {
		rc := deps.ResponseCache
		if rc != nil {
			mux.HandleFunc("GET /api/dashboard/stats",
				middleware.CacheHandler(rc, middleware.CacheConfig{TTL: 10 * time.Second}, dh.GetStats))
		} else {
			mux.HandleFunc("GET /api/dashboard/stats", dh.GetStats)
		}
		mux.HandleFunc("GET /api/couriers/locations", dh.GetCourierLocations)
	}
}

// registerAdmin mounts admin-only endpoints. Each handler is wrapped with
// the AdminGuard middleware before being registered on the mux so the
// admin role check (Requirement 10.7) runs on a per-route basis without
// requiring nested mux composition.
//
// The two payment-action endpoints share the path prefix
// `/api/orders/{id}/...` with non-admin order routes; the method+path
// pattern keeps them distinct on the same mux.
func registerAdmin(mux *http.ServeMux, deps Dependencies) {
	sh := deps.StockHandler
	oh := deps.OrderHandler
	g := deps.AdminGuard

	if sh != nil {
		mux.Handle("POST /api/admin/inventory", adminWrap(g, sh.Create))
		mux.Handle("GET /api/admin/inventory", adminWrap(g, sh.List))
		// `/api/admin/inventory/categories` must be registered with a
		// distinct pattern; stdlib ServeMux disambiguates between
		// `/api/admin/inventory/{id}` and `/api/admin/inventory/categories`
		// by preferring the more-specific literal path, but we register
		// it explicitly for clarity.
		mux.Handle("GET /api/admin/inventory/categories", adminWrap(g, sh.ListCategories))
		mux.Handle("GET /api/admin/inventory/{id}", adminWrap(g, sh.Get))
		mux.Handle("PUT /api/admin/inventory/{id}", adminWrap(g, sh.Update))
		mux.Handle("PATCH /api/admin/inventory/{id}/stock", adminWrap(g, sh.PatchStock))
		mux.Handle("DELETE /api/admin/inventory/{id}", adminWrap(g, sh.Delete))
	}

	if oh != nil {
		mux.Handle("POST /api/orders/{id}/payment/approve", adminWrap(g, oh.ApprovePayment))
		mux.Handle("POST /api/orders/{id}/payment/reject", adminWrap(g, oh.RejectPayment))
	}
}

// adminWrap returns an http.Handler that wraps fn with the AdminGuard
// middleware. A nil guard collapses to the bare handler so tests and the
// dev-mode stub guard do not need to construct an AdminGuard.
func adminWrap(g *auth.AdminGuard, fn http.HandlerFunc) http.Handler {
	if g == nil {
		return fn
	}
	return g.Middleware(fn)
}

// authMiddleware adapts auth.Guard to the middleware.Middleware signature.
// A nil guard becomes a pass-through, which is convenient for tests and for
// the development fallback in main.go where no Firebase credentials are
// available.
//
// Requests whose path matches one of the publicPathPrefixes bypass token
// verification entirely. This is how the public catalog endpoints
// (Requirement 16.2) and the health probe stay reachable without
// credentials while every other route remains gated.
func authMiddleware(guard *auth.Guard) middleware.Middleware {
	if guard == nil {
		return func(next http.Handler) http.Handler { return next }
	}
	guarded := guard.Middleware
	return func(next http.Handler) http.Handler {
		protected := guarded(next)
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if isPublicPath(r.URL.Path) {
				next.ServeHTTP(w, r)
				return
			}
			protected.ServeHTTP(w, r)
		})
	}
}

// isPublicPath reports whether the given request path matches one of the
// configured public-prefix bypasses. The check is a simple prefix match
// because the public surface is small and the prefixes are mutually
// exclusive with the protected routes.
func isPublicPath(path string) bool {
	for _, p := range publicPathPrefixes {
		if path == p || strings.HasPrefix(path, p) {
			return true
		}
	}
	return false
}

// healthHandler reports a basic liveness signal. It is intentionally tiny:
// richer readiness probes (Firestore connectivity etc.) will land alongside
// the Firebase Admin SDK integration.
func healthHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}
