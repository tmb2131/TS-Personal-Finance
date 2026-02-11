export interface ChatTelemetryRow {
  id: string
  user_id: string
  created_at: string
  intent: 'finance' | 'app_instructions' | 'mixed' | 'unknown'
  user_query: string
  route_hint: string | null
  tool_calls_count: number
  tool_names: string[] | null
  finish_reason: string | null
  is_unanswered: boolean
  is_low_confidence: boolean
  issue_labels: string[] | null
}

interface CountEntry {
  key: string
  count: number
}

function topCounts(items: string[], limit = 10): CountEntry[] {
  const counts = new Map<string, number>()
  items.forEach((item) => {
    const key = item?.trim()
    if (!key) return
    counts.set(key, (counts.get(key) ?? 0) + 1)
  })
  return Array.from(counts.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

export function getLastNDaysWindow(days = 7): { windowStartISO: string; windowEndISO: string } {
  const safeDays = Math.max(1, Math.min(days, 90))
  const now = new Date()
  const start = new Date(now)
  start.setUTCDate(now.getUTCDate() - safeDays)
  return {
    windowStartISO: start.toISOString(),
    windowEndISO: now.toISOString(),
  }
}

export function buildWeeklyQualityReport(input: {
  rows: ChatTelemetryRow[]
  windowStartISO: string
  windowEndISO: string
  scope: 'user' | 'global'
  userId?: string
}) {
  const rows = input.rows || []
  const total = rows.length
  const unanswered = rows.filter((row) => row.is_unanswered)
  const lowConfidence = rows.filter((row) => row.is_low_confidence)

  const intents = rows.map((row) => row.intent || 'unknown')
  const routes = rows.map((row) => row.route_hint || 'unknown')
  const tools = rows.flatMap((row) => row.tool_names || [])
  const issues = rows.flatMap((row) => row.issue_labels || [])

  const unansweredSamples = unanswered.slice(0, 10).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    query: row.user_query,
    issueLabels: row.issue_labels || [],
    finishReason: row.finish_reason,
  }))

  const lowConfidenceSamples = lowConfidence.slice(0, 10).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    query: row.user_query,
    issueLabels: row.issue_labels || [],
    finishReason: row.finish_reason,
  }))

  return {
    scope: input.scope,
    userId: input.userId || null,
    window: {
      startISO: input.windowStartISO,
      endISO: input.windowEndISO,
    },
    totals: {
      requests: total,
      unanswered: unanswered.length,
      lowConfidence: lowConfidence.length,
      unansweredRate: total > 0 ? Number((unanswered.length / total).toFixed(4)) : 0,
      lowConfidenceRate: total > 0 ? Number((lowConfidence.length / total).toFixed(4)) : 0,
    },
    breakdowns: {
      intents: topCounts(intents, 10),
      routes: topCounts(routes, 10),
      toolNames: topCounts(tools, 12),
      issueLabels: topCounts(issues, 12),
    },
    samples: {
      unanswered: unansweredSamples,
      lowConfidence: lowConfidenceSamples,
    },
  }
}
