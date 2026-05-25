package file

import (
	"net/http"

	"al-umana/order-fulfillment/internal/common"
)

// Handler is the HTTP-facing boundary for proof-of-delivery file operations.
// Methods are stubs that return 501 Not Implemented; tasks 15.x and 16.x
// will provide real implementations backed by the chunk assembler and MIME
// validator services.
type Handler struct{}

// NewHandler constructs a Handler. Future tasks will extend this signature
// to inject the chunk assembler and MIME validator services.
func NewHandler() *Handler {
	return &Handler{}
}

// AssembleFile handles POST /api/files/{id}/assemble.
func (h *Handler) AssembleFile(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "AssembleFile")
}

// DownloadFile handles GET /api/files/{id}/download.
func (h *Handler) DownloadFile(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "DownloadFile")
}

// ValidateMIME handles POST /api/files/validate-mime.
func (h *Handler) ValidateMIME(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "ValidateMIME")
}

func notImplemented(w http.ResponseWriter, endpoint string) {
	common.WriteJSONError(
		w,
		http.StatusNotImplemented,
		common.CodeNotImplemented,
		endpoint+" is not yet implemented",
	)
}
