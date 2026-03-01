import { SummaryPageContent } from '@/components/summary/summary-page-content'

export const metadata = {
  title: 'Daily Summary',
}

export default function SummaryPage() {
  return (
    <div className="flex h-full flex-col p-4 sm:p-6">
      <SummaryPageContent />
    </div>
  )
}
