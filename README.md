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
| `/login` → `/dashboard/*` | Admin | Everything |
| `/driver/login` → `/driver/dashboard` | Drivers | Only hires assigned to them, read-only invoice |
| `/availability` | Anyone | Which cars are free on a date; no private details |

Drivers are added by the admin on `/dashboard/drivers`.

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
