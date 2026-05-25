package file

import (
	"encoding/json"
	"errors"
	"net/http"

	"al-umana/order-fulfillment/internal/common"
)

// Handler is the HTTP boundary for proof-of-delivery file operations. It
// delegates work to the Assembler and the MIME Validator service and is
// responsible only for request decoding, response encoding, and error
// mapping onto the canonical JSON error envelope.
type Handler struct {
	repo      *Repository
	assembler *Assembler
}

// NewHandler constructs a Handler. Passing nil for either dependency makes
// the corresponding endpoint return 501; this is convenient during early
// scaffolding when the chunk assembler is not yet wired.
func NewHandler(repo *Repository, assembler *Assembler) *Handler {
	return &Handler{repo: repo, assembler: assembler}
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
