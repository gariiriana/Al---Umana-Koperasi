# Implementation Plan: Customer Storefront & Admin Stock Management

## Overview

Convert the feature design into a series of prompts for a code-generation LLM that will implement each step with incremental progress. Make sure that each prompt builds on the previous prompts, and ends with wiring things together. There should be no hanging or orphaned code that isn't integrated into a previous step. Focus ONLY on tasks that involve writing, modifying, or testing code.

The plan extends the existing Go backend (`backend/internal/{auth,order,stock,file,common,router}`) and the React/TypeScript frontend with a mobile-first Storefront, an Admin Stock Management area, and a payment-proof workflow. Property-based tests use `pgregory.net/rapid` (Go) and `fast-check` (TypeScript), both already on the project's dependency list.

## Tasks

- [x] 1. Backend foundation — error codes and chunked-file generalization
  - [x] 1.1 Add new error codes to common package
    - Extend `backend/internal/common/errors.go` with `INVALID_PAYMENT_METHOD`, `INVALID_STATE_TRANSITION`, `IMAGE_MIME_REJECTED`, `IMAGE_SIZE_REJECTED`, `ASSEMBLY_FAILED`, `FORBIDDEN_ADMIN_ONLY`
    - _Requirements: 6.5, 6.6, 7.4, 7.5, 7.13, 8.9, 10.6, 10.7, 11.2, 11.3, 11.12_

  - [x] 1.2 Generalize file repository to accept collection name
    - Extend `backend/internal/file/repository.go` with `NewRepositoryFor(client, collection)` plus `NewDeliveryFilesRepository`, `NewProductImagesRepository`, `NewPaymentProofsRepository` wrappers
    - Preserve existing `delivery_files` semantics and the `FileMetadata`/`FileChunk` shapes (with `OrderID` `omitempty`)
    - _Requirements: 7.6, 7.7, 11.4, 11.5_

  - [ ]\* 1.3 Write property test for chunking protocol round-trip
    - **Property 13: Chunking protocol round-trip**
    - For any byte array `b` (≤ 15 MB) and MIME `m ∈ {image/jpeg, image/png, image/webp}`, splitting → Base64 → prefixing chunk 0 → persisting → assembling yields a byte array equal to `b`; total chunks ∈ [1, 30] and each pre-encoded slice ≤ 524,288 bytes
    - Place under `backend/internal/file/chunking_property_test.go` using `pgregory.net/rapid`
    - **Validates: Requirements 7.6, 7.7, 11.4, 11.5, 11.8**

  - [ ]\* 1.4 Write property test for assembly error handling
    - **Property 17: Assembly error handling**
    - For any malformed chunked file (chunk-count mismatch, totalChunks > 30, out-of-range index, base64 failure), `Assembler.Assemble` returns an error identifying the cause and no Order/InventoryItem document is mutated
    - Place under `backend/internal/file/assembly_property_test.go`
    - **Validates: Requirements 7.13, 11.12**

- [x] 2. Order domain extensions (models, state machine, validation, service)
  - [x] 2.1 Extend Order models with payment fields and status constants
    - Add `StatusAwaitingPaymentProof`, `StatusAwaitingPaymentApproval`, `StatusPaymentRejected` to `backend/internal/order/models.go`
    - Add `PaymentMethod` and `PaymentStatus` enums and the new Order fields (`PaymentMethod`, `PaymentStatus`, `PaymentProofFileID`, `PaymentApprovedBy`, `PaymentApprovedAt`, `PaymentRejectedBy`, `PaymentRejectedAt`, `PaymentRejectReason`)
    - _Requirements: 5.2, 6.1, 7.1, 7.9, 8.5, 8.8_

  - [x] 2.2 Extend Order state machine with payment transitions
    - Update `backend/internal/order/statemachine.go` `validTransitions` to include `PLACING → AWAITING_PAYMENT_PROOF`, `AWAITING_PAYMENT_PROOF → AWAITING_PAYMENT_APPROVAL`, `AWAITING_PAYMENT_APPROVAL → CONFIRMED|PAYMENT_REJECTED`, and `PAYMENT_REJECTED → AWAITING_PAYMENT_APPROVAL`; preserve all existing transitions
    - _Requirements: 6.1, 7.1, 7.9, 8.5, 8.8_

  - [ ]\* 2.3 Write unit tests for new state machine edges
    - Cover both legal and illegal transitions for the new payment states; reject any transition not in the table
    - _Requirements: 6.1, 7.1, 7.9, 8.5, 8.8, 8.9_

  - [x] 2.4 Extend order validation with payment method and rejection reason
    - Update `backend/internal/order/validation.go` to validate `paymentMethod ∈ {cod, bank_transfer, e_wallet}` and rejection reason length 1–500 chars after trim
    - _Requirements: 5.2, 6.1, 8.7_

  - [x] 2.5 Extend Order service with payment lifecycle methods
    - In `backend/internal/order/service.go`: split `CreateOrder` post-stock-check transition by `paymentMethod` (COD → `CONFIRMED`, non-COD → `AWAITING_PAYMENT_PROOF` with `paymentStatus = awaiting_proof`), preserving existing `FAILED` handling for stock/timeout
    - Add `UploadProof(ctx, orderID, customerUID, fileId)` — sets `paymentProofFileId`, transitions `AWAITING_PAYMENT_PROOF | PAYMENT_REJECTED → AWAITING_PAYMENT_APPROVAL`, sets `paymentStatus = awaiting_approval`; deletes previous `payment_proofs/{old}` (parent + chunks) when re-uploading from `PAYMENT_REJECTED`
    - Add `ApprovePayment(ctx, orderID, adminUID)` — transitions `AWAITING_PAYMENT_APPROVAL → CONFIRMED`, sets `paymentStatus = approved`, `paymentApprovedBy`, `paymentApprovedAt`
    - Add `RejectPayment(ctx, orderID, adminUID, reason)` — validates reason 1–500 after trim, transitions `AWAITING_PAYMENT_APPROVAL → PAYMENT_REJECTED`, sets `paymentStatus = rejected`, `paymentRejectionReason`, `paymentRejectedBy`, `paymentRejectedAt`
    - Add `ListByCustomer(ctx, uid, cursor, limit)` returning at most `min(limit, 50)` orders sorted by `createdAt` desc with cursor support
    - Reject all four payment lifecycle methods with `INVALID_STATE_TRANSITION` when source status does not match
    - _Requirements: 6.1, 6.3, 6.4, 6.5, 7.1, 7.9, 7.10, 7.11, 7.12, 8.5, 8.7, 8.8, 8.9, 9.2_

  - [ ]\* 2.6 Write property test for order placement transition
    - **Property 10: Order placement transition**
    - After `Service.CreateOrder(req)` the persisted Order has status `CONFIRMED` (cod + stock OK), `AWAITING_PAYMENT_PROOF` with `paymentStatus = awaiting_proof` (non-cod + stock OK), or `FAILED` (stock unavailable / timeout) regardless of `paymentMethod`
    - Place under `backend/internal/order/placement_property_test.go`
    - **Validates: Requirements 6.1, 7.1**

  - [ ]\* 2.7 Write property test for successful proof finalization
    - **Property 14: Successful proof finalization**
    - For any Order with status ∈ `{AWAITING_PAYMENT_PROOF, PAYMENT_REJECTED}` and a successful upload yielding `fileId`, the post-state has `status = AWAITING_PAYMENT_APPROVAL`, `paymentStatus = awaiting_approval`, `paymentProofFileId = "payment_proofs/{fileId}"`, and parent file `status = "completed"`
    - Place under `backend/internal/order/proof_finalization_property_test.go`
    - **Validates: Requirements 7.9**

  - [ ]\* 2.8 Write property test for failed/cancelled upload preserves Order
    - **Property 15: Failed or cancelled upload preserves Order**
    - For any Order and any upload that aborts before all chunks are written, the Order document is byte-equal pre and post; parent file `status` ends as `"failed"` (chunk-write failure) or unchanged (cancel)
    - Place under `backend/internal/order/proof_failure_property_test.go`
    - **Validates: Requirements 7.10, 7.11, 11.13**

  - [ ]\* 2.9 Write property test for re-upload deletes previous proof
    - **Property 16: Re-upload deletes previous proof**
    - For Order with `PAYMENT_REJECTED` and existing `paymentProofFileId = "payment_proofs/{old}"`, after a successful re-upload yielding `new`, the Order has `paymentProofFileId = "payment_proofs/{new}"` and `payment_proofs/{old}` plus its chunks are absent
    - Place under `backend/internal/order/proof_reupload_property_test.go`
    - **Validates: Requirements 7.12**

  - [ ]\* 2.10 Write property test for approve transition
    - **Property 19: Approve transition**
    - For any Order with `AWAITING_PAYMENT_APPROVAL` and admin UID `u`, `Service.ApprovePayment` produces a post-state with `status = CONFIRMED`, `paymentStatus = approved`, `paymentApprovedBy = u`, and `paymentApprovedAt ∈ [pre, post]`; all other fields unchanged
    - Place under `backend/internal/order/approve_transition_property_test.go`
    - **Validates: Requirements 8.5**

  - [ ]\* 2.11 Write property test for reject transition
    - **Property 20: Reject transition**
    - Valid reason → `status = PAYMENT_REJECTED`, `paymentStatus = rejected`, `paymentRejectionReason = trim(r)`, `paymentRejectedBy = u`, `paymentRejectedAt ∈ [pre, post]`; invalid reason → validation error and Order byte-equal pre/post
    - Place under `backend/internal/order/reject_transition_property_test.go`
    - **Validates: Requirements 8.7, 8.8**

  - [ ]\* 2.12 Write property test for wrong-status payment action
    - **Property 21: Wrong-status payment action**
    - For any Order with `status ≠ AWAITING_PAYMENT_APPROVAL`, both `ApprovePayment` and `RejectPayment` return `INVALID_STATE_TRANSITION` and the Order is byte-equal pre/post
    - Place under `backend/internal/order/wrong_status_property_test.go`
    - **Validates: Requirements 8.9**

  - [ ]\* 2.13 Write property test for my-orders projection
    - **Property 22: My-orders projection**
    - `listMyOrders(uid, limit)` returns at most `min(limit, 50)` orders all matching `customerID = uid`, sorted by `createdAt` desc, with cursor pointing to the last `createdAt`; `itemCount(o) = Σ item.quantity`
    - Place under `backend/internal/order/my_orders_property_test.go`
    - **Validates: Requirements 9.2, 9.3**

- [x] 3. Stock domain — admin CRUD, validation, image cleanup
  - [x] 3.1 Extend stock repository with admin operations
    - Update `backend/internal/stock/repository.go` with `Create`, `Update`, `Delete`, `ListAll(filters)`, `PatchStock(id, qty)`, `DistinctCategories`, and `Get(id)`; ensure `UpdatedAt` is set to server time on Create/Update
    - Apply the `available = true ⇒ quantity > 0` invariant: when `quantity` is set to 0, force `available = false`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.8, 12.2, 12.3, 12.7, 13.6_

  - [x] 3.2 Add stock validation module
    - Create `backend/internal/stock/validation.go` with `validateInventoryItem(input)` enforcing: `1 ≤ len(trim(itemName)) ≤ 200`, `0 ≤ quantity ≤ 99,999`, `1 ≤ len(trim(unit)) ≤ 50`, `price ≥ 0`, `1 ≤ len(trim(category)) ≤ 50`, `imageURL ≤ 2048 chars` (when set, format `product_images/{fileId}`)
    - Return an error list with exactly one entry per violated field naming the field
    - _Requirements: 10.1, 10.6, 12.5, 13.3, 13.4_

  - [x] 3.3 Extend stock service with admin operations and image cascade
    - Update `backend/internal/stock/service.go` with `Create`, `Update`, `PatchStock`, `Delete`, `List(filters)` (cap 200), `Get`, `DistinctCategories`, `SetItemImage(id, newFileId)` (deletes previous `product_images/{old}` parent + chunks), and `RemoveItemImage(id)` (clears `imageURL` and deletes the parent + chunks)
    - On `Delete(id)`, cascade-delete the linked `product_images/{fileId}` document and chunks if `imageURL` is set
    - _Requirements: 10.1–10.5, 10.8, 11.7, 11.9, 11.11, 12.2, 12.3, 12.7, 13.6_

  - [ ]\* 3.4 Write property test for inventory CRUD round-trip
    - **Property 24: Inventory CRUD round-trip**
    - Create+Get returns user-controlled fields equal to the input; Update+Get reflects updates; Delete then Get returns ErrNotFound; Update/Delete/PatchStock on non-existent id return ErrNotFound
    - Place under `backend/internal/stock/service_property_test.go`
    - **Validates: Requirements 10.1, 10.3, 10.4, 10.8, 10.9, 10.10, 12.7**

  - [ ]\* 3.5 Write property test for inventory listing cap
    - **Property 25: Inventory listing cap**
    - `List(filters)` returns at most 200 items, every returned item satisfies the filter predicates, and every population item that fits the cap and filter is included
    - Place under `backend/internal/stock/listing_property_test.go`
    - **Validates: Requirements 10.2**

  - [ ]\* 3.6 Write property test for inventory updatedAt freshness
    - **Property 26: Inventory updatedAt freshness**
    - For any successful `Create`/`Update` between wall-clock `pre` and `post`, the persisted `UpdatedAt ∈ [pre, post]`
    - Place under `backend/internal/stock/updated_at_property_test.go`
    - **Validates: Requirements 10.5**

  - [ ]\* 3.7 Write property test for image attach round-trip
    - **Property 28: Image attach round-trip**
    - `setItemImage` persists `imageURL = "product_images/{newFileId}"`; previous `product_images/{oldFileId}` parent + chunks absent; `removeItemImage` sets `imageURL = ""` and removes previous file
    - Place under `backend/internal/stock/image_attach_property_test.go`
    - **Validates: Requirements 11.7, 11.9, 11.11**

  - [ ]\* 3.8 Write property test for quantity-availability invariant
    - **Property 29: Quantity-availability invariant**
    - For any sequence of `setQuantity(q)` and `setAvailable(b)`, the post-state satisfies `available = true ⇒ quantity > 0`; `setQuantity(0)` always results in `available = false`
    - Place under `backend/internal/stock/availability_property_test.go`
    - **Validates: Requirements 12.2, 12.3**

  - [ ]\* 3.9 Write property test for distinct categories aggregation
    - **Property 30: Distinct categories aggregation**
    - `distinctCategories(items)` returns the lexicographically sorted set of distinct `trim(category)` values where non-empty
    - Place under `backend/internal/stock/categories_property_test.go`
    - **Validates: Requirements 13.1, 13.6**

  - [ ]\* 3.10 Write property test for inventory validation
    - **Property 27: Inventory validation**
    - `validateInventoryItem` returns no errors iff all field rules hold; otherwise the error list contains exactly one entry per violated field naming that field
    - Place under `backend/internal/stock/validation_property_test.go`
    - **Validates: Requirements 10.6, 12.5, 13.3, 13.4**

- [x] 4. Catalog package — public read-only endpoints
  - [x] 4.1 Implement catalog service
    - Create `backend/internal/catalog/service.go` with `ListAvailable(category?)`, `Get(id)`, and `ListCategories()`
    - `ListAvailable` filters `available = true ∧ quantity > 0`; when `category` provided, also filters by category equality
    - `Recommended()` helper returns the top 5 available items sorted by `updatedAt` desc
    - Reuses `stock.Repository` for reads; adds in-memory grouping helpers
    - _Requirements: 1.1, 1.2, 1.3, 1.7, 2.1, 13.5, 13.6, 14.8_

  - [ ]\* 4.2 Write property test for catalog filter correctness
    - **Property 1: Catalog filter correctness**
    - `listAvailableProducts(items, c)` equals exactly the items satisfying `available = true ∧ quantity > 0` (and `category = c` when `c` is provided)
    - Place under `backend/internal/catalog/filter_property_test.go`
    - **Validates: Requirements 1.1, 1.3, 13.5**

  - [ ]\* 4.3 Write property test for catalog grouping order
    - **Property 2: Catalog grouping order**
    - `groupByCategory(items)` lists categories alphabetically, items alphabetically by `itemName` within each category, and partitions the input
    - Place under `backend/internal/catalog/grouping_property_test.go`
    - **Validates: Requirements 1.2**

  - [ ]\* 4.4 Write property test for recommended banner selection
    - **Property 31: Recommended banner selection**
    - `recommendedBanner(items)` returns at most 5 items, all satisfying `available = true ∧ quantity > 0`, sorted by `updatedAt` desc; equals the prefix of length `min(5, |available|)` of available items by `updatedAt` desc
    - Place under `backend/internal/catalog/recommended_property_test.go`
    - **Validates: Requirements 14.8**

- [x] 5. Backend HTTP handlers and router wiring
  - [x] 5.1 Implement catalog HTTP handler
    - Create `backend/internal/catalog/handler.go` with `GET /api/catalog/items`, `GET /api/catalog/items/{id}`, `GET /api/catalog/categories`
    - Allow optional auth (no Auth_Guard required); return 200 with JSON array
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 13.6, 16.2_

  - [x] 5.2 Implement stock admin HTTP handler
    - Create `backend/internal/stock/handler.go` with admin endpoints: `POST /api/admin/inventory`, `GET /api/admin/inventory`, `GET /api/admin/inventory/{id}`, `PUT /api/admin/inventory/{id}`, `PATCH /api/admin/inventory/{id}/stock`, `DELETE /api/admin/inventory/{id}`, `GET /api/admin/inventory/categories`
    - Apply admin role check (`role = admin` custom claim) and return 403 `FORBIDDEN_ADMIN_ONLY` for non-admins, 404 for missing IDs, 400 with field-level errors on validation failure, 201 on create, 200 on update, 204 on delete
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.6–10.10, 12.4, 12.5, 12.7, 13.5, 13.6, 16.3, 16.5_

  - [x] 5.3 Add admin claim helper and admin guard middleware
    - Extend `backend/internal/auth/guard.go` (or add `auth/admin.go`) with an `AdminGuard` wrapper around `Guard` that rejects non-admin tokens with 403 `FORBIDDEN_ADMIN_ONLY`
    - _Requirements: 8.1, 10.7, 16.3, 16.5_

  - [ ]\* 5.4 Write property test for admin authorization
    - **Property 18: Admin authorization**
    - For any role `r ∈ {anonymous, customer, admin}` and any protected route, the access decision matches the design's route-role decision table
    - Place under `backend/internal/auth/authorization_property_test.go`
    - **Validates: Requirements 8.1, 10.7, 16.1, 16.2, 16.3, 16.5**

  - [x] 5.5 Extend Order HTTP handler with payment endpoints and customer listing
    - Update `backend/internal/order/handler.go` and `requests.go` with: `POST /api/orders` accepting `paymentMethod`; `GET /api/orders/mine` (paged, 50 per page, customerID from token); `POST /api/orders/{id}/payment-proof`; `POST /api/orders/{id}/payment/approve` (admin); `POST /api/orders/{id}/payment/reject` (admin)
    - Wire `INVALID_STATE_TRANSITION` and `INVALID_PAYMENT_METHOD` errors to 409/400 responses with the new error codes
    - _Requirements: 5.2, 6.1, 6.5, 6.6, 6.7, 7.9, 8.5, 8.7, 8.8, 8.9, 9.2_

  - [x] 5.6 Implement file download endpoint with collection parameter
    - Add handler `GET /api/files/{collection}/{id}/download` accepting `collection ∈ {product_images, payment_proofs, delivery_files}`
    - Use `Assembler` against the matching repository, return 200 with the original `fileType` MIME header and reconstructed bytes; on assembly failure return 422 `ASSEMBLY_FAILED`
    - Public read for `product_images`; authenticated read for `payment_proofs` and `delivery_files`
    - _Requirements: 7.13, 8.4, 11.8, 11.12_

  - [x] 5.7 Wire all new routes in router
    - Update `backend/internal/router/router.go` to register the catalog, admin stock, file-download, and new order routes; apply `Guard` and `AdminGuard` per the route-role table
    - Update `backend/cmd/server/main.go` to construct the catalog and stock service instances and the three file repositories (delivery_files, product_images, payment_proofs)
    - _Requirements: 1.1, 8.1, 10.7, 16.3, 16.5_

  - [x] 5.8 Update Firestore security rules
    - Update `firestore.rules` with the rules from the design's "Cart Persistence Strategy" section: `carts/{customerId}/items/{itemId}` per-uid read+write; `payment_proofs/{fileId}` (read by any auth user, create requires `uploadedBy == auth.uid`, chunks read+write by auth users); `product_images/{fileId}` (public read, admin-only write); `inventory/{id}` (public read, admin-only write)
    - _Requirements: 3.1, 3.2, 7.7, 11.5, 16.1, 16.2, 16.3_

- [x] 6. Checkpoint - Backend
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Frontend formatting, validation, and shared utilities
  - [x] 7.1 Implement IDR formatter and parser
    - Create `frontend/src/lib/format.ts` with `formatIDR(n)` returning `"Rp " + dotThousands(n)` and `parseIDR(s)` round-trip; export `truncate(s, L)` returning ellipsis-suffixed strings ≤ L
    - _Requirements: 1.4, 2.2, 3.10, 5.5, 8.3, 9.3_

  - [ ]\* 7.2 Write property test for IDR formatting
    - **Property 3: IDR formatting**
    - `formatIDR(n)` begins with `"Rp "`, contains no decimal, and `parseIDR(formatIDR(n)) = n` for any non-negative integer
    - Place under `frontend/src/__tests__/format/formatIDR.property.test.ts` using `fast-check`
    - **Validates: Requirements 1.4, 2.2, 3.10, 5.5, 8.3, 9.3**

  - [ ]\* 7.3 Write property test for item-name truncation
    - **Property 4: Item-name truncation**
    - `truncate(s, 80)` produces a string of length ≤ 80, equals `s` when `len(s) ≤ 80`, otherwise ends with `"…"`
    - Place under `frontend/src/__tests__/format/truncate.property.test.ts`
    - **Validates: Requirements 1.4**

  - [x] 7.4 Implement address validator and image upload validator
    - Create `frontend/src/lib/validators.ts` with `isValidAddress(s)` (10 ≤ len(trim(s)) ≤ 500) and `validateImageUpload(mime, size)` (`mime ∈ {image/jpeg, image/png, image/webp} ∧ size ≤ 15,728,640`) returning rejection details
    - _Requirements: 4.3, 7.3, 7.4, 7.5, 11.1, 11.2, 11.3_

  - [ ]\* 7.5 Write property test for address validation
    - **Property 8: Address validation**
    - `isValidAddress(s)` returns true iff `10 ≤ len(trim(s)) ≤ 500`
    - Place under `frontend/src/__tests__/checkout/address.validation.property.test.ts`
    - **Validates: Requirements 4.3**

  - [ ]\* 7.6 Write property test for image upload validation
    - **Property 12: Image upload validation**
    - `validateImageUpload(m, n)` returns `accepted` iff `m ∈ {image/jpeg, image/png, image/webp} ∧ n ≤ 15,728,640`; otherwise rejection identifying the failed rule and no Firestore writes occur
    - Place under `frontend/src/__tests__/upload/imageValidation.property.test.ts`
    - **Validates: Requirements 7.3, 7.4, 7.5, 11.1, 11.2, 11.3**

  - [x] 7.7 Implement Bahasa Indonesian status label map and error messages catalog
    - Create `frontend/src/constants/statusLabels.ts` mapping every `OrderStatus` to its Bahasa label per Requirement 9.5
    - Create `frontend/src/constants/errorMessages.ts` translating backend `code` values to Bahasa user-facing strings
    - Add `useErrorToast()` hook in `frontend/src/hooks/useErrorToast.ts`
    - _Requirements: 1.8, 8.11, 9.5_

  - [ ]\* 7.8 Write property test for status label mapping
    - **Property 23: Status label mapping**
    - For every `OrderStatus` value, `statusLabel(s)` returns exactly the Bahasa string defined in the spec table
    - Place under `frontend/src/__tests__/orders/statusLabel.property.test.ts`
    - **Validates: Requirements 9.5**

- [x] 8. Frontend chunked upload generalization and services
  - [x] 8.1 Generalize chunkUploadService for multiple collections
    - Extend `frontend/src/services/chunkUploadService.ts` with `uploadFileInChunks(file, { collection: 'delivery_files' | 'product_images' | 'payment_proofs', orderId?, itemId?, onProgress })`
    - Preserve the chunk size 524,288 bytes pre-encoded, Base64 encoding, Data_URI prefix on chunk 0 only, and `totalChunks ∈ [1, 30]`
    - On chunk-write failure, set parent `status = "failed"`, surface failed chunk index, allow resume from that index
    - _Requirements: 7.4, 7.5, 7.6, 7.7, 7.10, 11.4, 11.5, 11.6, 11.13_

  - [ ]\* 8.2 Write property test for client-side chunking round-trip
    - **Property 13 (frontend mirror): Chunking protocol round-trip**
    - Same statement as Property 13 implemented in TypeScript with `fast-check` against an in-memory Firestore stub
    - Place under `frontend/src/__tests__/upload/chunking.roundtrip.property.test.ts`
    - **Validates: Requirements 7.6, 7.7, 11.4, 11.5, 11.8**

  - [x] 8.3 Implement catalog frontend service
    - Create `frontend/src/services/catalogService.ts` with `listAvailableProducts()`, `getProduct(id)`, `listCategories()` calling the backend endpoints
    - _Requirements: 1.1, 1.7, 2.1, 13.5, 13.6_

  - [x] 8.4 Implement cart frontend service (Firestore client SDK)
    - Create `frontend/src/services/cartService.ts` with `subscribeToCart(uid, cb)`, `addToCart(uid, item, qty, notes?)`, `setLineQuantity(uid, itemId, qty)`, `removeLineItem(uid, itemId)`, `clearCart(uid)`, `computeCartTotal(items)`, and `formatIDR` re-export
    - Cap quantity at 99; when `setLineQuantity(_, _, 0)` is called, delete the line document; persist `notes` (≤ 200 chars) on update
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.7, 3.8, 3.10, 3.11, 3.12, 3.13, 3.14_

  - [ ]\* 8.5 Write property test for cart line-item round-trip
    - **Property 6: Cart line-item round-trip**
    - For valid `(item, q ∈ [1,99], n ∈ strings ≤ 200)`, `addToCart(uid, item, q, n)` writes a doc whose round-trip equals `{ itemId, itemName, unitPrice: item.price, quantity: q, notes: n, updatedAt: serverTimestamp }`
    - Place under `frontend/src/__tests__/cart/cartLine.roundtrip.property.test.ts` with an in-memory Firestore fake
    - **Validates: Requirements 3.2, 3.3, 3.14**

  - [ ]\* 8.6 Write property test for cart aggregation invariants
    - **Property 7: Cart aggregation invariants**
    - For any sequence of `{addToCart, setLineQuantity, removeLineItem}` operations: line count = unique itemId count, quantity ∈ [1, 99] with 0 → delete, total = Σ unitPrice × quantity, badge = line count, removeLineItem deletes only that line
    - Place under `frontend/src/__tests__/cart/cart.aggregation.property.test.ts`
    - **Validates: Requirements 3.4, 3.5, 3.8, 3.9, 3.10, 3.12, 3.13**

  - [x] 8.7 Implement stock admin frontend service
    - Create `frontend/src/services/stockAdminService.ts` with `listAllItems({category?})`, `createItem`, `updateItem`, `patchStock`, `deleteItem` calling `/api/admin/inventory`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 12.4, 13.5_

  - [x] 8.8 Implement payment-proof and order frontend services
    - Create `frontend/src/services/paymentProofService.ts` with `uploadPaymentProof(orderId, file, onProgress)` orchestrating chunk upload + `POST /api/orders/{id}/payment-proof`
    - Extend `frontend/src/services/orderService.ts` with `createOrder`, `listMyOrders(cursor?, limit?)`, `approvePayment`, `rejectPayment`, `attachPaymentProof`, `subscribeToOrder(orderId, cb)`, `subscribeToPaymentApprovalQueue(cb)`
    - _Requirements: 6.1, 7.9, 8.2, 8.5, 8.8, 8.10, 9.2_

- [ ] 9. Storefront UI — layout, navigation, catalog, search
  - [x] 9.1 Implement Storefront layout shell and bottom navigation
    - Create `frontend/src/storefront/layouts/StorefrontLayout.tsx` with max-width 480px, fixed bottom nav (Beranda, Kategori, Keranjang, Pesanan) using Lucide icons 24×24, 44×44 minimum tap targets, Manrope/Hanken Grotesk fonts, palette #FBBF24/#111827/#F3F4F6
    - Wire React Router routes for `/`, `/category/:name`, `/product/:id`, `/cart`, `/checkout/address`, `/checkout/payment`, `/checkout/payment-proof/:orderId`, `/orders`, `/orders/:id`
    - _Requirements: 1.8, 1.9, 14.1, 14.2, 14.3, 14.4, 14.5_

  - [-] 9.2 Implement HomePage with search, recommended banner, and category-grouped listing
    - Create `frontend/src/storefront/pages/HomePage.tsx`, `components/SearchBar.tsx`, `components/RecommendedBanner.tsx` (5 most recently updated available items), `components/CategoryGrid.tsx`, `components/ProductCard.tsx`
    - SearchBar: placeholder `"Cari produk..."`, max 100 chars; debounce 300 ms; ≥ 2 chars → flat list filtered by case-insensitive substring; < 2 chars → grouped catalog
    - ProductCard: 16px rounded corners, shadow `0 1px 3px rgba(0,0,0,0.1)`, image top 60%, IDR price, `"Tersedia"` badge, ellipsis-truncate name to 80 chars, placeholder image when no `imageURL`
    - Catalog timeout > 10s → error UI with retry; empty state message
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 14.8, 14.9, 17.1, 17.2, 17.3, 17.4_

  - [ ]\* 9.3 Write property test for search filter correctness
    - **Property 32: Search filter correctness**
    - `len(q) ≥ 2`: result equals `{ i : toLower(i.itemName) contains toLower(q) }` as flat list; `len(q) < 2`: grouped catalog from Property 2
    - Place under `frontend/src/__tests__/catalog/search.property.test.ts`
    - **Validates: Requirements 17.2, 17.4**

  - [-] 9.4 Implement CategoryPage and ProductDetailPage
    - `CategoryPage`: filtered listing by `:name`
    - `ProductDetailPage`: full image, name, IDR price, unit, category; quantity selector (default 1, min 1, max = available qty) with increment/decrement; `"Stok Habis"` badge when `quantity = 0 || available = false` with disabled add-to-cart; cap at max with `"Maksimal {qty} {unit} tersedia"` hint; retry on detail load error
    - Add `QuantitySelector` component in `frontend/src/storefront/components/QuantitySelector.tsx`
    - _Requirements: 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [ ]\* 9.5 Write property test for quantity selector clamp
    - **Property 5: Quantity selector clamp**
    - For any `Q ≥ 1` and any sequence of increment/decrement/direct-set ops starting from 1, the displayed quantity stays in `[1, Q]`
    - Place under `frontend/src/__tests__/checkout/quantity.clamp.property.test.ts`
    - **Validates: Requirements 2.4, 2.5**

  - [-] 9.6 Implement CartPage with real-time sync
    - Create `frontend/src/storefront/pages/CartPage.tsx` and `components/CartLineItem.tsx`
    - Subscribe via `cartService.subscribeToCart` for ≤ 2-second update latency; show name, IDR unit price, ±/numeric/remove controls, line subtotal, notes input (≤ 200 chars), grand total
    - Decrement at qty=1 deletes line; cap at 99 with toast; show error toast on Firestore write failure with retry, retain UI state from snapshot
    - _Requirements: 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14, 3.15, 3.5_

  - [~] 9.7 Implement add-to-cart guard and login-redirect flow
    - In `ProductDetailPage`'s `Tambah ke Keranjang` action, if unauthenticated → store intended path + selected qty in router state, redirect to `/login`, after auth return to product detail with selected qty preserved
    - On adding an item already in cart, increment via Firestore transaction (cap 99)
    - _Requirements: 3.1, 3.3, 3.4, 3.5, 16.1, 16.4_

- [ ] 10. Storefront UI — checkout, orders, proof upload
  - [~] 10.1 Implement CheckoutWizard with Motion transitions
    - Create `frontend/src/storefront/pages/checkout/CheckoutWizard.tsx` orchestrating Address → Payment → (Confirmation or Proof Upload) with `motion` page transitions of 300 ms
    - _Requirements: 14.6, 14.7_

  - [~] 10.2 Implement AddressStep
    - Pre-fill `savedDeliveryAddress` from `users/{uid}`; validate 10–500 chars after trim; on proceed, save to user profile; on save failure show inline error but allow proceed; show `deliveryTime` label
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [~] 10.3 Implement PaymentMethodStep with payment instructions
    - Render `cod` / `bank_transfer` / `e_wallet` as selectable list, no preselect; highlight selected with #FBBF24; disable `Pesan Sekarang` until selection; show subtotal/delivery fee/service fee/grand total in IDR
    - Show payment-instructions section (destination account/e-wallet number, IDR amount, Bahasa instructions) iff method ∈ {bank_transfer, e_wallet}; toggle without reload
    - On submit: build `CreateOrderRequest`, POST `/api/orders`, show 15-second loading + disabled state; handle field-validation errors inline; on `FAILED + outOfStock` list names and return to cart without deleting; on `FAILED + timeout` show retry; on no-response-15s show connection error and retry
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 6.1, 6.2, 6.5, 6.6, 6.7, 6.8_

  - [ ]\* 10.4 Write property test for payment instruction visibility
    - **Property 9: Payment instruction visibility**
    - Across any sequence of selections from `{cod, bank_transfer, e_wallet}`, the instructions section is visible iff current method ∈ `{bank_transfer, e_wallet}`
    - Place under `frontend/src/__tests__/checkout/payment.visibility.property.test.ts`
    - **Validates: Requirements 5.6, 5.7, 5.8**

  - [~] 10.5 Implement OrderConfirmationPage and post-order cart cleanup
    - On `CONFIRMED` (cod): delete `carts/{uid}/items/*` then navigate to confirmation with order ID, item summary, address, time, label `"Pesanan Diterima"`
    - On `AWAITING_PAYMENT_PROOF`: delete cart and navigate to `/checkout/payment-proof/:orderId`
    - _Requirements: 6.3, 6.4_

  - [~] 10.6 Implement PaymentProofUploadPage
    - File input restricted to image/jpeg, image/png, image/webp; show pre-upload preview ≤ 300×300 px; reject MIME/size before any chunk write; on chunk failure show failed-chunk index and Resume; on cancel leave Order untouched
    - On all chunks completed, set parent `status = "completed"` and POST `/api/orders/{id}/payment-proof` to attach `fileId` and trigger transition to `AWAITING_PAYMENT_APPROVAL`
    - When re-uploading from `PAYMENT_REJECTED`, ensure backend `UploadProof` cleans up previous proof
    - _Requirements: 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10, 7.11, 7.12, 7.13_

  - [ ]\* 10.7 Write property test for proof upload accessibility
    - **Property 11: Proof upload accessibility**
    - The proof upload screen for Order `o` is reachable iff `o.status ∈ {AWAITING_PAYMENT_PROOF, PAYMENT_REJECTED}`
    - Place under `frontend/src/__tests__/orders/proofUploadAccess.property.test.ts`
    - **Validates: Requirements 7.2**

  - [~] 10.8 Implement OrderListPage and OrderDetailPage with real-time listener
    - `OrderListPage`: paginated list (50 per page) of `listMyOrders`, each row showing order ID, `DD MMM YYYY`, status badge, total item count; empty state with link to catalog; 10-second timeout error with retry
    - `OrderDetailPage`: subscribe via `subscribeToOrder` for ≤ 2-second status updates; show item list (name × qty), address, delivery time, status using Bahasa label map
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 8.10, 16.1_

- [ ] 11. Admin Panel UI — products, categories, payment approvals
  - [x] 11.1 Add admin sidebar links and route guards
    - Update existing AppShell sidebar to include `Daftar Produk`, `Tambah Produk`, `Kategori`, `Persetujuan Pembayaran` with Lucide icons
    - Apply admin role guard at the route level — non-admins see `"Akses Ditolak"` and redirect to storefront within 3 seconds
    - _Requirements: 15.1, 16.3, 16.5, 15.8_

  - [-] 11.2 Implement ProductsPage with MUI DataGrid
    - Columns: image thumbnail (48×48 with placeholder), product name, category, price (IDR), quantity, availability badge (green/red), edit/delete buttons; sortable on name/category/price/quantity; pagination 10/25/50, default 10
    - Filter by category; inline quantity editor with ±/numeric input (0–99,999); confirmation dialog on delete; empty state with link to `Tambah Produk`
    - Setting quantity to 0 forces availability false; toggling availability to false ignores quantity; setting quantity > 0 while unavailable prompts to confirm enabling availability
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 13.5, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7_

  - [~] 11.3 Implement ProductFormPage (create/edit)
    - Form fields with validation per Requirement 10.1; submit calls `createItem`/`updateItem`
    - Embed `ProductImageUploader` component (chunked upload to `product_images`); preview ≤ 300×300; on success, persist `imageURL = "product_images/{fileId}"`; on replace, backend cascade-deletes the old file; on remove, calls `RemoveItemImage`
    - `CategoryDropdown`: autocomplete from `listCategories()` plus free-text entry (Requirement 13.2)
    - _Requirements: 10.1, 10.6, 10.9, 10.10, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.9, 11.10, 11.11, 11.13, 13.1, 13.2, 13.3, 13.4_

  - [-] 11.4 Implement CategoriesPage
    - Display distinct non-empty categories returned by `/api/admin/inventory/categories`
    - _Requirements: 13.5, 13.6_

  - [~] 11.5 Implement PaymentApprovalPage with real-time queue
    - Subscribe via `subscribeToPaymentApprovalQueue` (orders where `status = AWAITING_PAYMENT_APPROVAL`); ≤ 2-second update latency
    - Each row: order ID, customer name, total IDR, payment method label (`Transfer Bank` / `E-Wallet`), upload timestamp `DD MMM YYYY HH:mm`, `Setujui` and `Tolak` buttons
    - On row select, fetch and display the proof image via `GET /api/files/payment_proofs/{fileId}/download`
    - `Setujui` → `approvePayment(orderId)`; `Tolak` → open `RejectionDialog`, validate reason 1–500 chars, then `rejectPayment(orderId, reason)`; on `INVALID_STATE_TRANSITION` show `"Status pesanan sudah berubah, muat ulang"`
    - All copy in Bahasa Indonesia
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.11, 15.8_

- [ ] 12. Auth and session integration
  - [-] 12.1 Storefront auth guard and redirect-back flow
    - Implement route guard that redirects unauthenticated users to `/login` for protected actions and returns them to the original URL after sign-in
    - On token expiration during a session, redirect to login with `"Sesi Anda berakhir, silakan masuk lagi."`; on Firebase auth service unavailable show error with retry
    - Allow unauthenticated catalog browse and product detail (read-only)
    - _Requirements: 16.1, 16.2, 16.4, 16.6, 16.7_

  - [-] 12.2 Wire admin role check on Admin Panel routes
    - Read `admin` Firebase custom claim; on missing claim show `"Akses Ditolak"` and redirect to storefront homepage within 3 seconds
    - _Requirements: 16.3, 16.5_

- [~] 13. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP; they cover unit, property, and integration tests.
- Each task references specific requirements (granular sub-requirements, not just user stories) for traceability.
- Property tests are placed close to the implementation they validate so regressions are caught early. Each property task explicitly references one of the 32 properties from the design document.
- Checkpoints (Tasks 6, 13) ensure incremental validation between back-end completion and full integration.
- The plan reuses the existing `auth`, `order`, `stock`, `file`, and chunk-upload infrastructure rather than duplicating it; the `file.Repository` is parameterized by collection name.
- The `Order` state machine is extended in place; existing transitions remain valid for COD orders to preserve backward compatibility with the `order-fulfillment-delivery-tracking` spec.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1", "7.1", "7.4", "7.7"] },
    {
      "id": 1,
      "tasks": [
        "1.3",
        "1.4",
        "2.2",
        "2.4",
        "3.1",
        "3.2",
        "7.2",
        "7.3",
        "7.5",
        "7.6",
        "7.8",
        "8.1"
      ]
    },
    {
      "id": 2,
      "tasks": ["2.3", "2.5", "3.3", "4.1", "5.3", "8.2", "8.3", "8.4", "8.7"]
    },
    {
      "id": 3,
      "tasks": [
        "2.6",
        "2.7",
        "2.8",
        "2.9",
        "2.10",
        "2.11",
        "2.12",
        "2.13",
        "3.4",
        "3.5",
        "3.6",
        "3.7",
        "3.8",
        "3.9",
        "3.10",
        "4.2",
        "4.3",
        "4.4",
        "5.1",
        "5.2",
        "5.4",
        "5.5",
        "5.6",
        "8.5",
        "8.6",
        "8.8"
      ]
    },
    { "id": 4, "tasks": ["5.7", "5.8", "9.1", "11.1"] },
    { "id": 5, "tasks": ["9.2", "9.4", "9.6", "11.2", "11.4", "12.1", "12.2"] },
    { "id": 6, "tasks": ["9.3", "9.5", "9.7", "10.1", "11.3", "11.5"] },
    { "id": 7, "tasks": ["10.2", "10.3", "10.5", "10.6", "10.8"] },
    { "id": 8, "tasks": ["10.4", "10.7"] }
  ]
}
```
