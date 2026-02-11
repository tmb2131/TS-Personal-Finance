import { createClient } from '@/lib/supabase/server'
import { getDefaultForecastMethods } from '@/lib/forecasting'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const YearMethodSchema = z.enum(['Annual', 'Linear', 'Budget', 'Manual'])
const MonthMethodSchema = z.enum(['Linear', 'Average', 'Manual'])

const UpdateCategoryPlanningSchema = z.object({
  rows: z.array(
    z.object({
      category: z.string().min(1),
      annual_budget_gbp: z.number().finite(),
      annual_budget_usd: z.number().finite(),
      current_year_method: YearMethodSchema,
      current_month_method: MonthMethodSchema,
      manual_year_forecast: z.number().finite().nullable().optional(),
      manual_month_forecast: z.number().finite().nullable().optional(),
    })
  ).min(1),
  budget_input_mode: z.enum(['app', 'sheet']).optional(),
})

type BudgetRow = {
  category: string
  annual_budget_gbp: number | null
  annual_budget_usd: number | null
  tracking_est_gbp: number | null
  tracking_est_usd: number | null
  ytd_gbp: number | null
  ytd_usd: number | null
  data_source: 'google_sheet' | 'plaid' | 'csv' | 'manual' | null
}

type ForecastSettingsRow = {
  category: string
  current_year_method: 'Annual' | 'Linear' | 'Budget' | 'Manual' | null
  current_month_method: 'Linear' | 'Average' | 'Manual' | null
  manual_year_forecast: number | null
  manual_month_forecast: number | null
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const [profileRes, budgetsRes, settingsRes, categoriesRes] = await Promise.all([
      supabase
        .from('user_profiles')
        .select('budget_input_mode')
        .eq('id', user.id)
        .single(),
      supabase
        .from('budget_targets')
        .select('category, annual_budget_gbp, annual_budget_usd, tracking_est_gbp, tracking_est_usd, ytd_gbp, ytd_usd, data_source')
        .eq('user_id', user.id),
      supabase
        .from('forecast_settings')
        .select('category, current_year_method, current_month_method, manual_year_forecast, manual_month_forecast')
        .eq('user_id', user.id),
      supabase.rpc('distinct_categories'),
    ])

    if (budgetsRes.error) {
      return NextResponse.json({ success: false, error: budgetsRes.error.message }, { status: 500 })
    }
    if (settingsRes.error) {
      return NextResponse.json({ success: false, error: settingsRes.error.message }, { status: 500 })
    }

    let categories: string[] = Array.isArray(categoriesRes.data) ? categoriesRes.data : []
    if (!categories.length) {
      const [budgetCats, txCats] = await Promise.all([
        supabase.from('budget_targets').select('category').eq('user_id', user.id),
        supabase.from('transaction_log').select('category').eq('user_id', user.id),
      ])
      const set = new Set<string>()
      ;(budgetCats.data || []).forEach((row: { category: string }) => row.category && set.add(row.category))
      ;(txCats.data || []).forEach((row: { category: string }) => row.category && set.add(row.category))
      categories = Array.from(set)
    }

    const categorySet = new Set<string>(categories)
    ;(budgetsRes.data || []).forEach((row: { category: string }) => {
      if (row.category) categorySet.add(row.category)
    })
    ;(settingsRes.data || []).forEach((row: { category: string }) => {
      if (row.category) categorySet.add(row.category)
    })

    const budgetByCategory = new Map<string, BudgetRow>()
    ;(budgetsRes.data || []).forEach((row) => {
      budgetByCategory.set(row.category, row as BudgetRow)
    })

    const settingsByCategory = new Map<string, ForecastSettingsRow>()
    ;(settingsRes.data || []).forEach((row) => {
      settingsByCategory.set(row.category, row as ForecastSettingsRow)
    })

    const rows = Array.from(categorySet)
      .sort((a, b) => a.localeCompare(b))
      .map((category) => {
        const defaults = getDefaultForecastMethods(category)
        const budget = budgetByCategory.get(category)
        const setting = settingsByCategory.get(category)

        return {
          category,
          annual_budget_gbp: Number(budget?.annual_budget_gbp ?? 0),
          annual_budget_usd: Number(budget?.annual_budget_usd ?? 0),
          current_year_method: setting?.current_year_method ?? defaults.year,
          current_month_method: setting?.current_month_method ?? defaults.month,
          manual_year_forecast: setting?.manual_year_forecast ?? null,
          manual_month_forecast: setting?.manual_month_forecast ?? null,
          budget_data_source: budget?.data_source ?? null,
        }
      })

    return NextResponse.json({
      success: true,
      budget_input_mode: profileRes.data?.budget_input_mode === 'sheet' ? 'sheet' : 'app',
      rows,
    })
  } catch (error: any) {
    console.error('Category planning GET error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch category planning data' },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = UpdateCategoryPlanningSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const normalizedRows = parsed.data.rows
      .map((row) => ({
        ...row,
        category: row.category.trim(),
      }))
      .filter((row) => row.category.length > 0)

    if (!normalizedRows.length) {
      return NextResponse.json({ success: false, error: 'At least one valid category is required' }, { status: 400 })
    }

    const dedupedByCategory = new Map<string, typeof normalizedRows[number]>()
    normalizedRows.forEach((row) => dedupedByCategory.set(row.category, row))
    const rows = Array.from(dedupedByCategory.values())
    const categories = rows.map((row) => row.category)

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('budget_input_mode')
      .eq('id', user.id)
      .single()

    const effectiveMode: 'app' | 'sheet' = parsed.data.budget_input_mode
      ? parsed.data.budget_input_mode
      : (profile?.budget_input_mode === 'sheet' ? 'sheet' : 'app')

    const { data: existingBudgets, error: existingError } = await supabase
      .from('budget_targets')
      .select('category, tracking_est_gbp, tracking_est_usd, ytd_gbp, ytd_usd')
      .eq('user_id', user.id)
      .in('category', categories)

    if (existingError) {
      return NextResponse.json({ success: false, error: existingError.message }, { status: 500 })
    }

    const existingByCategory = new Map<string, {
      tracking_est_gbp: number | null
      tracking_est_usd: number | null
      ytd_gbp: number | null
      ytd_usd: number | null
    }>()

    ;(existingBudgets || []).forEach((row: {
      category: string
      tracking_est_gbp: number | null
      tracking_est_usd: number | null
      ytd_gbp: number | null
      ytd_usd: number | null
    }) => {
      existingByCategory.set(row.category, {
        tracking_est_gbp: row.tracking_est_gbp,
        tracking_est_usd: row.tracking_est_usd,
        ytd_gbp: row.ytd_gbp,
        ytd_usd: row.ytd_usd,
      })
    })

    const budgetUpserts = rows.map((row) => {
      const existing = existingByCategory.get(row.category)
      return {
        user_id: user.id,
        category: row.category,
        annual_budget_gbp: row.annual_budget_gbp,
        annual_budget_usd: row.annual_budget_usd,
        tracking_est_gbp: existing?.tracking_est_gbp ?? 0,
        tracking_est_usd: existing?.tracking_est_usd ?? 0,
        ytd_gbp: existing?.ytd_gbp ?? 0,
        ytd_usd: existing?.ytd_usd ?? 0,
        data_source: effectiveMode === 'app'
          ? ('manual' as const)
          : 'google_sheet',
      }
    })

    const forecastUpserts = rows.map((row) => ({
      user_id: user.id,
      category: row.category,
      current_year_method: row.current_year_method,
      current_month_method: row.current_month_method,
      manual_year_forecast: row.manual_year_forecast ?? null,
      manual_month_forecast: row.manual_month_forecast ?? null,
    }))

    const [budgetUpsertRes, forecastUpsertRes] = await Promise.all([
      supabase.from('budget_targets').upsert(budgetUpserts, { onConflict: 'user_id,category' }),
      supabase.from('forecast_settings').upsert(forecastUpserts, { onConflict: 'user_id,category' }),
    ])

    if (budgetUpsertRes.error) {
      return NextResponse.json({ success: false, error: budgetUpsertRes.error.message }, { status: 500 })
    }
    if (forecastUpsertRes.error) {
      return NextResponse.json({ success: false, error: forecastUpsertRes.error.message }, { status: 500 })
    }

    if (parsed.data.budget_input_mode) {
      const { error: modeError } = await supabase
        .from('user_profiles')
        .update({
          budget_input_mode: parsed.data.budget_input_mode,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)

      if (modeError) {
        return NextResponse.json({ success: false, error: modeError.message }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Category planning PUT error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to save category planning data' },
      { status: 500 }
    )
  }
}
