import { SummaryPageContent } from '@/components/summary/summary-page-content'

export const metadata = {
  title: 'Daily Summary',
}

export default function SummaryPage() {
  return (
    <div className="space-y-4 md:space-y-6">
      <SummaryPageContent />
    </div>
  )
}
