package middleware

import (
	"log"
	"net/http"
	"runtime/debug"

	"al-umana/order-fulfillment/internal/common"
)

// Recover returns middleware that traps panics from downstream handlers,
// logs the panic value and stack trace, and emits the canonical
// INTERNAL_ERROR JSON response with HTTP 500. Without this guard a single
// panic in any handler would terminate the goroutine and leave the client
// hanging; with it, panics become structured errors that match the rest of
// the API.
func Recover(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("panic recovered on %s %s: %v\n%s", r.Method, r.URL.Path, rec, debug.Stack())
				common.WriteJSONError(
					w,
					http.StatusInternalServerError,
					common.CodeInternalError,
					"internal server error",
				)
			}
		}()
		next.ServeHTTP(w, r)
	})
}
