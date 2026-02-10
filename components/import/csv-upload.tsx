'use client'

import { useState, useCallback, useRef } from 'react'
import Papa from 'papaparse'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from 'lucide-react'
import { autoDetectColumns, parseDate, parseAmount, type CsvFieldMapping } from '@/lib/csv-parser'
import { ColumnMapper } from './column-mapper'
import { ImportPreview } from './import-preview'

type Step = 'upload' | 'map' | 'review'

interface ImportResult {
  imported: number
  duplicates: number
  errors: number
}

export function CsvImportFlow() {
  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState<string>('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<CsvFieldMapping>({
    date: null, category: null, counterparty: null, amount: null, currency: 'USD',
  })
  const [result, setResult] = useState<ImportResult | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) {
      toast.error('Please upload a CSV file')
      return
    }

    setFileName(file.name)

    Papa.parse(file, {
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data as string[][]
        if (data.length < 2) {
          toast.error('CSV file must have a header row and at least one data row')
          return
        }

        const csvHeaders = data[0]
        const csvRows = data.slice(1)

        setHeaders(csvHeaders)
        setRows(csvRows)
        setMapping(autoDetectColumns(csvHeaders))
        setStep('map')
      },
      error: () => {
        toast.error('Failed to parse CSV file')
      },
    })
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragActive(false)
  }, [])

  const getMappedTransactions = () => {
    if (!mapping.date || !mapping.amount) return []

    const dateIdx = headers.indexOf(mapping.date)
    const amountIdx = headers.indexOf(mapping.amount)
    const counterpartyIdx = mapping.counterparty ? headers.indexOf(mapping.counterparty) : -1
    const categoryIdx = mapping.category ? headers.indexOf(mapping.category) : -1

    const mapped: Array<{ date: string; category: string; counterparty: string | null; amount: number; currency: 'USD' | 'GBP' }> = []

    for (const row of rows) {
      const date = parseDate(row[dateIdx])
      const amount = parseAmount(row[amountIdx])

      if (!date || amount === null) continue

      mapped.push({
        date,
        category: categoryIdx >= 0 ? (row[categoryIdx]?.trim() || 'Uncategorized') : 'Uncategorized',
        counterparty: counterpartyIdx >= 0 ? (row[counterpartyIdx]?.trim() || null) : null,
        amount,
        currency: mapping.currency,
      })
    }

    return mapped
  }

  const handleProceedToReview = () => {
    if (!mapping.date || !mapping.amount) {
      toast.error('Date and Amount columns are required')
      return
    }

    const mapped = getMappedTransactions()
    if (mapped.length === 0) {
      toast.error('No valid rows could be mapped. Check your column mapping.')
      return
    }

    setStep('review')
  }

  const handleImportComplete = (importResult: ImportResult) => {
    setResult(importResult)
  }

  const handleReset = () => {
    setStep('upload')
    setFileName('')
    setHeaders([])
    setRows([])
    setMapping({ date: null, category: null, counterparty: null, amount: null, currency: 'USD' })
    setResult(null)
  }

  // Completed state
  if (result) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            Import Complete
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-3 text-center">
              <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{result.imported}</div>
              <div className="text-sm text-muted-foreground">Imported</div>
            </div>
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 p-3 text-center">
              <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{result.duplicates}</div>
              <div className="text-sm text-muted-foreground">Duplicates skipped</div>
            </div>
            {result.errors > 0 && (
              <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-3 text-center">
                <div className="text-2xl font-bold text-red-700 dark:text-red-400">{result.errors}</div>
                <div className="text-sm text-muted-foreground">Errors</div>
              </div>
            )}
          </div>
          <Button onClick={handleReset}>Import Another File</Button>
        </CardContent>
      </Card>
    )
  }

  // Step 1: Upload
  if (step === 'upload') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Upload CSV</CardTitle>
          <CardDescription>
            Upload a bank statement or transaction export in CSV format
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
              dragActive
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 hover:border-muted-foreground/50'
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-medium">Drag and drop your CSV file here</p>
            <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFile(file)
              }}
            />
          </div>
        </CardContent>
      </Card>
    )
  }

  // Step 2: Column Mapping
  if (step === 'map') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Map Columns
          </CardTitle>
          <CardDescription>
            {fileName} — {rows.length} rows detected. Map your CSV columns to our fields.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ColumnMapper
            headers={headers}
            sampleRows={rows}
            mapping={mapping}
            onMappingChange={setMapping}
          />

          {(!mapping.date || !mapping.amount) && (
            <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-4 w-4" />
              Date and Amount columns are required
            </div>
          )}

          {/* Raw data preview */}
          <div>
            <h4 className="text-sm font-medium mb-2">Raw Data Preview (first 5 rows)</h4>
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {headers.map((h) => (
                      <TableHead key={h} className="whitespace-nowrap text-xs">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 5).map((row, i) => (
                    <TableRow key={i}>
                      {row.map((cell, j) => (
                        <TableCell key={j} className="text-xs whitespace-nowrap">{cell}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={handleReset}>
              Start Over
            </Button>
            <Button
              onClick={handleProceedToReview}
              disabled={!mapping.date || !mapping.amount}
            >
              Continue to Review
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Step 3: Review & Import
  return (
    <Card>
      <CardHeader>
        <CardTitle>Review & Import</CardTitle>
        <CardDescription>
          Review the mapped transactions before importing
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ImportPreview
          transactions={getMappedTransactions()}
          onImportComplete={handleImportComplete}
          onBack={() => setStep('map')}
        />
      </CardContent>
    </Card>
  )
}
