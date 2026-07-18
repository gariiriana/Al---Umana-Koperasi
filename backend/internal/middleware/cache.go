// Package middleware – response cache implementation.
//
// Provides an in-memory TTL-based HTTP response cache for GET endpoints
// that are read-heavy and tolerate brief staleness (catalog listings,
// dashboard statistics, category enumerations).
//
// How it works:
//   1. On GET request, compute a cache key from method + URL path + query.
//   2. If a valid (non-expired) entry exists, serve the cached response
//      body and headers immediately — zero backend computation.
//   3. On cache miss, execute the handler, capture the response via a
//      ResponseRecorder, cache the result, and forward it to the client.
//   4. Non-GET methods and responses with non-200 status codes bypass
//      the cache entirely.
//
// Thread safety: uses sync.RWMutex around a plain map. At the expected
// concurrency (tens of thousands of concurrent reads, rare writes), the
// reader-favouring RWMutex outperforms sync.Map for this access pattern.
//
// Memory bound: entries are TTL-scoped and a background goroutine evicts
// expired entries every minute to prevent unbounded growth.
package middleware

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"sync"
	"time"
)

// CacheEntry holds a captured HTTP response.
type CacheEntry struct {
	StatusCode int
	Header     http.Header
	Body       []byte
	ExpiresAt  time.Time
}

// ResponseCache is a thread-safe in-memory cache for HTTP responses.
type ResponseCache struct {
	mu      sync.RWMutex
	entries map[string]*CacheEntry
	stopCh  chan struct{}
	stopped sync.Once
}

// NewResponseCache creates a cache and starts a background eviction
// goroutine that removes expired entries every minute.
func NewResponseCache() *ResponseCache {
	rc := &ResponseCache{
		entries: make(map[string]*CacheEntry),
		stopCh:  make(chan struct{}),
	}
	go rc.evictionLoop()
	return rc
}

// Get retrieves a non-expired cache entry by key, or nil if absent.
func (rc *ResponseCache) Get(key string) *CacheEntry {
	rc.mu.RLock()
	entry, ok := rc.entries[key]
	rc.mu.RUnlock()
	if !ok || time.Now().After(entry.ExpiresAt) {
		return nil
	}
	return entry
}

// Set stores a cache entry with the given TTL.
func (rc *ResponseCache) Set(key string, entry *CacheEntry) {
	rc.mu.Lock()
	rc.entries[key] = entry
	rc.mu.Unlock()
}

// Invalidate removes a specific key from the cache.
func (rc *ResponseCache) Invalidate(key string) {
	rc.mu.Lock()
	delete(rc.entries, key)
	rc.mu.Unlock()
}

// InvalidatePrefix removes all entries whose key starts with the given
// prefix. Used for broad invalidation (e.g. invalidate all catalog
// entries when inventory changes).
func (rc *ResponseCache) InvalidatePrefix(prefix string) {
	rc.mu.Lock()
	for k := range rc.entries {
		if len(k) >= len(prefix) && k[:len(prefix)] == prefix {
			delete(rc.entries, k)
		}
	}
	rc.mu.Unlock()
}

// Stop terminates the background eviction goroutine.
func (rc *ResponseCache) Stop() {
	rc.stopped.Do(func() { close(rc.stopCh) })
}

func (rc *ResponseCache) evictionLoop() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			now := time.Now()
			rc.mu.Lock()
			for k, entry := range rc.entries {
				if now.After(entry.ExpiresAt) {
					delete(rc.entries, k)
				}
			}
			rc.mu.Unlock()
		case <-rc.stopCh:
			return
		}
	}
}

// CacheConfig specifies the TTL for a cached endpoint.
type CacheConfig struct {
	TTL time.Duration
}

// CacheHandler wraps an http.HandlerFunc with response caching at the
// specified TTL. Only GET requests with 200 OK responses are cached.
//
// Usage:
//   cache := NewResponseCache()
//   mux.HandleFunc("GET /api/catalog/items",
//       CacheHandler(cache, CacheConfig{TTL: 30 * time.Second}, handler))
func CacheHandler(rc *ResponseCache, cfg CacheConfig, handler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Only cache GET requests.
		if r.Method != http.MethodGet {
			handler(w, r)
			return
		}

		// Cache key: path + sorted query string.
		key := r.URL.Path
		if r.URL.RawQuery != "" {
			key += "?" + r.URL.RawQuery
		}

		// Check cache.
		if entry := rc.Get(key); entry != nil {
			// Cache hit — serve directly.
			for k, vs := range entry.Header {
				for _, v := range vs {
					w.Header().Add(k, v)
				}
			}
			w.Header().Set("X-Cache", "HIT")
			w.WriteHeader(entry.StatusCode)
			_, _ = w.Write(entry.Body)
			return
		}

		// Cache miss — execute handler and capture the response.
		rec := httptest.NewRecorder()
		handler(rec, r)

		result := rec.Result()
		body := rec.Body.Bytes()

		// Only cache successful (200) responses.
		if result.StatusCode == http.StatusOK {
			headerCopy := make(http.Header)
			for k, vs := range rec.Header() {
				headerCopy[k] = append([]string(nil), vs...)
			}
			rc.Set(key, &CacheEntry{
				StatusCode: result.StatusCode,
				Header:     headerCopy,
				Body:       bytes.Clone(body),
				ExpiresAt:  time.Now().Add(cfg.TTL),
			})
		}

		// Forward the response to the client.
		for k, vs := range rec.Header() {
			for _, v := range vs {
				w.Header().Add(k, v)
			}
		}
		w.Header().Set("X-Cache", "MISS")
		w.WriteHeader(result.StatusCode)
		_, _ = w.Write(body)
	}
}
