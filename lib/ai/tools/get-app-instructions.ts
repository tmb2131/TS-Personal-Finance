import { z } from 'zod'
import type { ToolContext } from './types'
import { APP_PAGE_KNOWLEDGE_INDEX, findRelevantAppKnowledgeEntries, inferRouteHintFromQuery } from '@/lib/ai/app-knowledge'

export function createGetAppInstructionsTool(_ctx: ToolContext) {
  return {
    description: `Get grounded instructions for using app pages and features. Use this for questions like:
        - "How do I connect my Google Sheet?"
        - "Where do I import a CSV?"
        - "How do I refresh data?"
        - "What does the Liquidity page show?"
        - "Where can I change default currency?"
        This tool returns route-specific guidance, actions, and source-backed page context.`,
    inputSchema: z.object({
      query: z.string().describe('The user question about app usage, navigation, or settings.'),
      routeHint: z.string().optional().describe('Optional route hint if user mentions a page (e.g., /settings, /import, /analysis).'),
      maxResults: z.number().optional().default(3).describe('Maximum number of matched page entries to return (1-6).'),
    }),
    execute: async ({ query, routeHint, maxResults = 3 }: { query: string; routeHint?: string; maxResults?: number }) => {
      try {
        console.log('[chat] get_app_instructions: Starting', { query, routeHint, maxResults })

        const normalizedRouteHint =
          routeHint && APP_PAGE_KNOWLEDGE_INDEX.some((entry) => entry.route === routeHint)
            ? routeHint
            : inferRouteHintFromQuery(query)

        const matches = findRelevantAppKnowledgeEntries({
          query,
          routeHint: normalizedRouteHint,
          maxResults,
        })

        if (!matches.length) {
          return {
            guidance: null,
            summary: 'I could not find a matching app instruction in the current page knowledge.',
          }
        }

        const primary = matches[0]
        const summary = [
          `${primary.pageName}: ${primary.purpose}`,
          `Key actions: ${primary.keyActions.slice(0, 3).join('; ')}`,
        ].join(' ')

        return {
          guidance: {
            query,
            routeHint: normalizedRouteHint || null,
            matchedRoutes: matches.map((entry) => entry.route),
            entries: matches.map((entry) => ({
              route: entry.route,
              pageName: entry.pageName,
              purpose: entry.purpose,
              keyActions: entry.keyActions,
              primaryContent: entry.primaryContent,
              commonQuestions: entry.commonQuestions,
              sourceFiles: entry.sourceFiles,
            })),
            source: 'lib/ai/app-knowledge.ts',
          },
          summary,
        }
      } catch (err) {
        console.error('[chat] get_app_instructions: Execution error', err)
        return { error: err instanceof Error ? err.message : 'Unknown error' }
      }
    },
  }
}
