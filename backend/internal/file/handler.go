package file

import (
	"encoding/json"
	"errors"
	"net/http"

	"al-umana/order-fulfillment/internal/common"
)

// Handler is the HTTP boundary for chunked-file operations. It delegates
// work to the Assembler and the MIME Validator service and is responsible
// only for request decoding, response encoding, and error mapping onto the
// canonical JSON error envelope.
//
// The handler now supports multiple parent collections (see Requirement
// 11.4). Legacy callers continue to use the single-collection constructor
// NewHandler, which preserves the original AssembleFile / DownloadFile /
// ListByOrderHandler / ValidateMIME behaviour for delivery_files.
// Collection-aware callers use NewHandlerMulti to register one Repository
// per collection, exposing the per-collection download endpoint.
type Handler struct {
	// Legacy single-collection fields. Kept for backwards compatibility
	// with the existing AssembleFile / DownloadFile / ListByOrderHandler
	// / ValidateMIME endpoints, which were written before the file
	// package was generalised across multiple collections.
	repo      *Repository
	assembler *Assembler

	// assemblersByCollection holds one Assembler per parent collection
	// name (delivery_files, product_images, payment_proofs). Populated by
	// NewHandlerMulti; nil when the handler was constructed with the
	// legacy single-collection NewHandler.
	assemblersByCollection map[string]*Assembler
}

// validDownloadCollections enumerates the parent collection names accepted
// by DownloadFromCollection. Anything outside this set yields 404
// NOT_FOUND so that path-traversal attempts cannot reach unrelated
// Firestore collections (Requirements 7.13, 11.8).
var validDownloadCollections = map[string]struct{}{
	DeliveryFilesCollection: {},
	ProductImagesCollection: {},
	PaymentProofsCollection: {},
}

// NewHandler constructs a Handler bound to a single repository and
// assembler. Passing nil for either dependency makes the corresponding
// endpoint return 501; this is convenient during early scaffolding when
// the chunk assembler is not yet wired.
//
// This constructor is preserved for backwards compatibility with the
// original delivery_files-only wiring. New callers should prefer
// NewHandlerMulti so the per-collection download endpoint is also
// available.
func NewHandler(repo *Repository, assembler *Assembler) *Handler {
	return &Handler{repo: repo, assembler: assembler}
}

// NewHandlerMulti constructs a Handler that knows how to assemble files
// from multiple parent collections. It accepts a map keyed by collection
// name; only entries for known collections (delivery_files,
// product_images, payment_proofs) are kept. Unknown keys are silently
// ignored so the caller cannot accidentally widen the route's allowed
// collection set by misnaming a key.
//
// For backwards compatibility the legacy repo / assembler fields are
// populated from repos[DeliveryFilesCollection] when present, so the
// pre-existing AssembleFile / DownloadFile / ListByOrderHandler endpoints
// continue to operate against delivery_files exactly as before.
func NewHandlerMulti(repos map[string]*Repository) *Handler {
	h := &Handler{
		assemblersByCollection: make(map[string]*Assembler, len(repos)),
	}
	for name, repo := range repos {
		if _, ok := validDownloadCollections[name]; !ok {
			continue
		}
		if repo == nil {
			continue
		}
		h.assemblersByCollection[name] = NewAssembler(repo)
	}
	if legacy, ok := repos[DeliveryFilesCollection]; ok && legacy != nil {
		h.repo = legacy
		h.assembler = NewAssembler(legacy)
	}
	return h
}

// AssembleFile handles POST /api/files/{id}/assemble. It reassembles the
// chunks for the given file and returns the metadata along with the size
// of the reconstructed payload. The actual binary is not returned by this
// endpoint — clients call DownloadFile when they want the bytes.
func (h *Handler) AssembleFile(w http.ResponseWriter, r *http.Request) {
	if h.assembler == nil {
		notImplemented(w, "AssembleFile")
		return
	}
	id := r.PathValue("id")
	if id == "" {
		common.WriteJSONError(w, http.StatusBadRequest, common.CodeValidationError, "id path param is required")
		return
	}

	out, err := h.assembler.Assemble(r.Context(), id)
	if err != nil {
		writeAssemblyError(w, err)
		return
	}

	resp := map[string]interface{}{
		"fileId":      out.Metadata.ID,
		"fileName":    out.Metadata.FileName,
		"fileType":    out.Metadata.FileType,
		"fileSize":    out.Metadata.FileSize,
		"decodedSize": len(out.Bytes),
		"orderId":     out.Metadata.OrderID,
		"status":      out.Metadata.Status,
	}
	writeJSON(w, http.StatusOK, resp)
}

// DownloadFile handles GET /api/files/{id}/download. It reassembles the
// file and streams the binary back to the caller with appropriate
// Content-Type and Content-Disposition headers.
func (h *Handler) DownloadFile(w http.ResponseWriter, r *http.Request) {
	if h.assembler == nil {
		notImplemented(w, "DownloadFile")
		return
	}
	id := r.PathValue("id")
	if id == "" {
		common.WriteJSONError(w, http.StatusBadRequest, common.CodeValidationError, "id path param is required")
		return
	}

	out, err := h.assembler.Assemble(r.Context(), id)
	if err != nil {
		writeAssemblyError(w, err)
		return
	}

	contentType := out.Metadata.FileType
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", "inline; filename=\""+sanitizeFilename(out.Metadata.FileName)+"\"")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(out.Bytes)
}

// DownloadFromCollection handles GET /api/files/{collection}/{id}/download.
// It dispatches the assembly request to the per-collection Assembler
// registered via NewHandlerMulti and returns the reconstructed bytes with
// the original Content-Type and a sanitized Content-Disposition header.
//
// Path validation:
//   - collection must be one of {delivery_files, product_images,
//     payment_proofs}; anything else returns 404 NOT_FOUND so the
//     endpoint cannot be coerced into reading from arbitrary
//     Firestore collections (Requirements 7.13, 11.8).
//   - id must be present.
//
// Error mapping:
//   - Assembly-protocol errors (chunk count mismatch / chunk limit /
//     base64 decode) map to 422 ASSEMBLY_FAILED per Requirement 11.12.
//   - Other errors fall through to the existing assembly-error mapping
//     (404 NOT_FOUND, 413 PAYLOAD_TOO_LARGE, etc.).
func (h *Handler) DownloadFromCollection(w http.ResponseWriter, r *http.Request) {
	collection := r.PathValue("collection")
	if _, ok := validDownloadCollections[collection]; !ok {
		common.WriteJSONError(w, http.StatusNotFound, common.CodeNotFound, "unknown file collection")
		return
	}

	id := r.PathValue("id")
	if id == "" {
		common.WriteJSONError(w, http.StatusBadRequest, common.CodeValidationError, "id path param is required")
		return
	}

	asm := h.assemblerFor(collection)
	if asm == nil {
		notImplemented(w, "DownloadFromCollection")
		return
	}

	out, err := asm.Assemble(r.Context(), id)
	if err != nil {
		writeAssemblyOrFailedError(w, err)
		return
	}

	contentType := out.Metadata.FileType
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", "inline; filename=\""+sanitizeFilename(out.Metadata.FileName)+"\"")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(out.Bytes)
}

// assemblerFor returns the Assembler registered for the given parent
// collection, falling back to the legacy single-collection assembler when
// the handler was constructed via NewHandler against delivery_files.
func (h *Handler) assemblerFor(collection string) *Assembler {
	if asm, ok := h.assemblersByCollection[collection]; ok && asm != nil {
		return asm
	}
	if collection == DeliveryFilesCollection {
		return h.assembler
	}
	return nil
}

// ValidateMIME handles POST /api/files/validate-mime. The body is the raw
// file bytes (Content-Type header indicates the declared type). The
// validator runs the magic-byte check and returns the detected type plus
// a verdict.
//
// To keep memory bounded the request body is capped at BackendMaxFileSize.
// A larger payload returns 413 PAYLOAD_TOO_LARGE.
func (h *Handler) ValidateMIME(w http.ResponseWriter, r *http.Request) {
	if r.ContentLength > BackendMaxFileSize {
		common.WriteJSONError(w, http.StatusRequestEntityTooLarge, common.CodePayloadTooLarge, "file exceeds 10 MB backend limit")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, BackendMaxFileSize)
	buf := make([]byte, 0, 4096)
	tmp := make([]byte, 4096)
	for {
		n, err := r.Body.Read(tmp)
		if n > 0 {
			buf = append(buf, tmp[:n]...)
		}
		if err != nil {
			// io.EOF is expected; MaxBytesError is treated as 413.
			if err.Error() == "EOF" {
				break
			}
			if err.Error() == "http: request body too large" {
				common.WriteJSONError(w, http.StatusRequestEntityTooLarge, common.CodePayloadTooLarge, "file exceeds 10 MB backend limit")
				return
			}
			break
		}
		if int64(len(buf)) > BackendMaxFileSize {
			common.WriteJSONError(w, http.StatusRequestEntityTooLarge, common.CodePayloadTooLarge, "file exceeds 10 MB backend limit")
			return
		}
	}

	declared := r.Header.Get("X-Declared-Type")
	if declared == "" {
		declared = r.Header.Get("Content-Type")
	}

	detected, err := ValidateMIME(buf, declared)
	if err != nil {
		writeAssemblyError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"valid":    true,
		"detected": detected,
		"size":     len(buf),
	})
}

// ListByOrderHandler handles GET /api/orders/{id}/files (mounted by the
// router on the order path for cohesion with the order resource).
func (h *Handler) ListByOrderHandler(w http.ResponseWriter, r *http.Request) {
	if h.repo == nil {
		notImplemented(w, "ListOrderFiles")
		return
	}
	id := r.PathValue("id")
	if id == "" {
		common.WriteJSONError(w, http.StatusBadRequest, common.CodeValidationError, "id path param is required")
		return
	}
	files, err := h.repo.ListByOrder(r.Context(), id)
	if err != nil {
		common.WriteJSONError(w, http.StatusInternalServerError, common.CodeInternalError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"files": files})
}

// writeAssemblyError maps file-package errors onto the API error envelope.
func writeAssemblyError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		common.WriteJSONError(w, http.StatusNotFound, common.CodeNotFound, "file not found")
	case errors.Is(err, ErrChunkLimitExceeded):
		common.WriteJSONError(w, http.StatusBadRequest, common.CodeChunkLimitExceeded, err.Error())
	case errors.Is(err, ErrIncompleteData):
		common.WriteJSONError(w, http.StatusBadRequest, common.CodeIncompleteData, err.Error())
	case errors.Is(err, ErrDecodeFailure):
		common.WriteJSONError(w, http.StatusInternalServerError, common.CodeDecodeFailure, err.Error())
	case errors.Is(err, ErrPayloadTooLarge), errors.Is(err, ErrMIMETooLarge):
		common.WriteJSONError(w, http.StatusRequestEntityTooLarge, common.CodePayloadTooLarge, err.Error())
	case errors.Is(err, ErrMIMEUnsupported):
		common.WriteJSONError(w, http.StatusUnsupportedMediaType, common.CodeUnsupportedMediaType, err.Error())
	default:
		common.WriteJSONError(w, http.StatusInternalServerError, common.CodeInternalError, err.Error())
	}
}

// writeAssemblyOrFailedError is the per-collection download endpoint's
// error mapper. It mirrors writeAssemblyError except that the three
// assembly-protocol errors are collapsed onto 422 ASSEMBLY_FAILED per
// Requirement 11.12: the legacy delivery_files endpoint preserved
// distinct 400-class codes for backwards compatibility, but the new
// collection-aware endpoint uses the unified ASSEMBLY_FAILED code so
// admin and storefront UIs can render a single failure path.
func writeAssemblyOrFailedError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrIncompleteData),
		errors.Is(err, ErrChunkLimitExceeded),
		errors.Is(err, ErrDecodeFailure):
		common.WriteJSONError(w, http.StatusUnprocessableEntity, common.CodeAssemblyFailed, err.Error())
	default:
		writeAssemblyError(w, err)
	}
}

// sanitizeFilename strips path separators and quote characters from a
// filename so it can safely appear inside a Content-Disposition header.
func sanitizeFilename(name string) string {
	if name == "" {
		return "download"
	}
	out := make([]byte, 0, len(name))
	for i := 0; i < len(name); i++ {
		c := name[i]
		switch c {
		case '/', '\\', '"', '\r', '\n':
			continue
		default:
			out = append(out, c)
		}
	}
	if len(out) == 0 {
		return "download"
	}
	return string(out)
}

func writeJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func notImplemented(w http.ResponseWriter, endpoint string) {
	common.WriteJSONError(
		w,
		http.StatusNotImplemented,
		common.CodeNotImplemented,
		endpoint+" is not yet implemented",
	)
}
