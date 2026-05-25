// Package middleware provides HTTP middleware for the order fulfillment
// service, including CORS, request logging, and other cross-cutting concerns.
package middleware

import (
	"log"
	"net/http"
	"os"
	"strings"
)

// allowedMethods is the comma-separated list of HTTP methods exposed via CORS.
// It matches the design's accepted methods for the /api surface.
const allowedMethods = "GET, POST, PATCH, DELETE, OPTIONS"

// allowedHeaders is the comma-separated list of request headers that browsers
// may send on cross-origin requests to the API.
const allowedHeaders = "Authorization, Content-Type"

// defaultDevOrigin is used in non-production environments when the
// ALLOWED_ORIGINS environment variable is unset or empty. It corresponds to
// the local Vite dev server.
const defaultDevOrigin = "http://localhost:5173"

// productionEnv is the value of APP_ENV that activates strict production
// behaviour: wildcard origins are rejected per Requirement 8.5.
const productionEnv = "production"

// allowedOriginsEnv and appEnv are the names of the environment variables
// consulted by CORS at construction time.
const (
	allowedOriginsEnv = "ALLOWED_ORIGINS"
	appEnv            = "APP_ENV"
)

// CORSConfig captures the inputs to the CORS middleware. It is the explicit,
// dependency-injectable counterpart to the environment-driven CORS function:
// callers (typically main.go) read ALLOWED_ORIGINS and APP_ENV themselves,
// build a CORSConfig, and hand it to the router so the configuration is
// visible at the composition root.
type CORSConfig struct {
	// AllowedOrigins is the comma-separated raw value from the environment,
	// retained verbatim so that loadAllowedOrigins handles whitespace and
	// wildcard semantics consistently.
	AllowedOrigins string
	// Env is the application environment value (e.g. "production"). When it
	// equals productionEnv, a literal "*" entry in AllowedOrigins is dropped
	// per Requirement 8.5.
	Env string
}

// CORS returns middleware that enforces an allowlist-based CORS policy on the
// next handler. It is intended to be composed at the top of the middleware
// chain so that preflight requests are answered before any auth or business
// logic runs.
//
// Allowed origins are read from the ALLOWED_ORIGINS environment variable as a
// comma-separated list. Matching is case-sensitive and exact. In production
// (APP_ENV=production), a literal "*" entry is rejected to satisfy
// Requirement 8.5. In any non-production environment a "*" entry instead
// permits any origin, and an empty list falls back to defaultDevOrigin.
//
// Disallowed origins receive no Access-Control-* response headers. OPTIONS
// preflight requests are answered with a 204 No Content status regardless of
// origin, but only allowed origins receive the CORS headers needed for the
// browser to accept the response.
func CORS(next http.Handler) http.Handler {
	return CORSWithConfig(CORSConfig{
		AllowedOrigins: os.Getenv(allowedOriginsEnv),
		Env:            os.Getenv(appEnv),
	})(next)
}

// CORSWithConfig returns CORS middleware built from an explicit CORSConfig.
// It is the preferred constructor when wiring the router so that the policy
// is configured at the composition root rather than read from process
// environment inside the middleware package. The returned function fits the
// Middleware signature used by Chain.
func CORSWithConfig(cfg CORSConfig) Middleware {
	allowed, allowAny := loadAllowedOrigins(cfg.AllowedOrigins, cfg.Env)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Always vary on Origin so caches do not serve CORS-tagged
			// responses to clients on a different origin.
			w.Header().Add("Vary", "Origin")

			origin := r.Header.Get("Origin")
			if origin != "" && originAllowed(origin, allowed, allowAny) {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Set("Access-Control-Allow-Methods", allowedMethods)
				w.Header().Set("Access-Control-Allow-Headers", allowedHeaders)
			}

			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// loadAllowedOrigins parses the raw ALLOWED_ORIGINS value and returns the
// resulting allowlist along with a flag indicating whether any origin is
// permitted (the "*" wildcard outside of production).
//
// It is exported as an unexported helper to keep the configuration logic
// independent of os.Getenv so it can be tested deterministically.
func loadAllowedOrigins(raw, env string) (origins map[string]struct{}, allowAny bool) {
	isProduction := strings.EqualFold(strings.TrimSpace(env), productionEnv)
	origins = make(map[string]struct{})

	for _, entry := range strings.Split(raw, ",") {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}
		if entry == "*" {
			if isProduction {
				log.Printf("cors: ignoring wildcard origin %q in production (APP_ENV=%s)", entry, productionEnv)
				continue
			}
			allowAny = true
			continue
		}
		origins[entry] = struct{}{}
	}

	if len(origins) == 0 && !allowAny && !isProduction {
		origins[defaultDevOrigin] = struct{}{}
	}

	return origins, allowAny
}

// originAllowed reports whether origin is permitted by the configured
// allowlist. Matching is case-sensitive and exact.
func originAllowed(origin string, allowed map[string]struct{}, allowAny bool) bool {
	if allowAny {
		return true
	}
	_, ok := allowed[origin]
	return ok
}
