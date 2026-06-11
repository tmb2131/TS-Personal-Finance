import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SettingsForm } from '@/components/settings/settings-form'
import { AppearanceForm } from '@/components/settings/appearance-form'
import { CategoryPlanningSection } from '@/components/settings/category-planning-section'
import { FinancialAssumptionsSection } from '@/components/settings/financial-assumptions-section'
import { PageHeader } from '@/components/ui/page-header'

export default async function SettingsPage() {
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

  return (
    <div className="space-y-4 md:space-y-6">
      <PageHeader
        title="Settings"
        description="Preferences, data sources, category planning, and appearance."
        accent="slate"
      />
      <nav className="flex flex-wrap gap-x-4 gap-y-1 -mt-2 text-sm" aria-label="Settings sections">
        <a href="#google-sheet" className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">
          Data sources
        </a>
        <a href="#category-planning" className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">
          Category Planning
        </a>
        <a href="#financial-assumptions" className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">
          Financial Assumptions
        </a>
        <a href="#appearance" className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">
          Appearance
        </a>
      </nav>
      <SettingsForm
        initialSpreadsheetId={profile?.google_spreadsheet_id ?? ''}
        initialDisplayName={profile?.display_name ?? ''}
        initialDefaultCurrency={defaultCurrency}
        serviceAccountEmail={process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? ''}
      />
      <CategoryPlanningSection />
      <FinancialAssumptionsSection />
      <AppearanceForm />
    </div>
  )
}
