package auth

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	firebaseauth "firebase.google.com/go/v4/auth"

	"al-umana/order-fulfillment/internal/common"
)

func TestIsAdmin_Unit(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name   string
		claims map[string]interface{}
		want   bool
	}{
		{name: "nil claims", claims: nil, want: false},
		{name: "empty claims", claims: map[string]interface{}{}, want: false},
		{name: "role missing", claims: map[string]interface{}{"email": "a@b.test"}, want: false},
		{name: "role customer", claims: map[string]interface{}{"role": "customer"}, want: false},
		{name: "role admin", claims: map[string]interface{}{"role": "admin"}, want: true},
		{name: "role admin uppercased", claims: map[string]interface{}{"role": "ADMIN"}, want: false},
		{name: "role non-string", claims: map[string]interface{}{"role": 1}, want: false},
		{name: "role nil value", claims: map[string]interface{}{"role": nil}, want: false},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := IsAdmin(tc.claims); got != tc.want {
				t.Fatalf("IsAdmin(%v) = %v, want %v", tc.claims, got, tc.want)
			}
		})
	}
}

// adminGuardWithToken builds an AdminGuard whose underlying verifier always
// returns the supplied token. token == nil simulates a verification error.
func adminGuardWithToken(token *firebaseauth.Token) *AdminGuard {
	v := &mockVerifier{
		verifyFunc: func(ctx context.Context, raw string) (*firebaseauth.Token, error) {
			if token == nil {
				return nil, errors.New("verification failure")
			}
			return token, nil
		},
	}
	return NewAdminGuard(&Guard{verifier: v})
}

func TestAdminGuard_AllowsAdmin(t *testing.T) {
	t.Parallel()

	guard := adminGuardWithToken(&firebaseauth.Token{
		UID:    "admin-uid",
		Claims: map[string]interface{}{"role": "admin"},
	})

	called := false
	handler := guard.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		token, ok := ClaimsFrom(r.Context())
		if !ok || token == nil || token.UID != "admin-uid" {
			t.Fatalf("expected admin claims in context, got ok=%v token=%v", ok, token)
		}
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/admin/inventory", nil)
	req.Header.Set("Authorization", "Bearer admin-token")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if !called {
		t.Fatalf("expected next handler to run for admin request")
	}
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", rr.Code)
	}
}

func TestAdminGuard_RejectsNonAdmin(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name  string
		token *firebaseauth.Token
	}{
		{
			name: "customer role",
			token: &firebaseauth.Token{
				UID:    "customer-uid",
				Claims: map[string]interface{}{"role": "customer"},
			},
		},
		{
			name: "no role claim",
			token: &firebaseauth.Token{
				UID:    "no-role-uid",
				Claims: map[string]interface{}{},
			},
		},
		{
			name: "nil claims map",
			token: &firebaseauth.Token{
				UID: "nil-claims-uid",
			},
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			guard := adminGuardWithToken(tc.token)
			called := false
			handler := guard.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				called = true
			}))

			req := httptest.NewRequest(http.MethodGet, "/api/admin/inventory", nil)
			req.Header.Set("Authorization", "Bearer t")
			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)

			if called {
				t.Fatalf("non-admin request should not reach next handler")
			}
			if rr.Code != http.StatusForbidden {
				t.Fatalf("expected 403 Forbidden, got %d", rr.Code)
			}
			assertErrorCode(t, rr, common.CodeForbiddenAdminOnly)
		})
	}
}

func TestAdminGuard_RejectsUnauthenticated(t *testing.T) {
	t.Parallel()

	// nil token forces VerifyIDToken to fail, exercising Guard's auth path
	// before the admin role check has a chance to run.
	guard := adminGuardWithToken(nil)

	called := false
	handler := guard.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/admin/inventory", nil)
	req.Header.Set("Authorization", "Bearer bad-token")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if called {
		t.Fatalf("unauthenticated request should not reach next handler")
	}
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 Unauthorized, got %d", rr.Code)
	}
	assertErrorCode(t, rr, common.CodeUnauthorized)
}

func TestAdminGuard_MissingAuthHeader(t *testing.T) {
	t.Parallel()

	guard := adminGuardWithToken(&firebaseauth.Token{
		Claims: map[string]interface{}{"role": "admin"},
	})

	called := false
	handler := guard.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/admin/inventory", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if called {
		t.Fatalf("request without Authorization header should not reach next handler")
	}
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 Unauthorized, got %d", rr.Code)
	}
}

func TestAdminGuard_StubGuardPassThrough(t *testing.T) {
	t.Parallel()

	stub := NewStubGuard("test stub")
	admin := NewAdminGuard(stub)

	called := false
	handler := admin.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/admin/inventory", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if !called {
		t.Fatalf("stub admin guard should pass requests through")
	}
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", rr.Code)
	}
}

func TestAdminGuard_NilSafe(t *testing.T) {
	t.Parallel()

	var admin *AdminGuard
	called := false
	handler := admin.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/anything", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if !called {
		t.Fatalf("nil AdminGuard should be a pass-through")
	}
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", rr.Code)
	}
}

// assertErrorCode decodes the JSON error envelope and checks its code.
func assertErrorCode(t *testing.T, rr *httptest.ResponseRecorder, want string) {
	t.Helper()
	var body common.ErrorResponse
	if err := json.NewDecoder(rr.Body).Decode(&body); err != nil {
		t.Fatalf("decoding error response: %v", err)
	}
	if body.Error.Code != want {
		t.Fatalf("error code = %q, want %q", body.Error.Code, want)
	}
	if body.Error.Message == "" {
		t.Fatalf("expected non-empty error message, got empty")
	}
}
