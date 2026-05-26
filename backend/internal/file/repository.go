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
// protocol. The same Repository implementation is parameterised on the
// parent collection name so the Base64 chunking protocol can be reused
// across `delivery_files`, `product_images`, and `payment_proofs`.
const (
	// DeliveryFilesCollection holds proof-of-delivery files (the original
	// caller of this package).
	DeliveryFilesCollection = "delivery_files"
	// ProductImagesCollection holds chunked product images linked to
	// `inventory/{id}.imageURL`.
	ProductImagesCollection = "product_images"
	// PaymentProofsCollection holds chunked customer payment proofs linked
	// to `orders/{id}.paymentProofFileId`.
	PaymentProofsCollection = "payment_proofs"

	// chunksSubcollection is the subcollection name used for per-chunk
	// documents under any parent metadata document.
	chunksSubcollection = "chunks"
)

// ErrNotFound is returned when a metadata document or chunk is requested
// but does not exist.
var ErrNotFound = errors.New("file not found")

// Repository persists chunked files using the Base64 chunking protocol
// described in the design. Parent metadata lives under
// {collection}/{id}; per-chunk documents live under
// {collection}/{id}/chunks/{index}.
type Repository struct {
	client     *firestore.Client
	collection string
}

// NewRepository returns a file Repository bound to the original
// `delivery_files` collection. The client is owned by the caller and is
// not closed by the repository. Preserved for backwards compatibility
// with existing callers; new callers should prefer NewRepositoryFor or
// one of the typed convenience constructors.
func NewRepository(client *firestore.Client) *Repository {
	return NewRepositoryFor(client, DeliveryFilesCollection)
}

// NewRepositoryFor returns a file Repository bound to the given parent
// collection name. The collection name is used as-is; callers should pass
// one of the well-known names (DeliveryFilesCollection,
// ProductImagesCollection, PaymentProofsCollection) so security rules and
// subcollection layout match the design.
func NewRepositoryFor(client *firestore.Client, collection string) *Repository {
	if collection == "" {
		collection = DeliveryFilesCollection
	}
	return &Repository{client: client, collection: collection}
}

// NewDeliveryFilesRepository returns a Repository bound to the
// `delivery_files` collection (proof-of-delivery files).
func NewDeliveryFilesRepository(client *firestore.Client) *Repository {
	return NewRepositoryFor(client, DeliveryFilesCollection)
}

// NewProductImagesRepository returns a Repository bound to the
// `product_images` collection (admin-uploaded inventory item images).
func NewProductImagesRepository(client *firestore.Client) *Repository {
	return NewRepositoryFor(client, ProductImagesCollection)
}

// NewPaymentProofsRepository returns a Repository bound to the
// `payment_proofs` collection (customer-uploaded payment proofs).
func NewPaymentProofsRepository(client *firestore.Client) *Repository {
	return NewRepositoryFor(client, PaymentProofsCollection)
}

// Collection returns the parent collection name this repository writes
// to. Useful for callers that need to construct cross-document references
// such as `payment_proofs/{fileId}`.
func (r *Repository) Collection() string {
	return r.collection
}

// CreateMetadata writes a new parent document to the bound collection and
// returns the generated document ID. CreatedAt is replaced with a
// server-side timestamp. The OrderID field is only written when non-empty
// so collections that do not link to an order (notably `product_images`)
// do not persist an empty `orderId` field.
func (r *Repository) CreateMetadata(ctx context.Context, meta FileMetadata) (string, error) {
	doc := r.client.Collection(r.collection).NewDoc()
	payload := map[string]interface{}{
		"fileName":    meta.FileName,
		"fileType":    meta.FileType,
		"fileSize":    meta.FileSize,
		"totalChunks": meta.TotalChunks,
		"status":      meta.Status,
		"uploadedBy":  meta.UploadedBy,
		"createdAt":   firestore.ServerTimestamp,
	}
	if meta.OrderID != "" {
		payload["orderId"] = meta.OrderID
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
	snap, err := r.client.Collection(r.collection).Doc(id).Get(ctx)
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
	_, err := r.client.Collection(r.collection).Doc(id).Update(ctx, []firestore.Update{
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
		Collection(r.collection).
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
		Collection(r.collection).
		Doc(parentID).
		Collection(chunksSubcollection).
		Doc(docID).
		Set(ctx, chunk)
	if err != nil {
		return fmt.Errorf("file repository: write chunk: %w", err)
	}
	return nil
}

// DeleteFile removes the parent metadata document and every chunk document
// in its `chunks` subcollection. The deletion is best-effort: chunks are
// removed before the parent so a partial failure leaves the parent in
// place (and therefore re-discoverable for retry). Returns ErrNotFound
// when the parent document does not exist.
//
// The chunks subcollection is iterated in batches and each chunk's
// DocumentRef is deleted directly; this avoids the need to decode chunk
// payloads (which contain the full Base64 data we are about to discard)
// and is the standard pattern for cascading deletes against Firestore.
func (r *Repository) DeleteFile(ctx context.Context, id string) error {
	if id == "" {
		return fmt.Errorf("file repository: delete file: id is required")
	}

	parent := r.client.Collection(r.collection).Doc(id)

	// Pre-flight existence check so we surface ErrNotFound consistently
	// regardless of which underlying error code Firestore returns when
	// deleting non-existent docs.
	if _, err := parent.Get(ctx); err != nil {
		if status.Code(err) == codes.NotFound {
			return ErrNotFound
		}
		return fmt.Errorf("file repository: delete file: %w", err)
	}

	// Delete all chunk docs. We iterate via DocumentRefs() so we never
	// pull the Base64 payloads into memory.
	refs := parent.Collection(chunksSubcollection).DocumentRefs(ctx)
	for {
		ref, err := refs.Next()
		if errors.Is(err, iterator.Done) {
			break
		}
		if err != nil {
			return fmt.Errorf("file repository: delete file: list chunks: %w", err)
		}
		if _, err := ref.Delete(ctx); err != nil {
			return fmt.Errorf("file repository: delete file: delete chunk %s: %w", ref.ID, err)
		}
	}

	if _, err := parent.Delete(ctx); err != nil {
		if status.Code(err) == codes.NotFound {
			return ErrNotFound
		}
		return fmt.Errorf("file repository: delete file: %w", err)
	}
	return nil
}

// ListByOrder returns every FileMetadata document associated with the given
// order ID. Results are ordered by createdAt ascending so callers can
// display them in upload order. Only meaningful for collections that link
// metadata to an order (e.g. `delivery_files`, `payment_proofs`); calling
// this on a `product_images` repository will simply return zero results
// because those documents do not carry an `orderId` field.
func (r *Repository) ListByOrder(ctx context.Context, orderID string) ([]FileMetadata, error) {
	if orderID == "" {
		return nil, fmt.Errorf("file repository: list by order: order ID is required")
	}

	iter := r.client.
		Collection(r.collection).
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
