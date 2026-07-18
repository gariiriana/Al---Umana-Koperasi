// Package middleware – rate limiter implementation.
//
// Provides per-IP and global rate limiting using the token-bucket
// algorithm from golang.org/x/time/rate (already in go.mod). The
// middleware is designed for high-concurrency: the per-IP store uses
// sync.Map for lock-free reads and evicts stale entries periodically
// to prevent memory leaks from ephemeral IPs.
//
// Scalability:
//   - Per-IP: 100 requests/sec, burst 200 — protects against single-IP abuse
//   - Global: 50,000 requests/sec — prevents total backend saturation
//   - Auth endpoints: 10 requests/min per IP — anti brute-force
//
// When a client exceeds its rate limit, a 429 Too Many Requests response
// is returned with Retry-After and standard rate-limit headers.
package middleware

import (
	"encoding/json"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// RateLimitConfig configures the rate limiter behaviour.
type RateLimitConfig struct {
	// PerIPRate is the sustained requests per second allowed per client IP.
	PerIPRate rate.Limit
	// PerIPBurst is the burst capacity for a single IP.
	PerIPBurst int
	// GlobalRate is the sustained requests per second across all clients.
	GlobalRate rate.Limit
	// GlobalBurst is the burst capacity for the global limiter.
	GlobalBurst int
	// CleanupInterval controls how often stale per-IP entries are evicted.
	CleanupInterval time.Duration
	// EntryTTL is the duration after which an unused per-IP entry is
	// eligible for eviction.
	EntryTTL time.Duration
}

// DefaultRateLimitConfig returns a production-ready configuration:
// 100 req/s per IP (burst 200), 50K req/s global.
func DefaultRateLimitConfig() RateLimitConfig {
	return RateLimitConfig{
		PerIPRate:       100,
		PerIPBurst:      200,
		GlobalRate:      50_000,
		GlobalBurst:     100_000,
		CleanupInterval: 5 * time.Minute,
		EntryTTL:        10 * time.Minute,
	}
}

// ipEntry holds the limiter and last-seen time for a single client IP.
type ipEntry struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

// rateLimiter holds the per-IP and global limiters.
type rateLimiter struct {
	global  *rate.Limiter
	ips     sync.Map // map[string]*ipEntry
	cfg     RateLimitConfig
	stopCh  chan struct{}
	stopped sync.Once
}

// newRateLimiter creates a rate limiter and starts the background
// cleanup goroutine for stale per-IP entries.
func newRateLimiter(cfg RateLimitConfig) *rateLimiter {
	rl := &rateLimiter{
		global: rate.NewLimiter(cfg.GlobalRate, cfg.GlobalBurst),
		cfg:    cfg,
		stopCh: make(chan struct{}),
	}
	go rl.cleanupLoop()
	return rl
}

// allow checks both the per-IP and global limiters.
func (rl *rateLimiter) allow(ip string) bool {
	// Global check first (fast path rejection).
	if !rl.global.Allow() {
		return false
	}

	// Per-IP check.
	now := time.Now()
	var entry *ipEntry
	if v, ok := rl.ips.Load(ip); ok {
		entry = v.(*ipEntry)
		entry.lastSeen = now
	} else {
		entry = &ipEntry{
			limiter:  rate.NewLimiter(rl.cfg.PerIPRate, rl.cfg.PerIPBurst),
			lastSeen: now,
		}
		if actual, loaded := rl.ips.LoadOrStore(ip, entry); loaded {
			entry = actual.(*ipEntry)
			entry.lastSeen = now
		}
	}
	return entry.limiter.Allow()
}

// cleanupLoop evicts stale per-IP entries to prevent unbounded memory
// growth from ephemeral client IPs.
func (rl *rateLimiter) cleanupLoop() {
	ticker := time.NewTicker(rl.cfg.CleanupInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			cutoff := time.Now().Add(-rl.cfg.EntryTTL)
			rl.ips.Range(func(key, value any) bool {
				entry := value.(*ipEntry)
				if entry.lastSeen.Before(cutoff) {
					rl.ips.Delete(key)
				}
				return true
			})
		case <-rl.stopCh:
			return
		}
	}
}

// stop terminates the background cleanup goroutine.
func (rl *rateLimiter) stop() {
	rl.stopped.Do(func() { close(rl.stopCh) })
}

// clientIP extracts the client IP from the request, preferring
// X-Forwarded-For (set by load balancers and reverse proxies) over
// the raw RemoteAddr.
func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		// X-Forwarded-For may contain a chain: "client, proxy1, proxy2".
		// The first entry is the original client IP.
		if idx := strings.IndexByte(xff, ','); idx > 0 {
			return strings.TrimSpace(xff[:idx])
		}
		return strings.TrimSpace(xff)
	}
	if xri := r.Header.Get("X-Real-Ip"); xri != "" {
		return strings.TrimSpace(xri)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// RateLimit returns a Middleware that enforces per-IP and global rate
// limits. Requests that exceed the limit receive a 429 response with
// standard rate-limit headers.
func RateLimit(cfg RateLimitConfig) Middleware {
	rl := newRateLimiter(cfg)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := clientIP(r)
			if !rl.allow(ip) {
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("Retry-After", "1")
				w.Header().Set("X-RateLimit-Limit", "100")
				w.WriteHeader(http.StatusTooManyRequests)
				_ = json.NewEncoder(w).Encode(map[string]interface{}{
					"error": map[string]string{
						"code":    "RATE_LIMIT_EXCEEDED",
						"message": "Too many requests. Please slow down.",
					},
				})
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
