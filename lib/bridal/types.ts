export type CarStyle = "sedan" | "vintage" | "suv"

// "own": our vehicles. "partner": rented in from another owner and hired out
// by us; we pay the owner `ownerCost` per hire.
export type Fleet = "own" | "partner"

export type Car = {
  id: string
  name: string
  color: string
  hex: string
  style: CarStyle
  plate: string
  rate: number
  // Photo URL (/api/files/<id>, stored in file storage). Falls back to CarArt.
  // A data URL is accepted when saving; the server moves it into storage.
  image?: string
  fleet?: Fleet
  ownerName?: string
  ownerPhone?: string
  ownerCost?: number
}

export const isPartner = (c: { fleet?: Fleet }) => c.fleet === "partner"

export type EventType = "Wedding" | "Homecoming"
export type Decoration = "artificial" | "fresh"

export type Stop = { time: string; loc: string }

export type Route = {
  pickupTime: string
  pickupLoc: string
  stops: Stop[]
  dropTime: string
  dropLoc: string
}

// A car on a booking, with the name, hire amount and route agreed at booking
// time. Each car in an order can run its own route.
// Partner cars also keep who owns them and what we pay the owner for this hire.
// Each car on a hire can have its own driver (users.id of a driver account).
export type BookedCar = Route & {
  carId: string
  carName: string
  rate: number
  fleet?: Fleet
  ownerName?: string
  ownerCost?: number
  driverId?: string
}

// A driver account as the admin sees it. The password hash never leaves the server.
export type DriverStatus = "active" | "inactive"

export type Driver = {
  id: string
  name: string
  email: string
  phone: string
  status: DriverStatus
  createdAt: string
}

export type Role = "admin" | "driver"

// Extra money in or out on a hire after it's booked (petrol, extra hours…),
// linked to the hire by its booking id (shown as the invoice number).
export type LedgerKind = "income" | "expense"

export type LedgerEntry = {
  id: string
  bookingId: string
  kind: LedgerKind
  category: string
  note: string
  amount: number
  date: string
  createdAt: string
}

// Business costs not tied to one hire (overheads). carId optionally names
// the vehicle it was for; carName is kept even if the car is later removed.
export type IndirectExpense = {
  id: string
  date: string
  category: string
  carId?: string
  carName: string
  note: string
  amount: number
  createdAt: string
}

export const INDIRECT_CATEGORIES = [
  "Vehicle service",
  "Vehicle finance / lease",
  "Car wash",
  "Decoration cloths & flowers",
  "Fuel (not for a hire)",
  "Repairs & parts",
  "Insurance & licence",
  "Driver salary",
  "Other",
]

// A period a car can't be hired (repair, service…). start/end are local
// "YYYY-MM-DDTHH:MM"; end is exclusive, so a whole day ends at next 00:00.
// Customers only see "not available due to an unavoidable reason".
export type CarBlock = {
  id: string
  carId: string
  carName: string
  start: string
  end: string
  reason: string
  note: string
  createdAt: string
}

export const BLOCK_REASONS = ["Repair", "Service / maintenance", "Accident", "Owner needs the car", "Other"]

export const EXPENSE_CATEGORIES = ["Petrol", "Driver", "Toll & parking", "Decoration", "Repairs", "Other"]
export const INCOME_CATEGORIES = ["Extra hours", "Extra kilometres", "Waiting charge", "Decoration", "Other"]

export type Booking = {
  id: string
  invNo: string
  createdAt: string
  // Bumped each time the order is edited, so re-issued invoices are told
  // apart (1 = original invoice).
  revision?: number
  updatedAt?: string
  status: "confirmed" | "cancelled"
  date: string
  cars: BookedCar[]
  type: EventType
  customer: string
  phone: string
  address: string
  deco: Decoration
  // Customer's extra decoration requests ("white and pink flowers…").
  decoNotes: string
  // Sum of every car's hire amount.
  rate: number
  // Fresh flowers for every car on the booking.
  decoCost: number
  // Discount in LKR taken off the subtotal (rate + decoCost).
  discount: number
  // Final total after the discount: rate + decoCost - discount.
  total: number
  advance: number
  // total - advance (never below 0).
  balance: number
}

export type BookingInput = Omit<
  Booking,
  "id" | "invNo" | "createdAt" | "status" | "revision" | "updatedAt"
>

export type Settings = {
  bizName: string
  bizPhone: string
  bizAddr: string
  bizEmail: string
  bankBranch: string
  accountNo: string
  accountName: string
  // Landing page photo URL (/api/files/<id>). Falls back to a fleet photo.
  coverImage?: string
  // Background video on the public availability page (/api/files/<id>),
  // and where it came from: uploaded by the admin, the newest Facebook reel,
  // or switched off (no video, don't fetch one).
  coverVideo?: string
  coverVideoFrom?: "upload" | "facebook" | "none"
}

// ---- Uploaded files (stored in S3-compatible storage) ----------------------

// What a document is attached to. Car photos and the landing photo are
// handled separately (they're public and replace each other).
export type DocOwner = "booking" | "ledger" | "car_doc" | "driver_doc" | "indirect"

export type FileMeta = {
  id: string
  ownerType: DocOwner | "car_image" | "cover" | "cover_video"
  ownerId: string
  docType: string
  expiresOn?: string
  fileName: string
  contentType: string
  size: number
  uploadedAt: string
  // Where the browser fetches it (permission-checked): /api/files/<id>
  url: string
}

// Document kinds offered for each owner. Those with `expires` ask for an
// expiry date so the app can warn before it runs out.
export const DOC_TYPES: Record<DocOwner, { label: string; expires?: boolean }[]> = {
  booking: [{ label: "Agreement" }, { label: "Customer ID" }, { label: "Payment slip" }, { label: "Other" }],
  ledger: [{ label: "Receipt" }],
  indirect: [{ label: "Receipt" }],
  car_doc: [
    { label: "Insurance", expires: true },
    { label: "Revenue licence", expires: true },
    { label: "Emission test", expires: true },
    { label: "Registration (CR)" },
    { label: "Other", expires: true },
  ],
  driver_doc: [{ label: "Driving licence", expires: true }, { label: "NIC" }, { label: "Other", expires: true }],
}

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024
// The public page's background video (a short, compressed clip).
export const MAX_VIDEO_BYTES = 40 * 1024 * 1024
