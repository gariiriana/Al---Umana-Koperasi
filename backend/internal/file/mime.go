package file

import (
	"bytes"
	"errors"
	"net/http"
)

// MIME validation errors.
var (
	ErrMIMEUnsupported = errors.New("unsupported media type")
	ErrMIMETooLarge    = errors.New("file too large")
)

// AllowedMIMETypes is the canonical set of MIME types accepted by the
// proof-of-delivery upload pipeline (Requirement 8.1). The keys are the
// declared Content-Type values; the boolean value is unused but the map
// shape keeps lookups O(1).
var AllowedMIMETypes = map[string]struct{}{
	"image/jpeg":      {},
	"image/png":       {},
	"application/pdf": {},
}

// File magic byte signatures. The byte sequences are checked against the
// start of the supplied file content to confirm that the declared MIME
// type matches the actual content (defending against header spoofing).
var (
	jpegSignature = []byte{0xFF, 0xD8, 0xFF}
	pngSignature  = []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}
	pdfSignature  = []byte("%PDF-")
)

// DetectMIME inspects the first bytes of content and returns the detected
// MIME type. An empty string is returned when the content does not match
// any of the allowed types.
//
// DetectMIME deliberately ignores the declared Content-Type so callers can
// use it as the authoritative source of truth.
func DetectMIME(content []byte) string {
	switch {
	case bytes.HasPrefix(content, jpegSignature):
		return "image/jpeg"
	case bytes.HasPrefix(content, pngSignature):
		return "image/png"
	case bytes.HasPrefix(content, pdfSignature):
		return "application/pdf"
	default:
		// Fall back to net/http.DetectContentType for richer detection and
		// re-check against the allowlist. This catches edge cases where
		// the magic bytes table above is too narrow.
		detected := http.DetectContentType(content)
		// http.DetectContentType returns values like "image/jpeg" or
		// "image/png" verbatim, but for PDFs it returns "application/pdf"
		// only when the signature matches the standard form, which we
		// already cover above.
		if _, ok := AllowedMIMETypes[detected]; ok {
			return detected
		}
		return ""
	}
}

// ValidateMIME reports whether the given content matches one of the
// allowed MIME types and is within the backend size limit. It returns:
//
//   - ErrMIMETooLarge   when len(content) > BackendMaxFileSize
//   - ErrMIMEUnsupported when content does not match an allowed signature,
//     or when declaredType is non-empty and disagrees with the detected type
//   - the detected MIME type and nil on success
func ValidateMIME(content []byte, declaredType string) (string, error) {
	if int64(len(content)) > BackendMaxFileSize {
		return "", ErrMIMETooLarge
	}

	detected := DetectMIME(content)
	if detected == "" {
		return "", ErrMIMEUnsupported
	}
	if declaredType != "" && declaredType != detected {
		return "", ErrMIMEUnsupported
	}
	return detected, nil
}
