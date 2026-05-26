package auth

import (
	"net/http"

	"al-umana/order-fulfillment/internal/common"
)

// adminRole is the value of the Firebase custom claim "role" that grants
// access to the Admin Panel and admin-only API endpoints.
const adminRole = "admin"

// IsAdmin reports whether the given Firebase ID token custom claims grant
// admin access. The check is robust to nil maps, missing keys, and claim
// values whose underlying type is not a string.
//
// The convention mirrors the Firestore security rules
// (see firestore.rules and the design's Cart Persistence Strategy section):
// a user has admin privileges iff their token carries `role == "admin"`.
func IsAdmin(claims map[string]interface{}) bool {
	if claims == nil {
		return false
	}
	raw, ok := claims["role"]
	if !ok {
		return false
	}
	role, ok := raw.(string)
	if !ok {
		return false
	}
	return role == adminRole
}

// AdminGuard is an HTTP middleware that wraps Guard and additionally
// requires the verified Firebase ID token to carry role == "admin" in its
// custom claims. Authenticated requests without the admin role receive
// HTTP 403 with error code FORBIDDEN_ADMIN_ONLY.
//
// The zero value is not usable; call NewAdminGuard with a Guard produced by
// NewGuard or NewStubGuard.
type AdminGuard struct {
	guard *Guard
}

// NewAdminGuard returns an AdminGuard that delegates token verification to
// the provided Guard. A stub guard (one constructed via NewStubGuard) is
// honored: AdminGuard becomes a pass-through so local development environments
// without Firebase credentials can still reach admin endpoints. Production
// guards perform full token verification followed by the admin role check.
func NewAdminGuard(g *Guard) *AdminGuard {
	return &AdminGuard{guard: g}
}

// Middleware returns an http.Handler that enforces both authentication and
// the admin role on requests passed to next. The signature matches
// Guard.Middleware so the two can be used interchangeably in a router.
//
// Behavior:
//   - When AdminGuard or its underlying Guard is nil, the handler is returned
//     unchanged. This mirrors Guard.Middleware's nil-safety.
//   - When the underlying Guard is in stub (allow-all) mode, requests are
//     passed through without any check, again mirroring Guard.Middleware.
//   - Otherwise Guard's authentication runs first; only requests whose
//     verified token claims include role == "admin" reach next. All other
//     authenticated requests receive 403 FORBIDDEN_ADMIN_ONLY.
func (a *AdminGuard) Middleware(next http.Handler) http.Handler {
	if a == nil || a.guard == nil {
		return next
	}
	if a.guard.allowAll {
		return next
	}
	adminOnly := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token, ok := ClaimsFrom(r.Context())
		if !ok || token == nil || !IsAdmin(token.Claims) {
			writeForbiddenAdminOnly(w)
			return
		}
		next.ServeHTTP(w, r)
	})
	return a.guard.Middleware(adminOnly)
}

// writeForbiddenAdminOnly emits the canonical 403 admin-only error response.
// The message is in Bahasa Indonesia to match the Storefront's primary
// locale (see Requirement 16.5).
func writeForbiddenAdminOnly(w http.ResponseWriter) {
	common.WriteJSONError(
		w,
		http.StatusForbidden,
		common.CodeForbiddenAdminOnly,
		"Akses ditolak: hanya admin",
	)
}
