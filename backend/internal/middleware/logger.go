package middleware

import (
	"log"
	"net/http"
	"time"
)

// statusRecorder is a thin http.ResponseWriter wrapper that captures the
// status code written by downstream handlers so the request logger can
// include it in the access log line. It defaults to 200, matching the Go
// stdlib behaviour where WriteHeader is implicit.
type statusRecorder struct {
	http.ResponseWriter
	status      int
	wroteHeader bool
}

func newStatusRecorder(w http.ResponseWriter) *statusRecorder {
	return &statusRecorder{ResponseWriter: w, status: http.StatusOK}
}

// WriteHeader records the status code and forwards to the underlying
// ResponseWriter. Subsequent calls are forwarded but not re-recorded; this
// matches the stdlib's "first WriteHeader wins" semantics.
func (r *statusRecorder) WriteHeader(status int) {
	if !r.wroteHeader {
		r.status = status
		r.wroteHeader = true
	}
	r.ResponseWriter.WriteHeader(status)
}

// Write ensures that an implicit 200 is recorded if a handler writes the body
// without an explicit WriteHeader call.
func (r *statusRecorder) Write(b []byte) (int, error) {
	if !r.wroteHeader {
		r.wroteHeader = true
	}
	return r.ResponseWriter.Write(b)
}

// Logger returns middleware that logs one line per request in the form
//
//	METHOD PATH STATUS DURATION
//
// where DURATION is the wall time spent inside downstream handlers. The line
// is written with the standard log package so it shares the application's
// configured log destination and prefix.
func Logger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := newStatusRecorder(w)
		next.ServeHTTP(rec, r)
		log.Printf("%s %s %d %s", r.Method, r.URL.Path, rec.status, time.Since(start))
	})
}
