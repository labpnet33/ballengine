# Guest social publishing: staging and rollout

This branch extends the **existing** `/automation`, `/automation/accounts`,
`/automation/publish` and `/automation/autopilot` pages. It does not create
replacement pages, change the physics simulator, or connect to the original
BallEngine subscription backend. **Every guest gets access to the independent
publishing controls without a subscription**, but each guest must separately
authorize their own social accounts through the providers.

## Current deployment status — November 15, 2026

The existing **production frontend** at `https://ballengine.vercel.app` includes guest-friendly
Automation tabs and the separate social account/publishing panels. The original
React pages remain in place, and the independent Worker/API implementation is
merged into the repository default branch `main`.

The Cloudflare Worker `ballengine-project-saves` has the social OAuth,
publishing and cron modules deployed. Its D1 database includes
`guest_social_accounts`, `guest_social_jobs`, `guest_social_deliveries`,
and `guest_social_oauth_states`. A one-minute Cron Trigger exists.
`SOCIAL_TOKEN_SECRET` is configured as a secret (do not log or export it).

**Not activated:** OAuth app credentials (`GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `META_APP_ID`, `META_APP_SECRET`,
`TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`) are not present,
`SOCIAL_CRON_ENABLED` is deliberately `false`, no guest social accounts
are linked, and no real provider posts have been tested.
Do not label automatic publishing as working until official provider
authorization and a controlled private upload test succeed.

The original frontend uses local guest profile settings for guest-facing
UI; the independent social backend authenticates every private request with
the Cloud Saves recovery key and verifies OAuth consent per connected platform.
The guest flag `automaticSocialPosting: false` is therefore expected until
the site owner enables the audited integrations.

## Required Cloudflare Worker configuration

1. On an isolated staging Worker, bind a D1 database as `DB`. Apply the
   existing `cloud-saves/schema.sql`, `cloud-saves/music-schema.sql`,
   `cloud-saves/guest-publishing-schema.sql`, then
   `cloud-saves/guest-social-schema.sql` **in that order**. If the D1 database
   is already initialized, apply only the new guest-social schema.
2. Deploy the Worker entrypoint `cloud-saves/worker.mjs` together with all
   sibling `.mjs` modules. Do **not** replace the live Worker until staging
   validation is complete.
3. Configure these encrypted Worker secrets / variables (never commit them):

   | Name | Purpose |
   | --- | --- |
   | `SOCIAL_TOKEN_SECRET` | A newly generated 32-byte random key encoded in base64url. Required for AES-GCM encryption of all OAuth credentials. Backup securely; rotation requires migration or reconnection. |
   | `SOCIAL_WORKER_URL` | The public HTTPS origin of the Worker, e.g. `https://your-staging-worker.your-account.workers.dev` |
   | `SOCIAL_APP_ORIGIN` | The guest site origin used if the HTTP Origin header is absent, e.g. `https://ballengine.vercel.app` |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth app with YouTube Data API enabled |
   | `META_APP_ID`, `META_APP_SECRET` | Meta app with Facebook Login and applicable Page/Instagram permissions |
   | `META_GRAPH_VERSION` | Optional provider Graph version override; source default is `v25.0` |
   | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | TikTok Login Kit / Content Posting API app |
   | `SOCIAL_CRON_ENABLED` | Set to `true` only after authorizations, DB migrations and the Cron Trigger have been tested |

4. Add a Cloudflare Cron Trigger `* * * * *` (every minute, UTC) on the
   verified publishing Worker. The `scheduled` entrypoint is already wired.
   The cron job checks due deliveries, performs provider uploads, polls pending
   provider operations, and creates the next daily/weekly job only once.
5. When testing a staging Vercel page, point the existing
   `scripts/ballengine-cloud-saves.js` worker endpoint at the staging
   Worker **only for that preview**. Do not overwrite the production endpoint
   or share a production encryption key with staging.

## Register these provider callback URLs

Replace `WORKER_ORIGIN` with the actual HTTPS address configured above.

- Google/YouTube:
  `WORKER_ORIGIN/api/guest-social/oauth/callback/youtube`
- Facebook Pages:
  `WORKER_ORIGIN/api/guest-social/oauth/callback/facebook`
- Instagram professional accounts via Meta Facebook Login:
  `WORKER_ORIGIN/api/guest-social/oauth/callback/instagram`
- TikTok:
  `WORKER_ORIGIN/api/guest-social/oauth/callback/tiktok`

Configure provider-approved scopes before enabling Connect buttons.
YouTube uses `youtube.upload` and `youtube.readonly`; Meta requests
`pages_show_list`, `pages_read_engagement`, `pages_manage_posts`,
`instagram_basic`, `instagram_content_publish`; TikTok requests
`user.info.basic` and `video.publish`. Meta publishing supports authorized
Pages and linked professional Instagram accounts, not arbitrary personal
profiles. TikTok Direct Post requires platform approval; unaudited clients can
have posting/visibility limitations.

All tokens are server-side AES-GCM ciphertext in D1, indexed by a SHA-256
digest of the guest's Cloud Saves recovery key. The browser receives a
connection list and OAuth URL but **never** access/refresh tokens. Guests must
preserve their recovery keys across browsers; switching keys changes the
associated accounts and queued jobs.

## Guest experience

**Accounts**: Official platform OAuth, multiple connected accounts per
provider when available, disconnect/reconnect.

**Publish**: Existing manual drafts remain in place; a separate auto-publish
panel accepts MP4 uploads up to 10 MiB, account selection, title/caption,
YouTube audience choice, TikTok live creator permissions, visibility and
interactions, explicit consent, publish-now or scheduled UTC time, and
daily/weekly recurrence.

**Autopilot**: Recurring queue and per-platform statuses; cancel before
upload; retry *confirmed* failures. Ambiguous uploads are marked for review
instead of blindly retried to avoid duplicate posts.

**Overview**: Connected account counts, queue, successful jobs, failure
statuses, and recent history. No subscription requirement.

## Known limits and before-production safety checks

- Existing D1 media storage supports **10 MiB per MP4 and 40 MiB per library**
  across media. Large video uploads should move to R2 before lifting those
  limits.
- The cron runs in UTC; guests enter their local time and the frontend submits
  an ISO timestamp. Recurrence uses fixed 24-hour/7-day intervals, not
  DST-adjusted calendar events.
- Individual provider publishing requires official app review/approval,
  enabled scopes, and account authorization. An active guest UI alone cannot
  grant provider privileges.
- Do not promise public TikTok/YouTube visibility for unverified API projects.
- Instagram Reels use an unguessable Cloud Saves media URL because Meta needs
  an HTTPS fetchable video. Consider expiring media grants before broad rollout.
- If an upload might have succeeded but confirmation was lost, the job enters
  `needs_review`; never automatically issue a second upload.
- No actual production post has been sent by the implementation tests.
  Run individual **private test posts** for all four providers only after the
  user authorizes the test accounts, and verify provider-side results.
- Make a database backup before D1 migration and keep the existing live
  Worker/deployment unchanged until review and approval.

## Regression checks

GitHub Actions: `.github/workflows/guest-social-publishing.yml`

Locally (Node 22+):

```bash
node --check cloud-saves/worker.mjs
node --check cloud-saves/guest-social.mjs
node --check cloud-saves/social-oauth.mjs
node --check cloud-saves/social-publish.mjs
node --check scripts/ballengine-guest-social.js
node --test scripts/test-guest-social-integration.mjs
```
