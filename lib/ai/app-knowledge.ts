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
    route: '/insights',
    pageName: 'Key Insights',
    purpose: 'Show a quick top-level overview of financial performance and trends.',
    primaryContent: [
      'Key insight cards/charts for net worth, budget, annual and monthly spend trends',
      'Connect Sheet modal when no spreadsheet ID is configured',
      'Dummy data info banner when the shared test sheet is connected',
    ],
    keyActions: [
      'Connect a Google Sheet by pasting Spreadsheet ID',
      'Review summary insights before drilling into other pages',
    ],
    commonQuestions: [
      'Why does a modal ask me to connect a sheet?',
      'What does Key Insights show vs Dashboard?',
    ],
    sourceFiles: ['app/insights/page.tsx', 'components/insights/connect-sheet-modal.tsx', 'components/insights/dummy-data-message.tsx'],
  },
  {
    route: '/',
    pageName: 'Dashboard',
    purpose: 'Provide a broad overview of financial position plus budget and trend tables.',
    primaryContent: [
      'At-a-glance KPI cards',
      'Net worth and income-vs-expenses charts',
      'Budget table, annual trends, monthly trends',
      'In-page section navigation and back-to-top control',
    ],
    keyActions: [
      'Use section navigation buttons to jump to Net Worth, Budget, Annual, Monthly',
      'Open full table view where available to inspect denser data',
    ],
    commonQuestions: [
      'Where do I see budget vs actual?',
      'How do I jump to annual or monthly trends quickly?',
    ],
    sourceFiles: ['app/page.tsx', 'components/dashboard/dashboard-navigation.tsx'],
  },
  {
    route: '/accounts',
    pageName: 'Accounts Overview',
    purpose: 'Inspect account balances with account-level detail.',
    primaryContent: [
      'Account balances overview by institution/account/category',
      'Mobile-optimized cards and desktop tables',
    ],
    keyActions: [
      'Click "Add Account" to add a manual account row',
      'Review account balances grouped across categories/entities',
    ],
    commonQuestions: [
      'How do I add an account manually?',
      'Where do I see all account balances?',
    ],
    sourceFiles: ['app/accounts/page.tsx', 'components/accounts/accounts-overview.tsx', 'components/accounts/add-account-dialog.tsx'],
  },
  {
    route: '/liquidity',
    pageName: 'Liquidity Overview',
    purpose: 'Track liquidity, debt, and horizon/risk characteristics of assets.',
    primaryContent: [
      'Liquidity KPIs',
      'Committed capital vs cash and monthly expenses vs liquidity',
      'Debt overview and liquidity distribution',
      'Risk profile and horizon profile tables',
    ],
    keyActions: [
      'Click "Add Debt" to add debt obligations',
      'Use charts/tables to understand liquid vs locked-up exposure',
    ],
    commonQuestions: [
      'Where can I track debt?',
      'What does the liquidity page measure?',
    ],
    sourceFiles: ['app/liquidity/page.tsx', 'components/liquidity/add-debt-dialog.tsx'],
  },
  {
    route: '/kids',
    pageName: 'Kids Accounts',
    purpose: 'View and manage child account balances.',
    primaryContent: [
      'Kids account balances, notes, and purpose details',
      'Table and card layouts depending on viewport',
    ],
    keyActions: [
      'Click "Add Kids Account" to create a record',
      'Review balances by child and account type',
    ],
    commonQuestions: [
      'How do I add a kids account?',
      'Why is Kids not visible in the sidebar?',
    ],
    sourceFiles: ['app/kids/page.tsx', 'components/kids/kids-accounts-overview.tsx', 'components/kids/add-kids-account-dialog.tsx', 'components/sidebar.tsx'],
  },
  {
    route: '/analysis',
    pageName: 'Analysis & Trends',
    purpose: 'Deep-dive analytics page for runway, transactions, forecast changes, and net worth movement.',
    primaryContent: [
      'Cash runway section',
      'Transaction analysis with filters and deep-link params',
      'Forecast evolution and cumulative spend charts',
      'YoY net worth change and monthly category trends',
      'In-page anchor navigation',
    ],
    keyActions: [
      'Use section navigation to jump between analysis modules',
      'Use query params or hashes for deep links to a specific section',
      'Click "Add Transaction" to enter manual transactions',
    ],
    commonQuestions: [
      'How do I analyze a specific category trend?',
      'How do deep links like /analysis#forecast-evolution work?',
    ],
    sourceFiles: ['app/analysis/page.tsx', 'components/analysis/analysis-navigation.tsx', 'components/transactions/add-transaction-dialog.tsx'],
  },
  {
    route: '/recurring',
    pageName: 'Recurring Payments',
    purpose: 'Track recurring bills/subscriptions and detected recurring series.',
    primaryContent: [
      'Recurring payments table',
      'Recurring summary cards and review status',
    ],
    keyActions: [
      'Click "Add Recurring Payment" to add a recurring item',
      'Review detected recurring items and flagged entries',
    ],
    commonQuestions: [
      'How do I add or edit recurring payments?',
      'Where can I review recurring subscriptions?',
    ],
    sourceFiles: ['app/recurring/page.tsx', 'components/recurring/recurring-payments-table.tsx', 'components/recurring/add-recurring-payment-dialog.tsx'],
  },
  {
    route: '/import',
    pageName: 'Import Transactions',
    purpose: 'Import transactions from bank CSV files.',
    primaryContent: [
      'Three-step import flow: Upload, Map Columns, Review & Import',
      'CSV parsing, column mapping, and preview before commit',
    ],
    keyActions: [
      'Upload/drop a CSV file',
      'Map Date and Amount (required) plus optional Category/Counterparty',
      'Review parsed rows, then confirm import',
    ],
    commonQuestions: [
      'How do I import a CSV?',
      'Which columns are required for import?',
    ],
    sourceFiles: ['app/import/page.tsx', 'components/import/csv-upload.tsx', 'components/import/column-mapper.tsx', 'components/import/import-preview.tsx'],
  },
  {
    route: '/settings',
    pageName: 'Settings',
    purpose: 'Configure spreadsheet connection, user preferences, and planning settings.',
    primaryContent: [
      'Google Sheet template copy flow and service account sharing instructions',
      'Spreadsheet ID, display name, and default currency settings',
      'Category planning controls (budget source, methods, manual overrides)',
      'Appearance/theme controls',
    ],
    keyActions: [
      'Copy template sheet and share with service account email',
      'Paste Spreadsheet ID and save to trigger sync',
      'Set default currency/theme',
      'Adjust category planning methods and save',
    ],
    commonQuestions: [
      'How do I connect my Google Sheet?',
      'Where do I change default currency?',
      'How do I switch budget source between app and sheet?',
    ],
    sourceFiles: ['app/settings/page.tsx', 'components/settings/settings-form.tsx', 'components/settings/category-planning-section.tsx', 'components/settings/appearance-form.tsx'],
  },
  {
    route: 'global',
    pageName: 'Global Navigation and Header',
    purpose: 'Provide cross-app navigation and utility actions.',
    primaryContent: [
      'Sidebar navigation on desktop and bottom navigation on mobile',
      'Header actions: daily summary, refresh data, logout, currency toggle',
      'Floating AI assistant entry point',
    ],
    keyActions: [
      'Use sidebar/bottom nav to switch pages',
      'Use Refresh Data to sync from sheet',
      'Use currency toggle in header for display currency',
      'Open chat with floating button',
    ],
    commonQuestions: [
      'Where do I refresh data?',
      'How do I open the AI assistant?',
      'Where do I switch currency?',
    ],
    sourceFiles: ['components/sidebar.tsx', 'components/header.tsx', 'components/ai-assistant/chat-widget.tsx', 'components/app-shell.tsx'],
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
  '/insights': ['insights', 'key insights', 'overview', 'summary'],
  '/': ['dashboard', 'home', 'main page'],
  '/accounts': ['accounts', 'account balances', 'add account'],
  '/liquidity': ['liquidity', 'debt', 'risk profile', 'horizon profile'],
  '/kids': ['kids', 'kids accounts', 'child account'],
  '/analysis': ['analysis', 'trends', 'forecast evolution', 'cash runway', 'transaction analysis', 'add transaction', 'add a transaction', 'manual transaction'],
  '/recurring': ['recurring', 'subscriptions', 'bills', 'recurring payments'],
  '/import': ['import', 'csv', 'upload', 'column mapping'],
  '/settings': ['settings', 'preferences', 'currency', 'theme', 'spreadsheet id', 'connect sheet', 'google sheet'],
  global: ['navigation', 'sidebar', 'header', 'refresh', 'sync', 'currency toggle', 'chat button'],
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
