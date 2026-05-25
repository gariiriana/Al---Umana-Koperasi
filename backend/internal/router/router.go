// Package router wires the order fulfillment service's HTTP endpoints to
// their handlers and composes the cross-cutting middleware chain (CORS,
// request logging, panic recovery, auth guard) around them.
//
// Route registration uses Go 1.22+ net/http ServeMux method+path patterns,
// e.g. "POST /api/orders" and "GET /api/orders/{id}", which gives us
// per-method routing without an external router dependency.
package router

import (
	"encoding/json"
	"net/http"

	"al-umana/order-fulfillment/internal/auth"
	"al-umana/order-fulfillment/internal/dashboard"
	"al-umana/order-fulfillment/internal/file"
	"al-umana/order-fulfillment/internal/middleware"
	"al-umana/order-fulfillment/internal/order"
)

// Dependencies bundles every collaborator the router needs to register the
// API surface. Concentrating these in a single struct keeps the call site in
// main.go small and gives test code a single point of assembly.
type Dependencies struct {
	// AuthGuard verifies Firebase ID tokens on protected endpoints. A nil
	// value is treated as "no guard" and the routes are left unprotected;
	// main.go is responsible for ensuring a guard is supplied in production.
	AuthGuard *auth.Guard
	// CORSConfig drives the CORS middleware. Read at the composition root so
	// the policy is visible there rather than buried in package init.
	CORSConfig middleware.CORSConfig
	// Domain handlers. These are concrete types so that tasks adding new
	// methods do not need to change interface declarations here as well.
	OrderHandler     *order.Handler
	FileHandler      *file.Handler
	DashboardHandler *dashboard.Handler
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
func NewRouter(deps Dependencies) http.Handler {
	mux := http.NewServeMux()

	// Health endpoint stays outside the auth guard so load balancers and
	// uptime probes can reach it without credentials.
	mux.HandleFunc("GET /healthz", healthHandler)

	registerProtected(mux, deps)

	corsMW := middleware.CORSWithConfig(deps.CORSConfig)
	authMW := authMiddleware(deps.AuthGuard)

	return middleware.Chain(
		mux,
		corsMW,
		middleware.Logger,
		middleware.Recover,
		authMW,
	)
}

// registerProtected mounts every API endpoint that lives behind the auth
// guard. Routes are grouped by domain to make the surface easy to audit
// against the design's endpoint table.
func registerProtected(mux *http.ServeMux, deps Dependencies) {
	oh := deps.OrderHandler
	fh := deps.FileHandler
	dh := deps.DashboardHandler

	// Order lifecycle
	mux.HandleFunc("POST /api/orders", oh.CreateOrder)
	mux.HandleFunc("GET /api/orders", oh.ListOrders)
	mux.HandleFunc("GET /api/orders/{id}", oh.GetOrder)
	mux.HandleFunc("PATCH /api/orders/{id}/status", oh.TransitionStatus)
	mux.HandleFunc("POST /api/orders/{id}/assign-courier", oh.AssignCourier)
	mux.HandleFunc("POST /api/orders/{id}/dispatch", oh.DispatchOrder)
	mux.HandleFunc("POST /api/orders/{id}/deliver", oh.ConfirmDelivery)
	mux.HandleFunc("GET /api/orders/{id}/files", oh.ListOrderFiles)

	// Files
	mux.HandleFunc("POST /api/files/{id}/assemble", fh.AssembleFile)
	mux.HandleFunc("GET /api/files/{id}/download", fh.DownloadFile)
	mux.HandleFunc("POST /api/files/validate-mime", fh.ValidateMIME)

	// Dashboard
	mux.HandleFunc("GET /api/dashboard/stats", dh.GetStats)
	mux.HandleFunc("GET /api/couriers/locations", dh.GetCourierLocations)
}

// authMiddleware adapts auth.Guard to the middleware.Middleware signature.
// A nil guard becomes a pass-through, which is convenient for tests and for
// the development fallback in main.go where no Firebase credentials are
// available.
func authMiddleware(guard *auth.Guard) middleware.Middleware {
	if guard == nil {
		return func(next http.Handler) http.Handler { return next }
	}
	return guard.Middleware
}

// healthHandler reports a basic liveness signal. It is intentionally tiny:
// richer readiness probes (Firestore connectivity etc.) will land alongside
// the Firebase Admin SDK integration.
func healthHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}
