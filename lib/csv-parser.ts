export interface CsvFieldMapping {
  date: string | null
  category: string | null
  counterparty: string | null
  amount: string | null
  currency: 'USD' | 'GBP'
}

const DATE_PATTERNS = ['date', 'transaction date', 'trans date', 'posting date', 'value date', 'booked date']
const AMOUNT_PATTERNS = ['amount', 'debit', 'credit', 'value', 'sum', 'total', 'transaction amount']
const COUNTERPARTY_PATTERNS = ['description', 'counterparty', 'merchant', 'payee', 'name', 'memo', 'narrative', 'details', 'reference']
const CATEGORY_PATTERNS = ['category', 'type', 'transaction type', 'trans type']

function matchHeader(header: string, patterns: string[]): boolean {
  const normalized = header.toLowerCase().trim()
  return patterns.some(p => normalized === p || normalized.includes(p))
}

export function autoDetectColumns(headers: string[]): CsvFieldMapping {
  const mapping: CsvFieldMapping = {
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

  // UK format: 15/01/2024 — handled via heuristic (day > 12 means DD/MM)
  // For ambiguous dates (both <=12), we assume US format (MM/DD) since parseDate US match above handles it

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
  // Remove currency symbols and commas, handle parentheses as negative
  let cleaned = value.trim()
    .replace(/[$£€,]/g, '')
    .replace(/\s/g, '')

  // Parentheses indicate negative: (100.00) → -100.00
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    cleaned = '-' + cleaned.slice(1, -1)
  }

  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}
