import { createClient } from '@/lib/supabase/server'
import { buildAppKnowledgePromptContext, inferRouteHintFromQuery } from '@/lib/ai/app-knowledge'
import { buildIntentRoutingPromptContext, classifyQueryIntent } from '@/lib/ai/intent-routing'
import { buildDateContext, buildChatSystemPrompt } from '@/lib/ai/system-prompt'
import { createTelemetryLogger } from '@/lib/ai/chat-telemetry'
import { createChatTools } from '@/lib/ai/tools'
import { todayInTimeZone } from '@/lib/date-utils'
import { google } from '@ai-sdk/google'
import { streamText } from 'ai'

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let messages: unknown
  let timeZone: string | undefined

  try {
    const body = await req.json()
    messages = body?.messages ?? body
    if (body && typeof body.timeZone === 'string') {
      timeZone = body.timeZone
    }
    if (!Array.isArray(messages)) {
      console.error('[chat] Invalid request: messages is not an array', { body })
      return new Response(JSON.stringify({ error: 'messages must be an array' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  } catch (parseError) {
    console.error('[chat] Failed to parse request body', parseError)
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const modelMessages = (messages as Array<{ role: 'user' | 'assistant' | 'system'; content?: string; parts?: Array<{ type: string; text?: string }> }>).map(
      (msg) => {
        if (msg.content !== undefined) {
          return { role: msg.role, content: msg.content } as { role: 'user' | 'assistant' | 'system'; content: string }
        }
        if (Array.isArray(msg.parts)) {
          const content = msg.parts
            .filter((p): p is { type: string; text: string } => p.type === 'text' && typeof p.text === 'string')
            .map((p) => p.text)
            .join('')
          return { role: msg.role, content } as { role: 'user' | 'assistant' | 'system'; content: string }
        }
        return { role: msg.role, content: '' } as { role: 'user' | 'assistant' | 'system'; content: string }
      }
    ) as Array<{ role: 'user' | 'assistant' | 'system'; content: string }>

  console.log('[chat] Starting streamText with', modelMessages.length, 'messages')
  console.log('[chat] Model messages:', JSON.stringify(modelMessages.map(m => ({ role: m.role, contentLength: m.content.length, contentPreview: m.content.substring(0, 100) })), null, 2))

  const todayISO = todayInTimeZone(timeZone)
  const dateContext = buildDateContext(timeZone)
  const appKnowledgeContext = buildAppKnowledgePromptContext()
  const latestUserMessage = [...modelMessages].reverse().find((m) => m.role === 'user')?.content || ''
  const inferredRouteHint = inferRouteHintFromQuery(latestUserMessage)
  const intentResult = classifyQueryIntent(latestUserMessage)
  const intentRoutingContext = buildIntentRoutingPromptContext(intentResult)
  console.log('[chat] Intent routing:', {
    intent: intentResult.intent,
    financeScore: intentResult.financeScore,
    appScore: intentResult.appScore,
    inferredRouteHint,
    latestUserMessagePreview: latestUserMessage.substring(0, 120),
  })

  const telemetry = createTelemetryLogger({
    supabase,
    userId: user.id,
    intentResult,
    latestUserMessage,
    inferredRouteHint: inferredRouteHint || null,
  })

  const tools = createChatTools({ supabase, userId: user.id, todayISO })

  const systemPrompt = buildChatSystemPrompt({ dateContext, appKnowledgeContext, intentRoutingContext })

  let result
  try {
    type StreamTextOptions = Parameters<typeof streamText>[0]
    result = streamText({
      model: google('gemini-2.5-flash'),
      system: systemPrompt,
      messages: modelMessages,
      maxSteps: 5,
      stopWhen: () => false,
    onStepFinish: ({ text, toolCalls, toolResults, finishReason }) => {
      console.log('[chat] Step finished:', {
        textLength: text?.length,
        toolCalls: toolCalls?.length,
        toolResults: toolResults?.length,
        finishReason,
      })
    },
    onError: ({ error }) => {
      console.error('[chat] streamText error:', error)
      if (error instanceof Error) {
        console.error('[chat] Error details:', {
          message: error.message,
          name: error.name,
          stack: error.stack,
          cause: error.cause,
        })
      } else {
        console.error('[chat] Error details (non-Error object):', error)
      }
      void telemetry.log({
        responseText: '',
        finishReason: 'error',
        toolCalls: [],
        toolResults: [],
        extraIssueLabels: ['stream_error'],
      })
    },
    onFinish: async ({ text, toolCalls, toolResults, finishReason, response, steps }) => {
      const allText = steps?.map((step) => step.text).filter(Boolean).join(' ') || text
      const responseText = response?.messages?.find((m: any) => m.role === 'assistant')?.content
      console.log('[chat] streamText finished:', {
        textLength: text?.length,
        allTextLength: allText?.length,
        stepsCount: steps?.length,
        toolCalls: toolCalls?.length,
        toolResults: toolResults?.length,
        finishReason,
        hasText: !!text,
        hasAllText: !!allText,
        textPreview: text?.substring(0, 100),
        allTextPreview: allText?.substring(0, 100),
        responseMessages: response?.messages?.length,
        responseTextPreview: typeof responseText === 'string' ? responseText.substring(0, 100) : responseText,
        stepsText: steps?.map((s, i) => ({ step: i, textLength: s.text?.length, finishReason: s.finishReason })),
      })
      if (toolResults && toolResults.length > 0 && (!text || text.length === 0) && (!allText || allText.length === 0)) {
        console.warn('[chat] WARNING: Tool executed but no text response generated. Finish reason:', finishReason)
        console.warn('[chat] Tool results available:', JSON.stringify(toolResults.map((tr: any) => ({
          toolCallId: tr.toolCallId,
          toolName: tr.toolName,
          result: tr.result ? Object.keys(tr.result) : null,
        })), null, 2))
        console.warn('[chat] Steps:', JSON.stringify(steps?.map((s, i) => ({
          step: i,
          text: s.text?.substring(0, 200),
          finishReason: s.finishReason,
          toolCalls: s.toolCalls?.length,
          toolResults: s.toolResults?.length,
        })), null, 2))
      }

      const stepToolCalls = (steps || []).flatMap((step: any) => step?.toolCalls || [])
      const mergedToolCalls = [...(toolCalls || []), ...stepToolCalls]
      const stepToolResults = (steps || []).flatMap((step: any) => step?.toolResults || [])
      const mergedToolResults = [...(toolResults || []), ...stepToolResults]
      await telemetry.log({
        responseText: (allText || responseText || text || '').toString(),
        finishReason: finishReason || null,
        toolCalls: mergedToolCalls as Array<{ toolName?: string }>,
        toolResults: mergedToolResults as Array<{ toolName?: string; result?: unknown }>,
      })
    },
    tools,
    } as StreamTextOptions & { maxSteps: number })

    return result.toUIMessageStreamResponse()
  } catch (streamError) {
    console.error('[chat] Error creating streamText:', streamError)
    console.error('[chat] Stream error details:', {
      message: streamError instanceof Error ? streamError.message : String(streamError),
      name: streamError instanceof Error ? streamError.name : 'Unknown',
      stack: streamError instanceof Error ? streamError.stack : undefined,
    })
    await telemetry.log({
      responseText: '',
      finishReason: 'error',
      toolCalls: [],
      toolResults: [],
      extraIssueLabels: ['stream_create_error'],
    })
    throw streamError
  }
  } catch (err) {
    console.error('[chat] Error in streamText call:', err)
    console.error('[chat] Error details:', {
      message: err instanceof Error ? err.message : String(err),
      name: err instanceof Error ? err.name : 'Unknown',
      stack: err instanceof Error ? err.stack : undefined,
      fullError: err,
    })
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? (err instanceof Error ? err.stack : String(err)) : undefined,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
