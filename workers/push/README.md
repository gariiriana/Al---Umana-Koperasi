# Push Worker (`al-umana-push`)

Sends Firestore `notifications` to phones through Firebase Cloud Messaging, so
staff get notified even when the app is closed. Firebase stays on the free
Spark plan: this Worker replaces Cloud Functions.

## How it works

1. The app writes a `notifications` doc with `pushStatus: "pending"`. The doc
   is written by `frontend/src/services/notificationWriter.ts`, called from
   the order, job desk, MBG and Super Admin task flows.
2. The app calls `POST /api/push/kick`, which needs a Firebase ID token. A
   cron every 5 minutes is the safety net, so a notification whose kick
   failed arrives within about 5 minutes.
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

- `GET /api/push/health`: shows whether the secrets are set (`configured`,
  `appCheckConfigured`).
- `POST /api/push/kick`
- `POST /api/security/app-check-token`: Firebase App Check (see below).
- `POST /api/security/csp-report`: receives Content-Security-Policy violation
  reports and writes a short summary (`csp-violation ...`) to Worker Logs.

## App Check (Turnstile)

`frontend/src/lib/appCheck.ts` solves an invisible Cloudflare Turnstile
widget and sends the token to `/api/security/app-check-token`. The Worker
(`security.js`) then:

1. verifies the token with Turnstile `siteverify`, accepting only our
   hostnames and the `app-check` action;
2. signs a custom token with the service account;
3. exchanges it for an App Check token valid for 12 hours.

Firestore only rejects requests without that token once **enforcement** is
switched on (Firebase console → App Check → APIs → Cloud Firestore → Enforce).
Requests from Workers use the service account and are not affected.

Setup:

1. Cloudflare dashboard → Turnstile → **Add widget**. Use mode **Invisible**
   and add the hostnames `koperasi-alumana.com`, `al-umana-koperasi.web.app`
   and `al-umana-koperasi.firebaseapp.com`.
2. Set its secret on the Worker:
   `cd workers/push && npx wrangler@4 secret put TURNSTILE_APPCHECK_SECRET`.
3. Put its sitekey in `frontend/.env.production` as
   `VITE_TURNSTILE_APPCHECK_SITE_KEY=...`. Leaving it empty keeps App Check
   off.
4. Deploy the Worker, then hosting. `/api/push/health` should show
   `"appCheckConfigured": true`.
5. Watch Firebase console → App Check → Cloud Firestore for a few days. Turn
   on enforcement only when almost all requests are **verified**. Users still
   on an old version show up as unverified until they tap "Perbarui".
6. Local `vite dev` against production after enforcement: register a debug
   token in the Firebase console (App Check → Apps → Manage debug tokens).
   Then set `VITE_APPCHECK_DEBUG_TOKEN=...` in `frontend/.env.local`.

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

Tests: `node --test workers/push/logic.test.mjs workers/push/security.test.mjs`

## Limits (Cloudflare free plan)

Each run is capped at 50 subrequests. Whatever doesn't fit is delivered on
the next kick or cron. Firestore cost:

- each run reads 1 document at minimum;
- each notification adds 1 read per recipient lookup plus 2 writes.
