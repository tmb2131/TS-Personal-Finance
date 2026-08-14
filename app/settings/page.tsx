import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SettingsForm } from '@/components/settings/settings-form'
import { AppearanceForm } from '@/components/settings/appearance-form'
import { CategoryPlanningSection } from '@/components/settings/category-planning-section'
import { FinancialAssumptionsSection } from '@/components/settings/financial-assumptions-section'
import { AccountActions } from '@/components/settings/account-actions'
import { CsvImportFlow } from '@/components/import/csv-upload'
import { SourceHealthPanel } from '@/components/ingestion/source-health-panel'
import { SectionNav } from '@/components/nav/section-nav'
import { HashScroll } from '@/components/nav/hash-scroll'
import { PageHeader } from '@/components/ui/page-header'

export const metadata = {
  title: 'Settings',
}

interface SettingsPageProps {
  searchParams?: Promise<{ target?: string | string[] }>
}

const IMPORT_TARGETS = new Set(['transactions', 'account_balances', 'recurring_payments'] as const)

const SECTIONS = [
  { id: 'google-sheet', label: 'Data sources' },
  { id: 'import', label: 'Import' },
  { id: 'category-planning', label: 'Category planning' },
  { id: 'financial-assumptions', label: 'Assumptions' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'account', label: 'Account' },
]

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('google_spreadsheet_id, display_name, default_currency')
    .eq('id', user.id)
    .single()

  const defaultCurrency = profile?.default_currency === 'GBP' ? 'GBP' : 'USD'

  // Preserved from the retired /import?target=... deep links.
  const resolvedParams = searchParams ? await searchParams : undefined
  const rawTarget = resolvedParams?.target
  const candidate = Array.isArray(rawTarget) ? rawTarget[0] : rawTarget
  const initialTarget = IMPORT_TARGETS.has((candidate as any) ?? '')
    ? (candidate as 'transactions' | 'account_balances' | 'recurring_payments')
    : 'transactions'

  return (
    <div className="space-y-4 md:space-y-6">
      <HashScroll />
      <PageHeader
        title="Settings"
        description="Data sources, import, category planning, assumptions, and appearance."
      />

      <SectionNav sections={SECTIONS} />

      <SettingsForm
        initialSpreadsheetId={profile?.google_spreadsheet_id ?? ''}
        initialDisplayName={profile?.display_name ?? ''}
        initialDefaultCurrency={defaultCurrency}
        serviceAccountEmail={process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? ''}
      />

      <section id="import" className="scroll-mt-24 border-t pt-4 md:pt-6 space-y-4 md:space-y-6">
        <div className="space-y-1">
          <h2 className="text-title">Import CSV data</h2>
          <p className="text-body text-muted-foreground">
            Load transactions, balances, or recurring payments without maintaining a live
            spreadsheet. Feeds the same forecast pipeline as the sheet sync.
          </p>
        </div>
        <SourceHealthPanel
          title="Before you import"
          description="Check which datasets already exist so you can decide whether to append, review, or backfill with CSV."
        />
        <CsvImportFlow initialTarget={initialTarget} />
      </section>

      <CategoryPlanningSection />
      <FinancialAssumptionsSection />
      <AppearanceForm />
      <AccountActions />
    </div>
  )
}
