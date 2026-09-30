# Single Source of Truth (SSOT) architecture

Status: **proposal — not implemented yet.** Written against the code as of
2026-09-30 (schema version 5). Every section says what exists today and what
has to change.

Classification tags used throughout:

| Tag | Meaning |
| --- | --- |
| **AUTHORITATIVE** | The one place this fact is stored. All other copies are derived from it. |
| **DERIVED** | Computed from authoritative records on demand. Never written by hand. |
| **CACHE** | A temporary copy of authoritative or derived data. It may be stale, it is never written back as truth, and it can be thrown away. |
| **EXTERNAL SOURCE** | Originates in another system; this system stores an imported copy with provenance. |
| **AUDIT/HISTORY** | Append-only record of what happened. Never updated, never used as current state. |
| **SNAPSHOT** | A value copied *at a moment in time* on purpose (e.g. the car's name and rate on an issued invoice). Authoritative for "what was agreed then", never for "what is true now". |

Requirements marked **UNKNOWN** were not given. The design leaves room for them
but does not build them.

---

## 1. SSOT architecture

```
            ┌──────────────────────────── authoritative ───────────────────────────┐
 Postgres   │ cars · users(drivers) · bookings · booking_cars(assignments/trips)   │
 (Neon)     │ ledger · indirect_expenses · car_blocks · files(meta) · settings     │
            │ + new: audit_log · (future) odometer_readings, fuel_transactions…    │
            └──────────────────────────────────────────────────────────────────────┘
 S3 bucket    file bytes (AUTHORITATIVE for content; metadata lives in `files`)
                                   │
                                   ▼
 Domain / service layer   lib/server/domain/*   ← the ONLY code that writes
   validation (zod) · authorization (guard.ts) · business rules · transactions
   · audit writes · derived-state calculation (availability, status, money, alerts)
                                   │
                                   ▼
 API layer   server actions (admin-actions.ts) · route handlers (/api/*)
             · server components (driver pages)   — thin: parse → call domain → return
                                   │
          ┌────────────────┬───────┴────────┬──────────────────┬───────────────┐
          ▼                ▼                ▼                  ▼               ▼
      Dashboard        Driver pages     Public /availability  Reports (Excel/  Notifications
      (CACHE only)     (server-rendered) (DERIVED, public      PDF, generated   (UNKNOWN —
                                          fields only)          from API data)   future)
```

Rules:

1. **Only the domain layer writes.** No SQL outside `lib/server/domain/*` and
   `lib/server/db.ts`. Route handlers, server actions and scripts call domain
   functions.
2. **Only the domain layer decides business state.** Availability, hire status,
   money totals, expiry alerts and profit are computed on the server and
   *returned* to clients. Clients display them; they don't recompute them to
   make decisions.
3. **Clients hold caches, never truth.** The dashboard's in-memory store
   (`lib/bridal/store.ts`) is a CACHE of API responses. It may be stale, so every
   mutation is re-validated by the server, and every response replaces the
   cached copy.
4. **The database enforces what must never break**: keys, foreign keys, CHECKs,
   exclusion constraints and unique indexes. The domain layer gives friendly
   messages; the database is the final guarantee.

---

## 2. Entity ownership matrix

"Owner" is the one domain module allowed to write the entity.

| Entity | Table | Owner module | Tag | Notes |
| --- | --- | --- | --- | --- |
| Vehicle | `cars` | `domain/vehicles` | AUTHORITATIVE | Own + partner fleet. |
| Partner-car owner (name, phone, cost per hire) | `cars.owner_*` | `domain/vehicles` | AUTHORITATIVE | Current terms only; per-hire cost is a SNAPSHOT on `booking_cars`. |
| Driver | `users` (role = driver) | `domain/drivers` | AUTHORITATIVE | The admin is in `.env.local`, not the database (see §10 gap). |
| Hire (customer order, invoice) | `bookings` | `domain/hires` | AUTHORITATIVE | `inv_no` is the hire/invoice number. |
| Vehicle-driver assignment for a trip | `booking_cars.driver_id` | `domain/hires` | AUTHORITATIVE | Assignment is per hire, not standing. A standing "this driver normally drives this car" relationship is **UNKNOWN**. |
| Trip / journey (car, time slot, route, stops) | `booking_cars` | `domain/hires` | AUTHORITATIVE | One row = one car's trip on a hire. |
| Car unavailable period (repair, service…) | `car_blocks` | `domain/availability` | AUTHORITATIVE | |
| Extra income / expense per hire (incl. petrol) | `ledger` | `domain/finance` | AUTHORITATIVE | Petrol is a category here; there is no litre/odometer data (§11). |
| Indirect expense (not tied to a hire) | `indirect_expenses` | `domain/finance` | AUTHORITATIVE | Optionally assigned to a vehicle. |
| Document metadata (type, expiry date) | `files` | `domain/documents` | AUTHORITATIVE | Expiry lives only here. |
| Document bytes | S3 bucket `cwcar` | `domain/documents` | AUTHORITATIVE | Key recorded once in `files.s3_key`. |
| Business settings | `kv['settings']` | `domain/settings` | AUTHORITATIVE | |
| Audit trail | `audit_log` (new) | written only by domain modules | AUDIT/HISTORY | §10. |
| Odometer readings | — | — | **UNKNOWN** | Proposed `odometer_readings` (§4). |
| Fuel transactions (litres, station, card) | — | — | **UNKNOWN** | Today only as `ledger` amount; proposed `fuel_transactions` (§4). |
| Maintenance schedule (next service due) | — | — | **UNKNOWN** | Today: history = `indirect_expenses` (category Vehicle service/Repairs) + `car_blocks`. |
| GPS / location | — | — | **UNKNOWN** | No provider named. Rules in §11. |
| Payments (advance, balance received) | `bookings.advance` | `domain/hires` | AUTHORITATIVE (single figure) | Individual payment transactions are **UNKNOWN**; see §4. |
| Alerts | — | `domain/alerts` | DERIVED | Never stored as state (§3). |

---

## 3. Authoritative vs derived classification

### Stored today — and what each value is

| Value | Where | Tag | Verdict |
| --- | --- | --- | --- |
| `cars.*` | cars | AUTHORITATIVE | OK |
| `cars.image` | cars | AUTHORITATIVE link → `files` | **Gap:** the same link is also implied by `files(owner_type='car_image', owner_id)`. Two facts can drift (orphans). Fix in §13 (#6). |
| `bookings.customer, phone, address, date, type, deco, deco_notes, discount, advance, status` | bookings | AUTHORITATIVE | OK |
| `bookings.rate` (sum of car amounts) | bookings | DERIVED stored | **Gap** — duplicate of `SUM(booking_cars.rate)`. |
| `bookings.deco_cost` | bookings | DERIVED stored | **Gap** — follows from `deco` × car count × `FRESH_FLOWER_COST`. Keep only if the flower price is snapshotted (it should be: price changes must not rewrite old invoices), so store `deco_unit_cost` (SNAPSHOT) instead and derive the total. |
| `bookings.total`, `bookings.balance` | bookings | DERIVED stored | **Gap** — `total = rate + deco_cost − discount`, `balance = max(0, total − advance)`. Stored copies can disagree with their inputs. |
| `bookings.revision`, `updated_at` | bookings | AUTHORITATIVE (version) | Becomes the optimistic-concurrency version (§9). |
| `bookings.inv_no` | bookings | AUTHORITATIVE | **Gap:** it's generated from `count(*)` of the year's bookings, so deleting hires lets numbers be reused. Replace with a sequence (§13 #7). |
| `booking_cars.car_name, rate, fleet, owner_name, owner_cost` | booking_cars | SNAPSHOT | Correct and intentional: invoices must not change when the catalogue does. |
| `booking_cars.hire_date, active` | booking_cars | DERIVED stored (mirror of parent) | Justified: the `ex_car_slot` exclusion constraint needs them on the same row. Kept consistent because only `domain/hires` writes both, inside one transaction. The reconciliation check is in §12. |
| `booking_cars.slot` | booking_cars | DERIVED (generated column) | OK — Postgres computes it, it can't drift. |
| `indirect_expenses.car_name`, `car_blocks.car_name` | — | SNAPSHOT | OK — keeps the name readable after a car is removed. |
| `files.expires_on` | files | AUTHORITATIVE | OK |
| Browser `localStorage['bridalDriveData']` | browser | Legacy CACHE | **Gap** — a leftover competing copy from the pre-database version. Retire it (§14 phase 1). |
| Dashboard store (`useBridal`) | browser memory | CACHE | OK *as a cache*. The **gap** is that screens compute business state from it (next table). |

### Must be DERIVED (never stored as state)

| Value | Derived from | Computed where — today → target |
| --- | --- | --- |
| Car available / booked / partly booked / unavailable, free gaps | `booking_cars.slot` (active) + `car_blocks` | Browser (`lib/bridal/logic.ts`) + server for writes → **server only**, returned by `GET availability`. |
| Hire status (upcoming / today / completed / cancelled) | `bookings.status`, `date`, business "today" | Both sides; the browser uses *browser* time zone → **server**, using `todayInBusinessTz()`. |
| Hire money (income, expenses, partner cost, profit) | bookings + booking_cars + ledger | Browser (`hireMoney`) → **server**. |
| Period totals: hire income, extra income, hire expenses, indirect, net profit | the above + indirect_expenses | Browser → **server** `GET finance/summary`. |
| Per-vehicle expense totals | indirect_expenses by car_id | Browser → **server**. |
| Document expiry alert (expired / soon) | `files.expires_on`, business today | Browser → **server** `GET alerts`. |
| Counts: total, active, free-today, in-repair vehicles | cars, booking_cars, car_blocks | Browser → **server** `GET dashboard/summary`. |
| Excel / PDF reports | server report endpoints | Built in browser from cache → **server-generated file, or browser renders a fresh server response** (never the long-lived cache). |
| Invoice amounts | bookings + booking_cars | Browser `bookingMoney` → from server-returned DERIVED fields. |

No KPI table, counter column or stored total is proposed. At this size
(single business, hundreds of hires a year) every figure above is a cheap
query. If that changes, §8 says how to add a read model safely.

---

## 4. Database model and relationships

Existing tables stay; changes are additive migrations (v6+). New and changed
items are marked ✚.

```
users (drivers) ──< booking_cars.driver_id            FK, ON DELETE SET NULL  → ✚ RESTRICT (drivers are deactivated, never deleted)
bookings ─────────< booking_cars.booking_id           FK, ON DELETE CASCADE
bookings ─────────< ledger.booking_id                 FK, ON DELETE CASCADE   → ✚ RESTRICT (hires are cancelled, not deleted)
cars ─ ─ ─ ─ ─ ─ ─< booking_cars.car_id               no FK today            → ✚ FK RESTRICT once cars are archived, not deleted
cars ─ ─ ─ ─ ─ ─ ─< indirect_expenses.car_id          no FK today            → ✚ FK RESTRICT
cars ─ ─ ─ ─ ─ ─ ─< car_blocks.car_id                 no FK today            → ✚ FK RESTRICT
files.owner_type + owner_id                           polymorphic, checked in code (ownerExists)
```

| Change | Tag | Why |
| --- | --- | --- |
| ✚ `cars.archived_at timestamptz NULL` | AUTHORITATIVE | "Remove car" becomes *archive*. History, documents and FKs stay intact; archived cars disappear from pickers and the public page. |
| ✚ `users.status` already exists (active/inactive) — drop the ability to delete drivers | AUTHORITATIVE | The same principle as cars. |
| ✚ FKs above, after back-filling archived stub rows for any `car_id` that no longer exists | integrity | The database, not just code, prevents dangling references. |
| ✚ `bookings.deco_unit_cost integer` | SNAPSHOT | Flower price at the time of the hire. |
| ✚ `bookings.rate`, `deco_cost`, `total`, `balance` → replace with a view `booking_totals` (or `GENERATED ALWAYS` where the inputs live on the same row) | DERIVED | Removes stored duplicates (§13 #1). |
| ✚ `invoice_counters(year int PK, last int)` or a sequence per year | AUTHORITATIVE | Invoice numbers never reused. |
| ✚ `audit_log` (§10) | AUDIT/HISTORY | |
| ✚ `CHECK (status IN (...))` state-transition trigger on `bookings` | integrity | confirmed → cancelled is allowed; cancelled → anything is rejected (today enforced only in code). |
| Future `odometer_readings(id, car_id FK, reading_km, read_at, source, source_ref, recorded_by, created_at)` — append-only, `CHECK reading_km >= 0`, trigger rejecting a reading lower than the previous one for that car unless `source='correction'` | AUTHORITATIVE (if entered here) / EXTERNAL SOURCE (if telematics) | **UNKNOWN** requirement. Mileage totals are DERIVED from differences. |
| Future `fuel_transactions(id, car_id FK, booking_id FK NULL, litres, amount, station, paid_at, source, source_ref)` | AUTHORITATIVE / EXTERNAL SOURCE | **UNKNOWN**. When it exists, "Petrol" in `ledger` must stop being entered, or be written *only* as a projection of this table — never both by hand. |
| Future `payments(id, booking_id FK, amount, paid_at, method, source_ref)` | AUTHORITATIVE | **UNKNOWN**. Then `bookings.advance` becomes DERIVED (`SUM(payments)`). |
| Future `maintenance_schedules(car_id FK, kind, every_km, every_days)` | AUTHORITATIVE | **UNKNOWN**. "Service due" alerts DERIVED from it + odometer + last service. |
| Future `gps_positions(car_id, recorded_at, lat, lng, provider, received_at)` | EXTERNAL SOURCE | **UNKNOWN** (§11). |

---

## 5. Backend service boundaries

`lib/server/repo.ts` (≈950 lines today, one module for everything) splits into:

| Module | Writes | Reads it exposes (DERIVED) |
| --- | --- | --- |
| `domain/vehicles` | cars (create, edit, photo, archive) | fleet list with *current* status |
| `domain/drivers` | users (create, edit, activate/deactivate, password) | driver list; the driver's own hires |
| `domain/hires` | bookings + booking_cars (create, edit, cancel), invoice numbers | hire detail with money and status; invoice view model |
| `domain/availability` | car_blocks | slots, free gaps and state per car per day (admin and public variants) |
| `domain/finance` | ledger, indirect_expenses | hire money, period summary, per-vehicle expenses |
| `domain/documents` | files + S3 | document lists; expiry status |
| `domain/alerts` | nothing (read-only) | expiring documents, cars unavailable today, hires today without a driver, … |
| `domain/reports` | nothing (read-only) | Excel/PDF datasets for a period |
| `domain/audit` | audit_log (called by the others inside their transactions) | change history per entity |
| `domain/settings` | kv | settings |

Rules:

- A module writes only its own tables. When a hire needs a car, `hires` *reads*
  through `vehicles` and `availability`; it doesn't update `cars`.
- Cross-module invariants (a hire can't overlap a car block) are enforced in
  one transaction holding the per-car advisory lock (already done:
  `lockCars` in `repo.ts`).
- `lib/bridal/logic.ts` stays as **pure rule code** but moves to
  `lib/server/domain/rules.ts` (`server-only`). The browser must not import it
  to make decisions (§13 #2).

---

## 6. API data flow

```
request → auth (guard.ts: requireAdmin / requireDriver / public)
        → parse (zod schema)                       reject: 400/Result.error
        → domain function (transaction + lock + rules + audit)
        → database constraints                      reject: mapped to UserError
        → response DTO = authoritative fields + DERIVED fields, each typed
```

Every response DTO says which fields are which. Example `HireDTO`:

| Field | Tag |
| --- | --- |
| `id, invNo, date, type, customer, phone, address, deco, decoNotes, discount, advance, status, revision` | AUTHORITATIVE |
| `cars[].carName, rate, ownerCost` | SNAPSHOT |
| `cars[].pickupTime, dropTime, route, driverId` | AUTHORITATIVE |
| `money.{subtotal, total, balance, extraIncome, expenses, profit}` | DERIVED (server) |
| `displayStatus` (upcoming/today/completed/cancelled) | DERIVED (server, business time zone) |
| `asOf` (server timestamp) | metadata, lets the client know how old its CACHE is |

Mutations return the full updated DTO (with DERIVED fields recomputed), so the
client never has to calculate what changed.

Existing endpoints and their classification:

| Endpoint | Returns | Tag |
| --- | --- | --- |
| server actions in `admin-actions.ts` | mutated entity | AUTHORITATIVE fields (+ DERIVED once §3 is done) |
| `POST /api/admin/init` → `getAdminState` | whole admin snapshot | AUTHORITATIVE; the client holds it as a CACHE |
| `GET /api/availability` | public slots | DERIVED, public fields only (no reasons, customers, prices) |
| `GET /api/files/[id]` | file bytes | AUTHORITATIVE content, permission-checked |
| driver pages (server components) | driver's hires | DERIVED view of AUTHORITATIVE rows, rendered on the server — already correct |

---

## 7. Dashboard data flow

```
page load ─► GET snapshot (asOf) ─► store (CACHE) ─► render
user edits ─► server action(input, expectedRevision) ─► domain
            ◄─ updated DTO                  ─► replace the entry in CACHE
            ◄─ conflict / rule error        ─► show message, refetch the entity
tab regains focus (>30 s) ─► refetch snapshot   (exists today)
```

Allowed in the browser:

- formatting, sorting, filtering and searching cached data for display;
- **advisory** checks for fast feedback (e.g. "this time overlaps a hire"),
  but only by *asking the server*, or by clearly marking the check as a hint
  the server re-checks. The server's answer always wins.

Not allowed in the browser:

- deciding whether a car is free, a hire is completed or a document is
  expired, and acting on that decision;
- computing totals that are then shown as *the* figure (finance tiles,
  invoice totals, reports);
- writing anything to `localStorage` / IndexedDB other than UI preferences.

---

## 8. Caching / read-model strategy

**No materialized read model is needed now.** Every DERIVED value is a query
over at most a few thousand rows.

Caches that exist, and their rules:

| Cache | Tag | Refresh | Invalidation | Rebuild |
| --- | --- | --- | --- | --- |
| Dashboard store (`useBridal`) | CACHE | on load; on tab focus after 30 s; after each mutation (response replaces entry) | a conflict error → refetch that entity | reload the page |
| Public availability response | CACHE (browser, per month) | refetch when the month changes; `Cache-Control: no-store` | — | refetch |
| Car photos (`/api/files/[id]`) | CACHE (HTTP) | immutable per file id (a new photo = new id) | new id | n/a |

If a read model is ever needed (e.g. multi-year analytics), it must:

1. live in its own table named `rm_*`, tagged DERIVED in its migration comment;
2. be written only by a projector in `domain/*`, in the **same transaction** as
   the authoritative change, or by a job that records `rebuilt_at` and the
   source `max(updated_at)` it covers;
3. have a `rebuild()` function that truncates and recomputes it from
   authoritative tables, and a reconciliation check (§12) comparing both;
4. never be read by write paths (business rules read authoritative tables only).

---

## 9. Concurrency and transaction rules

| Rule | Today | Target |
| --- | --- | --- |
| Double-booking a car | `ex_car_slot` exclusion constraint + friendly check | keep |
| Hire vs car block race | per-car advisory lock (`lockCars`) in both paths | keep |
| Two car blocks overlapping | `ex_car_block` exclusion constraint | keep |
| Two admins edit the same hire | row lock `FOR UPDATE`, but **last write wins** | **optimistic concurrency:** the client sends `expectedRevision`; `UPDATE … WHERE id = $1 AND revision = $expected`; 0 rows → "This hire was changed by someone else. Reload to see the latest." |
| Two admins edit the same car / driver / settings | last write wins | ✚ `revision` column on `cars`, `users`, `kv`, with the same check |
| Invoice-number race | retry on unique violation | sequence/counter row locked in the transaction |
| Multi-row changes (hire + its cars; delete expense + its receipt) | hire: one transaction. Expense + receipt: two steps (row, then files/S3) | every multi-table change in **one DB transaction**; S3 deletes happen **after commit** (a failed S3 delete leaves an orphan object, found by §12, never a dangling row) |
| First-run import | `kv` row lock | keep, then retire (§14) |

---

## 10. Audit strategy

✚ `audit_log` — AUDIT/HISTORY, append-only:

```sql
CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  actor_role  text NOT NULL,          -- admin | driver | system | import
  actor_id    text NOT NULL,          -- 'admin' or users.id or integration name
  entity      text NOT NULL,          -- 'booking', 'car', 'car_block', …
  entity_id   text NOT NULL,
  action      text NOT NULL,          -- create | update | cancel | archive | delete | login …
  before      jsonb,                  -- authoritative fields before (NULL on create)
  after       jsonb,                  -- authoritative fields after  (NULL on delete)
  request_id  text                    -- ties several rows to one user action
);
REVOKE UPDATE, DELETE ON audit_log FROM app_role;   -- see note
```

- Written by the domain module **inside the same transaction** as the change,
  so there's never a change without its audit row (or the reverse).
- Stores AUTHORITATIVE fields only, never DERIVED values (they can be
  recomputed for any point in time from `after`).
- Audited: hire create/edit/cancel (with revision), car create/edit/archive,
  car blocks, ledger and indirect entries, document upload/delete, driver
  changes and activation, settings, logins and failed logins.
- Note: today the app connects as `neondb_owner`. To make the log
  tamper-resistant, the app should connect with a role without
  UPDATE/DELETE on `audit_log`. **UNKNOWN:** whether you want separate
  database roles.
- Gap to record honestly: the 2026-09-30 wipe of all hires happened before this
  existed. The only record is the JSON backup taken beforehand.
- Gap: the admin identity is a single shared login from `.env.local`, so
  `actor_id` can only say "admin". Named admin accounts are **UNKNOWN**.

---

## 11. External integration ownership rules

**None exist today.** No GPS, telematics, fuel-card, payment or accounting
system is named. These rules apply to any that are added:

| Question | Rule |
| --- | --- |
| 1. What originates externally | Declared per integration in `integrations/<name>.md` before building it. |
| 2. Who owns the raw data | The external system. We store an imported copy tagged EXTERNAL SOURCE, with `provider`, `provider_ref` (their id), `recorded_at` (their timestamp), `received_at` (ours), `raw jsonb`. |
| 3. What is imported | Only the fields needed, into a staging table `ext_<name>_*`, then projected into our tables by the owning domain module. |
| 4. Authority per field | Written down per field, e.g. GPS position → provider; which hire a trip belongs to → us; fuel litres → fuel-card provider; fuel cost *allocated to a hire* → us. We never overwrite an externally owned field by hand; corrections are a separate row with `source='correction'`. |
| 5. Conflicts | The externally owned field: provider wins, keyed by `(provider, provider_ref)` (idempotent upsert). Our field: ours wins. The same fact from two providers: an explicit priority list; the losing value is kept in `raw` for audit. |
| 6. Timestamps and sync status | `ext_sync_state(provider, last_success_at, last_attempt_at, last_error, cursor)`; UI shows "GPS last updated 12 min ago". |
| 7. Provider unavailable | Business operations never depend on it synchronously (bookings still work). Data shows as stale with its age; an alert is DERIVED from `last_success_at`; catch up from `cursor` when it returns. |

---

## 12. Data consistency and reconciliation

A `scripts/reconcile.mjs` (read-only; run daily and before any report) that
lists every violation and exits non-zero if there is one:

| Check | Query idea |
| --- | --- |
| Stored money totals match inputs (until §4 removes them) | `bookings.total <> rate + deco_cost − discount` or `balance <> greatest(0,total − advance)` |
| `bookings.rate = SUM(booking_cars.rate)` | group by booking |
| `booking_cars.hire_date/active` mirror their booking | join mismatch |
| No active slot overlaps a car block | `booking_cars.slot && tsrange(block)` |
| Every `car_id` reference exists (until FKs exist) | `booking_cars`, `indirect_expenses`, `car_blocks` anti-joins |
| `cars.image` ↔ `files(car_image)` agree | both directions |
| Every `files.s3_key` exists in S3, and every S3 object has a `files` row | list bucket vs table |
| `files.owner_id` points at an existing owner | per owner_type |
| Invoice numbers unique and not reused | gaps allowed, duplicates never |
| Audit coverage | every entity with `updated_at` after the audit rollout has a matching audit row |

Repairs are never automatic for AUTHORITATIVE data; the script reports and a
person decides. DERIVED/CACHE values are simply recomputed.

---

## 13. Incorrect implementations and their corrections

Numbers 1–8 are in this codebase today.

1. **Stored totals** — `bookings.total` and `balance` are saved at write time.
   If a later fix changes the discount rule, old rows and the new rule
   disagree. → Derive them in a view/generated column (§4). Only the inputs
   and SNAPSHOT prices are stored.
2. **Availability decided in the browser** — `booking-form.tsx`,
   `availability-view.tsx` and `landing-view.tsx` call `carSlotsOn` /
   `blocksOn` on cached data. Today the server re-checks on save, so no bad
   write gets in, but a stale tab can say "Free" when it isn't. → The server
   returns availability; the form asks the server as you type (debounced);
   the text says "checked at 10:42".
3. **Finance and reports from the cache** — Income & Expenses tiles, the
   History Excel file, the indirect Excel file and the vehicle PDF are built
   in the browser from whatever the tab loaded. → `GET finance/summary` and
   report endpoints; the browser renders the fresh response.
4. **Browser time zone for "today"** — `todayIso()` runs in the browser (18
   uses in `components/bridal`), while the server uses the business time zone.
   A laptop set to another zone disagrees about "today". → The server returns
   `businessToday` with every snapshot; the client never calls `new Date()` for
   business decisions.
5. **Hard deletes destroy history** — `removeCar` deletes the car row, its
   documents and its blocks; hires keep only a name snapshot, and indirect
   expenses keep a dangling `car_id`. → Archive (`archived_at`) instead; FKs
   `RESTRICT`.
6. **Two-way photo link** — `cars.image` and `files(owner_type='car_image')`
   both record "this car's photo". → Keep `files` as the owner of the link;
   derive the car's current photo as the newest car_image file (or keep
   `cars.image_file_id` as an FK and drop the owner fields for photos) — one,
   not both.
7. **Invoice number from `count(*)`** — after hires are deleted (as on
   2026-09-30), the next number can repeat one already printed. → A per-year
   counter row that only ever increases.
8. **Last write wins on edits** — two admins editing the same hire silently
   overwrite each other, even though `revision` exists. → Send and check
   `expectedRevision` (§9).
9. *(General)* **A dashboard counter table** such as
   `stats(total_vehicles, active_vehicles)` updated by the UI. It drifts the
   first time a write path forgets to update it. → A `COUNT(*)` query; if it
   ever gets slow, a DERIVED read model per §8.
10. *(General)* **"In maintenance" stored as `cars.status`** set by hand
    beside `car_blocks`. The two will disagree. → Status is DERIVED: "in
    repair now" = a block covering now.
11. *(General)* **Alerts table the dashboard marks "resolved"** — the
    document is still expired, but the alert is gone. → Alerts are DERIVED
    on every read. Only an acknowledgement (`alert_acks(alert_key, by, at)`,
    AUDIT/HISTORY) is stored, and it is ignored when the underlying fact
    changes.
12. *(General)* **The GPS provider's odometer copied into `cars.mileage`** and
    also edited by hand. → Readings are append-only rows with `source`; the
    current mileage is DERIVED (latest valid reading).

---

## 14. Practical implementation plan

Each phase ships on its own. Nothing changes what users see until the phase
says so.

**Phase 0 — guard rails (small)**
- Add `scripts/reconcile.mjs` (§12) and run it against production to get a
  baseline.
- Add an ESLint rule: no `pg`/`q(` imports outside `lib/server/**`, and no
  `lib/server/domain/rules` imports from client components.

**Phase 1 — history-safe data**
- Migration: `cars.archived_at`; "Remove car" → archive; back-fill, then add
  FKs from `booking_cars`, `indirect_expenses` and `car_blocks` to `cars`, with
  `RESTRICT`.
- Drivers: remove any delete path; deactivate only; FK `RESTRICT`.
- `ledger` FK → `RESTRICT`, since hires are cancelled, not deleted.
- Invoice counter table.
- Stop reading/writing the legacy `localStorage` key (keep the one-time
  import behind an explicit "import old data" button, or remove it).

**Phase 2 — audit**
- `audit_log` table plus `domain/audit.record(tx, …)`, called by every
  mutation.
- Log logins and failed logins.

**Phase 3 — derived values from the server**
- Split `repo.ts` into `domain/*` (§5); move `logic.ts` to a `server-only`
  module.
- DTOs with DERIVED fields (money, displayStatus, availability, expiry);
  `businessToday` in the snapshot.
- Dashboard screens switch from computing to displaying; the booking form
  asks `GET availability?car&date` for its hints.
- Finance summary and report endpoints; Excel/PDF built from a fresh response.

**Phase 4 — remove stored duplicates**
- Replace `bookings.rate/deco_cost/total/balance` with the `booking_totals`
  view (after reconcile shows zero mismatches); add `deco_unit_cost` SNAPSHOT.

**Phase 5 — concurrency**
- `revision` on cars/users/settings; `expectedRevision` on every update action
  with a clear conflict message.

**Phase 6 — only if the requirements are confirmed (UNKNOWN today)**
- Odometer readings, fuel transactions, payments, maintenance schedules,
  GPS/telematics — each as its own table with the ownership rules above,
  added one at a time.

**Decisions needed from you before building:**
1. Is a mobile client or notifications (SMS/WhatsApp/email) planned? That
   decides whether Phase 3's DTOs become a versioned public API.
2. Are odometer, fuel litres, maintenance schedules, GPS or payment records
   in scope, and from which providers?
3. Will there be more than one admin login (named accounts for the audit)?
4. How long must hires, receipts and audit rows be kept (legal/tax)?
5. Should hard delete exist at all (e.g. for GDPR-style customer removal),
   and if so, should it anonymize the hire instead of deleting it?
