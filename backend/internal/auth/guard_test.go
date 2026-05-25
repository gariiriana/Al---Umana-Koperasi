package auth

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	firebaseauth "firebase.google.com/go/v4/auth"
	"pgregory.net/rapid"
)

type mockVerifier struct {
	verifyFunc func(ctx context.Context, token string) (*firebaseauth.Token, error)
}

func (m *mockVerifier) VerifyIDToken(ctx context.Context, token string) (*firebaseauth.Token, error) {
	return m.verifyFunc(ctx, token)
}

func TestGuardProperty_RejectsUnauthenticated(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		tokenStr := rapid.StringMatching(`^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$`).Draw(rt, "token")

		// Create a mock verifier that fails for all tokens (unauthenticated case)
		verifier := &mockVerifier{
			verifyFunc: func(ctx context.Context, token string) (*firebaseauth.Token, error) {
				return nil, errors.New("invalid or expired token")
			},
		}

		// Generate random auth headers that are invalid, malformed, or missing
		authHeader := rapid.OneOf(
			rapid.Just(""),
			rapid.Just("Bearer "+tokenStr),
			rapid.String().Filter(func(s string) bool {
				sLower := strings.ToLower(s)
				return s == "" || !strings.HasPrefix(sLower, "bearer ")
			}),
		).Draw(rt, "authHeader")

		guard := &Guard{verifier: verifier}

		called := false
		nextHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			called = true
		})

		handler := guard.Middleware(nextHandler)
		req := httptest.NewRequest("GET", "/api/protected", nil)
		if authHeader != "" {
			req.Header.Set("Authorization", authHeader)
		}

		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)

		if called {
			rt.Fatalf("next handler called for unauthenticated request with header: %q", authHeader)
		}

		if rr.Code != http.StatusUnauthorized {
			rt.Fatalf("expected 401 Unauthorized, got %d", rr.Code)
		}
	})
}

func TestGuardProperty_AcceptsAuthenticated(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		tokenStr := rapid.StringMatching(`^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$`).Draw(rt, "token")
		uid := rapid.StringMatching(`^[a-zA-Z0-9]{28}$`).Draw(rt, "uid")

		// Create a mock verifier that successfully verifies the token
		verifier := &mockVerifier{
			verifyFunc: func(ctx context.Context, token string) (*firebaseauth.Token, error) {
				if token == tokenStr {
					return &firebaseauth.Token{
						UID: uid,
					}, nil
				}
				return nil, errors.New("token mismatch")
			},
		}

		guard := &Guard{verifier: verifier}

		called := false
		var claims *firebaseauth.Token
		nextHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			called = true
			var ok bool
			claims, ok = ClaimsFrom(r.Context())
			if !ok {
				t.Error("claims not found in context")
			}
		})

		handler := guard.Middleware(nextHandler)
		req := httptest.NewRequest("GET", "/api/protected", nil)
		req.Header.Set("Authorization", "Bearer "+tokenStr)

		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)

		if !called {
			rt.Fatalf("next handler not called for valid token: %s", tokenStr)
		}

		if rr.Code != http.StatusOK {
			rt.Fatalf("expected 200 OK, got %d", rr.Code)
		}

		if claims == nil || claims.UID != uid {
			rt.Fatalf("expected UID %s, got %v", uid, claims)
		}
	})
}
