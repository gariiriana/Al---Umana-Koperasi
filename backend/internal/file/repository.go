package file

import (
	"context"
	"errors"
	"fmt"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// Firestore collection and subcollection names used by the chunking
// protocol.
const (
	deliveryFilesCollection = "delivery_files"
	chunksSubcollection     = "chunks"
)

// ErrNotFound is returned when a metadata document or chunk is requested
// but does not exist.
var ErrNotFound = errors.New("file not found")

// Repository persists proof-of-delivery files using the Base64 chunking
// protocol described in the design. Parent metadata lives under
// delivery_files/{id}; per-chunk documents live under
// delivery_files/{id}/chunks/{index}.
type Repository struct {
	client *firestore.Client
}

// NewRepository returns a file Repository backed by the given Firestore
// client. The client is owned by the caller and is not closed by the
// repository.
func NewRepository(client *firestore.Client) *Repository {
	return &Repository{client: client}
}

// CreateMetadata writes a new parent document to delivery_files and returns
// the generated document ID. CreatedAt is replaced with a server-side
// timestamp.
func (r *Repository) CreateMetadata(ctx context.Context, meta FileMetadata) (string, error) {
	doc := r.client.Collection(deliveryFilesCollection).NewDoc()
	payload := map[string]interface{}{
		"orderId":     meta.OrderID,
		"fileName":    meta.FileName,
		"fileType":    meta.FileType,
		"fileSize":    meta.FileSize,
		"totalChunks": meta.TotalChunks,
		"status":      meta.Status,
		"uploadedBy":  meta.UploadedBy,
		"createdAt":   firestore.ServerTimestamp,
	}
	if _, err := doc.Set(ctx, payload); err != nil {
		return "", fmt.Errorf("file repository: create metadata: %w", err)
	}
	return doc.ID, nil
}

// GetMetadata reads a single FileMetadata document by ID. ErrNotFound is
// returned when the document does not exist.
func (r *Repository) GetMetadata(ctx context.Context, id string) (*FileMetadata, error) {
	if id == "" {
		return nil, fmt.Errorf("file repository: get metadata: id is required")
	}
	snap, err := r.client.Collection(deliveryFilesCollection).Doc(id).Get(ctx)
	if err != nil {
		if status.Code(err) == codes.NotFound {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("file repository: get metadata: %w", err)
	}
	var meta FileMetadata
	if err := snap.DataTo(&meta); err != nil {
		return nil, fmt.Errorf("file repository: decode %s: %w", snap.Ref.ID, err)
	}
	meta.ID = snap.Ref.ID
	return &meta, nil
}

// UpdateMetadataStatus sets the parent document's status field. Used by the
// uploader to mark a file "completed" or "failed" once all chunks have been
// written or when an error occurs mid-upload.
func (r *Repository) UpdateMetadataStatus(ctx context.Context, id, newStatus string) error {
	if id == "" {
		return fmt.Errorf("file repository: update status: id is required")
	}
	_, err := r.client.Collection(deliveryFilesCollection).Doc(id).Update(ctx, []firestore.Update{
		{Path: "status", Value: newStatus},
	})
	if err != nil {
		if status.Code(err) == codes.NotFound {
			return ErrNotFound
		}
		return fmt.Errorf("file repository: update status: %w", err)
	}
	return nil
}

// ListChunks returns every chunk document under the given parent ID,
// ordered by index ascending. The chunking protocol relies on this
// ordering being stable so the assembler can concatenate Base64 payloads
// in the correct sequence.
func (r *Repository) ListChunks(ctx context.Context, parentID string) ([]FileChunk, error) {
	if parentID == "" {
		return nil, fmt.Errorf("file repository: list chunks: parent ID is required")
	}

	iter := r.client.
		Collection(deliveryFilesCollection).
		Doc(parentID).
		Collection(chunksSubcollection).
		OrderBy("index", firestore.Asc).
		Documents(ctx)
	defer iter.Stop()

	var chunks []FileChunk
	for {
		snap, err := iter.Next()
		if errors.Is(err, iterator.Done) {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("file repository: list chunks: %w", err)
		}
		var c FileChunk
		if err := snap.DataTo(&c); err != nil {
			return nil, fmt.Errorf("file repository: decode chunk %s: %w", snap.Ref.ID, err)
		}
		chunks = append(chunks, c)
	}
	return chunks, nil
}

// WriteChunk persists a single chunk document under the given parent ID.
// The chunk's Index is used as the document ID so writes are idempotent
// when the uploader retries: re-writing the same index overwrites the
// existing document instead of producing a duplicate.
func (r *Repository) WriteChunk(ctx context.Context, parentID string, chunk FileChunk) error {
	if parentID == "" {
		return fmt.Errorf("file repository: write chunk: parent ID is required")
	}

	docID := fmt.Sprintf("%d", chunk.Index)
	_, err := r.client.
		Collection(deliveryFilesCollection).
		Doc(parentID).
		Collection(chunksSubcollection).
		Doc(docID).
		Set(ctx, chunk)
	if err != nil {
		return fmt.Errorf("file repository: write chunk: %w", err)
	}
	return nil
}

// ListByOrder returns every FileMetadata document associated with the given
// order ID. Results are ordered by createdAt ascending so callers can
// display them in upload order.
func (r *Repository) ListByOrder(ctx context.Context, orderID string) ([]FileMetadata, error) {
	if orderID == "" {
		return nil, fmt.Errorf("file repository: list by order: order ID is required")
	}

	iter := r.client.
		Collection(deliveryFilesCollection).
		Where("orderId", "==", orderID).
		OrderBy("createdAt", firestore.Asc).
		Documents(ctx)
	defer iter.Stop()

	var results []FileMetadata
	for {
		snap, err := iter.Next()
		if errors.Is(err, iterator.Done) {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("file repository: list by order: %w", err)
		}
		var meta FileMetadata
		if err := snap.DataTo(&meta); err != nil {
			return nil, fmt.Errorf("file repository: decode %s: %w", snap.Ref.ID, err)
		}
		meta.ID = snap.Ref.ID
		results = append(results, meta)
	}
	return results, nil
}
