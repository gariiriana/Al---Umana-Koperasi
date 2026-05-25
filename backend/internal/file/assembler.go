package file

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
)

// Assembly errors used by the handler to map onto the canonical API
// error envelope. All non-internal errors are tagged so the handler can
// pick the correct HTTP status.
var (
	ErrChunkLimitExceeded = errors.New("file exceeds maximum chunk count")
	ErrIncompleteData     = errors.New("chunk count does not match metadata")
	ErrDecodeFailure      = errors.New("base64 decode failed")
	ErrPayloadTooLarge    = errors.New("assembled payload exceeds backend limit")
	ErrAssemblyFailed     = errors.New("file assembly failed")
)

// AssembledFile is the result of a successful Assemble call. It contains
// the reconstructed binary payload along with the metadata needed to send
// it back to the client (filename, MIME type).
type AssembledFile struct {
	Metadata FileMetadata
	Bytes    []byte
}

// fileRepository defines the metadata and chunk retrieval operations needed by the assembler.
type fileRepository interface {
	GetMetadata(ctx context.Context, id string) (*FileMetadata, error)
	ListChunks(ctx context.Context, parentID string) ([]FileChunk, error)
}

// Assembler reassembles chunked files stored in Firestore back into their
// original binary representation per the chunking protocol described in
// Requirement 7.
type Assembler struct {
	repo fileRepository
}

// NewAssembler returns an Assembler backed by the given file repository.
func NewAssembler(repo fileRepository) *Assembler {
	return &Assembler{repo: repo}
}

// Assemble fetches the parent metadata and chunks for the given file ID,
// validates the assembly guards (chunk count, completeness), concatenates
// the Base64 payloads in index order, strips the Data_URI prefix from
// chunk 0, and decodes the result into the original bytes.
//
// Errors:
//
//	ErrNotFound           — parent document does not exist
//	ErrChunkLimitExceeded — totalChunks > MaxChunks (30)
//	ErrIncompleteData     — fetched chunks ≠ totalChunks (or any index gap)
//	ErrDecodeFailure      — concatenated payload is not valid Base64
//	ErrPayloadTooLarge    — decoded size > BackendMaxFileSize (10 MB)
func (a *Assembler) Assemble(ctx context.Context, fileID string) (*AssembledFile, error) {
	if fileID == "" {
		return nil, fmt.Errorf("%w: file ID is required", ErrAssemblyFailed)
	}

	meta, err := a.repo.GetMetadata(ctx, fileID)
	if err != nil {
		return nil, err
	}

	// Reject anything that would expand into more than the configured chunk
	// budget before reading the subcollection.
	if meta.TotalChunks > MaxChunks {
		return nil, fmt.Errorf("%w: totalChunks=%d limit=%d", ErrChunkLimitExceeded, meta.TotalChunks, MaxChunks)
	}

	chunks, err := a.repo.ListChunks(ctx, fileID)
	if err != nil {
		return nil, err
	}

	// Completeness: number of chunks must equal the metadata claim, and
	// indices must form the contiguous range [0, totalChunks).
	if len(chunks) != meta.TotalChunks {
		return nil, fmt.Errorf("%w: got %d chunks, expected %d", ErrIncompleteData, len(chunks), meta.TotalChunks)
	}
	for i, c := range chunks {
		if c.Index != i {
			return nil, fmt.Errorf("%w: missing or out-of-order chunk at index %d (saw %d)", ErrIncompleteData, i, c.Index)
		}
	}

	// Concatenate Base64 payloads.
	var sb strings.Builder
	for _, c := range chunks {
		sb.WriteString(c.Data)
	}
	combined := sb.String()

	// Strip the Data_URI prefix that the uploader prepends to chunk 0.
	if idx := strings.Index(combined, ";base64,"); idx >= 0 && strings.HasPrefix(combined, "data:") {
		combined = combined[idx+len(";base64,"):]
	}

	// Defensive: Base64 must not contain whitespace at this point. Strip
	// CR/LF defensively because some clients line-wrap.
	combined = stripWhitespace(combined)

	bytesOut, err := base64.StdEncoding.DecodeString(combined)
	if err != nil {
		// Try URL-safe variant as a fallback before giving up.
		alt, altErr := base64.RawStdEncoding.DecodeString(strings.TrimRight(combined, "="))
		if altErr != nil {
			return nil, fmt.Errorf("%w: %v", ErrDecodeFailure, err)
		}
		bytesOut = alt
	}

	if int64(len(bytesOut)) > BackendMaxFileSize {
		return nil, fmt.Errorf("%w: size=%d limit=%d", ErrPayloadTooLarge, len(bytesOut), BackendMaxFileSize)
	}

	return &AssembledFile{Metadata: *meta, Bytes: bytesOut}, nil
}

// stripWhitespace removes any spaces, tabs, and newlines from s. It is used
// before Base64 decoding to tolerate clients that line-wrap their payloads.
func stripWhitespace(s string) string {
	if !strings.ContainsAny(s, " \t\r\n") {
		return s
	}
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		switch r {
		case ' ', '\t', '\r', '\n':
			continue
		default:
			b.WriteRune(r)
		}
	}
	return b.String()
}
