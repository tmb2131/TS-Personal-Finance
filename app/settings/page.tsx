import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SettingsForm } from '@/components/settings/settings-form'
import { AppearanceForm } from '@/components/settings/appearance-form'

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
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Settings</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Connect your Google Sheet and preferences
        </p>
      </div>
      <SettingsForm
        initialSpreadsheetId={profile?.google_spreadsheet_id ?? ''}
        initialDisplayName={profile?.display_name ?? ''}
        initialDefaultCurrency={defaultCurrency}
        serviceAccountEmail={process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? ''}
      />
      <AppearanceForm />
    </div>
  )
}
