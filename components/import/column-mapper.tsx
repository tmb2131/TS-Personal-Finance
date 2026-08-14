'use client'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export interface ColumnMapperField {
  key: string
  label: string
  required: boolean
}

interface ColumnMapperProps {
  headers: string[]
  sampleRows: string[][]
  fields: ColumnMapperField[]
  mapping: Record<string, string | null>
  onMappingChange: (mapping: Record<string, string | null>) => void
}

export function ColumnMapper({ headers, sampleRows, fields, mapping, onMappingChange }: ColumnMapperProps) {
  const handleFieldChange = (field: string, value: string) => {
    onMappingChange({
      ...mapping,
      [field]: value || null,
    })
  }

  const getPreview = (columnName: string | null): string[] => {
    if (!columnName) return []
    const idx = headers.indexOf(columnName)
    if (idx === -1) return []
    return sampleRows.slice(0, 3).map((row) => row[idx] ?? '')
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <div className="overflow-x-auto scroll-touch rounded-md border">
          <Table className="min-w-[420px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">Our Field</TableHead>
                <TableHead className="w-[200px]">Your Column</TableHead>
                <TableHead>Preview</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map(({ key, label, required }) => {
                const preview = getPreview(mapping[key] ?? null)
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
                        {headers.map((header) => (
                          <option key={header} value={header}>
                            {header}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {preview.length > 0 ? preview.join(', ') : '—'}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 scroll-fade-right rounded-r-md" aria-hidden />
      </div>
    </div>
  )
}
