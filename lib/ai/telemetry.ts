import type { ChatQueryIntent } from '@/lib/ai/intent-routing'

interface ToolResultLike {
  toolName?: string
  result?: unknown
}

export interface DeriveTelemetryFlagsInput {
  intent: ChatQueryIntent
  responseText: string
  finishReason?: string | null
  toolNames: string[]
  toolResults?: ToolResultLike[]
}

export interface TelemetryFlags {
  isUnanswered: boolean
  isLowConfidence: boolean
  issueLabels: string[]
}

function hasToolErrors(toolResults?: ToolResultLike[]): boolean {
  if (!toolResults || toolResults.length === 0) return false
  return toolResults.some((result) => {
    if (!result || typeof result !== 'object') return false
    const payload = (result as { result?: unknown }).result
    if (!payload || typeof payload !== 'object') return false
    return Object.prototype.hasOwnProperty.call(payload, 'error')
  })
}

export function deriveTelemetryFlags(input: DeriveTelemetryFlagsInput): TelemetryFlags {
  const text = (input.responseText || '').trim().toLowerCase()
  const labels = new Set<string>()

  const noText = text.length === 0
  const explicitCannotAnswer =
    /cannot answer|can't answer|unable to answer|do not have enough|don't have enough|not available/.test(text)
  const hedgedLanguage = /\b(maybe|might|possibly|not sure|i think|could be)\b/.test(text)
  const mentionsError = /\berror\b|failed|unable to complete/.test(text)
  const toolError = hasToolErrors(input.toolResults)

  if (noText) labels.add('no_response_text')
  if (explicitCannotAnswer) labels.add('explicit_cannot_answer')
  if (hedgedLanguage) labels.add('hedged_language')
  if (mentionsError) labels.add('mentions_error')
  if (toolError) labels.add('tool_error')

  if (input.finishReason === 'length') {
    labels.add('truncated_response')
  }

  const hasAppHelpTool = input.toolNames.includes('get_app_instructions')
  const hasAnyTool = input.toolNames.length > 0

  if (input.intent === 'finance' && !hasAnyTool) {
    labels.add('missing_finance_tool_use')
  }
  if (input.intent === 'app_instructions' && !hasAppHelpTool) {
    labels.add('missing_app_help_tool_use')
  }

  const isUnanswered = labels.has('no_response_text') || labels.has('explicit_cannot_answer')
  const isLowConfidence =
    isUnanswered ||
    labels.has('hedged_language') ||
    labels.has('tool_error') ||
    labels.has('missing_finance_tool_use') ||
    labels.has('missing_app_help_tool_use') ||
    labels.has('truncated_response')

  return {
    isUnanswered,
    isLowConfidence,
    issueLabels: Array.from(labels.values()),
  }
}
