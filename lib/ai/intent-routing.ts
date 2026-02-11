export type ChatQueryIntent = 'finance' | 'app_instructions' | 'mixed' | 'unknown'

export interface QueryIntentResult {
  intent: ChatQueryIntent
  financeScore: number
  appScore: number
}

const FINANCE_HINTS = [
  'net worth',
  'spend',
  'spending',
  'expense',
  'income',
  'budget',
  'forecast',
  'runway',
  'burn',
  'balance',
  'account value',
  'category trend',
  'merchant',
  'over budget',
  'under budget',
  'ytd',
  'q1',
  'q2',
  'q3',
  'q4',
]

const APP_HINTS = [
  'how do i',
  'how to',
  'where do i',
  'where can i',
  'which page',
  'page',
  'which tab',
  'tab',
  'navigation',
  'click',
  'navigate',
  'open',
  'settings',
  'import',
  'csv',
  'connect sheet',
  'google sheet id',
  'spreadsheet id',
  'refresh data',
  'sync',
  'default currency',
  'theme',
  'login',
  'sign in',
  'sidebar',
  'chat button',
  'kids',
  'add account',
  'add transaction',
]

function normalize(input: string): string {
  return input.toLowerCase().replace(/\s+/g, ' ').trim()
}

function scoreHints(normalizedQuery: string, hints: string[]): number {
  return hints.reduce((score, hint) => {
    return normalizedQuery.includes(hint) ? score + 2 : score
  }, 0)
}

function scoreSingleTokens(normalizedQuery: string, tokens: string[]): number {
  return tokens.reduce((score, token) => {
    const pattern = new RegExp(`\\b${token}\\b`, 'i')
    return pattern.test(normalizedQuery) ? score + 1 : score
  }, 0)
}

export function classifyQueryIntent(query: string): QueryIntentResult {
  const normalized = normalize(query || '')
  if (!normalized) {
    return { intent: 'unknown', financeScore: 0, appScore: 0 }
  }

  const financeScore =
    scoreHints(normalized, FINANCE_HINTS) +
    scoreSingleTokens(normalized, ['net', 'worth', 'budget', 'spending', 'income', 'expenses', 'forecast', 'runway'])

  const appScore =
    scoreHints(normalized, APP_HINTS) +
    scoreSingleTokens(normalized, ['page', 'screen', 'settings', 'import', 'csv', 'sync', 'refresh', 'navigate', 'click'])

  const hasQuestionForm = /(how|where|which|can i|do i)/.test(normalized)
  const asksForPageLocation = /(which page|what page|where.*page|tab|screen|navigation)/.test(normalized)

  if (appScore >= 4 && financeScore >= 4) {
    return { intent: 'mixed', financeScore, appScore }
  }
  if (asksForPageLocation && appScore >= 3 && financeScore <= appScore + 2) {
    return { intent: 'app_instructions', financeScore, appScore }
  }
  if (appScore >= 4 && (hasQuestionForm || appScore > financeScore)) {
    return { intent: 'app_instructions', financeScore, appScore }
  }
  if (financeScore >= 3 && financeScore >= appScore) {
    return { intent: 'finance', financeScore, appScore }
  }
  if (financeScore > 0 && appScore > 0) {
    return { intent: 'mixed', financeScore, appScore }
  }
  if (appScore > 0) {
    return { intent: 'app_instructions', financeScore, appScore }
  }
  if (financeScore > 0) {
    return { intent: 'finance', financeScore, appScore }
  }
  return { intent: 'unknown', financeScore, appScore }
}

export function buildIntentRoutingPromptContext(result: QueryIntentResult): string {
  if (result.intent === 'app_instructions') {
    return [
      'INTENT ROUTING (latest user query): APP_INSTRUCTIONS',
      '- Prioritize get_app_instructions first.',
      '- Only call financial data tools if the user explicitly asks for numbers/trends in the same request.',
    ].join('\n')
  }
  if (result.intent === 'finance') {
    return [
      'INTENT ROUTING (latest user query): FINANCE',
      '- Prioritize financial tools.',
      '- Use get_app_instructions only if the user also asks a navigation/how-to question.',
    ].join('\n')
  }
  if (result.intent === 'mixed') {
    return [
      'INTENT ROUTING (latest user query): MIXED',
      '- Use both app and financial tools as needed.',
      '- Call get_app_instructions for how-to/navigation parts and financial tools for numeric analysis parts.',
    ].join('\n')
  }
  return [
    'INTENT ROUTING (latest user query): UNKNOWN',
    '- Infer user intent from phrasing and use tools conservatively.',
  ].join('\n')
}
