'use client'

import { type CsvFieldMapping } from '@/lib/csv-parser'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface ColumnMapperProps {
  headers: string[]
  sampleRows: string[][]
  mapping: CsvFieldMapping
  onMappingChange: (mapping: CsvFieldMapping) => void
}

const FIELDS: Array<{ key: keyof Omit<CsvFieldMapping, 'currency'>; label: string; required: boolean }> = [
  { key: 'date', label: 'Date', required: true },
  { key: 'amount', label: 'Amount', required: true },
  { key: 'counterparty', label: 'Counterparty / Description', required: false },
  { key: 'category', label: 'Category', required: false },
]

export function ColumnMapper({ headers, sampleRows, mapping, onMappingChange }: ColumnMapperProps) {
  const handleFieldChange = (field: keyof Omit<CsvFieldMapping, 'currency'>, value: string) => {
    onMappingChange({
      ...mapping,
      [field]: value || null,
    })
  }

  const handleCurrencyChange = (value: 'USD' | 'GBP') => {
    onMappingChange({ ...mapping, currency: value })
  }

  // Get preview values for a mapped column
  const getPreview = (columnName: string | null): string[] => {
    if (!columnName) return []
    const idx = headers.indexOf(columnName)
    if (idx === -1) return []
    return sampleRows.slice(0, 3).map(row => row[idx] ?? '')
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[180px]">Our Field</TableHead>
            <TableHead className="w-[200px]">Your Column</TableHead>
            <TableHead>Preview</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {FIELDS.map(({ key, label, required }) => {
            const preview = getPreview(mapping[key])
            return (
              <TableRow key={key}>
                <TableCell className="font-medium">
                  {label}
                  {required && <span className="text-destructive ml-1">*</span>}
                </TableCell>
                <TableCell>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={mapping[key] ?? ''}
                    onChange={(e) => handleFieldChange(key, e.target.value)}
                  >
                    <option value="">{required ? 'Select column...' : 'None'}</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {preview.length > 0 ? preview.join(', ') : '—'}
                </TableCell>
              </TableRow>
            )
          })}
          <TableRow>
            <TableCell className="font-medium">Currency</TableCell>
            <TableCell>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={mapping.currency}
                onChange={(e) => handleCurrencyChange(e.target.value as 'USD' | 'GBP')}
              >
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
              </select>
            </TableCell>
            <TableCell className="text-muted-foreground text-sm">
              Applied to all rows
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  )
}
