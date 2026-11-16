import { HistoryView } from "@/components/bridal/history-view"
import { staffPage } from "@/lib/server/guard"

export default async function Page() {
  await staffPage()
  return <HistoryView />
}
