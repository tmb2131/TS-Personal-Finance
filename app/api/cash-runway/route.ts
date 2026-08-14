import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/** Trailing window for the burn mean, in full calendar months. */
const BURN_WINDOW_MONTHS = 12

/**
 * GET /api/cash-runway
 *
 * Returns ONE burn: the trailing-12-full-calendar-month mean of every expense
 * cash-flow row, in GBP, aggregated in the database.
 *
 * It is deliberately not split by currency. Spending is sterling; which
 * counterparty happens to bill in dollars is an accident of vendor choice, not
 * a fact about liquidity. Dividing dollar cash by dollar-denominated spend
 * produced a "USD runway" of 54.7 months sitting next to a sterling runway of
 * 6.7 — two numbers answering the same question, one of them meaningless.
 *
 * Twelve months rather than three because this household's spending is lumpy:
 * school fees, tax and holidays land in particular months, so a three-month
 * window reports whichever quarter you happen to be standing in.
 */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Full calendar months only — the current partial month would drag the mean
  // down by however far into it we happen to be.
  const now = new Date()
  const utcYear = now.getUTCFullYear()
  const utcMonth = now.getUTCMonth()

  const start = new Date(Date.UTC(utcYear, utcMonth - BURN_WINDOW_MONTHS, 1))
  const end = new Date(Date.UTC(utcYear, utcMonth, 0))
  const startDateStr = start.toISOString().split('T')[0]
  const endDateStr = end.toISOString().split('T')[0]

  const { data: rpcData, error: rpcError } = await supabase.rpc('get_cash_runway_total_burn', {
    p_start: startDateStr,
    p_end: endDateStr,
  })

  if (rpcError) {
    console.error('[cash-runway] RPC error', rpcError)
    return NextResponse.json({ error: rpcError.message }, { status: 500 })
  }

  const row = Array.isArray(rpcData) ? rpcData[0] : rpcData
  const totalNetGbp =
    typeof row === 'number' ? Number(row) : row?.total_gbp_net != null ? Number(row.total_gbp_net) : 0

  // Net is negative when money went out; burn is the positive magnitude. A net
  // inflow over the window is zero burn, not negative burn.
  const totalBurnGbp = Math.max(0, -totalNetGbp)
  const monthlyBurnGbp = totalBurnGbp / BURN_WINDOW_MONTHS

  return NextResponse.json({
    startDate: startDateStr,
    endDate: endDateStr,
    months: BURN_WINDOW_MONTHS,
    totalBurnGbp,
    monthlyBurnGbp,
  })
}
