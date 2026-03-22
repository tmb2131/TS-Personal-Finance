'use client'

import { useState, useCallback, useRef, useEffect, type ComponentType } from 'react'
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
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, ReceiptText, Wallet, Repeat, Check } from 'lucide-react'
import {
  autoDetectTransactionColumns,
  autoDetectAccountBalanceColumns,
  autoDetectRecurringPaymentColumns,
  parseBoolean,
  parseDate,
  parseAmount,
} from '@/lib/csv-parser'
import { ColumnMapper, type ColumnMapperField } from './column-mapper'
import { ImportPreview, type CsvImportTarget } from './import-preview'

type Step = 'upload' | 'map' | 'review'

interface ImportResult {
  imported: number
  duplicates: number
  errors: number
}

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

const TARGET_OPTIONS: Array<{ value: CsvImportTarget; title: string; description: string }> = [
  {
    value: 'transactions',
    title: 'Transactions',
    description: 'Load bank activity, spending, and income without a live sheet.',
  },
  {
    value: 'account_balances',
    title: 'Account Balances',
    description: 'Backfill institutions and balance snapshots in one pass.',
  },
  {
    value: 'recurring_payments',
    title: 'Recurring Payments',
    description: 'Seed subscriptions and commitments for liquidity planning.',
  },
]

const TRANSACTION_FIELDS: ColumnMapperField[] = [
  { key: 'date', label: 'Date', required: true },
  { key: 'amount', label: 'Amount', required: true },
  { key: 'counterparty', label: 'Counterparty / Description', required: false },
  { key: 'category', label: 'Category', required: false },
]

const ACCOUNT_BALANCE_FIELDS: ColumnMapperField[] = [
  { key: 'date_updated', label: 'Date', required: false },
  { key: 'institution', label: 'Institution', required: true },
  { key: 'account_name', label: 'Account Name', required: true },
  { key: 'category', label: 'Category', required: false },
  { key: 'balance_total_local', label: 'Total Balance', required: true },
  { key: 'balance_personal_local', label: 'Personal Balance', required: false },
  { key: 'balance_family_local', label: 'Family Balance', required: false },
  { key: 'currency_column', label: 'Currency Column', required: false },
  { key: 'liquidity_profile', label: 'Liquidity Profile', required: false },
  { key: 'risk_profile', label: 'Risk Profile', required: false },
  { key: 'horizon_profile', label: 'Horizon Profile', required: false },
]

const RECURRING_FIELDS: ColumnMapperField[] = [
  { key: 'name', label: 'Payment Name', required: true },
  { key: 'annualized_amount', label: 'Annualized Amount', required: true },
  { key: 'currency_column', label: 'Currency Column', required: false },
  { key: 'needs_review', label: 'Needs Review', required: false },
]

const REQUIRED_MAPPING_KEYS: Record<CsvImportTarget, string[]> = {
  transactions: ['date', 'amount'],
  account_balances: ['institution', 'account_name', 'balance_total_local'],
  recurring_payments: ['name', 'annualized_amount'],
}

const TARGET_ROW_LABEL: Record<CsvImportTarget, string> = {
  transactions: 'transactions',
  account_balances: 'account balances',
  recurring_payments: 'recurring payments',
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

interface CsvImportFlowProps {
  initialTarget?: CsvImportTarget
}

function normalizeAccountCurrency(
  value: string | undefined,
  fallback: 'USD' | 'GBP' | 'EUR'
): 'USD' | 'GBP' | 'EUR' {
  const normalized = (value ?? '').trim().toUpperCase()
  if (normalized === 'USD') return 'USD'
  if (normalized === 'GBP') return 'GBP'
  if (normalized === 'EUR') return 'EUR'
  return fallback
}

function normalizeRecurringCurrency(
  value: string | undefined,
  fallback: 'USD' | 'GBP'
): 'USD' | 'GBP' {
  const normalized = (value ?? '').trim().toUpperCase()
  if (normalized === 'USD') return 'USD'
  if (normalized === 'GBP') return 'GBP'
  return fallback
}

export function CsvImportFlow({ initialTarget = 'transactions' }: CsvImportFlowProps) {
  const [step, setStep] = useState<Step>('upload')
  const [target, setTarget] = useState<CsvImportTarget>(initialTarget)
  const [fileName, setFileName] = useState<string>('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Record<string, string | null>>({})
  const [transactionCurrency, setTransactionCurrency] = useState<'USD' | 'GBP'>('USD')
  const [accountDefaultCurrency, setAccountDefaultCurrency] = useState<'USD' | 'GBP' | 'EUR'>('USD')
  const [recurringDefaultCurrency, setRecurringDefaultCurrency] = useState<'USD' | 'GBP'>('USD')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTarget(initialTarget)
  }, [initialTarget])

  const getFields = (activeTarget: CsvImportTarget): ColumnMapperField[] => {
    if (activeTarget === 'transactions') return TRANSACTION_FIELDS
    if (activeTarget === 'account_balances') return ACCOUNT_BALANCE_FIELDS
    return RECURRING_FIELDS
  }

  const getMappingLabel = (key: string): string => {
    const field = getFields(target).find((item) => item.key === key)
    return field?.label ?? key
  }

  const getMissingRequiredFields = () => {
    return REQUIRED_MAPPING_KEYS[target].filter((key) => !mapping[key])
  }

  const getMappedTransactions = (): MappedTransaction[] => {
    const dateColumn = mapping.date
    const amountColumn = mapping.amount
    if (!dateColumn || !amountColumn) return []

    const dateIdx = headers.indexOf(dateColumn)
    const amountIdx = headers.indexOf(amountColumn)
    if (dateIdx < 0 || amountIdx < 0) return []

    const counterpartyIdx = mapping.counterparty ? headers.indexOf(mapping.counterparty) : -1
    const categoryIdx = mapping.category ? headers.indexOf(mapping.category) : -1

    const mapped: MappedTransaction[] = []

    for (const row of rows) {
      const date = parseDate(row[dateIdx])
      const amount = parseAmount(row[amountIdx])

      if (!date || amount === null) continue

      mapped.push({
        date,
        category: categoryIdx >= 0 ? (row[categoryIdx]?.trim() || 'Uncategorized') : 'Uncategorized',
        counterparty: counterpartyIdx >= 0 ? (row[counterpartyIdx]?.trim() || null) : null,
        amount: round2(amount),
        currency: transactionCurrency,
      })
    }

    return mapped
  }

  const getMappedAccountBalances = (): MappedAccountBalance[] => {
    const institutionColumn = mapping.institution
    const accountNameColumn = mapping.account_name
    const totalBalanceColumn = mapping.balance_total_local
    if (!institutionColumn || !accountNameColumn || !totalBalanceColumn) return []

    const dateIdx = mapping.date_updated ? headers.indexOf(mapping.date_updated) : -1
    const institutionIdx = headers.indexOf(institutionColumn)
    const accountNameIdx = headers.indexOf(accountNameColumn)
    const categoryIdx = mapping.category ? headers.indexOf(mapping.category) : -1
    const totalIdx = headers.indexOf(totalBalanceColumn)
    const personalIdx = mapping.balance_personal_local ? headers.indexOf(mapping.balance_personal_local) : -1
    const familyIdx = mapping.balance_family_local ? headers.indexOf(mapping.balance_family_local) : -1
    const currencyIdx = mapping.currency_column ? headers.indexOf(mapping.currency_column) : -1
    const liquidityIdx = mapping.liquidity_profile ? headers.indexOf(mapping.liquidity_profile) : -1
    const riskIdx = mapping.risk_profile ? headers.indexOf(mapping.risk_profile) : -1
    const horizonIdx = mapping.horizon_profile ? headers.indexOf(mapping.horizon_profile) : -1

    if (institutionIdx < 0 || accountNameIdx < 0 || totalIdx < 0) return []

    const today = new Date().toISOString().slice(0, 10)
    const mapped: MappedAccountBalance[] = []

    for (const row of rows) {
      const institution = row[institutionIdx]?.trim() || ''
      const accountName = row[accountNameIdx]?.trim() || ''
      const total = parseAmount(row[totalIdx])

      if (!institution || !accountName || total === null) continue

      let personal = personalIdx >= 0 ? parseAmount(row[personalIdx]) : null
      let family = familyIdx >= 0 ? parseAmount(row[familyIdx]) : null

      if (personal === null && family === null) {
        personal = total
        family = 0
      } else if (personal === null) {
        personal = total - (family ?? 0)
      } else if (family === null) {
        family = total - personal
      }

      const parsedDate = dateIdx >= 0 ? parseDate(row[dateIdx]) : null
      const category = categoryIdx >= 0 ? (row[categoryIdx]?.trim() || 'Other') : 'Other'
      const currency =
        currencyIdx >= 0
          ? normalizeAccountCurrency(row[currencyIdx], accountDefaultCurrency)
          : accountDefaultCurrency
      const liquidity = liquidityIdx >= 0 ? (row[liquidityIdx]?.trim() || null) : null
      const risk = riskIdx >= 0 ? (row[riskIdx]?.trim() || null) : null
      const horizon = horizonIdx >= 0 ? (row[horizonIdx]?.trim() || null) : null

      mapped.push({
        date_updated: parsedDate ?? today,
        institution,
        account_name: accountName,
        category,
        currency,
        balance_total_local: round2(total),
        balance_personal_local: round2(personal ?? total),
        balance_family_local: round2(family ?? 0),
        liquidity_profile: liquidity,
        risk_profile: risk,
        horizon_profile: horizon,
      })
    }

    return mapped
  }

  const getMappedRecurringPayments = (): MappedRecurringPayment[] => {
    const nameColumn = mapping.name
    const amountColumn = mapping.annualized_amount
    if (!nameColumn || !amountColumn) return []

    const nameIdx = headers.indexOf(nameColumn)
    const amountIdx = headers.indexOf(amountColumn)
    if (nameIdx < 0 || amountIdx < 0) return []

    const currencyIdx = mapping.currency_column ? headers.indexOf(mapping.currency_column) : -1
    const reviewIdx = mapping.needs_review ? headers.indexOf(mapping.needs_review) : -1

    const mapped: MappedRecurringPayment[] = []

    for (const row of rows) {
      const name = row[nameIdx]?.trim() || ''
      const amount = parseAmount(row[amountIdx])
      if (!name || amount === null) continue

      const currency =
        currencyIdx >= 0
          ? normalizeRecurringCurrency(row[currencyIdx], recurringDefaultCurrency)
          : recurringDefaultCurrency

      const parsedReview = reviewIdx >= 0 ? parseBoolean(row[reviewIdx]) : null

      mapped.push({
        name,
        annualized_amount: round2(amount),
        currency,
        needs_review: parsedReview ?? false,
      })
    }

    return mapped
  }

  const getMappedRows = (): MappedImportRow[] => {
    if (target === 'transactions') return getMappedTransactions()
    if (target === 'account_balances') return getMappedAccountBalances()
    return getMappedRecurringPayments()
  }

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

        if (target === 'transactions') {
          const detected = autoDetectTransactionColumns(csvHeaders)
          setMapping({
            date: detected.date,
            amount: detected.amount,
            counterparty: detected.counterparty,
            category: detected.category,
          })
          setTransactionCurrency(detected.currency)
        } else if (target === 'account_balances') {
          const detected = autoDetectAccountBalanceColumns(csvHeaders)
          setMapping({
            date_updated: detected.date_updated,
            institution: detected.institution,
            account_name: detected.account_name,
            category: detected.category,
            balance_total_local: detected.balance_total_local,
            balance_personal_local: detected.balance_personal_local,
            balance_family_local: detected.balance_family_local,
            currency_column: detected.currency_column,
            liquidity_profile: detected.liquidity_profile,
            risk_profile: detected.risk_profile,
            horizon_profile: detected.horizon_profile,
          })
          setAccountDefaultCurrency(detected.default_currency)
        } else {
          const detected = autoDetectRecurringPaymentColumns(csvHeaders)
          setMapping({
            name: detected.name,
            annualized_amount: detected.annualized_amount,
            currency_column: detected.currency_column,
            needs_review: detected.needs_review,
          })
          setRecurringDefaultCurrency(detected.default_currency)
        }

        setStep('map')
      },
      error: () => {
        toast.error('Failed to parse CSV file')
      },
    })
  }, [target])

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

  const handleProceedToReview = () => {
    const missingRequired = getMissingRequiredFields()
    if (missingRequired.length > 0) {
      toast.error(`${missingRequired.map(getMappingLabel).join(', ')} ${missingRequired.length === 1 ? 'is' : 'are'} required`)
      return
    }

    const mapped = getMappedRows()
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
    setMapping({})
    setResult(null)
  }

  const mappedRows = getMappedRows()
  const missingRequired = getMissingRequiredFields()
  const hasRequiredMapping = missingRequired.length === 0

  const stepPosition: Record<Step, number> = {
    upload: 1,
    map: 2,
    review: 3,
  }

  const currentStep = stepPosition[step]

  const renderStepProgress = () => (
    <div className="rounded-xl border bg-background p-3">
      <ol className="grid grid-cols-3 gap-2 text-xs">
        {[
          { index: 1, label: 'Upload CSV' },
          { index: 2, label: 'Map Columns' },
          { index: 3, label: 'Review & Ingest' },
        ].map((item) => {
          const active = item.index === currentStep
          const done = item.index < currentStep

          return (
            <li
              key={item.label}
              className={`flex items-center gap-2 rounded-md border px-2 py-2 ${
                active ? 'border-primary bg-primary/5 text-primary' : 'text-muted-foreground'
              }`}
            >
              <span
                className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-semibold ${
                  done
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-muted-foreground/40'
                }`}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : item.index}
              </span>
              <span className="truncate font-medium">{item.label}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )

  const targetIconByType: Record<CsvImportTarget, ComponentType<{ className?: string }>> = {
    transactions: ReceiptText,
    account_balances: Wallet,
    recurring_payments: Repeat,
  }

  if (result) {
    return (
      <div className="space-y-4">
        {renderStepProgress()}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              Import Complete
            </CardTitle>
            <CardDescription>
              {TARGET_OPTIONS.find((option) => option.value === target)?.title} is now part of your native ingestion pipeline.
            </CardDescription>
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
      </div>
    )
  }

  if (step === 'upload') {
    return (
      <div className="space-y-4">
        {renderStepProgress()}
        <Card>
          <CardHeader>
            <CardTitle>Choose a CSV source</CardTitle>
            <CardDescription>Select the dataset you want to bulk load, then upload the file you want Findash to normalize.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              {TARGET_OPTIONS.map((option) => {
                const selected = option.value === target
                const Icon = targetIconByType[option.value]

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setTarget(option.value)}
                    className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                      selected
                        ? 'border-primary bg-primary/5'
                        : 'border-muted-foreground/25 hover:border-muted-foreground/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Icon className="h-4 w-4" />
                      {option.title}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{option.description}</div>
                  </button>
                )
              })}
            </div>

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
              <p className="text-xs text-muted-foreground mt-3">
                Target dataset: <span className="font-medium">{TARGET_OPTIONS.find((option) => option.value === target)?.title}</span>
              </p>
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
      </div>
    )
  }

  if (step === 'map') {
    return (
      <div className="space-y-4">
        {renderStepProgress()}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Map Columns
            </CardTitle>
            <CardDescription>
              {fileName} - {rows.length} rows detected for {TARGET_ROW_LABEL[target]}. Map your source columns to Findash fields before ingestion.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ColumnMapper
              headers={headers}
              sampleRows={rows}
              fields={getFields(target)}
              mapping={mapping}
              onMappingChange={setMapping}
            />

            {target === 'transactions' && (
              <div className="space-y-2">
                <div className="text-sm font-medium">Default Currency (applied to all rows)</div>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={transactionCurrency}
                  onChange={(e) => setTransactionCurrency(e.target.value as 'USD' | 'GBP')}
                >
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
            )}

            {target === 'account_balances' && (
              <div className="space-y-2">
                <div className="text-sm font-medium">Default Currency (used when Currency Column is empty)</div>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={accountDefaultCurrency}
                  onChange={(e) => setAccountDefaultCurrency(e.target.value as 'USD' | 'GBP' | 'EUR')}
                >
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
            )}

            {target === 'recurring_payments' && (
              <div className="space-y-2">
                <div className="text-sm font-medium">Default Currency (used when Currency Column is empty)</div>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={recurringDefaultCurrency}
                  onChange={(e) => setRecurringDefaultCurrency(e.target.value as 'USD' | 'GBP')}
                >
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
            )}

            {!hasRequiredMapping && (
              <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                <AlertCircle className="h-4 w-4" />
                Required fields: {missingRequired.map(getMappingLabel).join(', ')}
              </div>
            )}

            <div>
              <h4 className="text-sm font-medium mb-2">Raw Data Preview (first 5 rows)</h4>
              <div className="relative">
                <div className="rounded-md border overflow-x-auto overflow-y-auto scroll-touch max-h-[280px]">
                  <Table className="min-w-[400px]">
                    <TableHeader>
                      <TableRow>
                        {headers.map((header) => (
                          <TableHead key={header} className="whitespace-nowrap text-xs">
                            {header}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.slice(0, 5).map((row, i) => (
                        <TableRow key={i}>
                          {row.map((cell, j) => (
                            <TableCell key={j} className="text-xs whitespace-nowrap">
                              {cell}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent rounded-r-md" aria-hidden />
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={handleReset}>
                Start Over
              </Button>
              <Button onClick={handleProceedToReview} disabled={!hasRequiredMapping}>
                Continue to Review
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {renderStepProgress()}
      <Card>
        <CardHeader>
            <CardTitle>Review & Ingest</CardTitle>
          <CardDescription>
              Review the mapped {TARGET_ROW_LABEL[target]} before they are written into the app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ImportPreview
            target={target}
            rows={mappedRows}
            onImportComplete={handleImportComplete}
            onBack={() => setStep('map')}
          />
        </CardContent>
      </Card>
    </div>
  )
}
