export type FileMetadataStatus = 'uploading' | 'completed' | 'failed';

export interface FileMetadata {
  id: string;
  orderId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  totalChunks: number;
  status: FileMetadataStatus;
  uploadedBy: string;
  createdAt: string;
}

export interface FileChunk {
  fileId: string;
  index: number;
  data: string;
}
