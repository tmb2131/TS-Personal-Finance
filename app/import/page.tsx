import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CsvImportFlow } from '@/components/import/csv-upload'
import { SourceHealthPanel } from '@/components/ingestion/source-health-panel'

interface ImportPageProps {
  searchParams?: Promise<{ target?: string | string[] }>
}

const IMPORT_TARGETS = new Set(['transactions', 'account_balances', 'recurring_payments'] as const)

export default async function ImportPage({ searchParams }: ImportPageProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const resolvedParams = searchParams ? await searchParams : undefined

  const rawTarget = resolvedParams?.target
  const candidate = Array.isArray(rawTarget) ? rawTarget[0] : rawTarget
  const initialTarget = IMPORT_TARGETS.has((candidate as any) ?? '')
    ? (candidate as 'transactions' | 'account_balances' | 'recurring_payments')
    : 'transactions'

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="rounded-xl border bg-muted/30 p-4 md:p-5">
        <h1 className="text-2xl md:text-3xl font-bold">Import CSV Data</h1>
        <p className="mt-2 text-sm md:text-base text-muted-foreground">
          Load native data into Findash without maintaining a live spreadsheet.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border bg-background px-2.5 py-1 font-medium">Bulk source: CSV</span>
          <span className="rounded-full border bg-background px-2.5 py-1 font-medium">Works for transactions, balances, recurring</span>
          <span className="rounded-full border bg-background px-2.5 py-1 font-medium">Feeds the same forecast pipeline</span>
        </div>
      </div>
      <SourceHealthPanel
        title="Before you import"
        description="Check which datasets already exist so you can decide whether to append, review, or backfill with CSV."
      />
      <CsvImportFlow initialTarget={initialTarget} />
    </div>
  )
}
