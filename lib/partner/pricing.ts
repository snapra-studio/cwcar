// Partner (B2B) hire pricing and commission — pure functions, run on the
// server for every estimate, submission and approval. Nothing here is
// hard-coded per car: rates and commission amounts come from the database.
//
// Packages by hire duration (pick-up to drop-off):
//   up to 4 h        -> rate_4h
//   over 4 to 8 h    -> rate_8h
//   over 8 to 12 h   -> rate_12h
//   over 12 h        -> base_over_12h + each started hour after 12 × hourly_over_12h
// Commission = a fixed LKR amount per hire (never more than the total);
// net = total − commission.

export type PartnerRates = {
  rate4h: number | null
  rate8h: number | null
  rate12h: number | null
  baseOver12h: number | null
  hourlyOver12h: number | null
}

export type Tier = "upto4" | "upto8" | "upto12" | "over12"

export const TIER_LABEL: Record<Tier, string> = {
  upto4: "Up to 4 hours package",
  upto8: "4 to 8 hours package",
  upto12: "8 to 12 hours package",
  over12: "Above 12 hours (base rate + extra hours)",
}

// The quote saved with each inquiry (a snapshot: later price or commission
// changes never alter it).
export type Quote = {
  quoteNo: string
  durationMinutes: number
  tier: Tier
  tierLabel: string
  hireCharge: number
  extraHours: number
  extraHourly: number
  extraCharge: number
  total: number
  commissionEnabled: boolean
  // Fixed LKR commission. Quotes made before fixed amounts have
  // commissionPercent instead.
  commissionAmount?: number
  commissionPercent?: number
  commissionSource: "partner" | "vehicle" | "default" | "off"
  commission: number
  net: number
  ratesUsed: PartnerRates
  calculatedAt: string
}

export const toMin = (t: string) => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(t)
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN
}

export function durationMinutes(pickup: string, drop: string) {
  const d = toMin(drop) - toMin(pickup)
  return Number.isNaN(d) ? NaN : d
}

export function fmtDuration(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return [h && `${h} hour${h === 1 ? "" : "s"}`, m && `${m} min`].filter(Boolean).join(" ") || "0 min"
}

export function tierFor(minutes: number): Tier {
  if (minutes <= 240) return "upto4"
  if (minutes <= 480) return "upto8"
  if (minutes <= 720) return "upto12"
  return "over12"
}

// Is there a price for this duration? (The admin may not have set every tier.)
export function canPrice(rates: PartnerRates | null | undefined, minutes: number) {
  if (!rates || !(minutes > 0)) return false
  const t = tierFor(minutes)
  if (t === "upto4") return rates.rate4h != null
  if (t === "upto8") return rates.rate8h != null
  if (t === "upto12") return rates.rate12h != null
  return rates.baseOver12h != null && rates.hourlyOver12h != null
}

export function priceHire(rates: PartnerRates, minutes: number) {
  const tier = tierFor(minutes)
  if (!canPrice(rates, minutes)) throw new Error("No partner rate for this duration")
  if (tier === "over12") {
    const extraHours = Math.ceil((minutes - 720) / 60)
    const extraHourly = rates.hourlyOver12h!
    const hireCharge = rates.baseOver12h!
    return { tier, hireCharge, extraHours, extraHourly, extraCharge: extraHours * extraHourly }
  }
  const hireCharge = tier === "upto4" ? rates.rate4h! : tier === "upto8" ? rates.rate8h! : rates.rate12h!
  return { tier, hireCharge, extraHours: 0, extraHourly: 0, extraCharge: 0 }
}

export function commissionFor(total: number, amount: number, enabled: boolean) {
  const commission = enabled ? Math.min(total, Math.max(0, Math.round(amount))) : 0
  return { commission, net: total - commission }
}

// "fixed amount", "15%" (older quotes) or "not applied".
export function commissionLabel(q: Pick<Quote, "commissionEnabled" | "commissionAmount" | "commissionPercent">) {
  if (!q.commissionEnabled) return "not applied"
  return q.commissionAmount == null && q.commissionPercent != null ? `${q.commissionPercent}%` : "fixed amount"
}

export function buildQuote(input: {
  quoteNo: string
  rates: PartnerRates
  minutes: number
  commission: { enabled: boolean; amount: number; source: Quote["commissionSource"] }
}): Quote {
  const p = priceHire(input.rates, input.minutes)
  const total = p.hireCharge + p.extraCharge
  const c = commissionFor(total, input.commission.amount, input.commission.enabled)
  return {
    quoteNo: input.quoteNo,
    durationMinutes: input.minutes,
    tier: p.tier,
    tierLabel: TIER_LABEL[p.tier],
    hireCharge: p.hireCharge,
    extraHours: p.extraHours,
    extraHourly: p.extraHourly,
    extraCharge: p.extraCharge,
    total,
    commissionEnabled: input.commission.enabled,
    commissionAmount: c.commission,
    commissionSource: input.commission.enabled ? input.commission.source : "off",
    commission: c.commission,
    net: c.net,
    ratesUsed: input.rates,
    calculatedAt: new Date().toISOString(),
  }
}
