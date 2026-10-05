# Crish Wedding Hires

Wedding and homecoming car hire management: bookings, invoices, drivers,
income & expenses, and a public availability page. Next.js (App Router) with
a PostgreSQL database (Neon).

## Setup

1. `npm install`
2. Create `.env.local` (never commit it):

   ```bash
   # Admin login
   ADMIN_EMAIL=you@example.com
   ADMIN_PASSWORD=change-me
   # Signs the login cookie: any random string of 32+ characters
   AUTH_SECRET=...
   # PostgreSQL connection string
   DATABASE_URL=postgresql://user:password@host/db?sslmode=verify-full&channel_binding=require
   # S3-compatible file storage for photos and documents
   AWS_ENDPOINT_URL_S3=https://...
   AWS_ACCESS_KEY_ID=...
   AWS_SECRET_ACCESS_KEY=...
   AWS_REGION=us-east-2
   S3_BUCKET=cwcar
   # Optional: time zone for "today's hires" (default Asia/Colombo)
   # APP_TIMEZONE=Asia/Colombo
   ```

3. `npm run dev` and open <http://localhost:3000>.

The database tables are created automatically on the first request
(`lib/server/migrations.mjs`); there is no separate migrate command.

## Areas

| URL | Who | |
| --- | --- | --- |
| `/admin` → `/admin/login` → `/admin/dashboard/*` | Admins (email + Google Authenticator code) | Everything; the super admin also manages admins |
| `/driver/login` → `/driver/dashboard` | Drivers | Only hires assigned to them, read-only invoice |
| `/` (home page) | Anyone | The customer website: fleet, which cars are free on a date, reviews, contact; no private details |

Drivers are added by the admin on `/admin/dashboard/drivers`. Old addresses
(`/availability`, `/dashboard/*`, `/login`) redirect to the new ones.

## Code map

- `lib/server/db.ts`: Postgres pool, transactions
- `lib/server/migrations.mjs`: schema (add a new numbered migration to change it)
- `lib/server/repo.ts`: all database reads and writes
- `lib/server/guard.ts`: who may do what (`requireAdmin`, `requireDriver`, page guards)
- `lib/server/admin-actions.ts`: admin-only server actions used by the admin screens
- `proxy.ts`: sends each visitor to the area their login allows
- `lib/server/storage.ts`, `lib/server/files.ts`: file storage and the `files` table
- `app/api/files`: document upload (admin) and permission-checked file download

## Files

Photos and documents are stored in the S3 bucket; the database keeps a
`files` row for each. The browser only ever sees `/api/files/<id>`, which
checks access before streaming the file:

| Kind | Where | Who can open |
| --- | --- | --- |
| Car photos, landing photo | Cars page, Home | Anyone (used on the public page) |
| Hire files (agreement, ID copy, slips) | History → Files | Admin, and drivers assigned to that hire |
| Expense receipts | Income & Expenses → paperclip | Admin |
| Vehicle documents (with expiry) | Cars → Documents | Admin |
| Driver documents (with expiry) | Drivers → Documents | Admin |

Uploads are checked by content (photo, PDF, Word, Excel), up to 15 MB.

## Admin sign-in and admin accounts

Admins sign in with their **email and the 6-digit code from Google
Authenticator**. There are no admin passwords (`lib/server/admins.ts`,
`lib/server/totp.ts`). Drivers still use email + password.

**First time:** open `/admin`. It asks once for the old `ADMIN_EMAIL` /
`ADMIN_PASSWORD` from `.env.local`, then shows a QR code to scan with Google
Authenticator. That account becomes the **super admin** and gets 8 one-time
recovery codes; save them away from the phone. After this, `ADMIN_PASSWORD`
is no longer used and can be removed.

**Adding admins** (super admin: shield icon in the top bar → *Admins*): enter
a name and email and pick the role (*Admin* or *Super admin*) → they get an
email with a setup link (valid 3 days, works once) → they scan the QR code →
they show as *Waiting for approval* and every super admin gets an email →
*Approve*. You can also suspend, turn back on, reset someone's authenticator
(lost phone: they get a new link and need approval again), make them a super
admin or a regular admin again, or remove them. There can be several super
admins; nobody can change their own account, so one always remains. Every
admin can *Move to a new phone* on the same page.

**Email (SMTP)**: add to `.env.local` and restart:

```
SMTP_HOST=smtp.example.com
SMTP_PORT=587            # 465 for SSL
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM="Chrish Wedding Cars <no-reply@yourdomain.com>"
APP_URL=https://yourdomain.com   # used for the links inside emails
```

Without SMTP, inviting still works: you get the setup link to send yourself.

Authenticator secrets are encrypted with a key made from `AUTH_SECRET` (or
`TOTP_KEY` if set). Changing that value means every admin has to set up the
app again.

## Facebook reels as the public page video

The film at the top of the home page (`/`) can play the newest reel from the
Facebook page automatically (`lib/server/facebook.ts`). The site copies the
reel into file storage, so it keeps playing even if Facebook is unreachable.

1. At https://developers.facebook.com create an app (type **Business**) and
   add your Facebook account as an admin of the app.
2. In **Graph API Explorer**, pick the app, add the permissions
   `pages_show_list` and `pages_read_engagement`, generate a *User* token,
   and approve access to the Chrish Wedding Cars & Rentals page.
3. Exchange it for a long-lived user token (Access Token Debugger →
   *Extend Access Token*), then call `GET /me/accounts` with it. The
   `access_token` next to the page is a Page token that doesn't expire.
4. Add to `.env.local` and restart the server:

   ```
   FB_PAGE_ID=61579116013524
   FB_PAGE_TOKEN=<the page access_token>
   ```

Then Home shows the reel status and **Sync now**. Public page visits check for
a newer reel at most every 30 minutes. To also check while nobody visits, set
`CRON_SECRET` and call `GET /api/cron/facebook-sync` with
`Authorization: Bearer <CRON_SECRET>` on a schedule. Uploading a video on
Home overrides the reels until **Use Facebook reels** is pressed.

## Google reviews on the public page

The **Reviews** section on the home page always links to the Google
Business Profile ("Write a review" and "Read our reviews on Google"). To also
show the star rating, review count and latest reviews
(`lib/server/google-reviews.ts`):

1. In Google Cloud Console create a project, enable **Places API (New)**, and
   create an **API key**. Restrict it to that API.
2. Add to `.env.local` and restart the server:

   ```
   GOOGLE_PLACES_API_KEY=<your key>
   ```

The business is found by name the first time; set `GOOGLE_PLACE_ID` if the
wrong place is picked. Reviews are refreshed every 12 hours, so only about two
Google requests are made per day. Google returns up to 5 reviews and chooses
which ones; the page shows them unedited, with the reviewer's name and
"Reviews from Google".

## Moving data from the old SQLite file

Earlier versions kept data in `data/cwcar.db`. To copy it into an empty
Postgres database once:

```bash
node --env-file=.env.local scripts/migrate-sqlite-to-postgres.mjs
```

It refuses to run if Postgres already has data. Then move photos that were
stored inside the database into the bucket (safe to run again):

```bash
node --env-file=.env.local scripts/move-images-to-storage.mjs
```
