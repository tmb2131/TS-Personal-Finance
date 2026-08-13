import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import {
  MAX_EFFECTIVE_TAX_RATE,
  MAX_NOMINAL_RETURN,
  MIN_NOMINAL_RETURN,
  parseReturnAssumptions,
} from '@/lib/return-assumptions'

const DEFAULT_GBPUSD_RATE = 1.25

// Rates may be negative: a Conservative profile has to be able to express a
// drawdown year.
const returnRateSchema = z.number().min(MIN_NOMINAL_RETURN).max(MAX_NOMINAL_RETURN)
const taxRateSchema = z.number().min(0).max(MAX_EFFECTIVE_TAX_RATE)

// Open record rather than a fixed key set built from ASSET_RETURN_CATEGORIES, so
// adding or splitting a category is not a breaking API change. Unknown keys are
// dropped and missing ones defaulted by parseReturnAssumptions.
const nominalReturnsSchema = z.record(z.string(), returnRateSchema)

const ReturnAssumptionsSchema = z.object({
  defaultNominalReturn: returnRateSchema,
  nominalReturns: nominalReturnsSchema,
  effectiveTaxRates: z.record(z.string(), taxRateSchema).optional(),
  defaultEffectiveTaxRate: taxRateSchema.optional(),
})

const UpdateSchema = z.object({
  return_profile: z.enum(['Conservative', 'Expected', 'Base', 'Optimistic']),
  inflation_rate: z.number().min(0).max(0.25),
  floor_mode: z.enum(['savings_rate', 'wealth_target']),
  target_savings_rate: z.number().min(0).max(1),
  /** Wealth target expressed in `currency`; converted to both currencies server-side. Null clears it. */
  wealth_target: z.number().positive().finite().nullable(),
  currency: z.enum(['GBP', 'USD']),
  horizon_years: z.number().int().min(1).max(80),
  emergency_fund_months: z.number().min(0).max(60),
  include_trust: z.boolean(),
  wealth_target_terms: z.enum(['real', 'nominal']).optional().default('real'),
  nominal_return_assumptions: ReturnAssumptionsSchema.nullable().optional(),
})

function toMoney(value: number): number {
  return Math.round(value * 100) / 100
}

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('financial_assumptions')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) throw error

    const assumptions = data
      ? {
          ...data,
          nominal_return_assumptions: parseReturnAssumptions(data.nominal_return_assumptions),
        }
      : null

    return NextResponse.json({ success: true, assumptions })
  } catch (error: any) {
    console.error('Financial-assumptions GET error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch financial assumptions' },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = UpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    let wealthTargetGbp: number | null = null
    let wealthTargetUsd: number | null = null
    if (parsed.data.wealth_target != null) {
      const { data: fxCurrent, error: fxError } = await supabase
        .from('fx_rate_current')
        .select('gbpusd_rate')
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (fxError) throw fxError
      const gbpUsdRate = Number(fxCurrent?.gbpusd_rate ?? DEFAULT_GBPUSD_RATE) || DEFAULT_GBPUSD_RATE

      if (parsed.data.currency === 'GBP') {
        wealthTargetGbp = toMoney(parsed.data.wealth_target)
        wealthTargetUsd = toMoney(parsed.data.wealth_target * gbpUsdRate)
      } else {
        wealthTargetUsd = toMoney(parsed.data.wealth_target)
        wealthTargetGbp = toMoney(parsed.data.wealth_target / gbpUsdRate)
      }
    }

    const { data, error } = await supabase
      .from('financial_assumptions')
      .upsert(
        {
          user_id: user.id,
          return_profile: parsed.data.return_profile,
          inflation_rate: parsed.data.inflation_rate,
          floor_mode: parsed.data.floor_mode,
          target_savings_rate: parsed.data.target_savings_rate,
          wealth_target_gbp: wealthTargetGbp,
          wealth_target_usd: wealthTargetUsd,
          horizon_years: parsed.data.horizon_years,
          emergency_fund_months: parsed.data.emergency_fund_months,
          include_trust: parsed.data.include_trust,
          wealth_target_terms: parsed.data.wealth_target_terms,
          ...(parsed.data.nominal_return_assumptions !== undefined
            ? { nominal_return_assumptions: parsed.data.nominal_return_assumptions }
            : {}),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      assumptions: {
        ...data,
        nominal_return_assumptions: parseReturnAssumptions(data.nominal_return_assumptions),
      },
    })
  } catch (error: any) {
    console.error('Financial-assumptions PUT error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to save financial assumptions' },
      { status: 500 }
    )
  }
}
