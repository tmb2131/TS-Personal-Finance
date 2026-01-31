import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET /api/cash-runway
 * Returns net burn (expenses + refunds) for last 3 full calendar months (UTC), aggregated in DB (no row limit).
 * Same filters as SQL: category NOT IN ('Income', 'Excluded', 'Gift Money'); USD = currency IS NULL OR 'USD'; GBP = 'GBP'.
 */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const utcYear = now.getUTCFullYear()
  const utcMonth = now.getUTCMonth()
  const startMonth = utcMonth - 3
  const startYear = startMonth < 0 ? utcYear - 1 : utcYear
  const adjustedStartMonth = startMonth < 0 ? startMonth + 12 : startMonth
  const endMonth = utcMonth - 1
  const endYear = endMonth < 0 ? utcYear - 1 : utcYear
  const adjustedEndMonth = endMonth < 0 ? endMonth + 12 : endMonth
  const startDateStr = `${startYear}-${String(adjustedStartMonth + 1).padStart(2, '0')}-01`
  const lastDay = new Date(Date.UTC(endYear, adjustedEndMonth + 1, 0))
  const endDateStr = lastDay.toISOString().split('T')[0]

  const { data: rpcData, error: rpcError } = await supabase.rpc('get_cash_runway_net_burn', {
    p_start: startDateStr,
    p_end: endDateStr,
  })

  if (rpcError) {
    console.error('[cash-runway] RPC error', rpcError)
    return NextResponse.json({ error: rpcError.message }, { status: 500 })
  }

  const row = Array.isArray(rpcData) ? rpcData[0] : rpcData
  const gbpNet = row?.gbp_net != null ? Number(row.gbp_net) : 0
  const usdNet = row?.usd_net != null ? Number(row.usd_net) : 0

  return NextResponse.json({
    startDate: startDateStr,
    endDate: endDateStr,
    gbpNet,
    usdNet,
  })
}
