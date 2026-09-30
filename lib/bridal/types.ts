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
  // Photo as a data URL (uploaded) or any image URL. Falls back to CarArt.
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
  // Sum of every car's hire amount.
  rate: number
  // Fresh flowers for every car on the booking.
  decoCost: number
  total: number
  advance: number
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
  // Landing page photo (data URL). Falls back to a fleet photo.
  coverImage?: string
}
