'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { useCurrency } from '@/lib/contexts/currency-context'

type CurrencyOption = 'USD' | 'GBP'

interface SettingsFormProps {
  initialSpreadsheetId: string
  initialDisplayName: string
  initialDefaultCurrency: CurrencyOption
}

export function SettingsForm({ initialSpreadsheetId, initialDisplayName, initialDefaultCurrency }: SettingsFormProps) {
  const [spreadsheetId, setSpreadsheetId] = useState(initialSpreadsheetId)
  const [displayName, setDisplayName] = useState(initialDisplayName)
  const [defaultCurrency, setDefaultCurrency] = useState<CurrencyOption>(initialDefaultCurrency)
  const [saving, setSaving] = useState(false)
  const { setCurrency } = useCurrency()

  const handleSave = async () => {
    setSaving(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast.error('Not signed in')
        return
      }
      const { error } = await supabase
        .from('user_profiles')
        .update({
          google_spreadsheet_id: spreadsheetId.trim() || null,
          display_name: displayName.trim() || null,
          default_currency: defaultCurrency,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)
      if (error) {
        toast.error(error.message)
        return
      }
      toast.success('Settings saved')
      setCurrency(defaultCurrency)
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('currency', defaultCurrency)
      }

      const savedSpreadsheetId = spreadsheetId.trim()
      if (savedSpreadsheetId) {
        toast.info('Syncing data from your sheet…')
        const response = await fetch('/api/sync', { method: 'POST' })
        const result = await response.json().catch(() => ({}))
        if (response.ok && result.success) {
          toast.success('Data synced successfully')
          window.location.reload()
        } else if (!response.ok) {
          toast.error(result.error || 'Sync failed')
        } else {
          toast.warning(result.error || 'Sync completed with errors')
        }
      }
    } catch (e) {
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect your Google Sheet</CardTitle>
        <CardDescription>
          Paste your Google Spreadsheet ID so the app can sync your data. Find it in the sheet URL:
          https://docs.google.com/spreadsheets/d/<strong>SPREADSHEET_ID</strong>/edit
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="spreadsheet-id">Google Spreadsheet ID</Label>
          <Input
            id="spreadsheet-id"
            placeholder="e.g. 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
            value={spreadsheetId}
            onChange={(e) => setSpreadsheetId(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="display-name">Display name (optional)</Label>
          <Input
            id="display-name"
            placeholder="e.g. Family budget"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="default-currency">Default currency</Label>
          <select
            id="default-currency"
            value={defaultCurrency}
            onChange={(e) => setDefaultCurrency(e.target.value as CurrencyOption)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="USD">$ USD</option>
            <option value="GBP">£ GBP</option>
          </select>
          <p className="text-xs text-muted-foreground">
            Currency the app opens with when you log in. New users default to USD.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving & syncing…' : 'Save'}
        </Button>
      </CardContent>
    </Card>
  )
}
