# Requirements Document

## Introduction

This document specifies the requirements for two connected features in the Al Umana platform: (1) a mobile-first Customer Storefront web application that enables customers to browse products, add items to a cart, and place delivery orders following a ShopeeFood-inspired flow; and (2) an Admin Stock Management panel that allows administrators to manage the product inventory (CRUD operations, photo uploads, availability, pricing, and categorization). Both features integrate with the existing Go backend, Firebase Firestore database, and the established InventoryItem model. The customer-facing UI is presented in Bahasa Indonesia.

## Glossary

- **Storefront**: The mobile-first customer-facing web application for browsing products and placing orders
- **Admin_Panel**: The administrative interface for managing inventory items, stock quantities, and product metadata
- **Cart**: A server-side Firestore document set tied to the authenticated Customer's Firebase UID, stored under `carts/{customerId}/items/{itemId}`, holding the customer's selected items, quantities, and per-item notes before order placement; persists across browser sessions and devices because it lives in Firestore rather than browser local storage
- **InventoryItem**: The existing Firestore document model representing a product in the `inventory` collection (fields: id, itemName, quantity, unit, price, available, category, imageURL, updatedAt)
- **Order**: The existing Firestore document model representing a customer order moving through the fulfillment pipeline. This document extends the Order state machine defined in the `order-fulfillment-delivery-tracking` spec by adding three new statuses and two new optional fields. The new statuses are `AWAITING_PAYMENT_PROOF` (Bahasa label "Menunggu Bukti Pembayaran") for non-COD orders that have passed stock check but for which the Customer has not yet uploaded a payment proof, `AWAITING_PAYMENT_APPROVAL` (Bahasa label "Menunggu Persetujuan Pembayaran") for orders where the Customer has uploaded a payment proof and is awaiting Admin review, and `PAYMENT_REJECTED` (Bahasa label "Pembayaran Ditolak") for orders whose payment proof was rejected by the Admin. The new fields are `paymentStatus` (string: one of "awaiting_proof", "awaiting_approval", "approved", "rejected") and `paymentProofFileId` (string referencing a `payment_proofs/{fileId}` document). The transition flow becomes: COD orders go `PLACING` → `CONFIRMED` after stock check (unchanged); non-COD orders go `PLACING` → `AWAITING_PAYMENT_PROOF` after stock check, then `AWAITING_PAYMENT_PROOF` → `AWAITING_PAYMENT_APPROVAL` after the Customer uploads a proof, then either `AWAITING_PAYMENT_APPROVAL` → `CONFIRMED` (Admin approves) or `AWAITING_PAYMENT_APPROVAL` → `PAYMENT_REJECTED` (Admin rejects), with `PAYMENT_REJECTED` → `AWAITING_PAYMENT_APPROVAL` available when the Customer re-uploads. The design phase for this spec will need to reconcile both this extension and the existing state machine and Order Go struct defined in `order-fulfillment-delivery-tracking`.
- **Catalog_API**: The backend HTTP endpoints that serve product listings and details to the Storefront
- **Stock_API**: The backend HTTP endpoints that allow the Admin_Panel to create, read, update, and delete InventoryItem documents
- **Order_Service**: The backend service responsible for creating and managing orders in the fulfillment pipeline
- **Customer**: An authenticated user with the role "customer" who browses and places orders via the Storefront
- **Admin**: An authenticated user with the role "admin" who manages inventory via the Admin_Panel
- **Category**: A string label grouping InventoryItem documents for navigation and filtering (e.g., "Makanan", "Minuman", "Snack")
- **Delivery_Address**: A free-text address string provided by the Customer for order delivery
- **Payment_Method**: The payment option selected by the Customer at checkout, one of "cod" ("Bayar di Tempat (COD)"), "bank_transfer" ("Transfer Bank"), or "e_wallet" ("E-Wallet"); "bank_transfer" and "e_wallet" are non-COD methods that require a Payment_Proof
- **Payment_Proof**: A photo image (MIME type image/jpeg, image/png, or image/webp; size ≤ 15,728,640 bytes / 15 MB) uploaded by the Customer as evidence of payment for non-COD Payment_Method values, stored in Firestore using the existing Base64 chunking protocol under `payment_proofs/{fileId}` (parent document) with chunk documents in the `payment_proofs/{fileId}/chunks` subcollection
- **Payment_Approval**: The Admin's review action that either approves or rejects a Payment_Proof; an approval transitions the associated Order from `AWAITING_PAYMENT_APPROVAL` to `CONFIRMED`, while a rejection transitions the associated Order to `PAYMENT_REJECTED` and records a rejection reason
- **Price**: An integer value stored in the smallest currency unit (IDR) on the InventoryItem model
- **Auth_Guard**: The authentication middleware that verifies Firebase ID tokens and checks user roles

## Requirements

### Requirement 1: Product Catalog Browsing

**User Story:** As a Customer, I want to browse available products organized by category on the Storefront, so that I can discover items I want to order.

#### Acceptance Criteria

1. WHEN the Customer opens the Storefront homepage, THE Catalog_API SHALL return all InventoryItem documents where `available` equals true and `quantity` is greater than zero within 10 seconds
2. THE Storefront SHALL display products grouped by Category with each group showing the category name as a section header, sorted alphabetically by category name, and items within each category sorted alphabetically by item name
3. WHEN the Customer taps a category filter, THE Storefront SHALL display only InventoryItem documents belonging to the selected Category
4. THE Storefront SHALL display each product card with the item name (maximum 80 characters, truncated with ellipsis if exceeded), price formatted in IDR (e.g., "Rp 25.000"), product image, and a stock badge showing "Tersedia" when quantity is greater than zero
5. WHEN an InventoryItem has an empty ImageURL field, THE Storefront SHALL display a placeholder image in the product card
6. IF the Catalog_API returns an error or does not respond within 10 seconds, THEN THE Storefront SHALL display an error message indicating the catalog is temporarily unavailable and provide a retry action
7. IF no InventoryItem documents match the current filter or all items are unavailable, THEN THE Storefront SHALL display an empty-state message indicating no products are currently available
8. THE Storefront SHALL render all UI labels, headers, and navigation text in Bahasa Indonesia
9. THE Storefront SHALL use the Al Umana color palette with Primary (#FBBF24) for active states, Secondary (#111827) for text, and Background (#F3F4F6) for page backgrounds

### Requirement 2: Product Detail View

**User Story:** As a Customer, I want to view detailed information about a product, so that I can make an informed purchase decision.

#### Acceptance Criteria

1. WHEN the Customer taps a product card, THE Storefront SHALL navigate to a product detail page displaying the item name, full-size image, price in IDR, unit, and category
2. THE Storefront SHALL display the product price formatted with dot-separated thousands (e.g., "Rp 25.000") where the price value from the InventoryItem is in the smallest IDR unit
3. WHEN the InventoryItem quantity is zero or available is false, THE Storefront SHALL display a "Stok Habis" (out of stock) badge and disable the add-to-cart button
4. THE Storefront SHALL provide a quantity selector on the product detail page with increment and decrement controls, starting at a default value of 1, with a minimum of 1 and a maximum equal to the InventoryItem available quantity
5. WHEN the Customer sets a quantity exceeding the InventoryItem quantity, THE Storefront SHALL cap the selector at the maximum available quantity and display an informational message "Maksimal {quantity} {unit} tersedia"
6. IF the Catalog_API fails to load the product detail, THEN THE Storefront SHALL display an error message and provide a retry action

### Requirement 3: Shopping Cart Management

**User Story:** As a Customer, I want to add products to a server-side cart and manage quantities, so that I can prepare my order and have my cart available across devices.

#### Acceptance Criteria

1. THE Storefront SHALL require the Customer to be authenticated via the Auth_Guard before adding, modifying, or removing any item in the Cart; IF an unauthenticated user attempts to add an item, THEN THE Storefront SHALL redirect to the login page and, after successful authentication, return the Customer to the product detail page with the previously selected quantity preserved
2. THE Cart SHALL be stored in Firestore under the path `carts/{customerId}/items/{itemId}`, where `customerId` is the authenticated Customer's Firebase UID and `itemId` is the InventoryItem document ID; each Cart line item document SHALL contain the fields itemId, itemName, unitPrice, quantity, notes, and updatedAt
3. WHEN the Customer taps the "Tambah ke Keranjang" (Add to Cart) button on a product detail page, THE Storefront SHALL write the line item with the selected quantity (minimum 1, maximum 99) to the Customer's Cart in Firestore, persisting the item ID, item name, unit price, and quantity
4. WHEN the Customer adds an item already present in the Cart, THE Storefront SHALL increment the existing line item quantity by the selected amount via a Firestore write rather than creating a duplicate document, up to a maximum of 99 per line item
5. IF incrementing a line item quantity would exceed 99, THEN THE Storefront SHALL cap the quantity at 99 and display a message indicating the maximum quantity has been reached
6. THE Cart SHALL persist across browser sessions and devices via its Firestore storage; signing in on another device with the same Customer account SHALL load the same Cart contents
7. WHEN the Customer opens the Cart view, THE Storefront SHALL load the Cart line items from Firestore and SHALL register a real-time `onSnapshot` listener on `carts/{customerId}/items` so that subsequent Cart changes are reflected in the UI within 2 seconds without manual refresh
8. THE Storefront SHALL display a floating cart icon with a badge showing the total number of distinct items (line items) in the Cart, kept in sync with Firestore via the same real-time listener
9. WHEN the Customer opens the Cart view, THE Storefront SHALL display each line item with item name, unit price (formatted in IDR), an increment button, a decrement button, a numeric quantity display, line subtotal (unit price × quantity), and a remove button
10. THE Storefront SHALL display the Cart total as the sum of all line subtotals computed from the Firestore Cart documents, formatted in IDR
11. WHEN the Customer interacts with the increment, decrement, remove, or notes input controls on a line item, THE Storefront SHALL apply the change as a Firestore write to the corresponding `carts/{customerId}/items/{itemId}` document
12. WHEN the Customer taps the decrement button and the current line item quantity is 1, THE Storefront SHALL delete the line item document from Firestore
13. WHEN the Customer taps the remove button on a line item, THE Storefront SHALL delete the line item document from Firestore
14. THE Storefront SHALL provide a "Catatan" (notes) text field per line item for special instructions, with a maximum length of 200 characters, persisted to the line item document's `notes` field via a Firestore write
15. IF a Firestore Cart write fails due to a network error or permission denial, THEN THE Storefront SHALL display an error message indicating the Cart could not be updated, retain the latest UI state from the snapshot listener, and present a retry action

### Requirement 4: Delivery Address Confirmation

**User Story:** As a Customer, I want to confirm my delivery address before placing an order, so that the delivery reaches the correct location.

#### Acceptance Criteria

1. WHEN the Customer proceeds from the Cart step to the Address step in the checkout flow, THE Storefront SHALL display the delivery address confirmation step containing the Delivery_Address input field and the estimated delivery time label
2. IF the Customer's user profile in Firestore contains a previously saved delivery address, THEN THE Storefront SHALL pre-fill the Delivery_Address field with that saved address
3. IF the Delivery_Address field contains fewer than 10 characters or more than 500 characters (after trimming leading and trailing whitespace), THEN THE Storefront SHALL disable the proceed action and display a validation message indicating the address must be between 10 and 500 characters
4. WHEN the Customer edits the Delivery_Address and proceeds to the next step, THE Storefront SHALL save the updated address to the Customer's user profile in Firestore for future orders
5. IF the Storefront fails to save the updated address to the user profile, THEN THE Storefront SHALL display an error message indicating the save failed, retain the entered address in the Delivery_Address field, and still allow the Customer to proceed to the Payment step using the entered address for the current order
6. THE Storefront SHALL display the `deliveryTime` value from the order as the estimated delivery time label on the address confirmation step

### Requirement 5: Payment Method Selection

**User Story:** As a Customer, I want to choose a payment method, so that I can pay for my order in my preferred way.

#### Acceptance Criteria

1. WHEN the Customer proceeds past the delivery address step, THE Storefront SHALL display available payment methods as a selectable list with no payment method pre-selected
2. THE Storefront SHALL offer exactly the following Payment_Method options on the payment step: "Bayar di Tempat (COD)" (identifier "cod"), "Transfer Bank" (identifier "bank_transfer"), and "E-Wallet" (identifier "e_wallet")
3. WHEN the Customer selects a Payment_Method, THE Storefront SHALL visually highlight the selected Payment_Method using the Primary color (#FBBF24) and remove the highlight from any previously selected option
4. WHILE no Payment_Method is selected, THE Storefront SHALL disable the "Pesan Sekarang" (Place Order) button and prevent order submission
5. THE Storefront SHALL display the order total breakdown on the payment step showing: subtotal (sum of item prices × quantities), delivery fee, service fee, and a grand total equal to the sum of subtotal + delivery fee + service fee, each formatted as Indonesian Rupiah with zero decimal places (e.g., "Rp 25.000")
6. WHEN the Customer selects a non-COD Payment_Method ("bank_transfer" or "e_wallet"), THE Storefront SHALL display a payment instructions section showing the destination account number or e-wallet number (configured by the Admin and rendered read-only), the grand total amount to transfer formatted in IDR, and instructions in Bahasa Indonesia directing the Customer to upload the payment proof after completing the transfer
7. WHEN the Customer selects "Bayar di Tempat (COD)" as the Payment_Method, THE Storefront SHALL NOT display the payment instructions section described in 5.6 and SHALL NOT require a Payment_Proof upload
8. WHEN the Customer changes the selected Payment_Method between a COD and a non-COD option, THE Storefront SHALL show or hide the payment instructions section described in 5.6 to match the new selection without requiring a page reload
9. WHEN the Customer taps the enabled "Pesan Sekarang" button, THE Storefront SHALL submit the order to the Order_Service with the selected Payment_Method identifier ("cod", "bank_transfer", or "e_wallet") included in the order payload
10. IF the order submission fails after the Customer taps "Pesan Sekarang", THEN THE Storefront SHALL display an error message indicating the failure reason, retain the selected Payment_Method and order data, and allow the Customer to retry submission

### Requirement 6: Order Placement

**User Story:** As a Customer, I want to place my order after confirming all details, so that my items are prepared and delivered.

#### Acceptance Criteria

1. WHEN the Customer taps "Pesan Sekarang" and the checkout fields — customer name (non-empty, ≤ 200 characters), delivery address (non-empty, ≤ 500 characters), delivery time (non-empty, ≤ 100 characters), Payment_Method (one of "cod", "bank_transfer", "e_wallet"), and at least one item with a valid identifier and quantity ≥ 1 — are all valid, THE Storefront SHALL submit a POST request to the Order_Service order creation endpoint with the cart items, delivery address, delivery time, customer name, and Payment_Method
2. WHEN the Storefront submits the order creation request, THE Storefront SHALL display a loading indicator and disable the "Pesan Sekarang" button until the Order_Service returns a response or 15 seconds elapse, whichever comes first
3. WHEN the Order_Service returns a successful order creation response with order status `CONFIRMED` and Payment_Method "cod", THE Storefront SHALL delete all Cart line item documents under `carts/{customerId}/items` from Firestore and navigate to an order confirmation page displaying the order ID, item summary (item names and quantities), delivery address, delivery time, and order status label "Pesanan Diterima" (Order Received)
4. WHEN the Order_Service returns a successful order creation response with order status `AWAITING_PAYMENT_PROOF` and Payment_Method "bank_transfer" or "e_wallet", THE Storefront SHALL delete all Cart line item documents under `carts/{customerId}/items` from Firestore and navigate to the payment proof upload screen described in Requirement 7 with the created order ID prefilled
5. IF the Order_Service returns a response with order status `FAILED` and out-of-stock item identifiers, THEN THE Storefront SHALL display an error message listing the names of the unavailable items and return the Customer to the cart view without deleting any Cart line item documents from Firestore
6. IF the Order_Service returns a response with order status `FAILED` and a timeout rejection reason, THEN THE Storefront SHALL display an error message indicating the order could not be processed due to a service delay and present a retry action to the Customer
7. IF the Order_Service returns a validation error response, THEN THE Storefront SHALL display the field-specific error messages adjacent to the corresponding input fields and keep the Customer on the checkout view without submitting the order
8. IF the Storefront does not receive a response from the Order_Service within 15 seconds, THEN THE Storefront SHALL display a connection error message and present a retry action to the Customer without deleting any Cart line item documents from Firestore

### Requirement 7: Customer Payment Proof Upload

**User Story:** As a Customer who selected a non-COD Payment_Method, I want to upload a photo of my payment proof, so that the Admin can verify my payment and approve my order.

#### Acceptance Criteria

1. WHEN the Order_Service successfully creates an order with Payment_Method "bank_transfer" or "e_wallet" and stock check passes, THE Order_Service SHALL persist the Order with status `AWAITING_PAYMENT_PROOF` and `paymentStatus` "awaiting_proof"
2. WHILE an Order is in status `AWAITING_PAYMENT_PROOF` or `PAYMENT_REJECTED`, THE Storefront SHALL display a payment proof upload screen accessible from the order detail page and from the order confirmation page for that Order
3. THE Storefront SHALL provide a file upload control on the payment proof upload screen that accepts image files with MIME types image/jpeg, image/png, and image/webp only
4. IF the Customer selects a file with a MIME type other than image/jpeg, image/png, or image/webp, THEN THE Storefront SHALL display a validation error indicating the accepted formats and reject the upload before any chunk is written to Firestore
5. IF the Customer selects an image file larger than 15,728,640 bytes (15 MB), THEN THE Storefront SHALL display a validation error indicating the maximum allowed size is 15 MB and reject the upload before any chunk is written to Firestore
6. THE Storefront SHALL store Payment_Proof images in Firestore using the same Base64 chunking protocol described in Requirement 11 (Admin Product Image Upload): the file SHALL be split into chunks of at most 524,288 bytes (512 KB) of pre-encoded source data, every chunk SHALL be Base64-encoded, chunk index 0 SHALL be prepended with the Data_URI prefix `data:<mimeType>;base64,`, and subsequent chunks SHALL NOT contain the Data_URI prefix
7. THE Storefront SHALL write a parent file document to the Firestore collection `payment_proofs/{fileId}` containing the fields fileName, fileSize (bytes), fileType (MIME), totalChunks (integer between 1 and 30 inclusive), status (one of "uploading", "completed", "failed"), uploadedBy (Customer Firebase UID), orderId (the associated Order document ID), and createdAt; chunk documents SHALL be written to the subcollection `payment_proofs/{fileId}/chunks` with the fields fileId, index (0-based sequential), and data (Base64 string)
8. WHEN the Customer selects a valid image file, THE Storefront SHALL display a preview of the selected image at a maximum display size of 300×300 pixels before any chunk is written to Firestore
9. WHEN all chunks for a Payment_Proof have been written successfully, THE Storefront SHALL update the parent file document `status` field to "completed", set the associated Order's `paymentProofFileId` field to `payment_proofs/{fileId}`, set the Order's `paymentStatus` to "awaiting_approval", and transition the Order's status from `AWAITING_PAYMENT_PROOF` (or `PAYMENT_REJECTED`) to `AWAITING_PAYMENT_APPROVAL`
10. IF a chunk write to Firestore fails after one or more chunks have already been written, THEN THE Storefront SHALL set the parent file document `status` to "failed", display an error message identifying the failed chunk index, leave the Order's status unchanged at `AWAITING_PAYMENT_PROOF` or `PAYMENT_REJECTED`, leave the Order's `paymentProofFileId` field unchanged, and present a retry action that resumes from the failed chunk
11. IF the Customer cancels the upload before all chunks have been written, THEN THE Storefront SHALL leave the Order's `paymentProofFileId` field unchanged, leave the Order's status unchanged, and SHALL NOT update any field on the Order document
12. WHEN the Customer uploads a new Payment_Proof for an Order in status `PAYMENT_REJECTED` whose `paymentProofFileId` field already references a previous `payment_proofs/{fileId}` document, THE Storefront SHALL delete the previous parent file document together with all of its chunk documents from Firestore before writing the new parent file document and updating the Order's `paymentProofFileId` field to point to the new fileId
13. IF assembly of a Payment_Proof image fails because the actual chunk count does not equal the parent document's `totalChunks` value, the chunk count exceeds 30, an `index` value is missing or out of range [0, totalChunks − 1], or Base64 decoding fails, THEN THE Storefront and Admin_Panel SHALL display a fallback placeholder image and an assembly error message without modifying the Order document

### Requirement 8: Admin Payment Approval

**User Story:** As an Admin, I want to review payment proofs and approve or reject payments, so that only paid orders proceed to production.

#### Acceptance Criteria

1. THE Admin_Panel SHALL provide a "Persetujuan Pembayaran" (Payment Approval) page accessible from the sidebar navigation, requiring the Auth_Guard to verify the requesting user holds the "admin" role via Firebase custom claims before granting access
2. WHEN the Admin opens the Persetujuan Pembayaran page, THE Admin_Panel SHALL register a real-time `onSnapshot` listener on the `orders` collection filtered by status equal to `AWAITING_PAYMENT_APPROVAL` so that newly pending Orders appear in the list within 2 seconds without manual refresh
3. THE Admin_Panel SHALL display each Order in the approval list with: order ID, customer name, total amount formatted in IDR, Payment_Method label in Bahasa Indonesia ("Transfer Bank" or "E-Wallet"), Payment_Proof upload timestamp formatted as "DD MMM YYYY HH:mm", a "Setujui" (Approve) button, and a "Tolak" (Reject) button
4. WHEN the Admin selects an Order from the approval list, THE Admin_Panel SHALL display the uploaded Payment_Proof image assembled from the chunked Firestore documents at `payment_proofs/{fileId}` and `payment_proofs/{fileId}/chunks` referenced by the Order's `paymentProofFileId` field
5. WHEN the Admin clicks the "Setujui" button on an Order in status `AWAITING_PAYMENT_APPROVAL`, THE Order_Service SHALL transition the Order's status to `CONFIRMED`, set the Order's `paymentStatus` to "approved", and record the approving Admin's Firebase UID and a server-side approval timestamp on the Order document
6. WHEN the Admin clicks the "Tolak" button on an Order in status `AWAITING_PAYMENT_APPROVAL`, THE Admin_Panel SHALL display a confirmation dialog containing a rejection reason text input in Bahasa Indonesia and a confirm action
7. IF the rejection reason entered by the Admin is empty after trimming leading and trailing whitespace or exceeds 500 characters, THEN THE Admin_Panel SHALL disable the rejection confirm action and display a validation message indicating the rejection reason must be between 1 and 500 characters
8. WHEN the Admin submits a valid rejection reason, THE Order_Service SHALL transition the Order's status to `PAYMENT_REJECTED`, set the Order's `paymentStatus` to "rejected", and record the rejection reason, the rejecting Admin's Firebase UID, and a server-side rejection timestamp on the Order document
9. IF the Admin attempts to approve or reject an Order that is not in status `AWAITING_PAYMENT_APPROVAL`, THEN THE Order_Service SHALL return an `INVALID_STATE_TRANSITION` error and leave the Order document unchanged
10. WHEN the Order's status changes from `AWAITING_PAYMENT_APPROVAL` to `CONFIRMED` or `PAYMENT_REJECTED`, THE Storefront SHALL update the Customer's view of the Order within 2 seconds via a real-time `onSnapshot` listener on the Order document
11. THE Admin_Panel SHALL render all UI labels, buttons, dialog text, and messages on the Persetujuan Pembayaran page in Bahasa Indonesia

### Requirement 9: Customer Order History

**User Story:** As a Customer, I want to view my past and current orders, so that I can track delivery status and reorder items.

#### Acceptance Criteria

1. THE Storefront SHALL provide a "Pesanan Saya" (My Orders) page accessible from the bottom navigation, requiring the Customer to be authenticated via the Auth_Guard before displaying any order data
2. WHEN the Customer opens the orders page, THE Order_Service SHALL return up to 50 orders belonging to the authenticated Customer (filtered by `customerID`), sorted by creation date descending, with the ability to load subsequent pages of 50 orders each
3. THE Storefront SHALL display each order in the list with: order ID, creation date (formatted as "DD MMM YYYY"), status badge, and total item count (sum of all line item quantities)
4. WHEN the Customer taps an order, THE Storefront SHALL navigate to an order detail page showing: the full item list (item name and quantity for each line item), delivery address, delivery time, and current order status
5. THE Storefront SHALL display order status labels in Bahasa Indonesia using the following complete mapping: `PLACING` → "Menunggu Konfirmasi", `AWAITING_PAYMENT_PROOF` → "Menunggu Bukti Pembayaran", `AWAITING_PAYMENT_APPROVAL` → "Menunggu Persetujuan Pembayaran", `PAYMENT_REJECTED` → "Pembayaran Ditolak", `CONFIRMED` → "Sudah Dibayar, Menunggu Proses Memasak", `IN_PRODUCTION` → "Sedang Diproses", `READY` → "Siap", `READY_TO_DELIVER` → "Siap Dikirim", `OUT_FOR_DELIVERY` → "Dalam Pengiriman", `DELIVERED` → "Terkirim", `FAILED` → "Gagal"
6. IF the Customer has no orders, THEN THE Storefront SHALL display an empty state view with a message indicating no orders exist and a navigation action to the product catalog
7. IF the Order_Service fails to return order data within 10 seconds or returns a network error, THEN THE Storefront SHALL display an error message indicating the data could not be loaded and present an explicit retry action

### Requirement 10: Admin Product CRUD Operations

**User Story:** As an Admin, I want to create, read, update, and delete products in the inventory, so that the product catalog stays current.

#### Acceptance Criteria

1. THE Stock_API SHALL expose a POST endpoint for creating a new InventoryItem with required fields: itemName (1–200 characters), quantity (integer, minimum 0), unit (1–50 characters), price (int64, minimum 0, in smallest currency unit), available (boolean), and optional fields: category (maximum 100 characters), imageURL (maximum 2048 characters)
2. THE Stock_API SHALL expose a GET endpoint that returns all InventoryItem documents with support for filtering by category and availability, returning a maximum of 200 items per response
3. THE Stock_API SHALL expose a PUT endpoint for full replacement of an existing InventoryItem identified by document ID, requiring all mandatory fields in the request body and applying the same validation rules as creation
4. THE Stock_API SHALL expose a DELETE endpoint for removing an InventoryItem identified by document ID
5. WHEN the Admin creates or updates an InventoryItem, THE Stock_API SHALL set the updatedAt field to the current server timestamp
6. WHEN the Admin provides an itemName that is empty or exceeds 200 characters, a quantity less than 0, a unit that is empty, or a price less than 0, THE Stock_API SHALL return a 400 validation error with field-level details identifying each invalid field
7. THE Stock_API SHALL require the requesting user to have the "admin" role via Firebase custom claims; requests from non-admin users SHALL receive a 403 Forbidden response
8. IF the Admin attempts to update or delete an InventoryItem with a document ID that does not exist, THEN THE Stock_API SHALL return a 404 Not Found error
9. WHEN the Admin successfully creates an InventoryItem, THE Stock_API SHALL return a 201 response containing the created item including its generated document ID
10. WHEN the Admin successfully updates or deletes an InventoryItem, THE Stock_API SHALL return a 200 response containing the updated item, or a 204 response with no body for deletion

### Requirement 11: Admin Product Image Upload

**User Story:** As an Admin, I want to upload product photos that are stored directly in Firestore using the existing Base64 chunking protocol, so that customers can see what they are ordering and the system avoids any dependency on Firebase Cloud Storage.

#### Acceptance Criteria

1. THE Admin_Panel SHALL provide a file upload control on the product create/edit form that accepts image files with MIME types image/jpeg, image/png, and image/webp only
2. WHEN the Admin selects a file with a MIME type other than image/jpeg, image/png, or image/webp, THE Admin_Panel SHALL display a validation error indicating the accepted formats and reject the upload before any chunk is written to Firestore
3. WHEN the Admin selects an image file larger than 15,728,640 bytes (15 MB), THE Admin_Panel SHALL display a validation error indicating the maximum allowed size is 15 MB and reject the upload before any chunk is written to Firestore
4. THE Admin_Panel SHALL store product images in Firestore using the existing Base64 chunking protocol used by the order-fulfillment-delivery-tracking feature for proof-of-delivery files: the file SHALL be split into chunks of at most 524,288 bytes (512 KB) of pre-encoded source data, every chunk SHALL be Base64-encoded, chunk index 0 SHALL be prepended with the Data_URI prefix `data:<mimeType>;base64,`, and subsequent chunks SHALL NOT contain the Data_URI prefix
5. THE Admin_Panel SHALL write a parent file document to the Firestore collection `product_images/{fileId}` containing the fields fileName, fileSize (bytes), fileType (MIME), totalChunks (integer between 1 and 30 inclusive), status (one of "uploading", "completed", "failed"), uploadedBy (Admin Firebase UID), and createdAt; chunk documents SHALL be written to the subcollection `product_images/{fileId}/chunks` with the fields fileId, index (0-based sequential), and data (Base64 string)
6. WHEN all chunks for an image have been written successfully, THE Admin_Panel SHALL update the parent file document `status` field to "completed"; IF any chunk write fails, THEN THE Admin_Panel SHALL set the parent document `status` to "failed", display an error message identifying the failed chunk index, and present a retry action that resumes from the failed chunk
7. THE Stock_API SHALL store the parent file document ID on the InventoryItem `imageURL` field as the value `product_images/{fileId}` within 30 seconds of upload completion; the field name `imageURL` is preserved here for backward compatibility with the existing InventoryItem Go struct (`backend/internal/stock/models.go`) and Firestore documents — a rename to `imageFileId` MAY be proposed in the design phase but is out of scope for these requirements
8. THE Storefront and Admin_Panel SHALL read product images by either of the following paths: (a) calling a Stock_API endpoint that retrieves the parent file document and all its chunk documents for the referenced fileId, concatenates the chunk `data` values in ascending `index` order, strips the Data_URI prefix from chunk 0, decodes the Base64 payload, and returns the binary image with the original `fileType` MIME header; OR (b) reading the parent and chunk documents directly from Firestore via the client SDK using a real-time listener and assembling the concatenated Data_URI client-side for use as an `<img>` `src`
9. WHEN the Admin uploads a valid image for a product that already has an `imageURL` value referencing an existing `product_images/{fileId}` document, THE Stock_API SHALL delete the previous parent file document together with all of its chunk documents from Firestore before updating the InventoryItem `imageURL` field to point to the new fileId
10. WHEN the Admin selects a valid image file, THE Admin_Panel SHALL display a preview of the selected image at a maximum display size of 300×300 pixels before any chunk is written to Firestore
11. WHEN the Admin removes an existing product image, THE Stock_API SHALL delete the parent `product_images/{fileId}` document together with all of its chunk documents from Firestore and clear the `imageURL` field on the InventoryItem
12. IF assembly of an image fails because the actual chunk count does not equal the parent document's `totalChunks` value, the chunk count exceeds 30, an `index` value is missing or out of range [0, totalChunks − 1], or Base64 decoding fails, THEN THE Stock_API SHALL return an error response identifying the failure cause and the Storefront/Admin_Panel SHALL display a fallback placeholder image without modifying the InventoryItem document
13. IF a chunk write to Firestore fails after one or more chunks have already been written, THEN THE Admin_Panel SHALL leave the parent file document `status` as "failed", SHALL NOT update the InventoryItem `imageURL` field, and SHALL allow the Admin to either retry the upload (resuming from the failed chunk) or cancel and discard the partially written parent and chunk documents

### Requirement 12: Admin Stock Quantity Management

**User Story:** As an Admin, I want to manage stock quantities and availability, so that customers only see products that are in stock.

#### Acceptance Criteria

1. THE Admin_Panel SHALL display the current quantity and availability status for each InventoryItem in the product list
2. WHEN the Admin sets an InventoryItem quantity to zero, THE Stock_API SHALL automatically set the `available` field to false
3. WHEN the Admin toggles the availability switch to "Tidak Tersedia" (Unavailable), THE Stock_API SHALL set the `available` field to false regardless of the current quantity
4. THE Admin_Panel SHALL provide inline quantity editing with increment/decrement controls and direct numeric input for values between 0 and 99,999
5. WHEN the Admin updates stock quantity, THE Stock_API SHALL validate that the new quantity is a non-negative integer not exceeding 99,999; IF the value is negative, non-integer, or exceeds 99,999, THEN THE Stock_API SHALL reject the request with a validation error indicating the accepted range
6. WHEN the Admin sets an InventoryItem quantity to a value greater than zero while the `available` field is false, THE Admin_Panel SHALL prompt the Admin to confirm whether to also set the `available` field to true
7. IF the Admin attempts to update stock for an InventoryItem that does not exist, THEN THE Stock_API SHALL return an error indicating the item was not found

### Requirement 13: Admin Product Categorization

**User Story:** As an Admin, I want to assign categories to products, so that customers can browse products by category on the Storefront.

#### Acceptance Criteria

1. THE Admin_Panel SHALL provide a category dropdown on the product create/edit form populated with the distinct category list returned by the Stock_API
2. WHEN the Admin types a category name that does not match any existing category in the dropdown, THE Admin_Panel SHALL allow the Admin to use that new value as the product's category
3. WHEN the Admin saves a product with a category value, THE Stock_API SHALL trim leading and trailing whitespace from the category string, validate that it is between 1 and 50 characters in length, and store it on the InventoryItem document
4. IF the Admin submits a product with a blank or empty category string after trimming, THEN THE Stock_API SHALL reject the request with an error message indicating that category is required
5. THE Admin_Panel SHALL display a category filter on the product list page allowing the Admin to filter the displayed products to a single selected category
6. THE Stock_API SHALL return the list of distinct non-empty category strings currently stored across all InventoryItem documents when queried by the Admin_Panel, within 5 seconds

### Requirement 14: Storefront Mobile-First Layout (ShopeeFood-Inspired)

**User Story:** As a Customer, I want the Storefront to feel like a familiar food-ordering app (ShopeeFood-style), so that I can order intuitively from my phone.

#### Acceptance Criteria

1. THE Storefront SHALL use a single-column layout optimized for viewport widths between 320px and 480px as the primary design target
2. THE Storefront SHALL include a fixed bottom navigation bar with icons and labels for Beranda (Home), Kategori (Categories), Keranjang (Cart), and Pesanan (Orders), using Lucide React icons at 24×24 pixels
3. THE Storefront SHALL use touch-friendly tap targets with a minimum size of 44×44 pixels for all interactive elements
4. WHILE the viewport width exceeds 768px, THE Storefront SHALL adapt to a wider layout with a maximum content width of 480px centered on screen to preserve the mobile app feel
5. THE Storefront SHALL use the Manrope font for headings and Hanken Grotesk font for body text as defined in the existing theme configuration
6. THE Storefront SHALL apply Motion (Framer Motion) page transition animations between checkout steps with a duration of 300 milliseconds
7. THE Storefront SHALL implement the 6-step ShopeeFood checkout flow: Browse → Select Product → Cart Review → Delivery Address → Payment Method → Order Confirmation
8. THE Storefront SHALL display a promotional banner section on the homepage labeled "Sering Direkomendasikan" (Frequently Recommended) featuring the 5 most recently updated available products
9. THE Storefront SHALL use card-based product listings with 16px rounded corners, subtle shadow elevation (0 1px 3px rgba(0,0,0,0.1)), and product image occupying the top 60% of each card

### Requirement 15: Admin Panel Layout and Navigation

**User Story:** As an Admin, I want a clear and organized admin interface, so that I can efficiently manage the product inventory.

#### Acceptance Criteria

1. THE Admin_Panel SHALL provide a sidebar navigation with links to "Daftar Produk" (Product List), "Tambah Produk" (Add Product), "Kategori" (Categories), and "Persetujuan Pembayaran" (Payment Approval), each displaying a corresponding icon and label
2. THE Admin_Panel SHALL display a data table for the product list with columns: image thumbnail (48×48 pixels, with a placeholder icon when no image exists), product name, category, price (formatted in IDR currency), quantity, availability status (displayed as a colored badge: green for available, red for unavailable), and action buttons (edit and delete)
3. THE Admin_Panel SHALL use MUI v7 DataGrid or Table components for the product list with sorting enabled on product name, category, price, and quantity columns, and pagination defaulting to 10 rows per page with options for 10, 25, and 50 rows per page
4. THE Admin_Panel SHALL use the Al Umana color palette (Primary #FBBF24, Secondary #111827) consistently with the existing admin dashboard pages, integrating within the existing AppShell layout
5. WHEN the Admin clicks the delete action button for a product, THE Admin_Panel SHALL display a confirmation dialog identifying the product name and requiring the Admin to explicitly confirm or cancel before the delete operation is executed
6. IF the Admin cancels the confirmation dialog, THEN THE Admin_Panel SHALL close the dialog and leave the product unchanged
7. IF the product list contains no products, THEN THE Admin_Panel SHALL display an empty state message indicating no products are available and providing a link to "Tambah Produk" (Add Product)
8. WHEN the Admin clicks the "Persetujuan Pembayaran" sidebar link, THE Admin_Panel SHALL navigate to the Payment Approval page described in Requirement 8

### Requirement 16: Authentication and Authorization

**User Story:** As the system owner, I want the Storefront and Admin Panel to enforce proper authentication, so that only authorized users can access their respective features.

#### Acceptance Criteria

1. THE Storefront SHALL require Firebase Authentication login before allowing the Customer to add items to Cart, place orders, view order history, upload Payment_Proof, or access account settings
2. THE Storefront SHALL allow unauthenticated users to browse the product catalog and view product details in read-only mode without requiring login
3. THE Admin_Panel SHALL require Firebase Authentication login and verify the user has the "admin" role via Firebase custom claims or Firestore user profile before granting access to any Admin_Panel route
4. IF an unauthenticated user attempts to access a protected Storefront action, THEN THE Storefront SHALL redirect to the login page and, after successful authentication, redirect the user back to the URL they originally attempted to access
5. IF a non-admin user attempts to access the Admin_Panel routes, THEN THE System SHALL display an "Akses Ditolak" (Access Denied) message and redirect to the Storefront homepage within 3 seconds
6. IF the user's Firebase Authentication token expires or is revoked during an active session, THEN THE Storefront SHALL redirect the user to the login page on the next protected action attempt and display a message indicating the session has ended
7. IF the Firebase Authentication service is unreachable when a user attempts to log in, THEN THE System SHALL display an error message indicating the authentication service is unavailable and allow the user to retry

### Requirement 17: Storefront Search

**User Story:** As a Customer, I want to search for products by name, so that I can quickly find specific items without browsing all categories.

#### Acceptance Criteria

1. THE Storefront SHALL display a search input field on the homepage with placeholder text "Cari produk..." and a maximum input length of 100 characters
2. WHEN the Customer types at least 2 characters in the search field, THE Storefront SHALL filter the displayed products within 300 milliseconds of the last keystroke to those whose itemName contains the search text as a substring (case-insensitive), displaying results as a flat list without category grouping
3. WHEN the search yields no matching products, THE Storefront SHALL display an empty state message "Produk tidak ditemukan"
4. WHEN the search field text is reduced to fewer than 2 characters (by deletion, clearing, or using a clear button), THE Storefront SHALL restore the full category-grouped product listing
