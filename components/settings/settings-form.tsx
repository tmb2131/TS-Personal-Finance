'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SourceHealthPanel } from '@/components/ingestion/source-health-panel'
import { toast } from 'sonner'
import { useCurrency } from '@/lib/contexts/currency-context'
import { SYNC_COMPLETED_EVENT, useSync } from '@/lib/contexts/sync-context'
import { ExternalLink, Copy, FileUp, FileSpreadsheet, Landmark, PencilLine } from 'lucide-react'

const TEMPLATE_SHEET_ID = '1LsbT4ahDlq7Lyf04d5nyr4bsjqmkDq-kqQoA2t66Kgg'
const TEMPLATE_COPY_URL = `https://docs.google.com/spreadsheets/d/${TEMPLATE_SHEET_ID}/copy`

type CurrencyOption = 'USD' | 'GBP'

interface SettingsFormProps {
  initialSpreadsheetId: string
  initialDisplayName: string
  initialDefaultCurrency: CurrencyOption
  serviceAccountEmail: string
}

export function SettingsForm({
  initialSpreadsheetId,
  initialDisplayName,
  initialDefaultCurrency,
  serviceAccountEmail,
}: SettingsFormProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [copiedEmail, setCopiedEmail] = useState(false)

  const [spreadsheetId, setSpreadsheetId] = useState(initialSpreadsheetId)
  const [displayName, setDisplayName] = useState(initialDisplayName)
  const [defaultCurrency, setDefaultCurrency] = useState<CurrencyOption>(initialDefaultCurrency)
  const [saving, setSaving] = useState(false)
  const { setCurrency } = useCurrency()
  const { refreshIngestionStatus } = useSync()

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
        toast.info('Refreshing your Google Sheet source...')
        const response = await fetch('/api/sync', { method: 'POST' })
        const result = await response.json().catch(() => ({}))
        if (response.ok && result.success) {
          toast.success('Google Sheet source connected')
          queryClient.invalidateQueries()
          window.dispatchEvent(new CustomEvent(SYNC_COMPLETED_EVENT))
          await refreshIngestionStatus()
          router.refresh()
        } else if (!response.ok) {
          toast.error(result.error || 'Sync failed')
        } else {
          toast.warning(result.error || 'Sync completed with errors')
        }
      } else {
        await refreshIngestionStatus()
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
      <SourceHealthPanel
        title="Source control"
        description="Run the app without a spreadsheet, then layer in imports or sheet refreshes where they help."
      />

      <Card>
        <CardHeader>
          <CardTitle>Choose your ingestion path</CardTitle>
          <CardDescription>
            Findash now works best when you pick the lightest-weight source for each dataset instead of forcing everything through one spreadsheet.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border bg-background p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <PencilLine className="h-4 w-4 text-primary" />
              Manual first
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Add balances and transactions directly in-app when you only need a few edits or want fast setup.
            </p>
          </div>
          <div className="rounded-xl border bg-background p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <FileUp className="h-4 w-4 text-primary" />
              CSV for bulk loads
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Import transactions, balances, or recurring payments in batches without maintaining a live sheet.
            </p>
          </div>
          <div className="rounded-xl border bg-background p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Landmark className="h-4 w-4 text-primary" />
              Native connectors next
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              The ingestion pipeline is now source-agnostic, so bank and broker connectors can plug into the same rebuild path.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card id="google-sheet">
        <CardHeader>
          <CardTitle>Optional Google Sheet connector</CardTitle>
          <CardDescription>
            Keep Sheets only if you want a refreshable Transaction Log source. Accounts and most day-to-day edits are better handled in-app or through CSV import.
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
                Copy Sheet Template
              </a>
            </Button>
            <Button asChild variant="outline">
              <Link href="/import">
                <FileUp className="mr-2 h-4 w-4" />
                Open CSV Import
              </Link>
            </Button>
          </div>
          <div className="rounded-md bg-muted p-3 text-sm space-y-2">
            <p className="font-medium">If you keep using Sheets, share the copied file with the service account:</p>
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
              Open the copied sheet, click Share, paste this email, and grant Viewer access so Findash can refresh the Transaction Log tab.
            </p>
          </div>
        </CardContent>
      </Card>

    <Card>
      <CardHeader>
        <CardTitle>Preferences and source settings</CardTitle>
        <CardDescription>
          Save your preferred currency, display name, and optional spreadsheet ID. Leave the sheet blank if you plan to rely on CSV or manual entry.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl border border-dashed bg-muted/20 p-3 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            Spreadsheet ID format
          </div>
          <p className="mt-2 text-muted-foreground">
            Paste only the ID from `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="spreadsheet-id">Transaction Log Spreadsheet ID</Label>
          <Input
            id="spreadsheet-id"
            placeholder="Optional: 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
            value={spreadsheetId}
            onChange={(e) => setSpreadsheetId(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Leave blank if you do not want a live Google Sheet connector.
          </p>
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
          {saving ? 'Saving source settings...' : 'Save settings'}
        </Button>
      </CardContent>
    </Card>
    </div>
  )
}
