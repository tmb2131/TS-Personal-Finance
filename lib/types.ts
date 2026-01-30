export interface AccountBalance {
  id: string
  date_updated: string
  institution: string
  account_name: string
  category: string
  currency: 'USD' | 'GBP' | 'EUR'
  balance_personal_local: number
  balance_family_local: number
  balance_total_local: number
}

export interface TransactionLog {
  id: string
  date: string
  category: string
  counterparty: string | null
  amount_usd: number | null
  amount_gbp: number | null
}

export interface BudgetTarget {
  id: string
  category: string
  annual_budget_gbp: number
  annual_budget_usd: number
  tracking_est_gbp: number
  ytd_gbp: number
  tracking_est_usd: number
  ytd_usd: number
}

export interface HistoricalNetWorth {
  id: string
  date: string
  category: string
  amount_usd: number | null
  amount_gbp: number | null
}

export interface FXRate {
  date: string
  gbpusd_rate: number
  eurusd_rate: number
}

export interface FXRateCurrent {
  id: string
  date: string
  gbpusd_rate: number
}

export interface AnnualTrend {
  id: string
  category: string
  cur_yr_minus_4: number
  cur_yr_minus_3: number
  cur_yr_minus_2: number
  cur_yr_minus_1: number
  cur_yr_est: number
  cur_yr_est_vs_4yr_avg: number
}

export interface MonthlyTrend {
  id: string
  category: string
  cur_month_minus_3: number
  cur_month_minus_2: number
  cur_month_minus_1: number
  cur_month_est: number
  ttm_avg: number
  z_score: number
  delta_vs_l3m: number
}

export interface YoYNetWorth {
  id: string
  category: string
  amount_usd: number | null
  amount_gbp: number | null
}

export interface InvestmentReturn {
  id: string
  income_source: string
  amount_gbp: number
}

export interface RecurringPreference {
  id: string
  counterparty_pattern: string
  is_ignored: boolean
  created_at: string
}

export interface RecurringPayment {
  id: string
  name: string
  annualized_amount_gbp: number | null
  annualized_amount_usd: number | null
  needs_review: boolean
  created_at: string
  updated_at: string
}

// Kids Accounts - simplified structure matching Google Sheet
export interface KidsAccount {
  id: string
  child_name: string
  account_type: string
  balance_usd: number
  date_updated: string
  notes: string | null
  purpose: string | null
}
