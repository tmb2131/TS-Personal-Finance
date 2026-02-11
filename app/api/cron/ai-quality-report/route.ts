import { createAdminClient } from '@/lib/supabase/admin'
import { buildWeeklyQualityReport, getLastNDaysWindow, type ChatTelemetryRow } from '@/lib/ai/quality-report'
import { NextResponse } from 'next/server'

async function fetchTelemetryWindow(windowStartISO: string, windowEndISO: string): Promise<ChatTelemetryRow[]> {
  const admin = createAdminClient()
  const pageSize = 1000
  let from = 0
  let hasMore = true
  const allRows: ChatTelemetryRow[] = []

  while (hasMore) {
    const to = from + pageSize - 1
    const { data, error } = await admin
      .from('ai_chat_telemetry')
      .select('id, user_id, created_at, intent, user_query, route_hint, tool_calls_count, tool_names, finish_reason, is_unanswered, is_low_confidence, issue_labels')
      .gte('created_at', windowStartISO)
      .lte('created_at', windowEndISO)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) {
      throw error
    }

    const rows = (data || []) as ChatTelemetryRow[]
    allRows.push(...rows)
    hasMore = rows.length === pageSize
    from += pageSize
  }

  return allRows
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const expected = process.env.CRON_SECRET

  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const daysParam = Number(searchParams.get('days') || '7')
    const days = Number.isFinite(daysParam) ? daysParam : 7
    const { windowStartISO, windowEndISO } = getLastNDaysWindow(days)
    const rows = await fetchTelemetryWindow(windowStartISO, windowEndISO)
    const report = buildWeeklyQualityReport({
      rows,
      windowStartISO,
      windowEndISO,
      scope: 'global',
    })

    const admin = createAdminClient()
    const weekStart = windowStartISO.split('T')[0]
    const weekEnd = windowEndISO.split('T')[0]
    const { error: upsertError } = await admin
      .from('ai_quality_reports')
      .upsert(
        {
          week_start: weekStart,
          week_end: weekEnd,
          generated_at: new Date().toISOString(),
          report,
        },
        {
          onConflict: 'week_start,week_end',
        }
      )

    if (upsertError) {
      console.error('[ai-quality-report cron] upsert error', upsertError)
      return NextResponse.json(
        { success: false, error: upsertError.message, report },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      report,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to generate AI quality report'
    console.error('[ai-quality-report cron] error:', error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  return GET(request)
}
