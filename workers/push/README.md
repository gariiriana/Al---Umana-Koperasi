# Push Worker (`al-umana-push`)

Sends Firestore `notifications` to phones through Firebase Cloud Messaging, so
staff get notified even when the app is closed. Firebase stays on the free
Spark plan: this Worker replaces Cloud Functions.

## How it works

1. The app writes a `notifications` doc with `pushStatus: "pending"`. The doc
   is written by `frontend/src/services/notificationWriter.ts`, called from
   the order, job desk, MBG and Super Admin task flows.
2. The app calls `POST /api/push/kick`, which needs a Firebase ID token. A
   cron every minute is the safety net.
3. The Worker finds the recipient's phones in `push_devices`. A recipient can
   be a uid, or a role expanded through `ROLE_ALIASES` in `logic.js`.
4. It claims the doc using an `updateTime` precondition, so a notification is
   never sent twice.
5. It sends one data-only FCM message per phone. Dead tokens are deleted.
6. It marks the doc `sent`, `no_devices`, `failed` or `expired`. Expired
   means older than 12 hours.

Phones register in `frontend/src/services/pushService.ts`. The service worker
handler that shows the notification is `frontend/public/push-sw.js`.

Routes:

- `GET /api/push/health`: shows whether the secrets are set.
- `POST /api/push/kick`

## Setup

1. In the Firebase console, go to **Project settings → Service accounts →
   Generate new private key**. The `firebase-adminsdk` account has both
   Firestore and FCM access.
2. Set the secrets. The key goes straight to Cloudflare:
   `node workers/push/set-secrets.mjs "<downloaded-key>.json"`
3. Delete the downloaded JSON.
4. Deploy: `cd workers/push && npx wrangler@4 deploy`
5. Check: `https://koperasi-alumana.com/api/push/health` should show
   `"configured": true`.

Tests: `node --test workers/push/logic.test.mjs`

## Limits (Cloudflare free plan)

Each run is capped at 50 subrequests. Whatever doesn't fit is delivered on
the next kick or cron. Firestore cost:

- each run reads 1 document at minimum;
- each notification adds 1 read per recipient lookup plus 2 writes.
