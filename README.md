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

## Moving data from the old SQLite file

Earlier versions kept data in `data/cwcar.db`. To copy it into an empty
Postgres database once:

```bash
node --env-file=.env.local scripts/migrate-sqlite-to-postgres.mjs
```

It refuses to run if Postgres already has data.
