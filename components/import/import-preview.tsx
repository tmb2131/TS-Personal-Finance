'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

export type CsvImportTarget = 'transactions' | 'account_balances' | 'recurring_payments'

interface MappedTransaction {
  date: string
  category: string
  counterparty: string | null
  amount: number
  currency: 'USD' | 'GBP'
}

interface MappedAccountBalance {
  date_updated: string
  institution: string
  account_name: string
  category: string
  currency: 'USD' | 'GBP' | 'EUR'
  balance_total_local: number
  balance_personal_local: number
  balance_family_local: number
  liquidity_profile: string | null
  risk_profile: string | null
  horizon_profile: string | null
}

interface MappedRecurringPayment {
  name: string
  annualized_amount: number
  currency: 'USD' | 'GBP'
  needs_review: boolean
}

type MappedImportRow = MappedTransaction | MappedAccountBalance | MappedRecurringPayment

interface ImportPreviewProps {
  target: CsvImportTarget
  rows: MappedImportRow[]
  onImportComplete: (result: { imported: number; duplicates: number; errors: number }) => void
  onBack: () => void
}

const TARGET_LABELS: Record<CsvImportTarget, string> = {
  transactions: 'transactions',
  account_balances: 'account balances',
  recurring_payments: 'recurring payments',
}

function formatCurrencyAmount(value: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function ImportPreview({ target, rows, onImportComplete, onBack }: ImportPreviewProps) {
  const [importing, setImporting] = useState(false)

  const handleImport = async () => {
    setImporting(true)
    try {
      const res = await fetch('/api/import/csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, rows }),
      })

      const result = await res.json()

      if (!res.ok) {
        toast.error(result.error || 'Import failed')
        return
      }

      onImportComplete(result)
    } catch {
      toast.error('Failed to import CSV data')
    } finally {
      setImporting(false)
    }
  }

  const preview = rows.slice(0, 5)
  const rowLabel = TARGET_LABELS[target]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 text-sm">
        <div className="rounded-lg bg-muted px-3 py-2">
          <span className="font-medium">{rows.length}</span> {rowLabel} to import
        </div>
      </div>

      <div className="relative">
        <div className="rounded-md border overflow-x-auto overflow-y-auto scroll-touch max-h-[50vh]">
          <Table className="min-w-[500px]">
          <TableHeader>
            {target === 'transactions' && (
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Counterparty</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            )}
            {target === 'account_balances' && (
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Institution</TableHead>
                <TableHead>Account Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            )}
            {target === 'recurring_payments' && (
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead className="text-right">Annualized Amount</TableHead>
                <TableHead className="text-right">Needs Review</TableHead>
              </TableRow>
            )}
          </TableHeader>
          <TableBody>
            {target === 'transactions' &&
              (preview as MappedTransaction[]).map((row, i) => (
                <TableRow key={i}>
                  <TableCell>{row.date}</TableCell>
                  <TableCell>{row.counterparty || '—'}</TableCell>
                  <TableCell>{row.category}</TableCell>
                  <TableCell className="text-right">{formatCurrencyAmount(row.amount, row.currency)}</TableCell>
                </TableRow>
              ))}

            {target === 'account_balances' &&
              (preview as MappedAccountBalance[]).map((row, i) => (
                <TableRow key={i}>
                  <TableCell>{row.date_updated}</TableCell>
                  <TableCell>{row.institution}</TableCell>
                  <TableCell>{row.account_name}</TableCell>
                  <TableCell>{row.category}</TableCell>
                  <TableCell>{row.currency}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrencyAmount(row.balance_total_local, row.currency)}
                  </TableCell>
                </TableRow>
              ))}

            {target === 'recurring_payments' &&
              (preview as MappedRecurringPayment[]).map((row, i) => (
                <TableRow key={i}>
                  <TableCell>{row.name}</TableCell>
                  <TableCell>{row.currency}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrencyAmount(row.annualized_amount, row.currency)}
                  </TableCell>
                  <TableCell className="text-right">{row.needs_review ? 'Yes' : 'No'}</TableCell>
                </TableRow>
              ))}

            {rows.length > 5 && (
              <TableRow>
                <TableCell
                  colSpan={target === 'transactions' ? 4 : target === 'account_balances' ? 6 : 4}
                  className="text-center text-muted-foreground text-sm"
                >
                  ... and {rows.length - 5} more rows
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        </div>
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent rounded-r-md" aria-hidden />
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} disabled={importing}>
          Back
        </Button>
        <Button onClick={handleImport} disabled={importing}>
          {importing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Importing...
            </>
          ) : (
            `Import ${rows.length} ${rowLabel}`
          )}
        </Button>
      </div>
    </div>
  )
}
