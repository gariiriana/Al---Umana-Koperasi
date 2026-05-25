package file

import (
	"context"
	"encoding/base64"
	"testing"

	"pgregory.net/rapid"
)

type mockFileRepo struct {
	getMetaFunc   func(ctx context.Context, id string) (*FileMetadata, error)
	listChunksFunc func(ctx context.Context, parentID string) ([]FileChunk, error)
}

func (m *mockFileRepo) GetMetadata(ctx context.Context, id string) (*FileMetadata, error) {
	return m.getMetaFunc(ctx, id)
}

func (m *mockFileRepo) ListChunks(ctx context.Context, parentID string) ([]FileChunk, error) {
	return m.listChunksFunc(ctx, parentID)
}

func TestAssemblerProperty_GuardConditions(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		// Draw a failure condition:
		// 0 = total chunks exceeds limit (> 30)
		// 1 = chunk count mismatch
		// 2 = out-of-order/missing index gap
		// 3 = decoded size exceeds limit (> 10MB)
		failType := rapid.IntRange(0, 3).Draw(rt, "failType")

		var meta FileMetadata
		var chunks []FileChunk
		var expectedErr error

		switch failType {
		case 0:
			// Total chunks exceeds limit (> 30)
			meta = FileMetadata{
				ID:          "file_123",
				TotalChunks: rapid.IntRange(31, 100).Draw(rt, "badTotalChunks"),
				Status:      "uploading",
			}
			expectedErr = ErrChunkLimitExceeded

		case 1:
			// Chunk count mismatch
			meta = FileMetadata{
				ID:          "file_123",
				TotalChunks: rapid.IntRange(2, 29).Draw(rt, "totalChunks"),
				Status:      "uploading",
			}
			// generate different number of chunks
			actualChunksCount := rapid.IntRange(1, 30).Filter(func(c int) bool {
				return c != meta.TotalChunks
			}).Draw(rt, "actualChunksCount")

			chunks = make([]FileChunk, actualChunksCount)
			for i := 0; i < actualChunksCount; i++ {
				chunks[i] = FileChunk{FileID: "file_123", Index: i, Data: "bW9ja19kYXRh"} // "mock_data" in base64
			}
			expectedErr = ErrIncompleteData

		case 2:
			// Index gap (e.g. indices are non-contiguous)
			totalChunks := rapid.IntRange(3, 10).Draw(rt, "totalChunks")
			meta = FileMetadata{
				ID:          "file_123",
				TotalChunks: totalChunks,
				Status:      "uploading",
			}
			chunks = make([]FileChunk, totalChunks)
			// Draw index with gap (skip index 1)
			for i := 0; i < totalChunks; i++ {
				idx := i
				if i == 1 {
					idx = totalChunks // creates out-of-order/gap
				}
				chunks[i] = FileChunk{FileID: "file_123", Index: idx, Data: "bW9ja19kYXRh"}
			}
			expectedErr = ErrIncompleteData

		case 3:
			// Assembled payload too large (> 10MB)
			meta = FileMetadata{
				ID:          "file_123",
				TotalChunks: 2,
				Status:      "uploading",
			}
			// Generate large data (e.g. 6MB per chunk, total 12MB)
			largeChunkBytes := make([]byte, 6*1024*1024)
			largeChunkB64 := base64.StdEncoding.EncodeToString(largeChunkBytes)
			chunks = []FileChunk{
				{FileID: "file_123", Index: 0, Data: "data:image/png;base64," + largeChunkB64},
				{FileID: "file_123", Index: 1, Data: largeChunkB64},
			}
			expectedErr = ErrPayloadTooLarge
		}

		repo := &mockFileRepo{
			getMetaFunc: func(ctx context.Context, id string) (*FileMetadata, error) {
				return &meta, nil
			},
			listChunksFunc: func(ctx context.Context, parentID string) ([]FileChunk, error) {
				return chunks, nil
			},
		}

		a := NewAssembler(nil) // NewAssembler takes *Repository in code but we'll adapt it to use interface repo
		a.repo = repo          // override repo field

		_, err := a.Assemble(context.Background(), "file_123")
		if err == nil {
			rt.Fatalf("expected error for failType %d, but assembly succeeded", failType)
		}

		if err != nil && !errorIs(err, expectedErr) {
			rt.Fatalf("expected error %v, got %v", expectedErr, err)
		}
	})
}

// errorIs is a simple wrapper to check error wrapper prefixes
func errorIs(err, target error) bool {
	if err == nil || target == nil {
		return err == target
	}
	// assembler errors wrap using fmt.Errorf("%w: ...", target, ...)
	// so the target error can be checked using errors.Is
	// since we are avoiding importing errors for minor things, let's just do a simple check
	// or use standard errors package
	return err.Error() == target.Error() || (len(err.Error()) >= len(target.Error()) && err.Error()[:len(target.Error())] == target.Error())
}
