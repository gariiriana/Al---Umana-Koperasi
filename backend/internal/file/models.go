// Package file contains the domain types and services for proof-of-delivery
// file storage using the Base64 chunking protocol described in the design.
package file

import "time"

// File status values stored on the parent delivery_files document.
const (
	StatusUploading = "uploading"
	StatusCompleted = "completed"
	StatusFailed    = "failed"
)

// Chunking protocol limits.
//
//   - MaxFileSize is the absolute upper bound on a proof file accepted by the
//     frontend Chunk_Uploader (15 MB). Files larger than this are rejected
//     before any Firestore write occurs.
//   - ChunkSize is the maximum size in bytes of any single chunk's Base64
//     payload (524,286 bytes ≈ 512 KB), chosen to stay safely under the
//     Firestore 1 MiB per-document limit once Firestore overhead is included.
//   - MaxChunks is the upper bound on the number of chunks the assembler will
//     accept for a single file.
//   - BackendMaxFileSize is the upper bound enforced by the Go backend on
//     assembled files (10 MB). Anything above this returns 413.
const (
	MaxFileSize        = 15 * 1024 * 1024
	ChunkSize          = 524286
	MaxChunks          = 30
	BackendMaxFileSize = 10 * 1024 * 1024
)

// FileMetadata is the parent document for a proof-of-delivery file. Chunks
// are stored as documents in the `chunks` subcollection keyed by index.
type FileMetadata struct {
	ID          string    `json:"id" firestore:"-"`
	OrderID     string    `json:"orderId" firestore:"orderId"`
	FileName    string    `json:"fileName" firestore:"fileName"`
	FileType    string    `json:"fileType" firestore:"fileType"`
	FileSize    int64     `json:"fileSize" firestore:"fileSize"`
	TotalChunks int       `json:"totalChunks" firestore:"totalChunks"`
	Status      string    `json:"status" firestore:"status"`
	UploadedBy  string    `json:"uploadedBy" firestore:"uploadedBy"`
	CreatedAt   time.Time `json:"createdAt" firestore:"createdAt"`
}

// FileChunk is a single chunk document within delivery_files/{id}/chunks.
// Chunk 0 carries the Data_URI prefix `data:<fileType>;base64,` followed by
// Base64 data; subsequent chunks carry only Base64 data.
type FileChunk struct {
	FileID string `json:"fileId" firestore:"fileId"`
	Index  int    `json:"index" firestore:"index"`
	Data   string `json:"data" firestore:"data"`
}
