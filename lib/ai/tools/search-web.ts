import { z } from 'zod'
import type { ToolContext } from './types'

export function createSearchWebTool(_ctx: ToolContext) {
  return {
    description: `Search the web for external data, benchmarks, averages, or market information to compare with the user's financial data. Use this when the user asks comparative questions like:
        - "How does my spending on X compare to average in Y location?"
        - "What's the typical cost of X in Y?"
        - "How does my budget compare to others?"
        - Any question requiring external benchmarks or market data
        
        IMPORTANT: Only use this tool when the user explicitly asks for comparisons with external data or benchmarks. For questions about the user's own data, use the other financial tools instead.`,
    inputSchema: z.object({
      query: z.string().describe('The search query to find relevant external data, benchmarks, or averages. Make it specific and include location/context when relevant (e.g., "average Uber spending per month London UK" or "typical grocery budget for family of 4 NYC").'),
    }),
    execute: async ({ query }: { query: string }) => {
      try {
        console.log('[chat] search_web: Starting web search', { query })

        const serperApiKey = process.env.SERPER_API_KEY
        console.log('[chat] search_web: API key check', {
          hasKey: !!serperApiKey,
          keyLength: serperApiKey?.length,
          keyPreview: serperApiKey ? `${serperApiKey.substring(0, 4)}...` : 'missing',
        })

        if (!serperApiKey || serperApiKey === 'your_serper_api_key_here' || serperApiKey.trim() === '') {
          console.warn('[chat] search_web: SERPER_API_KEY not configured', {
            value: serperApiKey,
            envKeys: Object.keys(process.env).filter(k => k.includes('SERPER')),
          })
          return {
            error: 'Web search is not configured. Please set SERPER_API_KEY in environment variables and restart the server.',
            summary: 'Web search functionality requires API configuration. If you just added SERPER_API_KEY to .env.local, please restart your development server (stop and run `npm run dev` again).',
          }
        }

        const response = await fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: {
            'X-API-KEY': serperApiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            q: query,
            num: 5,
          }),
        })

        if (!response.ok) {
          const errorText = await response.text()
          console.error('[chat] search_web: API error', { status: response.status, error: errorText })
          return {
            error: `Web search API error: ${response.status} ${response.statusText}`,
            summary: 'Unable to fetch external data. Please try again later.',
          }
        }

        const data = await response.json()

        const organicResults = data.organic || []
        const answerBox = data.answerBox
        const knowledgeGraph = data.knowledgeGraph

        const summaryParts: string[] = []

        if (answerBox) {
          if (answerBox.answer) {
            summaryParts.push(`Answer: ${answerBox.answer}`)
          }
          if (answerBox.title && answerBox.title !== answerBox.answer) {
            summaryParts.push(`Title: ${answerBox.title}`)
          }
        }

        if (knowledgeGraph) {
          if (knowledgeGraph.description) {
            summaryParts.push(`Description: ${knowledgeGraph.description}`)
          }
          if (knowledgeGraph.title) {
            summaryParts.push(`Topic: ${knowledgeGraph.title}`)
          }
        }

        const topResults = organicResults.slice(0, 3).map((result: any) => ({
          title: result.title,
          snippet: result.snippet,
          link: result.link,
        }))

        if (topResults.length > 0 && summaryParts.length === 0) {
          summaryParts.push(`Found ${organicResults.length} relevant sources. Top results:`)
          topResults.forEach((result: any, idx: number) => {
            summaryParts.push(`${idx + 1}. ${result.title}: ${result.snippet.substring(0, 150)}...`)
          })
        }

        const summary = summaryParts.length > 0
          ? summaryParts.join('\n\n')
          : 'No relevant information found. Try rephrasing your query or being more specific about location/context.'

        return {
          searchResults: {
            query,
            answerBox: answerBox || null,
            knowledgeGraph: knowledgeGraph || null,
            organicResults: topResults,
            totalResults: organicResults.length,
          },
          summary,
          disclaimer: 'Note: External data may vary by source, location, and time period. Use for general comparison purposes only.',
        }
      } catch (err) {
        console.error('[chat] search_web: Execution error', err)
        return {
          error: err instanceof Error ? err.message : 'Unknown error during web search',
          summary: 'Unable to complete web search. Please try again later.',
        }
      }
    },
  }
}
