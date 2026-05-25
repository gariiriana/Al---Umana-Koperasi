# Requirements Document

## Introduction

This document defines the requirements for an **Order Fulfillment & Delivery Tracking System** — a web-based platform built for Al-Umana Koperasi. The system manages the complete lifecycle of an order from placement through production, quality control, courier dispatch, GPS-tracked delivery, and final handover (serah-terima) with digital proof capture. It also provides a real-time monitoring dashboard for administrators.

The tech stack comprises a React 18 / TypeScript / Vite / Tailwind CSS v4 frontend, a Go 1.24 backend with the Firestore Admin SDK, and Firebase Firestore for real-time data and client-side operations.

---

## Glossary

- **Order**: A customer request for goods, identified by a unique order ID, progressing through a defined status pipeline.
- **Order_Service**: The backend Go service responsible for creating, validating, and updating orders.
- **Stock_Service**: The backend component that checks inventory availability for an order.
- **Production_Queue**: The ordered list of confirmed orders awaiting or undergoing production.
- **QC_Service**: The quality-control component that reviews completed production items before dispatch.
- **Courier**: The delivery personnel assigned to transport a confirmed, ready order to the customer.
- **GPS_Tracker**: The client-side component that periodically captures and writes the courier's geographic coordinates.
- **Delivery_Dashboard**: The real-time admin interface that visualises order pipeline status and courier GPS positions.
- **Proof_Capture**: The client-side component that collects a photo and a digital signature at the point of handover.
- **Chunk_Uploader**: The client-side component that splits large files into Base64 chunks and writes them to Firestore.
- **Chunk_Assembler**: The Go backend service that reads, orders, and reassembles Base64 chunks from Firestore.
- **Auth_Guard**: The middleware component that enforces Firebase Authentication on protected endpoints and Firestore rules.
- **PIC**: Person-In-Charge at the delivery destination.
- **Serah-Terima**: The formal handover event at which proof of delivery (photo + signature) is captured.
- **MIME_Validator**: The backend component that inspects and approves or rejects file MIME types.
- **Data_URI**: A string of the form `data:<mediatype>;base64,<data>` that prefixes the first chunk of each uploaded file.

---

## Requirements

### Requirement 1: Order Placement and Validation

**User Story:** As a client, I want to submit an order with my details, so that I can request goods and receive confirmation or a clear rejection reason.

#### Acceptance Criteria

1. WHEN a client submits an order form, THE Order_Service SHALL validate all required fields — customer name (non-empty string, ≤ 200 characters), item identifiers (each non-empty), quantities (each a positive integer ≥ 1), and delivery address (non-empty string, ≤ 500 characters) — before persisting the order.
2. IF any required field is missing or contains an invalid value, THEN THE Order_Service SHALL return a validation error that identifies each failing field by name and states the specific reason for rejection, without creating an order record.
3. WHEN the order form passes validation, THE Order_Service SHALL persist the order in Firestore with the initial status `PLACING`.
4. WHEN an order with status `PLACING` is persisted, THE Stock_Service SHALL check inventory availability for every line item in the order.
5. IF any line item is out of stock, THEN THE Order_Service SHALL update the order status to `FAILED` and record in the order document the identifier of every out-of-stock item as the rejection reason.
6. WHEN all line items are confirmed to be in stock, THE Order_Service SHALL update the order status to `CONFIRMED` and forward the order to the Production_Queue.
7. IF the Stock_Service does not return an availability result within 10 seconds, THEN THE Order_Service SHALL update the order status to `FAILED` and record a timeout reason in the order document.

---

### Requirement 2: Production Workflow

**User Story:** As a production team member, I want to view confirmed orders and track their production progress, so that I can fulfil orders in the correct sequence.

#### Acceptance Criteria

1. WHEN a production team member opens the production view, THE Production_Queue SHALL display all orders with status `CONFIRMED`, ordered by creation timestamp ascending.
2. WHEN a production team member with a `CONFIRMED` order starts work on it, THE Order_Service SHALL update the order status to `IN_PRODUCTION` and record the team member's authenticated UID and a server-side start timestamp on the order.
3. WHEN a production team member marks an `IN_PRODUCTION` order as complete, THE Order_Service SHALL update the order status to `READY`.
4. WHILE an order has status `IN_PRODUCTION`, THE Production_Queue SHALL prevent any other team member from starting the same order, returning an error message that identifies the order as already in progress.
5. WHEN an order status transitions to `READY`, THE Order_Service SHALL notify the QC_Service to begin review of that order.
6. IF a production team member attempts to start an order that is not in `CONFIRMED` status, THEN THE Order_Service SHALL reject the action and return an invalid state transition error.
7. IF a production team member attempts to complete an order that is not in `IN_PRODUCTION` status, THEN THE Order_Service SHALL reject the action and return an invalid state transition error.

---

### Requirement 3: Quality Control (QC) Review

**User Story:** As a QC reviewer, I want to inspect completed production items and record pass/fail outcomes, so that only conforming goods are dispatched.

#### Acceptance Criteria

1. WHEN the QC_Service receives a review notification for an order, THE Delivery_Dashboard SHALL display the order in the QC review queue within 3 seconds via a Firestore `onSnapshot` listener.
2. WHEN a QC reviewer marks an order as passed, THE Order_Service SHALL update the order status to `READY_TO_DELIVER`.
3. WHEN a QC reviewer marks an order as failed, THE Order_Service SHALL persist the failure reason in the order record and update the order status back to `CONFIRMED` so that the Production_Queue can re-process it.
4. THE Order_Service SHALL record the QC reviewer's authenticated UID and a server-side review timestamp on every QC decision.
5. IF a QC fail decision is submitted without a reason, or with a reason exceeding 500 characters, THEN THE Order_Service SHALL reject the decision with a validation error and leave the order status unchanged.
6. IF a QC action is submitted for an order that is not in `READY` status, THEN THE Order_Service SHALL reject the action with an invalid state transition error.

---

### Requirement 4: Courier Assignment and Dispatch

**User Story:** As a dispatcher, I want to assign orders marked `READY_TO_DELIVER` to couriers, so that delivery can begin in an organised manner.

#### Acceptance Criteria

1. WHEN an order reaches status `READY_TO_DELIVER`, THE Delivery_Dashboard SHALL display the order in the courier assignment queue.
2. WHEN a dispatcher assigns an order that is in `READY_TO_DELIVER` status to a courier, THE Order_Service SHALL record the courier's identifier against the order.
3. WHEN a dispatcher confirms dispatch for an assigned order, THE Order_Service SHALL update the order status to `OUT_FOR_DELIVERY`.
4. WHILE an order has status `OUT_FOR_DELIVERY`, THE Order_Service SHALL reject any attempt to assign the order to a second courier, returning an error message indicating the order is already out for delivery.
5. IF a dispatcher attempts to assign or dispatch an order that is not in `READY_TO_DELIVER` status, THEN THE Order_Service SHALL reject the action and return an invalid state transition error.

---

### Requirement 5: Real-Time GPS Tracking

**User Story:** As an administrator, I want to see the courier's live GPS position on a map, so that I can monitor delivery progress and detect anomalies.

#### Acceptance Criteria

1. WHILE an order has status `OUT_FOR_DELIVERY`, THE GPS_Tracker SHALL write the courier's current latitude and longitude to the Firestore `courier_locations` document for that order at an interval of no greater than 30 seconds.
2. WHEN a GPS coordinate update is written to Firestore, THE Delivery_Dashboard SHALL reflect the new position on the map within 3 seconds.
3. IF the GPS_Tracker has not written a new coordinate for more than 5 minutes for an order with status `OUT_FOR_DELIVERY`, THEN THE Delivery_Dashboard SHALL display an anomaly alert indicator for that order, visually distinct from the normal courier position marker.
4. THE GPS_Tracker SHALL record latitude (number), longitude (number), and a server-side timestamp for every coordinate update.
5. IF the GPS_Tracker obtains a coordinate where latitude is outside the range -90 to 90 or longitude is outside the range -180 to 180, THEN THE GPS_Tracker SHALL discard the coordinate and retry at the next scheduled interval without writing a record.
6. WHEN a valid GPS update is received for an order that previously had an anomaly alert, THE Delivery_Dashboard SHALL automatically clear the anomaly alert for that order.

---

### Requirement 6: Handover and Proof of Delivery (Serah-Terima)

**User Story:** As a courier, I want to capture photo and signature proof at the point of delivery, so that a tamper-evident record of the handover exists.

#### Acceptance Criteria

1. WHEN a courier arrives at the delivery destination, THE Proof_Capture SHALL require the courier to explicitly confirm PIC presence via an acknowledgment action before the proof submission form becomes accessible.
2. WHEN the courier initiates proof capture, THE Proof_Capture SHALL collect both a photo image (JPEG or PNG) and a digital signature containing at least one drawn stroke from the PIC.
3. WHEN both photo and signature are collected, THE Chunk_Uploader SHALL upload each file using the Firestore Base64 Chunking Protocol defined in Requirement 7.
4. WHEN all file chunks are successfully written to Firestore, THE Order_Service SHALL update the order status to `DELIVERED` and record the delivery timestamp as a server-side timestamp.
5. IF the chunk upload fails for any file, THEN THE Proof_Capture SHALL display an error message indicating which file failed, retain all collected proof data locally, and present an explicit retry action to the courier until the upload succeeds or the courier explicitly discards the data.

---

### Requirement 7: Firestore Base64 Chunking Protocol

**User Story:** As a developer, I want a well-defined chunking protocol for large file storage in Firestore, so that files up to 15 MB can be stored and retrieved reliably within Firestore document size limits.

#### Acceptance Criteria

1. IF a file's byte size exceeds 15,728,640 bytes (15 MB), THEN THE Chunk_Uploader SHALL reject the file before beginning any upload, return a size-exceeded error to the caller, and leave no partial documents in Firestore.
2. THE Chunk_Uploader SHALL split each accepted file into sequential binary blobs of no more than 524,286 bytes (512 KB) each.
3. WHEN splitting a file, THE Chunk_Uploader SHALL convert each blob to Base64 encoding.
4. WHEN encoding chunk index 0, THE Chunk_Uploader SHALL prepend the Data_URI prefix in the format `data:<fileType>;base64,` to the Base64 string.
5. WHEN beginning an upload, THE Chunk_Uploader SHALL create a parent document in the `delivery_files` Firestore collection containing: `fileName`, `fileSize`, `fileType`, `totalChunks`, and `status` set to `"uploading"`.
6. WHEN a chunk is ready for storage, THE Chunk_Uploader SHALL write it as a separate document in the `delivery_files/{parentId}/chunks` subcollection containing: `index` (integer) and `data` (Base64 string).
7. WHEN all chunk documents are successfully written, THE Chunk_Uploader SHALL update the parent document `status` field to `"completed"`.
8. WHEN a file assembly is requested, THE Chunk_Assembler SHALL retrieve all chunk documents from `delivery_files/{parentId}/chunks`, ordered by `index` ascending.
9. WHEN reassembling a file, THE Chunk_Assembler SHALL concatenate the Base64 data fields in index order, strip the Data_URI prefix from the result, and decode the remainder into the original binary representation.
10. IF the number of chunks for a given parent document exceeds 30, THEN THE Chunk_Assembler SHALL reject the assembly request and return an error without reading further chunk data.
11. IF the chunk upload operation fails for any individual chunk, THEN THE Chunk_Uploader SHALL abort the upload, mark the parent document `status` as `"failed"`, and return an error to the caller.
12. IF the retrieved chunk count does not match the `totalChunks` value in the parent document, THEN THE Chunk_Assembler SHALL reject the assembly request with an incomplete-data error.
13. IF the decoded binary data cannot be reconstructed from the concatenated Base64 string, THEN THE Chunk_Assembler SHALL return a decode-failure error without returning partial data.

---

### Requirement 8: File Security and MIME Validation

**User Story:** As a security engineer, I want all uploaded files to be validated and storage access controlled, so that only authorised users can store or retrieve proof-of-delivery files.

#### Acceptance Criteria

1. THE MIME_Validator SHALL accept only files whose content is consistent with one of the following MIME types: `image/jpeg`, `image/png`, or `application/pdf`.
2. IF a file's content is inconsistent with the accepted MIME type set, THEN THE MIME_Validator SHALL reject the upload request and return a `415 Unsupported Media Type` HTTP response.
3. THE Auth_Guard SHALL require a valid Firebase Authentication token (`request.auth != null`) for any read or write operation on the `delivery_files` collection and its `chunks` subcollection in Firestore.
4. THE Auth_Guard SHALL require a valid Firebase Authentication token for all Go backend API endpoints that read or write order, GPS, or file data.
5. WHILE the system is running in a production environment, THE Order_Service SHALL configure CORS to allow only explicitly listed origin domains; wildcard origins (`*`) SHALL NOT be used.
6. IF a file's byte size exceeds 10,485,760 bytes (10 MB) at the backend validation layer, THEN THE MIME_Validator SHALL reject the request and return a `413 Request Entity Too Large` HTTP response.
7. IF a request arrives at a protected Go backend endpoint without a valid Firebase Authentication token, THEN THE Auth_Guard SHALL reject the request and return a `401 Unauthorized` HTTP response.

---

### Requirement 9: Real-Time Monitoring Dashboard

**User Story:** As an administrator, I want a live dashboard that shows order status distribution and active courier positions, so that I can identify and act on operational issues immediately.

#### Acceptance Criteria

1. WHEN the Delivery_Dashboard loads for an authenticated administrator, THE Delivery_Dashboard SHALL establish Firestore `onSnapshot` listeners for the `orders` collection, updating the displayed order pipeline without requiring a manual page refresh.
2. WHEN the order pipeline updates, THE Delivery_Dashboard SHALL display the updated count of orders in each status — `PLACING`, `CONFIRMED`, `IN_PRODUCTION`, `READY`, `READY_TO_DELIVER`, `OUT_FOR_DELIVERY`, and `DELIVERED` — within 5 seconds of the Firestore change event.
3. WHEN a delivery is rescheduled (order status transitions from `OUT_FOR_DELIVERY` back to `READY_TO_DELIVER`), THE Delivery_Dashboard SHALL display a dismissible anomaly alert indicator for that order, visually distinct from normal status changes.
4. THE Delivery_Dashboard SHALL display, as map markers, each courier whose most recent GPS update has a timestamp no older than 5 minutes.
5. WHERE an authenticated administrator is viewing the dashboard, THE Delivery_Dashboard SHALL provide a filter that accepts any combination of: order status, courier identifier, and a date range of no more than 90 days; filtered results SHALL satisfy all selected criteria simultaneously (AND logic).

---

### Requirement 10: Security Configuration and Repository Safety

**User Story:** As a developer, I want a `.gitignore` and `firestore.rules` configuration that prevent secrets and sensitive data from being committed, so that the repository is safe to host on GitHub.

#### Acceptance Criteria

1. THE repository's `.gitignore` file SHALL exclude the following patterns: `.env`, `.env.*`, `firebase-service-account.json`, `*.pem`, `*.key`, `dist/`, `build/`, `node_modules/`, `.firebase/`, and `.vercel/`.
2. IF a Firestore request targets the `delivery_files` collection or its `chunks` subcollection and `request.auth` is `null`, THEN THE `firestore.rules` configuration SHALL deny the request.
3. THE `firestore.rules` file SHALL be structured so that the top-level default denies all access, and each explicit rule grants only the specific operations (read, write, or both) necessary for the collection's documented purpose.
4. THE repository SHALL NOT contain any Firebase API keys, service account credentials, or private key files in any commit across its full commit history; these values SHALL be loaded exclusively from environment variables or secret management services at runtime.

---

### Requirement 11: TypeScript Data Contracts

**User Story:** As a frontend developer, I want well-typed TypeScript interfaces for all domain entities, so that type safety is enforced across the client codebase.

#### Acceptance Criteria

1. THE codebase SHALL define a TypeScript `Order` interface containing at minimum: `id` (string), `customerId` (string), `items` (array of line items), `status` (an explicitly enumerated string union type of all valid status literals), `createdAt` (ISO 8601 string), and `updatedAt` (ISO 8601 string).
2. THE codebase SHALL define a TypeScript `CourierGPS` interface containing: `orderId` (string), `courierId` (string), `latitude` (number), `longitude` (number), and `timestamp` (ISO 8601 string).
3. THE codebase SHALL define a TypeScript `FileMetadata` interface containing: `id` (string), `fileName` (string), `fileSize` (number, in bytes), `fileType` (string), `totalChunks` (number), and `status` (string union of `"uploading"` | `"completed"` | `"failed"`).
4. THE codebase SHALL define a TypeScript `FileChunk` interface containing: `fileId` (string), `index` (number), and `data` (string).
5. IF any component or service consumes or produces an `Order`, `CourierGPS`, `FileMetadata`, or `FileChunk` value, THEN THE component or service SHALL NOT annotate that value with `any` or `object`; it SHALL use the corresponding typed interface.
