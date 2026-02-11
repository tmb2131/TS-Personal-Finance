import { createClient } from '@/lib/supabase/server'
import { buildWeeklyQualityReport, getLastNDaysWindow, type ChatTelemetryRow } from '@/lib/ai/quality-report'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const daysParam = Number(searchParams.get('days') || '7')
  const days = Number.isFinite(daysParam) ? daysParam : 7
  const { windowStartISO, windowEndISO } = getLastNDaysWindow(days)

  const { data, error } = await supabase
    .from('ai_chat_telemetry')
    .select('id, user_id, created_at, intent, user_query, route_hint, tool_calls_count, tool_names, finish_reason, is_unanswered, is_low_confidence, issue_labels')
    .gte('created_at', windowStartISO)
    .lte('created_at', windowEndISO)
    .order('created_at', { ascending: false })
    .limit(5000)

  if (error) {
    console.error('[ai-quality-report] query error', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data || []) as ChatTelemetryRow[]
  const report = buildWeeklyQualityReport({
    rows,
    windowStartISO,
    windowEndISO,
    scope: 'user',
    userId: user.id,
  })

  return NextResponse.json({
    success: true,
    report,
  })
}
