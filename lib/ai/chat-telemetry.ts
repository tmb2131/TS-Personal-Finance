import type { SupabaseClient } from '@supabase/supabase-js'
import type { QueryIntentResult } from '@/lib/ai/intent-routing'
import { deriveTelemetryFlags } from '@/lib/ai/telemetry'

export interface TelemetryData {
  responseText: string
  finishReason?: string | null
  toolCalls?: Array<{ toolName?: string }>
  toolResults?: Array<{ toolName?: string; result?: unknown }>
  extraIssueLabels?: string[]
}

export function createTelemetryLogger(params: {
  supabase: SupabaseClient
  userId: string
  intentResult: QueryIntentResult
  latestUserMessage: string
  inferredRouteHint: string | null
}) {
  let logged = false

  return {
    log: async (data: TelemetryData) => {
      if (logged) return
      logged = true

      try {
        const uniqueToolNames = Array.from(
          new Set(
            (data.toolCalls || [])
              .map((toolCall) => toolCall?.toolName)
              .filter((name): name is string => typeof name === 'string' && name.length > 0)
          )
        )
        const flags = deriveTelemetryFlags({
          intent: params.intentResult.intent,
          responseText: data.responseText,
          finishReason: data.finishReason || null,
          toolNames: uniqueToolNames,
          toolResults: data.toolResults || [],
        })
        const issueLabels = Array.from(new Set([...(flags.issueLabels || []), ...(data.extraIssueLabels || [])]))
        const responseLength = (data.responseText || '').trim().length

        const { error: telemetryError } = await params.supabase.from('ai_chat_telemetry').insert({
          user_id: params.userId,
          intent: params.intentResult.intent,
          user_query: params.latestUserMessage,
          route_hint: params.inferredRouteHint || null,
          tool_calls_count: uniqueToolNames.length,
          tool_names: uniqueToolNames,
          finish_reason: data.finishReason || null,
          response_text: data.responseText || null,
          response_length: responseLength,
          is_unanswered: flags.isUnanswered,
          is_low_confidence: flags.isLowConfidence,
          issue_labels: issueLabels,
          model: 'gemini-2.5-flash',
          metadata: {
            intentScores: {
              finance: params.intentResult.financeScore,
              app: params.intentResult.appScore,
            },
          },
        })

        if (telemetryError) {
          console.error('[chat] telemetry insert error:', telemetryError)
        }
      } catch (telemetryInsertError) {
        console.error('[chat] telemetry logging failed:', telemetryInsertError)
      }
    },
  }
}
