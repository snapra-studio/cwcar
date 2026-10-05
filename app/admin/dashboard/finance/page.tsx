import { FinanceView } from "@/components/bridal/finance-view"

export default async function Page({ searchParams }: PageProps<"/admin/dashboard/finance">) {
  const { hire } = await searchParams
  const initialHireId = typeof hire === "string" ? hire : undefined
  // key remounts when opened from a different hire.
  return <FinanceView key={initialHireId} initialHireId={initialHireId} />
}
