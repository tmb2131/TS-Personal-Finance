export interface TransactionCsvFieldMapping {
  date: string | null
  category: string | null
  counterparty: string | null
  amount: string | null
  currency: 'USD' | 'GBP'
}

// Backward-compatible alias used by the existing transaction import flow.
export type CsvFieldMapping = TransactionCsvFieldMapping

export interface AccountBalanceCsvFieldMapping {
  date_updated: string | null
  institution: string | null
  account_name: string | null
  category: string | null
  balance_total_local: string | null
  balance_personal_local: string | null
  balance_family_local: string | null
  currency_column: string | null
  liquidity_profile: string | null
  risk_profile: string | null
  horizon_profile: string | null
  default_currency: 'USD' | 'GBP' | 'EUR'
}

export interface RecurringPaymentCsvFieldMapping {
  name: string | null
  annualized_amount: string | null
  currency_column: string | null
  needs_review: string | null
  default_currency: 'USD' | 'GBP'
}

const DATE_PATTERNS = ['date', 'transaction date', 'trans date', 'posting date', 'value date', 'booked date', 'as of']
const AMOUNT_PATTERNS = ['amount', 'debit', 'credit', 'value', 'sum', 'total', 'transaction amount']
const COUNTERPARTY_PATTERNS = ['description', 'counterparty', 'merchant', 'payee', 'name', 'memo', 'narrative', 'details', 'reference']
const CATEGORY_PATTERNS = ['category', 'type', 'transaction type', 'trans type']

const INSTITUTION_PATTERNS = ['institution', 'bank', 'broker', 'custodian', 'provider']
const ACCOUNT_NAME_PATTERNS = ['account name', 'account', 'account title', 'name']
const TOTAL_BALANCE_PATTERNS = ['total balance', 'balance total', 'ending balance', 'current balance', 'balance', 'amount', 'value']
const PERSONAL_BALANCE_PATTERNS = ['personal', 'individual']
const FAMILY_BALANCE_PATTERNS = ['family', 'joint']
const CURRENCY_PATTERNS = ['currency', 'ccy', 'curr']
const LIQUIDITY_PATTERNS = ['liquidity', 'liquidity profile']
const RISK_PATTERNS = ['risk', 'risk profile']
const HORIZON_PATTERNS = ['horizon', 'horizon profile', 'time horizon']

const RECURRING_NAME_PATTERNS = ['name', 'payment', 'subscription', 'merchant', 'counterparty']
const RECURRING_ANNUAL_PATTERNS = ['annualized', 'annual', 'yearly', 'amount', 'cost', 'value']
const REVIEW_PATTERNS = ['needs review', 'review', 'flag']

function matchHeader(header: string, patterns: string[]): boolean {
  const normalized = header.toLowerCase().trim()
  return patterns.some((pattern) => normalized === pattern || normalized.includes(pattern))
}

function pickHeader(headers: string[], patterns: string[], used: Set<string>): string | null {
  for (const header of headers) {
    if (used.has(header)) continue
    if (matchHeader(header, patterns)) {
      used.add(header)
      return header
    }
  }
  return null
}

export function autoDetectTransactionColumns(headers: string[]): TransactionCsvFieldMapping {
  const mapping: TransactionCsvFieldMapping = {
    date: null,
    category: null,
    counterparty: null,
    amount: null,
    currency: 'USD',
  }

  for (const header of headers) {
    if (!mapping.date && matchHeader(header, DATE_PATTERNS)) {
      mapping.date = header
    } else if (!mapping.amount && matchHeader(header, AMOUNT_PATTERNS)) {
      mapping.amount = header
    } else if (!mapping.counterparty && matchHeader(header, COUNTERPARTY_PATTERNS)) {
      mapping.counterparty = header
    } else if (!mapping.category && matchHeader(header, CATEGORY_PATTERNS)) {
      mapping.category = header
    }
  }

  return mapping
}

// Existing callers import this function name.
export function autoDetectColumns(headers: string[]): TransactionCsvFieldMapping {
  return autoDetectTransactionColumns(headers)
}

export function autoDetectAccountBalanceColumns(headers: string[]): AccountBalanceCsvFieldMapping {
  const used = new Set<string>()

  const mapping: AccountBalanceCsvFieldMapping = {
    date_updated: pickHeader(headers, DATE_PATTERNS, used),
    institution: pickHeader(headers, INSTITUTION_PATTERNS, used),
    account_name: pickHeader(headers, ACCOUNT_NAME_PATTERNS, used),
    category: pickHeader(headers, CATEGORY_PATTERNS, used),
    balance_total_local: pickHeader(headers, TOTAL_BALANCE_PATTERNS, used),
    balance_personal_local: pickHeader(headers, PERSONAL_BALANCE_PATTERNS, used),
    balance_family_local: pickHeader(headers, FAMILY_BALANCE_PATTERNS, used),
    currency_column: pickHeader(headers, CURRENCY_PATTERNS, used),
    liquidity_profile: pickHeader(headers, LIQUIDITY_PATTERNS, used),
    risk_profile: pickHeader(headers, RISK_PATTERNS, used),
    horizon_profile: pickHeader(headers, HORIZON_PATTERNS, used),
    default_currency: 'USD',
  }

  return mapping
}

export function autoDetectRecurringPaymentColumns(headers: string[]): RecurringPaymentCsvFieldMapping {
  const used = new Set<string>()

  const mapping: RecurringPaymentCsvFieldMapping = {
    name: pickHeader(headers, RECURRING_NAME_PATTERNS, used),
    annualized_amount: pickHeader(headers, RECURRING_ANNUAL_PATTERNS, used),
    currency_column: pickHeader(headers, CURRENCY_PATTERNS, used),
    needs_review: pickHeader(headers, REVIEW_PATTERNS, used),
    default_currency: 'USD',
  }

  return mapping
}

export function normalizeCounterparty(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().trim()
}

export function parseDate(value: string): string | null {
  if (!value) return null
  const trimmed = value.trim()

  // ISO format: 2024-01-15
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed

  // US format: 01/15/2024 or 1/15/2024
  const usMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (usMatch) {
    const [, m, d, y] = usMatch
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // DD-MM-YYYY or DD.MM.YYYY
  const euMatch = trimmed.match(/^(\d{1,2})[-.](\d{1,2})[-.](\d{4})$/)
  if (euMatch) {
    const [, d, m, y] = euMatch
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // Try native Date parse as fallback
  const d = new Date(trimmed)
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10)
  }

  return null
}

export function parseAmount(value: string): number | null {
  if (!value) return null

  // Remove currency symbols and commas, handle parentheses as negative.
  let cleaned = value
    .trim()
    .replace(/[$£€,]/g, '')
    .replace(/\s/g, '')

  // Parentheses indicate negative: (100.00) -> -100.00
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    cleaned = `-${cleaned.slice(1, -1)}`
  }

  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

export function parseBoolean(value: string): boolean | null {
  if (!value) return null

  const normalized = value.trim().toLowerCase()
  if (!normalized) return null

  if (
    normalized === '1' ||
    normalized === 'true' ||
    normalized === 'yes' ||
    normalized === 'y' ||
    normalized === 'review' ||
    normalized === 'needs review' ||
    normalized === 'flagged'
  ) {
    return true
  }

  if (
    normalized === '0' ||
    normalized === 'false' ||
    normalized === 'no' ||
    normalized === 'n' ||
    normalized === 'none' ||
    normalized === 'clear'
  ) {
    return false
  }

  return null
}
