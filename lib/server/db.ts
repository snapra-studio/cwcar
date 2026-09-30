import "server-only"

import { mkdirSync } from "node:fs"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"

// SQLite database (Node's built-in driver, no native install). One file, by
// default ./data/cwcar.db; set DATABASE_PATH to move it.
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
// unique index ux_car_day can refuse a double-booking at the database level.

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone         TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'driver' CHECK (role IN ('driver')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cars (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL,
  hex         TEXT NOT NULL,
  style       TEXT NOT NULL CHECK (style IN ('sedan', 'vintage', 'suv')),
  plate       TEXT NOT NULL DEFAULT '',
  rate        INTEGER NOT NULL,
  image       TEXT,
  fleet       TEXT NOT NULL DEFAULT 'own' CHECK (fleet IN ('own', 'partner')),
  owner_name  TEXT,
  owner_phone TEXT,
  owner_cost  INTEGER
);

CREATE TABLE IF NOT EXISTS bookings (
  id         TEXT PRIMARY KEY,
  inv_no     TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  revision   INTEGER NOT NULL DEFAULT 1,
  status     TEXT NOT NULL CHECK (status IN ('confirmed', 'cancelled')),
  date       TEXT NOT NULL,
  type       TEXT NOT NULL,
  customer   TEXT NOT NULL,
  phone      TEXT NOT NULL,
  address    TEXT NOT NULL DEFAULT '',
  deco       TEXT NOT NULL CHECK (deco IN ('artificial', 'fresh')),
  rate       INTEGER NOT NULL,
  deco_cost  INTEGER NOT NULL,
  total      INTEGER NOT NULL,
  advance    INTEGER NOT NULL,
  balance    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_bookings_date ON bookings (date);

CREATE TABLE IF NOT EXISTS booking_cars (
  booking_id  TEXT NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  car_id      TEXT NOT NULL,
  car_name    TEXT NOT NULL,
  rate        INTEGER NOT NULL,
  fleet       TEXT,
  owner_name  TEXT,
  owner_cost  INTEGER,
  driver_id   TEXT REFERENCES users (id) ON DELETE SET NULL,
  pickup_time TEXT NOT NULL,
  pickup_loc  TEXT NOT NULL,
  stops       TEXT NOT NULL DEFAULT '[]',
  drop_time   TEXT NOT NULL,
  drop_loc    TEXT NOT NULL,
  hire_date   TEXT NOT NULL,
  active      INTEGER NOT NULL,
  PRIMARY KEY (booking_id, position)
);
CREATE INDEX IF NOT EXISTS ix_booking_cars_driver ON booking_cars (driver_id, hire_date);
CREATE UNIQUE INDEX IF NOT EXISTS ux_car_day ON booking_cars (car_id, hire_date) WHERE active = 1;

CREATE TABLE IF NOT EXISTS ledger (
  id         TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
  category   TEXT NOT NULL,
  note       TEXT NOT NULL DEFAULT '',
  amount     INTEGER NOT NULL CHECK (amount > 0),
  date       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_ledger_booking ON ledger (booking_id);

CREATE TABLE IF NOT EXISTS kv (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

function open() {
  const file = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "cwcar.db")
  mkdirSync(path.dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec(SCHEMA)
  return db
}

// One connection per server process; kept on globalThis so dev hot reloads
// don't open a new one each time.
const g = globalThis as unknown as { __cwcarDb?: DatabaseSync }
export const db = (g.__cwcarDb ??= open())

// Runs fn inside a write transaction; rolls back if it throws.
export function tx<T>(fn: () => T): T {
  db.exec("BEGIN IMMEDIATE")
  try {
    const out = fn()
    db.exec("COMMIT")
    return out
  } catch (err) {
    db.exec("ROLLBACK")
    throw err
  }
}
