package file

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"al-umana/order-fulfillment/internal/common"
)

// stubFileRepo is a minimal in-memory repository used to drive the
// Assembler from handler tests without spinning up Firestore. It
// satisfies the fileRepository interface declared in assembler.go.
type stubFileRepo struct {
	meta   *FileMetadata
	chunks []FileChunk
	getErr error
	lcErr  error
}

func (s *stubFileRepo) GetMetadata(ctx context.Context, id string) (*FileMetadata, error) {
	if s.getErr != nil {
		return nil, s.getErr
	}
	return s.meta, nil
}

func (s *stubFileRepo) ListChunks(ctx context.Context, parentID string) ([]FileChunk, error) {
	if s.lcErr != nil {
		return nil, s.lcErr
	}
	return s.chunks, nil
}

// newHandlerWithStubs constructs a Handler whose per-collection
// assemblers are backed by stubFileRepo instances. The returned handler
// behaves the same as one produced by NewHandlerMulti for routing
// purposes; only the underlying repository is replaced.
func newHandlerWithStubs(stubs map[string]*stubFileRepo) *Handler {
	h := &Handler{
		assemblersByCollection: make(map[string]*Assembler, len(stubs)),
	}
	for name, stub := range stubs {
		h.assemblersByCollection[name] = NewAssembler(stub)
	}
	return h
}

// makeChunkedFile encodes b under the chunking protocol used by chunk 0
// (data URI prefix) and returns the parent metadata + chunks ready for
// the stub repository.
func makeChunkedFile(t *testing.T, id, fileType, fileName string, b []byte) (FileMetadata, []FileChunk) {
	t.Helper()
	encoded := base64.StdEncoding.EncodeToString(b)
	chunks := []FileChunk{
		{FileID: id, Index: 0, Data: "data:" + fileType + ";base64," + encoded},
	}
	return FileMetadata{
		ID:          id,
		FileName:    fileName,
		FileType:    fileType,
		FileSize:    int64(len(b)),
		TotalChunks: 1,
		Status:      StatusCompleted,
	}, chunks
}

// doDownload runs DownloadFromCollection for the given collection/id and
// returns the recorded response. Path values are injected via the
// request's path-pattern using a fresh ServeMux so r.PathValue works.
func doDownload(t *testing.T, h *Handler, collection, id string) *httptest.ResponseRecorder {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/files/{collection}/{id}/download", h.DownloadFromCollection)
	rr := httptest.NewRecorder()
	url := "/api/files/" + collection + "/" + id + "/download"
	req := httptest.NewRequest(http.MethodGet, url, nil)
	mux.ServeHTTP(rr, req)
	return rr
}

func TestDownloadFromCollection_KnownCollections(t *testing.T) {
	want := []byte{0x01, 0x02, 0x03, 0x04, 0xFF}

	cases := []struct {
		name        string
		collection  string
		fileType    string
		fileName    string
		wantContent string
	}{
		{"product images", ProductImagesCollection, "image/png", "logo.png", "image/png"},
		{"payment proofs", PaymentProofsCollection, "image/jpeg", "receipt.jpg", "image/jpeg"},
		{"delivery files", DeliveryFilesCollection, "image/webp", "pod.webp", "image/webp"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			meta, chunks := makeChunkedFile(t, "f1", tc.fileType, tc.fileName, want)
			h := newHandlerWithStubs(map[string]*stubFileRepo{
				tc.collection: {meta: &meta, chunks: chunks},
			})

			rr := doDownload(t, h, tc.collection, "f1")

			if rr.Code != http.StatusOK {
				t.Fatalf("status: got %d, want 200; body=%s", rr.Code, rr.Body.String())
			}
			if got := rr.Header().Get("Content-Type"); got != tc.wantContent {
				t.Errorf("Content-Type: got %q, want %q", got, tc.wantContent)
			}
			if cd := rr.Header().Get("Content-Disposition"); !strings.Contains(cd, tc.fileName) {
				t.Errorf("Content-Disposition: got %q, want it to contain %q", cd, tc.fileName)
			}
			if got, _ := io.ReadAll(rr.Body); string(got) != string(want) {
				t.Errorf("body: got %v, want %v", got, want)
			}
		})
	}
}

func TestDownloadFromCollection_UnknownCollectionReturns404(t *testing.T) {
	h := newHandlerWithStubs(map[string]*stubFileRepo{
		ProductImagesCollection: {meta: &FileMetadata{ID: "x"}},
	})

	rr := doDownload(t, h, "secret_admin", "x")

	if rr.Code != http.StatusNotFound {
		t.Fatalf("status: got %d, want 404", rr.Code)
	}
	body := decodeError(t, rr.Body.Bytes())
	if body.Error.Code != common.CodeNotFound {
		t.Errorf("code: got %q, want %q", body.Error.Code, common.CodeNotFound)
	}
}

func TestDownloadFromCollection_AssemblyProtocolErrorsMapTo422(t *testing.T) {
	t.Run("incomplete data (chunk count mismatch)", func(t *testing.T) {
		meta := FileMetadata{ID: "f", TotalChunks: 3, Status: StatusUploading}
		chunks := []FileChunk{{FileID: "f", Index: 0, Data: "AAAA"}}
		h := newHandlerWithStubs(map[string]*stubFileRepo{
			PaymentProofsCollection: {meta: &meta, chunks: chunks},
		})

		rr := doDownload(t, h, PaymentProofsCollection, "f")

		if rr.Code != http.StatusUnprocessableEntity {
			t.Fatalf("status: got %d, want 422; body=%s", rr.Code, rr.Body.String())
		}
		body := decodeError(t, rr.Body.Bytes())
		if body.Error.Code != common.CodeAssemblyFailed {
			t.Errorf("code: got %q, want %q", body.Error.Code, common.CodeAssemblyFailed)
		}
	})

	t.Run("chunk limit exceeded", func(t *testing.T) {
		meta := FileMetadata{ID: "f", TotalChunks: MaxChunks + 1, Status: StatusUploading}
		h := newHandlerWithStubs(map[string]*stubFileRepo{
			ProductImagesCollection: {meta: &meta},
		})

		rr := doDownload(t, h, ProductImagesCollection, "f")

		if rr.Code != http.StatusUnprocessableEntity {
			t.Fatalf("status: got %d, want 422", rr.Code)
		}
		body := decodeError(t, rr.Body.Bytes())
		if body.Error.Code != common.CodeAssemblyFailed {
			t.Errorf("code: got %q, want %q", body.Error.Code, common.CodeAssemblyFailed)
		}
	})

	t.Run("base64 decode failure", func(t *testing.T) {
		meta := FileMetadata{
			ID: "f", FileType: "image/png", TotalChunks: 1, Status: StatusCompleted,
		}
		// "!!!!" is not valid base64 (and not in URL-safe alphabet either).
		chunks := []FileChunk{
			{FileID: "f", Index: 0, Data: "data:image/png;base64,!!!!"},
		}
		h := newHandlerWithStubs(map[string]*stubFileRepo{
			DeliveryFilesCollection: {meta: &meta, chunks: chunks},
		})

		rr := doDownload(t, h, DeliveryFilesCollection, "f")

		if rr.Code != http.StatusUnprocessableEntity {
			t.Fatalf("status: got %d, want 422; body=%s", rr.Code, rr.Body.String())
		}
		body := decodeError(t, rr.Body.Bytes())
		if body.Error.Code != common.CodeAssemblyFailed {
			t.Errorf("code: got %q, want %q", body.Error.Code, common.CodeAssemblyFailed)
		}
	})
}

func TestDownloadFromCollection_NotFoundFromRepoFallsThroughTo404(t *testing.T) {
	// When the parent metadata document is missing (ErrNotFound), the
	// per-collection endpoint must surface 404 NOT_FOUND, not 422
	// ASSEMBLY_FAILED. This is the key check that 422 is *only* used for
	// assembly-protocol errors.
	h := newHandlerWithStubs(map[string]*stubFileRepo{
		ProductImagesCollection: {getErr: ErrNotFound},
	})

	rr := doDownload(t, h, ProductImagesCollection, "missing")

	if rr.Code != http.StatusNotFound {
		t.Fatalf("status: got %d, want 404; body=%s", rr.Code, rr.Body.String())
	}
	body := decodeError(t, rr.Body.Bytes())
	if body.Error.Code != common.CodeNotFound {
		t.Errorf("code: got %q, want %q", body.Error.Code, common.CodeNotFound)
	}
}

func TestDownloadFromCollection_UnregisteredKnownCollectionReturns501(t *testing.T) {
	// product_images is a *known* collection name but no Repository was
	// registered for it. The endpoint should reach assemblerFor and find
	// no assembler, returning 501 NOT_IMPLEMENTED.
	h := newHandlerWithStubs(map[string]*stubFileRepo{
		PaymentProofsCollection: {meta: &FileMetadata{ID: "x"}},
	})

	rr := doDownload(t, h, ProductImagesCollection, "x")

	if rr.Code != http.StatusNotImplemented {
		t.Fatalf("status: got %d, want 501; body=%s", rr.Code, rr.Body.String())
	}
}

func TestNewHandlerMulti_FiltersUnknownCollectionsAndPopulatesLegacy(t *testing.T) {
	// We can't construct *Repository instances without a Firestore client
	// here, so we drive NewHandlerMulti with nil repos and assert it
	// degrades gracefully (unknown / nil entries are skipped). The
	// assemblersByCollection map should be empty, and so should the
	// legacy fields.
	h := NewHandlerMulti(map[string]*Repository{
		ProductImagesCollection: nil,
		"unknown_collection":    nil,
	})

	if len(h.assemblersByCollection) != 0 {
		t.Errorf("assemblersByCollection: got %d entries, want 0 (all inputs nil/unknown)", len(h.assemblersByCollection))
	}
	if h.assembler != nil {
		t.Errorf("legacy assembler: got non-nil, want nil")
	}
	if h.repo != nil {
		t.Errorf("legacy repo: got non-nil, want nil")
	}
}

func TestDownloadFromCollection_MissingIDReturns400(t *testing.T) {
	// The mux's pattern requires an id segment, so we hit the handler
	// directly with an empty path value. We use httptest.NewRequest
	// without going through the mux for this case.
	h := newHandlerWithStubs(map[string]*stubFileRepo{
		ProductImagesCollection: {meta: &FileMetadata{ID: "x"}},
	})

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/files/product_images//download", nil)
	req.SetPathValue("collection", ProductImagesCollection)
	req.SetPathValue("id", "")
	h.DownloadFromCollection(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status: got %d, want 400", rr.Code)
	}
	body := decodeError(t, rr.Body.Bytes())
	if body.Error.Code != common.CodeValidationError {
		t.Errorf("code: got %q, want %q", body.Error.Code, common.CodeValidationError)
	}
}

// decodeError is a small helper that decodes the canonical JSON error
// envelope so tests can assert the error code without reimplementing the
// shape in every case.
func decodeError(t *testing.T, body []byte) common.ErrorResponse {
	t.Helper()
	var resp common.ErrorResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatalf("decode error response: %v (body=%s)", err, string(body))
	}
	return resp
}
