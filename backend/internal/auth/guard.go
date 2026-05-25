// Package auth provides Firebase Authentication integration for the order
// fulfillment service, including the HTTP middleware that guards protected
// API endpoints.
package auth

import (
	"context"
	"log"
	"net/http"
	"strings"

	firebaseauth "firebase.google.com/go/v4/auth"

	"al-umana/order-fulfillment/internal/common"
)

// tokenVerifier is the subset of the Firebase Admin SDK auth client that the
// guard relies on. Exposing it as an interface makes the guard testable
// without spinning up a real Firebase project.
type tokenVerifier interface {
	VerifyIDToken(ctx context.Context, token string) (*firebaseauth.Token, error)
}

// contextKey is a private type used as the key for context values produced by
// the guard. Using a dedicated type avoids collisions with keys used by other
// packages.
type contextKey int

const (
	// claimsKey stores the verified Firebase auth token on the request
	// context. Handlers retrieve it with ClaimsFrom.
	claimsKey contextKey = iota
)

// Guard verifies Firebase ID tokens on incoming requests and exposes an HTTP
// middleware. The zero value is not usable; call NewGuard or NewStubGuard.
type Guard struct {
	verifier tokenVerifier
	allowAll bool
}

// NewGuard returns a Guard backed by a Firebase Admin SDK auth client. The
// returned guard rejects any request that does not carry a valid Bearer token
// in the Authorization header.
//
// A nil client falls back to NewStubGuard so that mis-wired callers never
// produce a guard that panics on the first request.
func NewGuard(client *firebaseauth.Client) *Guard {
	if client == nil {
		return NewStubGuard("nil Firebase auth client supplied; stub guard active")
	}
	return &Guard{verifier: client}
}

// NewStubGuard returns a Guard that allows every request through without
// verification. It is intended for local development where Firebase service
// account credentials are not available.
func NewStubGuard(reason string) *Guard {
	if reason == "" {
		reason = "stub guard active; all requests allowed without authentication"
	}
	log.Printf("auth: %s", reason)
	return &Guard{allowAll: true}
}

// Middleware returns an http.Handler that runs auth verification before
// calling next. With the stub guard this is effectively a pass-through; with
// a real verifier, the Authorization header is parsed for a Bearer token,
// the token is verified, and the decoded claims are placed on the request
// context for downstream handlers.
//
// Failures produce the canonical UNAUTHORIZED JSON error with HTTP 401.
func (g *Guard) Middleware(next http.Handler) http.Handler {
	if g == nil || g.allowAll {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := bearerToken(r.Header.Get("Authorization"))
		if token == "" {
			writeUnauthorized(w, "missing or malformed Authorization header")
			return
		}
		claims, err := g.verifier.VerifyIDToken(r.Context(), token)
		if err != nil {
			writeUnauthorized(w, "invalid or expired token")
			return
		}
		ctx := context.WithValue(r.Context(), claimsKey, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// ClaimsFrom returns the verified Firebase auth token attached to ctx, if
// any. The boolean result reports whether a token is present.
func ClaimsFrom(ctx context.Context) (*firebaseauth.Token, bool) {
	t, ok := ctx.Value(claimsKey).(*firebaseauth.Token)
	return t, ok
}

// bearerToken extracts the token portion of a "Bearer <token>" Authorization
// header value. It returns an empty string when the header is missing,
// malformed, or uses a different scheme.
func bearerToken(header string) string {
	if header == "" {
		return ""
	}
	const prefix = "Bearer "
	if len(header) <= len(prefix) || !strings.EqualFold(header[:len(prefix)], prefix) {
		return ""
	}
	return strings.TrimSpace(header[len(prefix):])
}

// writeUnauthorized emits the standard UNAUTHORIZED error response.
func writeUnauthorized(w http.ResponseWriter, message string) {
	common.WriteJSONError(w, http.StatusUnauthorized, common.CodeUnauthorized, message)
}
