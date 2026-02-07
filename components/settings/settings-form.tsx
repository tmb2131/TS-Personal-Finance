'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { useCurrency } from '@/lib/contexts/currency-context'
import { ExternalLink, Copy } from 'lucide-react'

const TEMPLATE_SHEET_ID = '1LsbT4ahDlq7Lyf04d5nyr4bsjqmkDq-kqQoA2t66Kgg'
const TEMPLATE_COPY_URL = `https://docs.google.com/spreadsheets/d/${TEMPLATE_SHEET_ID}/copy`

type CurrencyOption = 'USD' | 'GBP'

interface SettingsFormProps {
  initialSpreadsheetId: string
  initialDisplayName: string
  initialDefaultCurrency: CurrencyOption
  serviceAccountEmail: string
}

export function SettingsForm({ initialSpreadsheetId, initialDisplayName, initialDefaultCurrency, serviceAccountEmail }: SettingsFormProps) {
  const [copiedEmail, setCopiedEmail] = useState(false)

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

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(serviceAccountEmail)
      setCopiedEmail(true)
      toast.success('Service account email copied')
      setTimeout(() => setCopiedEmail(false), 2000)
    } catch {
      toast.error('Failed to copy email')
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Get Started with Google Sheets</CardTitle>
          <CardDescription>
            Don&apos;t have a spreadsheet yet? Copy our template to your Google Drive, then paste the new spreadsheet ID below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button asChild variant="outline">
              <a
                href={TEMPLATE_COPY_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Copy Template to My Drive
              </a>
            </Button>
          </div>
          <div className="rounded-md bg-muted p-3 text-sm space-y-2">
            <p className="font-medium">After copying, share your new sheet with our service account:</p>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-background px-2 py-1 rounded border break-all">
                {serviceAccountEmail}
              </code>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 h-7 px-2"
                onClick={handleCopyEmail}
              >
                <Copy className="h-3.5 w-3.5" />
                <span className="ml-1 text-xs">{copiedEmail ? 'Copied!' : 'Copy'}</span>
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              Open your copied sheet → click Share → paste this email → grant Viewer access.
            </p>
          </div>
        </CardContent>
      </Card>

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
    </div>
  )
}
