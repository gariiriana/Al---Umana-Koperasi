// Package common contains cross-cutting types shared across the order
// fulfillment service, including the canonical JSON error response shape
// described in the design document.
package common

import (
	"encoding/json"
	"net/http"
)

// Error code constants used across the API. Each maps to a documented HTTP
// status as described in the design's "Error Categories" table.
const (
	CodeValidationError        = "VALIDATION_ERROR"
	CodeInvalidPaymentMethod   = "INVALID_PAYMENT_METHOD"
	CodeInvalidStateTransition = "INVALID_STATE_TRANSITION"
	CodeUnauthorized           = "UNAUTHORIZED"
	CodeForbidden              = "FORBIDDEN"
	CodeForbiddenAdminOnly     = "FORBIDDEN_ADMIN_ONLY"
	CodeNotFound               = "NOT_FOUND"
	CodeUnsupportedMediaType   = "UNSUPPORTED_MEDIA_TYPE"
	CodePayloadTooLarge        = "PAYLOAD_TOO_LARGE"
	CodeTimeout                = "TIMEOUT"
	CodeChunkLimitExceeded     = "CHUNK_LIMIT_EXCEEDED"
	CodeIncompleteData         = "INCOMPLETE_DATA"
	CodeDecodeFailure          = "DECODE_FAILURE"
	CodeUploadFailed           = "UPLOAD_FAILED"
	CodeImageMimeRejected      = "IMAGE_MIME_REJECTED"
	CodeImageSizeRejected      = "IMAGE_SIZE_REJECTED"
	CodeAssemblyFailed         = "ASSEMBLY_FAILED"
	CodeInternalError          = "INTERNAL_ERROR"
	CodeNotImplemented         = "NOT_IMPLEMENTED"
)

// FieldError describes a single field-level validation problem. The frontend
// uses this to attach inline error messages to the offending form field.
type FieldError struct {
	Field  string `json:"field"`
	Reason string `json:"reason"`
}

// ErrorBody is the inner payload of an API error response.
type ErrorBody struct {
	Code    string       `json:"code"`
	Message string       `json:"message"`
	Details []FieldError `json:"details,omitempty"`
}

// ErrorResponse is the canonical JSON envelope returned by the API for any
// non-2xx response. It matches the shape defined in the design's
// "Backend Error Response Format" section.
type ErrorResponse struct {
	Error ErrorBody `json:"error"`
}

// WriteJSONError serializes a standard error response and writes it to w with
// the given HTTP status. The Content-Type header is set to application/json.
//
// Encoding failures are intentionally ignored: at this point the response
// status has already been committed and there is no useful recovery path.
func WriteJSONError(w http.ResponseWriter, status int, code, message string, details ...FieldError) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(ErrorResponse{
		Error: ErrorBody{
			Code:    code,
			Message: message,
			Details: details,
		},
	})
}
