# Implementation Plan: Order Fulfillment & Delivery Tracking System

## Overview

This plan implements a full-stack order fulfillment and delivery tracking system for Al-Umana Koperasi. The frontend uses React 18 + TypeScript + Vite + Tailwind CSS v4, and the backend uses Go 1.24 with Firestore Admin SDK. Implementation proceeds from scaffolding and shared types through core backend logic, then frontend pages, and finally integration wiring.

## Tasks

- [ ] 1. Project scaffolding and configuration
  - [x] 1.1 Initialize frontend project with Vite + React + TypeScript + Tailwind CSS v4
    - Run `npm create vite@latest frontend -- --template react-ts`
    - Install dependencies: `@tailwindcss/vite`, `tailwindcss`, `react-router-dom`
    - Install UI libraries: `@radix-ui/react-*`, `@mui/material`, `lucide-react`, `motion`
    - Configure `vite.config.ts` with `@tailwindcss/vite` plugin
    - Create base `app.css` with Tailwind v4 `@import "tailwindcss"` directive
    - _Requirements: 11.1–11.5_

  - [x] 1.2 Initialize Go backend module and project structure
    - Run `go mod init al-umana/order-fulfillment`
    - Create directory structure: `cmd/server/`, `internal/order/`, `internal/file/`, `internal/auth/`, `internal/stock/`, `internal/qc/`, `internal/gps/`, `internal/middleware/`, `internal/router/`
    - Create `cmd/server/main.go` with basic HTTP server setup
    - _Requirements: 1.1, 2.2, 3.2, 4.2_

  - [ ] 1.3 Configure Firebase client SDK and environment variables
    - Install `firebase` npm package in frontend
    - Create `src/lib/firebase.ts` with `initializeApp()` using env vars
    - Create `.env.example` with placeholder keys: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`
    - _Requirements: 10.4, 8.3_

  - [x] 1.4 Create `.gitignore` for repository safety
    - Add patterns: `.env`, `.env.*`, `firebase-service-account.json`, `*.pem`, `*.key`, `dist/`, `build/`, `node_modules/`, `.firebase/`, `.vercel/`
    - Add Go-specific patterns: `bin/`, `*.exe`
    - _Requirements: 10.1, 10.4_

  - [ ] 1.5 Configure CORS middleware in Go backend
    - Create `internal/middleware/cors.go`
    - Implement CORS middleware that reads allowed origins from environment variable
    - Allow methods: `GET, POST, PATCH, DELETE, OPTIONS`
    - Allow headers: `Authorization, Content-Type`
    - Reject wildcard `*` origins in production mode
    - _Requirements: 8.5_

- [ ] 2. TypeScript interfaces and Go data models
  - [ ] 2.1 Define TypeScript interfaces for all domain entities
    - Create `src/types/order.ts` with `Order`, `OrderLineItem`, `OrderStatus` types
    - Create `src/types/courier-gps.ts` with `CourierGPS` interface
    - Create `src/types/file.ts` with `FileMetadata` and `FileChunk` interfaces
    - Ensure `OrderStatus` is a string union of all valid status literals
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [ ] 2.2 Define Go structs and request/response types
    - Create `internal/order/models.go` with `Order`, `OrderLineItem`, `OrderStatus` types
    - Create `internal/file/models.go` with `FileMetadata`, `FileChunk` structs
    - Create `internal/gps/models.go` with `CourierGPS` struct
    - Define error response struct in `internal/common/errors.go`
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

- [ ] 3. UI/UX design system and shared components
  - [ ] 3.1 Configure Tailwind CSS v4 theme with design tokens
    - Define color tokens: primary `#FBBF24`, secondary `#111827`, tertiary `#F59E0B`, neutral `#6B7280`, background `#F3F4F6`, success `#10B981`, error `#EF4444`, info `#3B82F6`
    - Configure typography: Manrope for headings, Hanken Grotesk for body
    - Import Google Fonts in `index.html`
    - _Requirements: 9.1, 9.2_

  - [ ] 3.2 Create shared UI components (Button, Card, Input, StatusBadge)
    - Create `src/components/ui/Button.tsx` with variants: Primary, Secondary, Inverted, Outlined, Danger (pill shape `rounded-full`)
    - Create `src/components/ui/Card.tsx` with shadow and 1rem border radius
    - Create `src/components/ui/Input.tsx` with focus ring `#FBBF24`
    - Create `src/components/ui/StatusBadge.tsx` with color mapping for all 8 order statuses
    - _Requirements: 9.2_

  - [ ] 3.3 Create layout components (Sidebar, AppShell, NavigationTabs)
    - Create `src/components/layout/Sidebar.tsx` with fixed 240px desktop sidebar, icon + label nav items
    - Create `src/components/layout/AppShell.tsx` wrapping sidebar + main content area
    - Create `src/components/layout/MobileNav.tsx` with bottom tab bar for mobile (< 768px)
    - Implement responsive breakpoint at 768px
    - _Requirements: 9.1_

- [ ] 4. Auth guard middleware and Firebase auth integration
  - [ ] 4.1 Implement Go Auth Guard middleware
    - Create `internal/auth/guard.go` with middleware that extracts `Authorization: Bearer <token>` header
    - Verify token via Firebase Admin SDK `auth.VerifyIDToken()`
    - Inject decoded UID and custom claims into request context
    - Return `401 Unauthorized` JSON error if token is missing or invalid
    - _Requirements: 8.4, 8.7_

  - [ ]* 4.2 Write property test for Auth Guard (Property 16)
    - **Property 16: Auth guard rejects unauthenticated requests**
    - Generate requests with missing, malformed, and expired tokens using `rapid`
    - Verify all return 401 Unauthorized
    - **Validates: Requirements 8.4, 8.7**

  - [ ] 4.3 Implement frontend AuthProvider and auth service
    - Create `src/services/authService.ts` with sign-in, sign-out, token refresh, auth state listener
    - Create `src/contexts/AuthContext.tsx` with `AuthProvider` component
    - Implement `useAuth()` hook exposing user, loading state, and auth methods
    - Add token injection to API client (Axios/fetch interceptor with `Authorization: Bearer`)
    - _Requirements: 8.3, 8.4_

- [ ] 5. Go backend router and handler structure
  - [ ] 5.1 Set up HTTP router with all API endpoints
    - Create `internal/router/router.go` using Go 1.22+ `net/http` ServeMux with method patterns
    - Register all endpoints: `POST /api/orders`, `GET /api/orders`, `GET /api/orders/{id}`, `PATCH /api/orders/{id}/status`, `POST /api/orders/{id}/assign-courier`, `POST /api/orders/{id}/dispatch`, `POST /api/orders/{id}/deliver`, `GET /api/orders/{id}/files`, `POST /api/files/{id}/assemble`, `GET /api/files/{id}/download`, `POST /api/files/validate-mime`, `GET /api/dashboard/stats`, `GET /api/couriers/locations`
    - Apply Auth Guard and CORS middleware to all routes
    - Apply request logger middleware
    - _Requirements: 8.4, 8.5_

  - [ ] 5.2 Create Firestore repository layer
    - Create `internal/order/repository.go` with CRUD operations for orders collection
    - Create `internal/file/repository.go` with operations for `delivery_files` and `chunks` subcollection
    - Create `internal/gps/repository.go` with operations for `courier_locations` collection
    - Use Firestore Admin SDK client injected via constructor
    - _Requirements: 1.3, 5.1, 7.5, 7.6_

- [ ] 6. Order state machine implementation
  - [ ] 6.1 Implement order state machine in Go
    - Create `internal/order/statemachine.go` with valid transitions map
    - Implement `ValidateTransition(from, to OrderStatus) error` function
    - Define all valid transitions per the design: PLACING→CONFIRMED, PLACING→FAILED, CONFIRMED→IN_PRODUCTION, IN_PRODUCTION→READY, READY→READY_TO_DELIVER, READY→CONFIRMED, READY_TO_DELIVER→OUT_FOR_DELIVERY, OUT_FOR_DELIVERY→READY_TO_DELIVER, OUT_FOR_DELIVERY→DELIVERED
    - Return `INVALID_STATE_TRANSITION` error with 409 status for invalid transitions
    - _Requirements: 2.6, 2.7, 3.6, 4.5_

  - [ ]* 6.2 Write property test for state machine (Property 4)
    - **Property 4: State machine rejects invalid transitions**
    - Generate all possible (from, to) status pairs using `rapid`
    - Verify valid transitions are accepted and invalid transitions are rejected with error
    - **Validates: Requirements 2.6, 2.7, 3.6, 4.5, 2.4, 4.4**

- [ ] 7. Order placement and validation
  - [ ] 7.1 Implement order validation in Go backend
    - Create `internal/order/validation.go` with `ValidateCreateOrder(req CreateOrderRequest) []FieldError`
    - Validate: customer name non-empty ≤ 200 chars, each item ID non-empty, each quantity ≥ 1, delivery address non-empty ≤ 500 chars
    - Return field-specific errors identifying each failing field by name with reason
    - _Requirements: 1.1, 1.2_

  - [ ]* 7.2 Write property test for order validation (Property 1)
    - **Property 1: Order validation accepts valid inputs and rejects invalid inputs with field-specific errors**
    - Generate random order payloads with valid and invalid fields using `rapid`
    - Verify valid payloads pass, invalid payloads return field-specific errors, no order record created on failure
    - **Validates: Requirements 1.1, 1.2**

  - [ ] 7.3 Implement CreateOrder handler and service
    - Create `internal/order/handler.go` with `CreateOrder` HTTP handler
    - Create `internal/order/service.go` with `CreateOrder` method
    - On valid payload: persist order to Firestore with status `PLACING`, return order ID
    - On invalid payload: return 400 with field-specific errors
    - _Requirements: 1.1, 1.2, 1.3_

  - [ ]* 7.4 Write property test for order persistence (Property 3)
    - **Property 3: Valid order persistence with initial status**
    - Generate valid order payloads using `rapid`
    - Verify each persisted order has status `PLACING` and all field values preserved
    - **Validates: Requirements 1.3**

  - [ ] 7.5 Implement frontend OrderForm component
    - Create `src/pages/OrdersPage.tsx` with order list and create form
    - Create `src/components/orders/OrderForm.tsx` with fields: customer name, items (dynamic list), quantities, delivery address
    - Add client-side validation matching backend rules
    - Submit via `orderService.createOrder()` REST call
    - Display field-specific validation errors inline
    - _Requirements: 1.1, 1.2, 1.3_

- [ ] 8. Stock service integration
  - [ ] 8.1 Implement Stock Service in Go backend
    - Create `internal/stock/service.go` with `CheckAvailability(items []OrderLineItem) (StockResult, error)`
    - Query Firestore `inventory` collection for each item
    - Return list of out-of-stock item IDs if any are unavailable
    - Implement 10-second timeout using `context.WithTimeout`
    - _Requirements: 1.4, 1.5, 1.6, 1.7_

  - [ ] 8.2 Wire stock check into order creation flow
    - After order persisted with `PLACING`, call `StockService.CheckAvailability()`
    - If all items available: transition to `CONFIRMED`, forward to Production_Queue
    - If any item unavailable: transition to `FAILED`, record out-of-stock item IDs
    - If timeout (10s): transition to `FAILED`, record timeout reason
    - _Requirements: 1.4, 1.5, 1.6, 1.7_

  - [ ]* 8.3 Write property test for stock check outcome (Property 2)
    - **Property 2: Stock check determines order outcome**
    - Mock stock service responses using `rapid`
    - Verify: all available → CONFIRMED; any unavailable → FAILED with item IDs; timeout → FAILED with timeout reason
    - **Validates: Requirements 1.4, 1.5, 1.6**

- [ ] 9. Checkpoint - Core order creation flow
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Production workflow
  - [ ] 10.1 Implement production status transitions in Go backend
    - Add `StartProduction` handler: validate order is `CONFIRMED`, transition to `IN_PRODUCTION`, record UID + server timestamp
    - Add `CompleteProduction` handler: validate order is `IN_PRODUCTION`, transition to `READY`
    - Enforce single-worker lock: reject if order already `IN_PRODUCTION`
    - Notify QC_Service when order reaches `READY`
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [ ]* 10.2 Write property test for production start metadata (Property 6)
    - **Property 6: Production start records actor and timestamp**
    - Generate authenticated team member UIDs and CONFIRMED orders using `rapid`
    - Verify transition to IN_PRODUCTION with UID and timestamp recorded
    - **Validates: Requirements 2.2**

  - [ ]* 10.3 Write property test for production queue filtering (Property 5)
    - **Property 5: Production queue shows only CONFIRMED orders in creation order**
    - Generate mixed-status order sets using `rapid`
    - Verify only CONFIRMED orders returned, ordered by createdAt ascending
    - **Validates: Requirements 2.1**

  - [ ] 10.4 Implement frontend ProductionPage
    - Create `src/pages/ProductionPage.tsx` with production queue view
    - Create `src/components/production/ProductionQueue.tsx` displaying CONFIRMED orders sorted by creation time
    - Create `src/components/production/ProductionCard.tsx` with "Start" and "Complete" actions
    - Use Firestore `onSnapshot` for real-time queue updates
    - Show error toast for invalid state transitions (already in progress)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [ ] 11. QC review workflow
  - [ ] 11.1 Implement QC review handlers in Go backend
    - Add `QCPass` handler: validate order is `READY`, transition to `READY_TO_DELIVER`, record reviewer UID + timestamp
    - Add `QCFail` handler: validate order is `READY`, validate reason (non-empty, ≤ 500 chars), transition to `CONFIRMED`, record reason + reviewer UID + timestamp
    - Reject QC actions on orders not in `READY` status
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ]* 11.2 Write property test for QC decision transitions (Property 7)
    - **Property 7: QC decision transitions and metadata**
    - Generate QC pass/fail decisions with valid reasons using `rapid`
    - Verify pass → READY_TO_DELIVER, fail → CONFIRMED with reason persisted, UID + timestamp recorded
    - **Validates: Requirements 3.2, 3.3, 3.4**

  - [ ]* 11.3 Write property test for QC fail reason validation (Property 8)
    - **Property 8: QC fail reason validation**
    - Generate empty strings and strings > 500 chars using `rapid`
    - Verify rejection with validation error, order status unchanged
    - **Validates: Requirements 3.5**

  - [ ] 11.4 Implement frontend QCReviewPage
    - Create `src/pages/QCReviewPage.tsx` with QC queue view
    - Create `src/components/qc/QCQueue.tsx` displaying orders in `READY` status via `onSnapshot`
    - Create `src/components/qc/QCReviewForm.tsx` with Pass/Fail buttons and fail reason textarea (≤ 500 chars)
    - Display within 3 seconds of Firestore change via real-time listener
    - _Requirements: 3.1, 3.2, 3.3, 3.5_

- [ ] 12. Courier assignment and dispatch
  - [ ] 12.1 Implement courier assignment and dispatch handlers in Go backend
    - Add `AssignCourier` handler: validate order is `READY_TO_DELIVER`, record courier ID
    - Add `DispatchOrder` handler: validate order is assigned and `READY_TO_DELIVER`, transition to `OUT_FOR_DELIVERY`
    - Reject assignment/dispatch for orders not in `READY_TO_DELIVER` status
    - Reject re-assignment for orders already `OUT_FOR_DELIVERY`
    - _Requirements: 4.2, 4.3, 4.4, 4.5_

  - [ ] 12.2 Implement frontend DispatchPage
    - Create `src/pages/DispatchPage.tsx` with assignment queue
    - Create `src/components/dispatch/AssignmentQueue.tsx` showing `READY_TO_DELIVER` orders
    - Create `src/components/dispatch/CourierSelector.tsx` for courier selection dropdown
    - Add "Assign" and "Dispatch" action buttons with confirmation
    - Use `onSnapshot` for real-time queue updates
    - _Requirements: 4.1, 4.2, 4.3_

- [ ] 13. Checkpoint - Order lifecycle through dispatch
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 14. GPS tracking implementation
  - [ ] 14.1 Implement frontend GPS Tracker service
    - Create `src/services/gpsService.ts` with Geolocation API wrapper
    - Implement coordinate validation: latitude [-90, 90], longitude [-180, 180]
    - Discard invalid coordinates silently, retry at next interval
    - Write valid coordinates directly to Firestore `courier_locations/{orderId}_{courierId}` document
    - Append to `location_history` subcollection for historical tracking
    - Set interval to ≤ 30 seconds while order is `OUT_FOR_DELIVERY`
    - Record latitude, longitude, and server-side timestamp
    - _Requirements: 5.1, 5.4, 5.5_

  - [ ]* 14.2 Write property test for GPS coordinate validation (Property 9)
    - **Property 9: GPS coordinate validation and storage**
    - Generate random lat/lng pairs using `fast-check` (both valid and invalid ranges)
    - Verify valid coordinates are stored with timestamp, invalid coordinates are discarded
    - **Validates: Requirements 5.4, 5.5**

  - [ ] 14.3 Implement GPS Tracker React component
    - Create `src/pages/TrackingPage.tsx` for courier tracking view
    - Create `src/components/tracking/GPSTracker.tsx` that starts/stops tracking based on order status
    - Create `src/components/tracking/LocationDisplay.tsx` showing current position
    - Start tracking when order is `OUT_FOR_DELIVERY`, stop on delivery
    - _Requirements: 5.1_

  - [ ]* 14.4 Write property test for GPS staleness detection (Property 10)
    - **Property 10: GPS staleness detection**
    - Generate random timestamps and compute elapsed time using `fast-check`
    - Verify: > 5 minutes elapsed + OUT_FOR_DELIVERY → anomaly flagged; fresh update → anomaly cleared
    - **Validates: Requirements 5.3, 5.6, 9.4**

  - [ ] 14.5 Implement CourierMap component on dashboard
    - Create `src/components/dashboard/CourierMap.tsx` with map markers for active couriers
    - Subscribe to `courier_locations` via `onSnapshot`
    - Display markers only for couriers with GPS update < 5 minutes old
    - Implement anomaly alert indicator for stale GPS (> 5 minutes)
    - Auto-clear anomaly when fresh update arrives
    - Reflect new position within 3 seconds of Firestore write
    - _Requirements: 5.2, 5.3, 5.6, 9.4_

- [ ] 15. Chunking protocol implementation
  - [ ] 15.1 Implement frontend Chunk Uploader service
    - Create `src/services/chunkUploadService.ts`
    - Reject files > 15,728,640 bytes (15 MB) before upload begins
    - Split accepted files into sequential blobs of ≤ 524,286 bytes (512 KB)
    - Base64 encode each blob
    - Prepend Data_URI prefix `data:<fileType>;base64,` to chunk index 0
    - Create parent document in `delivery_files` with: fileName, fileSize, fileType, totalChunks, status="uploading"
    - Write each chunk to `delivery_files/{parentId}/chunks` subcollection with index and data
    - On all chunks written: update parent status to "completed"
    - On any chunk failure: mark parent status "failed", abort, return error
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.11_

  - [ ]* 15.2 Write property test for chunk structure invariants (Property 12)
    - **Property 12: Chunk structure invariants**
    - Generate random files of varying sizes using `fast-check`
    - Verify: each chunk ≤ 524,286 bytes, indices sequential from 0, chunk 0 has Data_URI prefix, subsequent chunks do not
    - **Validates: Requirements 7.2, 7.3, 7.4, 7.6**

  - [ ]* 15.3 Write property test for file size rejection (Property 13)
    - **Property 13: File size rejection**
    - Generate random file sizes using `fast-check`
    - Verify: > 15 MB rejected by Chunk_Uploader with no Firestore documents; > 10 MB rejected by backend with 413
    - **Validates: Requirements 7.1, 8.6**

  - [ ] 15.4 Implement Go Chunk Assembler service
    - Create `internal/file/assembler.go` with `AssembleFile(parentId string) ([]byte, error)`
    - Read parent document, verify totalChunks ≤ 30
    - Read all chunks ordered by index ascending
    - Verify chunk count matches totalChunks
    - Concatenate Base64 data in index order
    - Strip Data_URI prefix from concatenated string
    - Decode Base64 to binary
    - Return error for: chunk count > 30, count mismatch, decode failure
    - _Requirements: 7.8, 7.9, 7.10, 7.12, 7.13_

  - [ ]* 15.5 Write property test for chunking round-trip (Property 11)
    - **Property 11: Chunking protocol round-trip**
    - Generate random binary data ≤ 15 MB using `fast-check`
    - Split, encode, prepend Data_URI, then assemble: verify output equals original
    - **Validates: Requirements 7.2, 7.3, 7.4, 7.8, 7.9**

  - [ ]* 15.6 Write property test for assembly guard conditions (Property 14)
    - **Property 14: Assembly guard conditions**
    - Generate chunk counts > 30 and mismatched totalChunks values using `rapid`
    - Verify rejection with appropriate error, no partial data returned
    - **Validates: Requirements 7.10, 7.12**

- [ ] 16. MIME validation
  - [ ] 16.1 Implement MIME Validator in Go backend
    - Create `internal/file/mime.go` with `ValidateMIME(data []byte, declaredType string) error`
    - Read file magic bytes to detect actual content type
    - Accept only: `image/jpeg`, `image/png`, `application/pdf`
    - Return 415 Unsupported Media Type if content doesn't match accepted set
    - Return 413 Request Entity Too Large if file > 10,485,760 bytes (10 MB)
    - Wire into `ValidateMIME` HTTP handler endpoint
    - _Requirements: 8.1, 8.2, 8.6_

  - [ ]* 16.2 Write property test for MIME validation (Property 15)
    - **Property 15: MIME validation**
    - Generate random file headers (valid JPEG/PNG/PDF magic bytes and invalid bytes) using `rapid`
    - Verify: valid magic bytes accepted, invalid magic bytes return 415
    - **Validates: Requirements 8.1, 8.2**

- [ ] 17. Proof of delivery (Serah-Terima)
  - [ ] 17.1 Implement frontend ProofCapture component
    - Create `src/pages/DeliveryPage.tsx` with delivery flow
    - Create `src/components/delivery/PICConfirmation.tsx` requiring explicit PIC presence acknowledgment before proof form
    - Create `src/components/delivery/ProofCapture.tsx` collecting photo (JPEG/PNG) and digital signature (≥ 1 stroke)
    - Integrate camera/gallery input for photo capture
    - Implement signature pad component for PIC signature
    - _Requirements: 6.1, 6.2_

  - [ ] 17.2 Wire ProofCapture to ChunkUploader and delivery confirmation
    - On both photo and signature collected: upload each via `chunkUploadService`
    - On successful upload of all files: call `POST /api/orders/{id}/deliver` to mark `DELIVERED`
    - On chunk failure: display error identifying failed file, retain local data, show retry button
    - Implement `ConfirmDelivery` handler in Go backend: validate order is `OUT_FOR_DELIVERY`, transition to `DELIVERED`, record server-side delivery timestamp and proof file IDs
    - _Requirements: 6.3, 6.4, 6.5_

  - [ ]* 17.3 Write property test for proof capture validation (Property 18)
    - **Property 18: Proof capture validation**
    - Generate partial submissions (missing photo, missing signature, empty signature) using `fast-check`
    - Verify: both photo + signature with ≥ 1 stroke accepted; any missing → rejected
    - **Validates: Requirements 6.2**

- [ ] 18. Checkpoint - Delivery and file handling complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 19. Real-time monitoring dashboard
  - [ ] 19.1 Implement DashboardPage with real-time order pipeline
    - Create `src/pages/DashboardPage.tsx` as main dashboard view
    - Create `src/components/dashboard/StatusPipeline.tsx` showing order counts per status
    - Establish Firestore `onSnapshot` listener on `orders` collection
    - Update counts within 5 seconds of Firestore change event
    - Display all 7 active statuses: PLACING, CONFIRMED, IN_PRODUCTION, READY, READY_TO_DELIVER, OUT_FOR_DELIVERY, DELIVERED
    - _Requirements: 9.1, 9.2_

  - [ ] 19.2 Implement AnomalyAlerts component
    - Create `src/components/dashboard/AnomalyAlerts.tsx` for live anomaly feed
    - Detect reschedule events (OUT_FOR_DELIVERY → READY_TO_DELIVER) and display dismissible alert
    - Detect GPS staleness (> 5 min without update for OUT_FOR_DELIVERY orders)
    - Visually distinguish anomaly alerts from normal status changes
    - _Requirements: 9.3, 5.3_

  - [ ] 19.3 Implement FilterPanel component
    - Create `src/components/dashboard/FilterPanel.tsx` with filters: order status, courier identifier, date range (≤ 90 days)
    - Apply AND logic: filtered results satisfy ALL selected criteria simultaneously
    - Wire filters to order table query
    - _Requirements: 9.5_

  - [ ]* 19.4 Write property test for dashboard filter AND logic (Property 17)
    - **Property 17: Dashboard filter AND logic**
    - Generate random filter combinations and order sets using `fast-check`
    - Verify: filtered results contain only orders satisfying ALL selected criteria
    - **Validates: Requirements 9.5**

  - [ ] 19.5 Implement dashboard stats backend endpoint
    - Implement `GetDashboardStats` handler in Go backend returning aggregated order counts by status
    - Implement `GetCourierLocations` handler returning current GPS positions for active couriers
    - _Requirements: 9.1, 9.4_

- [ ] 20. Firestore security rules
  - [ ] 20.1 Create Firestore security rules file
    - Create `firestore.rules` with `rules_version = '2'`
    - Default deny all: `match /{document=**} { allow read, write: if false; }`
    - `delivery_files` and `chunks` subcollection: require `request.auth != null` for read/write
    - `orders`: authenticated users read own orders, admins read all
    - `courier_locations`: authenticated couriers write, admins read
    - `inventory`: read-only for authenticated users
    - _Requirements: 10.2, 10.3, 8.3_

- [ ] 21. Frontend service layer and API client wiring
  - [ ] 21.1 Implement frontend service layer
    - Create `src/services/orderService.ts` with REST calls for all order endpoints
    - Create `src/services/realtimeService.ts` with `onSnapshot` subscription management and cleanup
    - Create `src/services/dashboardService.ts` with aggregation queries and anomaly detection logic
    - Create shared API client with base URL config, auth token injection, and error handling
    - Implement retry with exponential backoff (max 3 attempts) for network errors
    - _Requirements: 1.1, 9.1, 9.2_

- [ ] 22. App routing and page integration
  - [ ] 22.1 Set up React Router with all page routes
    - Create `src/router/AppRouter.tsx` with routes: `/dashboard`, `/orders`, `/production`, `/qc`, `/dispatch`, `/delivery`, `/tracking`
    - Wrap routes in `AuthProvider` for protected access
    - Implement redirect to login for unauthenticated users
    - Wire all pages into AppShell layout with sidebar navigation
    - _Requirements: 8.3, 9.1_

- [ ] 23. Final checkpoint - Full system integration
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Frontend uses TypeScript with React 18, Vite, and Tailwind CSS v4
- Backend uses Go 1.24 with standard library `net/http` router and Firestore Admin SDK
- Property-based tests use `fast-check` for TypeScript and `rapid` for Go
- All Firestore direct writes (GPS, chunks) use Firebase client SDK with auth
- All order state transitions go through the Go backend for server-side enforcement

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.4"] },
    { "id": 1, "tasks": ["1.3", "1.5", "2.1", "2.2"] },
    { "id": 2, "tasks": ["3.1", "3.2", "3.3", "4.1", "5.1", "5.2"] },
    { "id": 3, "tasks": ["4.2", "4.3", "6.1"] },
    { "id": 4, "tasks": ["6.2", "7.1"] },
    { "id": 5, "tasks": ["7.2", "7.3"] },
    { "id": 6, "tasks": ["7.4", "7.5", "8.1"] },
    { "id": 7, "tasks": ["8.2"] },
    { "id": 8, "tasks": ["8.3", "10.1"] },
    { "id": 9, "tasks": ["10.2", "10.3", "10.4", "11.1"] },
    { "id": 10, "tasks": ["11.2", "11.3", "11.4", "12.1"] },
    { "id": 11, "tasks": ["12.2", "14.1"] },
    { "id": 12, "tasks": ["14.2", "14.3", "14.4", "14.5", "15.1"] },
    { "id": 13, "tasks": ["15.2", "15.3", "15.4"] },
    { "id": 14, "tasks": ["15.5", "15.6", "16.1"] },
    { "id": 15, "tasks": ["16.2", "17.1"] },
    { "id": 16, "tasks": ["17.2", "17.3"] },
    { "id": 17, "tasks": ["19.1", "19.2", "19.3", "19.5"] },
    { "id": 18, "tasks": ["19.4", "20.1", "21.1"] },
    { "id": 19, "tasks": ["22.1"] }
  ]
}
```
