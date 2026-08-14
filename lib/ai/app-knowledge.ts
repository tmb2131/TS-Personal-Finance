export interface AppPageKnowledgeEntry {
  route: string
  pageName: string
  purpose: string
  primaryContent: string[]
  keyActions: string[]
  commonQuestions: string[]
  sourceFiles: string[]
}

export const APP_PAGE_KNOWLEDGE_INDEX: AppPageKnowledgeEntry[] = [
  {
    route: '/login',
    pageName: 'Login',
    purpose: 'Authenticate with Google and enter the app.',
    primaryContent: [
      'Google OAuth sign-in button',
      'Inline auth error messages for restricted or failed sign-in',
    ],
    keyActions: [
      'Click "Sign in with Google"',
      'If sign-in fails, retry from the same page',
    ],
    commonQuestions: [
      'How do I sign in?',
      'Why am I seeing "This email is not allowed to access the app"?',
    ],
    sourceFiles: ['app/login/page.tsx'],
  },
  {
    route: '/',
    pageName: 'Home',
    purpose:
      'Answer one question: is there anything I need to do? Merges the former Daily Summary and Key Insights pages.',
    primaryContent: [
      'GBP available: sterling cash actually held across the UK accounts. Does NOT follow the currency toggle, because most of the working pool is USD-denominated and a converted total would read as sterling that is not there. The converted all-cash total is shown separately and labelled.',
      'Budget status: full-year tracking against budget, with the over/under gap',
      'Net worth: latest total excluding trust capital',
      'Attention: zero to three actionable items (stale sync, category well over budget). Shows "Nothing needs attention." when there are none.',
    ],
    keyActions: [
      'Follow an attention item through to the page that can act on it',
      'Open Spending or Position from the inline links',
    ],
    commonQuestions: [
      'How much sterling do I actually have?',
      'Why is GBP available different from my total cash?',
      'Am I over or under budget?',
      'Is there anything I need to deal with?',
    ],
    sourceFiles: [
      'app/page.tsx',
      'components/home/home-content.tsx',
      'components/home/attention-list.tsx',
      'lib/gbp-available.ts',
    ],
  },
  {
    route: '/spending',
    pageName: 'Spending',
    purpose: 'Everything about money going out: today, budget, analysis, transactions, recurring.',
    primaryContent: [
      'Today section: today\'s headroom, spend by category and by forecast methodology',
      'Budget table: per-category budget vs tracking (section id budget-table)',
      'Transaction Analysis: YTD/MTD breakdowns by category and merchant (section id transaction-analysis)',
      'Transactions list: search, filter and review synced and imported rows',
      'Recurring payments: detected and manually tracked subscriptions and commitments',
    ],
    keyActions: [
      'Add a transaction or a recurring payment from the page header',
      'Filter transaction analysis by period, year, month or category',
      'Edit budgets via Settings > Category Planning',
    ],
    commonQuestions: [
      'How much have I spent on a category this year?',
      'What can I spend today?',
      'Which subscriptions am I paying for?',
      'Where is the budget table?',
    ],
    sourceFiles: [
      'app/spending/page.tsx',
      'components/dashboard/budget-table.tsx',
      'components/analysis/transaction-analysis.tsx',
      'components/transactions/transactions-list.tsx',
      'components/recurring/recurring-payments-table.tsx',
      'components/today/today-page-content.tsx',
    ],
  },
  {
    route: '/position',
    pageName: 'Position',
    purpose: 'What is owned, what it is worth, and how much of it is actually spendable.',
    primaryContent: [
      'Accounts overview with in-app add/edit and sheet import',
      'Net worth chart over time (section id net-worth-chart)',
      'Cash runway (section id cash-runway)',
      'Liquidity: total cash, liquid assets, instant liquidity, distribution, risk and horizon profiles, debt',
      'Sustainable spend explorer',
      'Kids accounts, hidden entirely when there is no kids data',
    ],
    keyActions: [
      'Add or edit an account, or import balances from the sheet',
      'Add a debt or committed capital line',
      'Adjust return and inflation assumptions to move the sustainable spend range',
    ],
    commonQuestions: [
      'What is my net worth?',
      'How long does my cash last?',
      'How much can I sustainably spend?',
      'Does the trust count towards my liquidity?',
    ],
    sourceFiles: [
      'app/position/page.tsx',
      'components/accounts/accounts-overview.tsx',
      'components/liquidity/liquidity-overview-kpis.tsx',
      'components/liquidity/enough-calculator.tsx',
      'components/sustainable-spend/spend-explorer.tsx',
      'components/kids/kids-section.tsx',
      'lib/trust-exclusions.ts',
    ],
  },
  {
    route: '/trends',
    pageName: 'Trends',
    purpose: 'How the year is tracking, and how it compares with the years before it.',
    primaryContent: [
      'Observations: top ranked allocation and spending observations from the data',
      'Forecast: one section with a period toggle across year-to-date, full-year, and how the forecast changed. Replaces the three former sections ytd-spend, annual-cumulative and forecast-evolution, whose fragments still land here.',
      'Methodologies: three forecast methodologies and the scenario band across them',
      'Year-over-year net worth bridge and waterfall (section id yoy-net-worth)',
      'Monthly category trends (section id monthly-category-trends)',
      'Annual and monthly trends tables',
    ],
    keyActions: [
      'Switch the forecast period toggle between year-to-date, full year, and how it changed',
      'Compare a category across years in the trends tables',
    ],
    commonQuestions: [
      'How has my forecast changed since last week?',
      'How does this year compare with last year?',
      'Where did my net worth change come from?',
    ],
    sourceFiles: [
      'app/trends/page.tsx',
      'components/trends/forecast-section.tsx',
      'components/observations/observations-section.tsx',
      'components/analysis/yoy-net-worth-waterfall.tsx',
      'components/analysis/monthly-category-trends-section.tsx',
    ],
  },
  {
    route: '/settings',
    pageName: 'Settings',
    purpose: 'Data sources, CSV import, category planning, assumptions, appearance, and account.',
    primaryContent: [
      'Google Sheet connection and display preferences (section id google-sheet)',
      'CSV import for transactions, balances and recurring payments (section id import)',
      'Category planning: budgets and forecast methods (section id category-planning)',
      'Financial assumptions: returns, inflation, horizon, trust inclusion (section id financial-assumptions)',
      'Appearance: light, dark or system theme (section id appearance)',
      'Account: log out (section id account)',
    ],
    keyActions: [
      'Connect a Google Sheet by pasting the Spreadsheet ID',
      'Import a CSV without maintaining a live spreadsheet',
      'Edit budgets and forecast methods per category',
      'Change theme or log out',
    ],
    commonQuestions: [
      'How do I connect my Google Sheet?',
      'Where do I import a CSV?',
      'Where do I change default currency?',
      'Where is dark mode?',
      'How do I log out?',
    ],
    sourceFiles: [
      'app/settings/page.tsx',
      'components/settings/settings-form.tsx',
      'components/settings/category-planning-section.tsx',
      'components/settings/financial-assumptions-section.tsx',
      'components/settings/appearance-form.tsx',
      'components/settings/account-actions.tsx',
      'components/import/csv-upload.tsx',
    ],
  },
  {
    route: 'global',
    pageName: 'Global Navigation and Header',
    purpose: 'Provide cross-app navigation and utility actions.',
    primaryContent: [
      'Five-item sidebar on desktop and five-item bottom navigation on mobile. There is no "More" sheet — every destination is one tap.',
      'Header: sync status, refresh, currency chip, quick add',
      'Currency chip shows the active currency; tap it to switch',
      'One floating button, the AI assistant. Quick Add lives in the header.',
      'Theme and log out live in Settings, not the header',
    ],
    keyActions: [
      'Use sidebar or bottom nav to switch between Home, Spending, Position, Trends and Settings',
      'Use Refresh Sheet to sync',
      'Tap the currency chip to switch display currency',
      'Open chat with the floating button',
    ],
    commonQuestions: [
      'Where do I refresh data?',
      'How do I open the AI assistant?',
      'Where do I switch currency?',
      'Where did the Dashboard / Insights / Analysis page go?',
      'Where is the theme toggle?',
    ],
    sourceFiles: [
      'components/sidebar.tsx',
      'components/header.tsx',
      'components/currency-toggle.tsx',
      'components/ai-assistant/chat-widget.tsx',
      'components/app-shell.tsx',
    ],
  },
]

export function buildAppKnowledgePromptContext(): string {
  const intro = 'APP PAGE KNOWLEDGE (use this for app instructions/how-to questions):'
  const blocks = APP_PAGE_KNOWLEDGE_INDEX.map((entry) => {
    const primary = entry.primaryContent.join('; ')
    const actions = entry.keyActions.join('; ')
    const questions = entry.commonQuestions.join('; ')
    return `- ${entry.route} (${entry.pageName}): purpose=${entry.purpose} | content=${primary} | actions=${actions} | common_q=${questions}`
  })
  return [intro, ...blocks].join('\n')
}

const PAGE_ALIASES: Record<string, string[]> = {
  '/login': ['login', 'sign in', 'signin', 'auth', 'google sign in'],
  // Retired page names are kept as aliases so questions phrased against the old
  // navigation ("where is key insights") still route to where the content went.
  '/': ['home', 'main page', 'daily summary', 'summary', 'insights', 'key insights', 'overview', 'gbp available', 'attention'],
  '/spending': ['spending', 'budget', 'budget table', 'transactions', 'transaction analysis', 'add transaction', 'add a transaction', 'manual transaction', 'recurring', 'subscriptions', 'bills', 'recurring payments', 'today', 'headroom'],
  '/position': ['position', 'accounts', 'account balances', 'add account', 'net worth', 'liquidity', 'debt', 'risk profile', 'horizon profile', 'cash runway', 'runway', 'kids', 'kids accounts', 'child account', 'sustainable spend', 'sustainable spending'],
  '/trends': ['trends', 'analysis', 'forecast', 'forecast evolution', 'observations', 'yoy', 'year over year', 'monthly trends', 'annual trends', 'methodologies'],
  '/settings': ['settings', 'preferences', 'currency', 'theme', 'change the theme', 'dark mode', 'spreadsheet id', 'connect sheet', 'google sheet', 'import', 'csv', 'upload', 'column mapping', 'category planning', 'assumptions', 'log out', 'logout'],
  global: ['navigation', 'sidebar', 'header', 'refresh', 'sync', 'currency toggle', 'currency chip', 'chat button'],
}

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'at',
  'by',
  'for',
  'from',
  'how',
  'i',
  'in',
  'is',
  'it',
  'me',
  'my',
  'of',
  'on',
  'or',
  'the',
  'to',
  'what',
  'where',
  'with',
])

function normalize(input: string): string {
  return input.toLowerCase().replace(/\s+/g, ' ').trim()
}

function tokenize(input: string): string[] {
  return normalize(input)
    .split(/[^a-z0-9/]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
}

export function inferRouteHintFromQuery(query: string): string | undefined {
  const normalizedQuery = normalize(query || '')
  if (!normalizedQuery) return undefined

  const directRoute = APP_PAGE_KNOWLEDGE_INDEX.find(
    (entry) => entry.route !== 'global' && normalizedQuery.includes(entry.route.toLowerCase())
  )
  if (directRoute) return directRoute.route

  let bestRoute: string | undefined
  let bestScore = 0

  APP_PAGE_KNOWLEDGE_INDEX.forEach((entry) => {
    if (entry.route === 'global') return
    const aliases = PAGE_ALIASES[entry.route] || []
    let score = 0
    aliases.forEach((alias) => {
      const aliasNorm = normalize(alias)
      if (!aliasNorm) return
      if (normalizedQuery.includes(aliasNorm)) score += 2
      const aliasTokens = tokenize(aliasNorm)
      if (aliasTokens.length > 0 && aliasTokens.every((token) => normalizedQuery.includes(token))) {
        score += 1
      }
    })

    if (score > bestScore) {
      bestScore = score
      bestRoute = entry.route
    }
  })

  return bestScore > 0 ? bestRoute : undefined
}

function buildEntryCorpus(entry: AppPageKnowledgeEntry): string {
  const aliases = PAGE_ALIASES[entry.route] || []
  return normalize([
    entry.route,
    entry.pageName,
    entry.purpose,
    ...entry.primaryContent,
    ...entry.keyActions,
    ...entry.commonQuestions,
    ...aliases,
  ].join(' | '))
}

function scoreEntry(
  entry: AppPageKnowledgeEntry,
  normalizedQuery: string,
  queryTokens: string[],
  routeHint?: string
): number {
  let score = 0
  const corpus = buildEntryCorpus(entry)
  const aliases = PAGE_ALIASES[entry.route] || []
  const pageNameNormalized = normalize(entry.pageName)

  if (routeHint && routeHint === entry.route) {
    score += 12
  }

  if (entry.route !== 'global' && normalizedQuery.includes(entry.route.toLowerCase())) {
    score += 10
  }

  const aliasMatches = (alias: string): boolean => {
    const aliasNorm = normalize(alias)
    if (!aliasNorm) return false
    if (normalizedQuery.includes(aliasNorm)) return true
    const aliasTokens = tokenize(aliasNorm)
    if (aliasTokens.length === 0) return false
    return aliasTokens.every((token) => normalizedQuery.includes(token))
  }

  aliases.forEach((alias) => {
    if (aliasMatches(alias)) {
      score += 6
    }
  })

  if (entry.route !== 'global') {
    const pageNameTokens = pageNameNormalized.split(/\s+/).filter((token) => token.length > 2)
    pageNameTokens.forEach((token) => {
      if (normalizedQuery.includes(token)) {
        score += 3
      }
    })
  }

  queryTokens.forEach((token) => {
    if (corpus.includes(token)) {
      score += 1
    }
  })

  if (
    entry.route === 'global' &&
    /(navigate|navigation|sidebar|header|refresh|sync|currency|chat|assistant)/.test(normalizedQuery)
  ) {
    score += 4
  }

  if (entry.route === 'global' && /(kids|analysis|accounts|liquidity|recurring|import|settings|insights|dashboard)/.test(normalizedQuery)) {
    score -= 2
  }

  return score
}

export function findRelevantAppKnowledgeEntries(args: {
  query: string
  routeHint?: string
  maxResults?: number
}): AppPageKnowledgeEntry[] {
  const query = args.query || ''
  const routeHint = args.routeHint && args.routeHint !== 'global' ? args.routeHint : undefined
  const maxResults = Math.max(1, Math.min(args.maxResults ?? 3, 6))

  const normalizedQuery = normalize(query)
  const queryTokens = tokenize(query)

  const scored = APP_PAGE_KNOWLEDGE_INDEX.map((entry) => ({
    entry,
    score: scoreEntry(entry, normalizedQuery, queryTokens, routeHint),
  }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)

  if (scored.length > 0) {
    return scored.slice(0, maxResults).map((item) => item.entry)
  }

  // Fallback for vague queries: return hinted route + global navigation guidance
  const fallback: AppPageKnowledgeEntry[] = []
  if (routeHint) {
    const hinted = APP_PAGE_KNOWLEDGE_INDEX.find((entry) => entry.route === routeHint)
    if (hinted) fallback.push(hinted)
  }
  const global = APP_PAGE_KNOWLEDGE_INDEX.find((entry) => entry.route === 'global')
  if (global && !fallback.some((entry) => entry.route === 'global')) {
    fallback.push(global)
  }

  if (fallback.length > 0) {
    return fallback.slice(0, maxResults)
  }

  return APP_PAGE_KNOWLEDGE_INDEX.filter((entry) => entry.route === 'global' || entry.route === '/settings').slice(0, maxResults)
}
