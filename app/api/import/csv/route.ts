import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { normalizeCounterparty } from '@/lib/csv-parser'
import { rebuildYoYNetWorthFromAppData } from '@/lib/yoy-net-worth'
import { rebuildHistoricalNetWorthFromAccountHistory } from '@/lib/snapshot-historical-net-worth'

const CsvTransactionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.string().default('Uncategorized'),
  counterparty: z.string().nullable(),
  amount: z.number(),
  currency: z.enum(['USD', 'GBP']),
})

const CsvAccountBalanceSchema = z.object({
  date_updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  institution: z.string().min(1),
  account_name: z.string().min(1),
  category: z.string().min(1),
  currency: z.enum(['USD', 'GBP', 'EUR']),
  balance_total_local: z.number(),
  balance_personal_local: z.number(),
  balance_family_local: z.number(),
  liquidity_profile: z.string().nullable().optional(),
  risk_profile: z.string().nullable().optional(),
  horizon_profile: z.string().nullable().optional(),
})

const CsvRecurringPaymentSchema = z.object({
  name: z.string().min(1),
  annualized_amount: z.number(),
  currency: z.enum(['USD', 'GBP']),
  needs_review: z.boolean().default(false),
})

const ImportRequestSchema = z.discriminatedUnion('target', [
  z.object({
    target: z.literal('transactions'),
    rows: z.array(CsvTransactionSchema).min(1).max(5000),
  }),
  z.object({
    target: z.literal('account_balances'),
    rows: z.array(CsvAccountBalanceSchema).min(1).max(5000),
  }),
  z.object({
    target: z.literal('recurring_payments'),
    rows: z.array(CsvRecurringPaymentSchema).min(1).max(5000),
  }),
])

const LegacyTransactionImportSchema = z.object({
  transactions: z.array(CsvTransactionSchema).min(1).max(5000),
})

type CsvTransaction = z.infer<typeof CsvTransactionSchema>
type CsvAccountBalance = z.infer<typeof CsvAccountBalanceSchema>
type CsvRecurringPayment = z.infer<typeof CsvRecurringPaymentSchema>

interface ImportStats {
  imported: number
  duplicates: number
  errors: number
  total: number
}

const CHUNK_SIZE = 500

function normalizeDateKey(value: string): string {
  const parsed = new Date(value)
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10)
  }
  return value.slice(0, 10)
}

function buildAccountKey(date: string, institution: string, accountName: string): string {
  return `${normalizeDateKey(date)}|${institution.trim().toLowerCase()}|${accountName.trim().toLowerCase()}`
}

function buildRecurringKey(name: string): string {
  return name.trim().toLowerCase()
}

async function importTransactions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  transactions: CsvTransaction[]
): Promise<ImportStats> {
  const dates = transactions.map((row) => row.date)
  const minDate = dates.reduce((a, b) => (a < b ? a : b))
  const maxDate = dates.reduce((a, b) => (a > b ? a : b))

  const { data: existing } = await supabase
    .from('transaction_log')
    .select('date, counterparty_dedup, amount_usd, amount_gbp')
    .eq('user_id', userId)
    .gte('date', minDate)
    .lte('date', maxDate)

  const existingKeys = new Set(
    (existing ?? []).map((row) => {
      const amount = row.amount_usd ?? row.amount_gbp ?? 0
      return `${row.date}|${row.counterparty_dedup ?? ''}|${amount}`
    })
  )

  const toInsert: Array<{
    user_id: string
    date: string
    category: string
    counterparty: string | null
    counterparty_dedup: string
    amount_usd: number | null
    amount_gbp: number | null
    currency: string
    data_source: 'csv'
  }> = []

  let duplicates = 0
  let errors = 0

  for (const tx of transactions) {
    const dedup = normalizeCounterparty(tx.counterparty)
    const key = `${tx.date}|${dedup}|${tx.amount}`

    if (existingKeys.has(key)) {
      duplicates++
      continue
    }

    existingKeys.add(key)

    toInsert.push({
      user_id: userId,
      date: tx.date,
      category: tx.category || 'Uncategorized',
      counterparty: tx.counterparty,
      counterparty_dedup: dedup,
      amount_usd: tx.currency === 'USD' ? tx.amount : null,
      amount_gbp: tx.currency === 'GBP' ? tx.amount : null,
      currency: tx.currency,
      data_source: 'csv',
    })
  }

  let imported = 0
  for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
    const chunk = toInsert.slice(i, i + CHUNK_SIZE)
    const { error } = await supabase.from('transaction_log').insert(chunk)
    if (error) {
      console.error('CSV transaction import insert error:', error)
      errors += chunk.length
    } else {
      imported += chunk.length
    }
  }

  if (imported > 0) {
    try {
      await rebuildYoYNetWorthFromAppData(supabase, userId)
    } catch (rebuildError) {
      console.error('CSV transaction import: failed to rebuild YoY net worth data', rebuildError)
    }
  }

  return {
    imported,
    duplicates,
    errors,
    total: transactions.length,
  }
}

async function importAccountBalances(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  balances: CsvAccountBalance[]
): Promise<ImportStats> {
  const { data: existing } = await supabase
    .from('account_balances')
    .select('date_updated, institution, account_name')
    .eq('user_id', userId)

  const existingKeys = new Set(
    (existing ?? []).map((row) => buildAccountKey(row.date_updated, row.institution, row.account_name))
  )

  const toInsert: Array<{
    user_id: string
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
    data_source: 'csv'
  }> = []

  let duplicates = 0
  let errors = 0

  for (const row of balances) {
    const key = buildAccountKey(row.date_updated, row.institution, row.account_name)

    if (existingKeys.has(key)) {
      duplicates++
      continue
    }

    existingKeys.add(key)

    toInsert.push({
      user_id: userId,
      date_updated: row.date_updated,
      institution: row.institution.trim(),
      account_name: row.account_name.trim(),
      category: row.category.trim() || 'Other',
      currency: row.currency,
      balance_total_local: row.balance_total_local,
      balance_personal_local: row.balance_personal_local,
      balance_family_local: row.balance_family_local,
      liquidity_profile: row.liquidity_profile ?? null,
      risk_profile: row.risk_profile ?? null,
      horizon_profile: row.horizon_profile ?? null,
      data_source: 'csv',
    })
  }

  let imported = 0
  for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
    const chunk = toInsert.slice(i, i + CHUNK_SIZE)
    const { error } = await supabase.from('account_balances').insert(chunk)
    if (error) {
      console.error('CSV account balance import insert error:', error)
      errors += chunk.length
    } else {
      imported += chunk.length
    }
  }

  if (imported > 0) {
    try {
      await rebuildHistoricalNetWorthFromAccountHistory(supabase, userId)
      await rebuildYoYNetWorthFromAppData(supabase, userId)
    } catch (rebuildError) {
      console.error('CSV account balance import: failed to rebuild derived net worth data', rebuildError)
    }
  }

  return {
    imported,
    duplicates,
    errors,
    total: balances.length,
  }
}

async function importRecurringPayments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  payments: CsvRecurringPayment[]
): Promise<ImportStats> {
  const { data: existing } = await supabase
    .from('recurring_payments')
    .select('name')
    .eq('user_id', userId)

  const existingKeys = new Set((existing ?? []).map((row) => buildRecurringKey(row.name)))

  const toInsert: Array<{
    user_id: string
    name: string
    annualized_amount_gbp: number | null
    annualized_amount_usd: number | null
    needs_review: boolean
    data_source: 'csv'
  }> = []

  let duplicates = 0
  let errors = 0

  for (const row of payments) {
    const key = buildRecurringKey(row.name)
    if (existingKeys.has(key)) {
      duplicates++
      continue
    }

    existingKeys.add(key)

    toInsert.push({
      user_id: userId,
      name: row.name.trim(),
      annualized_amount_gbp: row.currency === 'GBP' ? row.annualized_amount : null,
      annualized_amount_usd: row.currency === 'USD' ? row.annualized_amount : null,
      needs_review: row.needs_review,
      data_source: 'csv',
    })
  }

  let imported = 0
  for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
    const chunk = toInsert.slice(i, i + CHUNK_SIZE)
    const { error } = await supabase.from('recurring_payments').insert(chunk)
    if (error) {
      console.error('CSV recurring payment import insert error:', error)
      errors += chunk.length
    } else {
      imported += chunk.length
    }
  }

  return {
    imported,
    duplicates,
    errors,
    total: payments.length,
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    const parsed = ImportRequestSchema.safeParse(body)
    const legacy = parsed.success ? null : LegacyTransactionImportSchema.safeParse(body)

    if (!parsed.success && !legacy?.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    let result: ImportStats

    if (parsed.success) {
      if (parsed.data.target === 'transactions') {
        result = await importTransactions(supabase, user.id, parsed.data.rows)
      } else if (parsed.data.target === 'account_balances') {
        result = await importAccountBalances(supabase, user.id, parsed.data.rows)
      } else {
        result = await importRecurringPayments(supabase, user.id, parsed.data.rows)
      }
    } else if (legacy?.success) {
      result = await importTransactions(supabase, user.id, legacy.data.transactions)
    } else {
      return NextResponse.json({ success: false, error: 'Invalid input' }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      imported: result.imported,
      duplicates: result.duplicates,
      errors: result.errors,
      total: result.total,
    })
  } catch (error: any) {
    console.error('CSV import API error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to import CSV' },
      { status: 500 }
    )
  }
}
