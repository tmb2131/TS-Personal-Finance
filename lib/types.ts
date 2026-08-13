export type DataSource = 'google_sheet' | 'plaid' | 'csv' | 'manual'

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
  liquidity_profile: string | null
  risk_profile: string | null
  horizon_profile: string | null
  data_source?: DataSource
}

export interface TransactionLog {
  id: string
  date: string
  category: string
  counterparty: string | null
  /** Normalized counterparty for grouping (e.g. lowercase trim). Used by recurring detection. */
  counterparty_dedup?: string | null
  amount_usd: number | null
  amount_gbp: number | null
  /** Original transaction currency from sheet column F: 'USD' | 'GBP'. Used for per-currency burn. */
  currency?: string | null
  data_source?: DataSource
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
  data_source?: DataSource
}

export interface HistoricalNetWorth {
  id: string
  date: string
  category: string
  amount_usd: number | null
  amount_gbp: number | null
  data_source?: 'app_generated' | 'manual'
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
  mtd: number
  ttm_avg: number
  z_score: number
  delta_vs_l3m: number
}

export interface ForecastSetting {
  id: string
  user_id: string
  category: string
  current_year_method: 'Annual' | 'Linear' | 'Budget' | 'Manual'
  current_month_method: 'Linear' | 'Average' | 'Manual' | 'MTD'
  manual_year_forecast?: number | null
  manual_month_forecast?: number | null
  created_at: string
  updated_at: string
}

export interface YoYNetWorth {
  id: string
  category: string
  amount_usd: number | null
  amount_gbp: number | null
}

export interface YoYBridgeMeta {
  forecast_year: number
  year_start_date: string
  actual_as_of_date: string
  forecast_year_end_date: string
}

export interface InvestmentReturn {
  id: string
  income_source: string
  amount_gbp: number
  data_source?: DataSource
}

export interface RecurringPreference {
  id: string
  counterparty_pattern: string
  is_ignored: boolean
  /** User notes for this detected recurring payment. Optional for backward compatibility. */
  notes?: string | null
  created_at: string
}

export interface RecurringPayment {
  id: string
  name: string
  annualized_amount_gbp: number | null
  annualized_amount_usd: number | null
  needs_review: boolean
  /** User notes (e.g. renewal date). Optional for backward compatibility. */
  notes?: string | null
  created_at: string
  updated_at: string
  data_source?: DataSource
}

// Kids Accounts
export interface KidsAccount {
  id: string
  child_name: string
  account_type: string
  balance_usd: number
  date_updated: string
  notes: string | null
  purpose: string | null
  data_source?: DataSource
}

import type { ReturnAssumptions } from '@/lib/return-assumptions'

// Sustainable spending range assumptions (one row per user)
// 'Expected' is the probability-weighted centre and sits between Conservative
// and Base. Conservative is a genuine downside case and may carry negative
// nominal returns; see lib/return-assumptions.ts.
export type ReturnProfile = 'Conservative' | 'Expected' | 'Base' | 'Optimistic'
export type SpendingFloorMode = 'savings_rate' | 'wealth_target'
/** real = today's purchasing power at horizon; nominal = future account value */
export type WealthTargetTerms = 'real' | 'nominal'

export interface FinancialAssumptions {
  id: string
  user_id: string
  return_profile: ReturnProfile
  inflation_rate: number
  floor_mode: SpendingFloorMode
  target_savings_rate: number
  wealth_target_gbp: number | null
  wealth_target_usd: number | null
  wealth_target_terms: WealthTargetTerms
  horizon_years: number
  emergency_fund_months: number
  include_trust: boolean
  nominal_return_assumptions: ReturnAssumptions | null
  created_at: string
  updated_at: string
}

// Debt tracking - mortgages, loans, credit cards
export interface Debt {
  id: string
  user_id: string
  type: string
  name: string
  purpose: string | null
  amount_gbp: number | null
  amount_usd: number | null
  date_updated: string
  created_at: string
  data_source?: DataSource
}
