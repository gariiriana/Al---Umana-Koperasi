package middleware

import "net/http"

// Middleware is the canonical signature for any HTTP middleware in this
// service: a function that wraps one handler in another.
type Middleware func(http.Handler) http.Handler

// Chain composes a sequence of middleware around a handler. The first
// middleware in the list becomes the outermost wrapper (it sees the request
// first and the response last), so a call like
//
//	Chain(h, cors, logger, recover, authGuard)
//
// produces the equivalent of cors(logger(recover(authGuard(h)))).
//
// A nil entry in middlewares is ignored, which keeps composition convenient
// when some middleware is conditional.
func Chain(handler http.Handler, middlewares ...Middleware) http.Handler {
	for i := len(middlewares) - 1; i >= 0; i-- {
		mw := middlewares[i]
		if mw == nil {
			continue
		}
		handler = mw(handler)
	}
	return handler
}
