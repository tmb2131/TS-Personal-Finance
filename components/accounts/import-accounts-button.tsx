'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { queryKeys } from '@/lib/query-keys'
import { useCurrency } from '@/lib/contexts/currency-context'
import { AlertTriangle, Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface ImportPreview {
  rowsParsed: number
  latestDate: string | null
  skipped: { account_name: string; reason: string }[]
  changed: { account_name: string; from: number | null; to: number; date: string }[]
}

/**
 * Preview-then-confirm rather than a single button. An import rewrites balances
 * across every account, so the diff is shown first.
 */
export function ImportAccountsButton() {
  const queryClient = useQueryClient()
  const { currency } = useCurrency()
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [preview, setPreview] = useState<ImportPreview | null>(null)

  const format = (value: number) =>
    new Intl.NumberFormat(currency === 'GBP' ? 'en-GB' : 'en-US', {
      maximumFractionDigits: 0,
    }).format(value)

  const call = async (dryRun: boolean) => {
    const res = await fetch('/api/import/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dryRun }),
    })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok || payload?.success !== true) {
      throw new Error(payload?.error || 'Import failed')
    }
    return payload
  }

  const handlePreview = async () => {
    setLoading(true)
    try {
      const payload = await call(true)
      setPreview({
        rowsParsed: payload.rowsParsed,
        latestDate: payload.latestDate,
        skipped: payload.skipped ?? [],
        changed: payload.changed ?? [],
      })
    } catch (error: any) {
      toast.error(error.message || 'Could not read the sheet')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = async () => {
    setImporting(true)
    try {
      const payload = await call(false)
      toast.success(
        `Imported ${payload.rowsWritten} account ${payload.rowsWritten === 1 ? 'row' : 'rows'}`
      )
      await queryClient.invalidateQueries({ queryKey: queryKeys.accounts })
      setPreview(null)
    } catch (error: any) {
      toast.error(error.message || 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={handlePreview} disabled={loading}>
        {loading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Download className="mr-2 h-4 w-4" />
        )}
        Import from Sheet
      </Button>

      <Dialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import account balances</DialogTitle>
            <DialogDescription>
              {preview?.rowsParsed ?? 0} rows read from the Accounts tab
              {preview?.latestDate ? `, newest dated ${preview.latestDate}` : ''}.
              {preview && preview.changed.length === 0
                ? ' Nothing has changed since the last import.'
                : ` ${preview?.changed.length} account balance${
                    preview?.changed.length === 1 ? '' : 's'
                  } would change.`}
            </DialogDescription>
          </DialogHeader>

          {preview && preview.changed.length > 0 && (
            <div className="max-h-64 overflow-y-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium">Account</th>
                    <th className="px-2 py-1.5 text-right font-medium">From</th>
                    <th className="px-2 py-1.5 text-right font-medium">To</th>
                    <th className="px-2 py-1.5 text-right font-medium">As of</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.changed.map((row) => (
                    <tr key={row.account_name} className="border-t">
                      <td className="px-2 py-1.5 truncate max-w-[180px]">{row.account_name}</td>
                      <td className="px-2 py-1.5 text-right num text-muted-foreground">
                        {row.from == null ? 'new' : format(row.from)}
                      </td>
                      <td className="px-2 py-1.5 text-right num font-medium">
                        {format(row.to)}
                      </td>
                      <td className="px-2 py-1.5 text-right num text-muted-foreground">
                        {row.date}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {preview && preview.skipped.length > 0 && (
            <div className="rounded-md border border-amber-500/40 bg-muted p-2.5 text-xs">
              <p className="flex items-center gap-1.5 font-semibold text-muted-foreground mb-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                {preview.skipped.length} row{preview.skipped.length === 1 ? '' : 's'} skipped
              </p>
              <p className="text-muted-foreground">
                {preview.skipped
                  .slice(0, 6)
                  .map((s) => `${s.account_name} (${s.reason})`)
                  .join(', ')}
                {preview.skipped.length > 6 ? '…' : ''}
              </p>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Imported rows are marked as sheet-sourced, so they are no longer hand-editable here —
            re-import to update them. Liquidity, risk and horizon profiles are kept.
          </p>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)} disabled={importing}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={importing || preview?.rowsParsed === 0}>
              {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Import {preview?.rowsParsed ?? 0} rows
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
