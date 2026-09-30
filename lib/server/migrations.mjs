// PostgreSQL schema, as numbered migrations. Plain JavaScript so both the app
// (lib/server/db.ts) and scripts/migrate-sqlite-to-postgres.mjs can run them.
// Never edit a migration that has shipped; add a new one instead.
//
// Tables
//   users          driver accounts (the admin signs in with .env.local credentials)
//   cars           vehicle catalogue (own + partner fleet)
//   bookings       hires; bookings.inv_no is the hire/invoice number
//   booking_cars   cars on a hire, each with its own route, amount and driver
//   ledger         extra income / expenses per hire
//   kv             settings and one-off flags
//
// booking_cars.car_id is deliberately not a foreign key: a car can be removed
// from the catalogue while old hires keep its name (car_name snapshot).
// booking_cars.hire_date + active mirror the parent booking so the partial
// unique index ux_car_day refuses a double-booking at the database level.

/** @type {{ version: number, name: string, sql: string }[]} */
export const MIGRATIONS = [
  {
    version: 1,
    name: "initial schema",
    sql: `
CREATE TABLE users (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  email         text NOT NULL,
  phone         text NOT NULL DEFAULT '',
  role          text NOT NULL DEFAULT 'driver' CHECK (role IN ('driver')),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_users_email ON users (lower(email));

CREATE TABLE cars (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  color       text NOT NULL,
  hex         text NOT NULL,
  style       text NOT NULL CHECK (style IN ('sedan', 'vintage', 'suv')),
  plate       text NOT NULL DEFAULT '',
  rate        integer NOT NULL CHECK (rate >= 0),
  image       text,
  fleet       text NOT NULL DEFAULT 'own' CHECK (fleet IN ('own', 'partner')),
  owner_name  text,
  owner_phone text,
  owner_cost  integer CHECK (owner_cost >= 0)
);

CREATE TABLE bookings (
  id         text PRIMARY KEY,
  inv_no     text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  revision   integer NOT NULL DEFAULT 1,
  status     text NOT NULL CHECK (status IN ('confirmed', 'cancelled')),
  date       date NOT NULL,
  type       text NOT NULL CHECK (type IN ('Wedding', 'Homecoming')),
  customer   text NOT NULL,
  phone      text NOT NULL,
  address    text NOT NULL DEFAULT '',
  deco       text NOT NULL CHECK (deco IN ('artificial', 'fresh')),
  rate       integer NOT NULL CHECK (rate >= 0),
  deco_cost  integer NOT NULL CHECK (deco_cost >= 0),
  total      integer NOT NULL CHECK (total >= 0),
  advance    integer NOT NULL CHECK (advance >= 0),
  balance    integer NOT NULL CHECK (balance >= 0)
);
CREATE INDEX ix_bookings_date ON bookings (date);

CREATE TABLE booking_cars (
  booking_id  text NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
  position    integer NOT NULL,
  car_id      text NOT NULL,
  car_name    text NOT NULL,
  rate        integer NOT NULL CHECK (rate >= 0),
  fleet       text CHECK (fleet IN ('own', 'partner')),
  owner_name  text,
  owner_cost  integer CHECK (owner_cost >= 0),
  driver_id   text REFERENCES users (id) ON DELETE SET NULL,
  pickup_time text NOT NULL,
  pickup_loc  text NOT NULL,
  stops       jsonb NOT NULL DEFAULT '[]',
  drop_time   text NOT NULL,
  drop_loc    text NOT NULL,
  hire_date   date NOT NULL,
  active      boolean NOT NULL,
  PRIMARY KEY (booking_id, position)
);
CREATE INDEX ix_booking_cars_driver ON booking_cars (driver_id, hire_date);
CREATE INDEX ix_booking_cars_day ON booking_cars (hire_date) WHERE active;
CREATE UNIQUE INDEX ux_car_day ON booking_cars (car_id, hire_date) WHERE active;

CREATE TABLE ledger (
  id         text PRIMARY KEY,
  booking_id text NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('income', 'expense')),
  category   text NOT NULL,
  note       text NOT NULL DEFAULT '',
  amount     integer NOT NULL CHECK (amount > 0),
  date       date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_ledger_booking ON ledger (booking_id);

CREATE TABLE kv (
  key   text PRIMARY KEY,
  value text NOT NULL
);
`,
  },
  {
    version: 2,
    name: "uploaded files",
    // Files live in S3-compatible storage (see lib/server/storage.ts); this
    // table records what each one is and who it belongs to.
    //   owner_type   car_image / cover  public photos (fleet, landing page)
    //                booking            hire files (agreement, ID copy, slips)
    //                ledger             expense receipts
    //                car_doc            vehicle papers (insurance, licence…)
    //                driver_doc         driver papers (licence, NIC…)
    // owner_id points at cars / bookings / ledger / users by owner_type, so it
    // can't be a single foreign key; lib/server/repo.ts removes files with
    // their owner.
    sql: `
CREATE TABLE files (
  id           text PRIMARY KEY,
  owner_type   text NOT NULL CHECK (owner_type IN ('car_image', 'cover', 'booking', 'ledger', 'car_doc', 'driver_doc')),
  owner_id     text,
  doc_type     text NOT NULL DEFAULT '',
  expires_on   date,
  s3_key       text NOT NULL UNIQUE,
  file_name    text NOT NULL,
  content_type text NOT NULL,
  size         integer NOT NULL CHECK (size > 0),
  uploaded_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_files_owner ON files (owner_type, owner_id);
`,
  },
  {
    version: 3,
    name: "time-based availability, discount, decoration notes",
    // A car used to be blocked for the whole day by any active hire. Now it is
    // blocked only for the hire's time slot (pick-up to drop-off), so several
    // hires can share a day if their times don't overlap.
    //
    // booking_slot() turns the stored date + "HH:MM" times into a timestamp
    // range. New hires always end after they start (validated); older hires
    // whose drop-off time is earlier than pick-up ran past midnight, so their
    // slot ends the next day. A missing time blocks the rest of the day.
    // Ranges are half-open [start, end), so 8-10 and 10-13 don't clash.
    //
    // ex_car_slot (an exclusion constraint) replaces ux_car_day: the database
    // itself refuses two active hires of the same car with overlapping slots,
    // even if two saves race each other.
    sql: `
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE FUNCTION booking_slot(d date, s text, e text) RETURNS tsrange
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN s !~ '^[0-9]{2}:[0-9]{2}$' THEN tsrange(d::timestamp, (d + 1)::timestamp)
    WHEN e !~ '^[0-9]{2}:[0-9]{2}$' THEN tsrange(d + s::time, (d + 1)::timestamp)
    WHEN e::time > s::time THEN tsrange(d + s::time, d + e::time)
    ELSE tsrange(d + s::time, (d + 1) + e::time)
  END
$$;

ALTER TABLE booking_cars
  ADD COLUMN slot tsrange GENERATED ALWAYS AS (booking_slot(hire_date, pickup_time, drop_time)) STORED;

DROP INDEX ux_car_day;
ALTER TABLE booking_cars
  ADD CONSTRAINT ex_car_slot EXCLUDE USING gist (car_id WITH =, slot WITH &&) WHERE (active);

ALTER TABLE bookings
  ADD COLUMN discount integer NOT NULL DEFAULT 0 CHECK (discount >= 0),
  ADD COLUMN deco_notes text NOT NULL DEFAULT '';
`,
  },
  {
    version: 4,
    name: "indirect expenses",
    // Business costs not tied to one hire: vehicle services, car washes,
    // decoration cloths and flowers, and so on. car_id optionally says which
    // vehicle it was for; like booking_cars it isn't a foreign key, so the
    // record (and car_name snapshot) survives the car being removed.
    // Receipts attach through the files table as owner_type 'indirect'.
    sql: `
CREATE TABLE indirect_expenses (
  id         text PRIMARY KEY,
  date       date NOT NULL,
  category   text NOT NULL,
  car_id     text,
  car_name   text NOT NULL DEFAULT '',
  note       text NOT NULL DEFAULT '',
  amount     integer NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_indirect_expenses_date ON indirect_expenses (date);

ALTER TABLE files DROP CONSTRAINT files_owner_type_check;
ALTER TABLE files ADD CONSTRAINT files_owner_type_check
  CHECK (owner_type IN ('car_image', 'cover', 'booking', 'ledger', 'car_doc', 'driver_doc', 'indirect'));
`,
  },
]

// Applies any migrations not yet recorded. `client` is a connected pg client.
// An advisory lock makes concurrent server starts wait for each other.
export async function migrate(client) {
  await client.query("BEGIN")
  try {
    await client.query("SELECT pg_advisory_xact_lock(4242001)")
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, name text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())"
    )
    const { rows } = await client.query("SELECT version FROM schema_migrations")
    const done = new Set(rows.map((r) => r.version))
    for (const m of MIGRATIONS) {
      if (done.has(m.version)) continue
      await client.query(m.sql)
      await client.query("INSERT INTO schema_migrations (version, name) VALUES ($1, $2)", [m.version, m.name])
    }
    await client.query("COMMIT")
  } catch (err) {
    await client.query("ROLLBACK")
    throw err
  }
}
