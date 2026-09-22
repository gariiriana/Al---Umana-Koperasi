# Invoice API Worker

This Worker replaces only the public invoice endpoint:

- `GET /api/public/invoices/:token`
- `POST /api/public/invoices/:token/sign`

It intentionally exposes only invoice fields and performs Firestore access
server-side. The frontend should use its Worker URL in
`VITE_INVOICE_API_BASE_URL` after deployment.

## Cloudflare setup

Create a Worker named `al-umana-invoice-api`, paste `worker.js`, then set:

- Plain variables: `FIREBASE_PROJECT_ID`, `ALLOWED_ORIGIN`.
- Encrypted secrets: `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`.

The Firebase credentials must belong to a dedicated service account with the
minimum IAM role needed for Firestore document read/write. Do not reuse an
administrator's personal key or commit any credential file.
