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

interface MappedTransaction {
  date: string
  category: string
  counterparty: string | null
  amount: number
  currency: 'USD' | 'GBP'
}

interface ImportPreviewProps {
  transactions: MappedTransaction[]
  onImportComplete: (result: { imported: number; duplicates: number; errors: number }) => void
  onBack: () => void
}

export function ImportPreview({ transactions, onImportComplete, onBack }: ImportPreviewProps) {
  const [importing, setImporting] = useState(false)

  const handleImport = async () => {
    setImporting(true)
    try {
      const res = await fetch('/api/import/csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions }),
      })

      const result = await res.json()

      if (!res.ok) {
        toast.error(result.error || 'Import failed')
        return
      }

      onImportComplete(result)
    } catch {
      toast.error('Failed to import transactions')
    } finally {
      setImporting(false)
    }
  }

  const preview = transactions.slice(0, 5)
  const currencySymbol = transactions[0]?.currency === 'GBP' ? '£' : '$'

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 text-sm">
        <div className="rounded-lg bg-muted px-3 py-2">
          <span className="font-medium">{transactions.length}</span> transactions to import
        </div>
      </div>

      <div className="rounded-md border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Counterparty</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {preview.map((tx, i) => (
              <TableRow key={i}>
                <TableCell>{tx.date}</TableCell>
                <TableCell>{tx.counterparty || '—'}</TableCell>
                <TableCell>{tx.category}</TableCell>
                <TableCell className="text-right">
                  {currencySymbol}{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </TableCell>
              </TableRow>
            ))}
            {transactions.length > 5 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground text-sm">
                  ... and {transactions.length - 5} more rows
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
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
            `Import ${transactions.length} Transactions`
          )}
        </Button>
      </div>
    </div>
  )
}
