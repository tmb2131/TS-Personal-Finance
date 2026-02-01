import { createClient } from '@/lib/supabase/server'
import { google } from '@ai-sdk/google'
import { streamText } from 'ai'
import { z } from 'zod'

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

  try {
    const body = await req.json()
    messages = body?.messages ?? body
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
    // Convert UI message format (parts) to Core/Model format (content) for streamText
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

  // Compute current date context so the AI resolves relative dates ("last month", "this year") correctly
  const now = new Date()
  const todayISO = now.toISOString().split('T')[0]
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()
  const lastMonthStart = new Date(currentYear, currentMonth - 1, 1)
  const lastMonthEnd = new Date(currentYear, currentMonth, 0)
  const lastMonthStartISO = lastMonthStart.toISOString().split('T')[0]
  const lastMonthEndISO = lastMonthEnd.toISOString().split('T')[0]
  const dateContext = `CURRENT DATE CONTEXT (use this for ALL relative date resolution):
- Today's date: ${todayISO} (YYYY-MM-DD)
- Current year: ${currentYear}
- "Last month" = ${lastMonthStartISO} to ${lastMonthEndISO} (the calendar month immediately before the current month)
- "This year" = ${currentYear}-01-01 to ${todayISO}
- "This month" = first day of current month to ${todayISO}
When the user says "last month", "this year", "this month", or similar, you MUST pass the corresponding startDate and endDate (YYYY-MM-DD) to the tool using this context. Do not guess or use a different date.`

  let result
  try {
    // @ts-ignore - maxSteps property exists at runtime but may not be in TypeScript types
    result = streamText({
      model: google('gemini-2.5-flash'),
      system: `You are a Senior Financial Analyst AI Assistant with deep expertise in personal finance analysis. You have access to comprehensive financial data including account balances, transaction history, budget targets, and historical net worth trends.

${dateContext}

YOUR CAPABILITIES:
1. **Financial health perspective**: Synthesise account values, allocation, budget status, and spending/income trends into a short narrative (e.g. "Here's where you stand and how things are trending"). Use get_financial_health_summary when the user asks for an overall picture of their financial health, a summary of where they stand, or how they're doing (accounts, allocation, budget, spending trends).

2. **Financial Snapshots**: Answer questions about current and historical net worth, account balances grouped by currency (GBP/USD/EUR), category, or entity (Personal/Family/Trust). You can provide snapshots for any date in the past or current balances.

3. **Spending Analysis**: Analyze spending patterns, income vs expenses, merchant-specific spending (e.g., "Uber", "Amazon"), and trends over any date range. You automatically exclude non-expense categories (Excluded, Income, Gift Money, Other Income) unless explicitly requested.

4. **Budget Performance**: Compare budget targets vs actual spending, identify categories over/under budget, calculate variances, and highlight the biggest budget variances. You can analyze YTD (year-to-date) or annual budgets.

5. **Net worth trends and cash runway**: Use get_net_worth_trend when the user asks how their net worth has changed over time or for a trend over a date range. Use get_cash_runway when the user asks about runway, burn, or how long their cash will last.

DATA CONTEXT:
- The user has accounts in multiple currencies (primarily GBP and USD)
- Accounts are categorized by type (Cash, Brokerage, Alt Inv, Retirement, Taconic, House, Trust, etc.)
- Balances can be Personal, Family, or Trust entities
- Transactions include both expenses (negative amounts) and income (positive amounts)
- Budget targets are set annually and tracked YTD

CRITICAL INSTRUCTIONS:
1. **Always use tools** - Never guess or make up financial data. Always call the appropriate tool to get accurate information.
2. **Provide comprehensive summaries** - When you call a tool and receive results, you MUST immediately provide a clear, human-readable summary. Expand on the summary field provided by tools with context and insights.
3. **Multi-step analysis** - You can call multiple tools in sequence to answer complex questions. For example, use get_financial_snapshot for balances, then analyze_spending for spending patterns, then get_budget_vs_actual for budget context.
4. **Currency handling** - Always format currency appropriately: £ for GBP, $ for USD, € for EUR. When comparing amounts, convert to a single currency or show both.
5. **Entity distinction** - Clearly distinguish between Personal, Family, and Trust entities when relevant. Personal balances are in balance_personal_local, Family in balance_family_local.
6. **Net worth default** - When describing net worth (e.g. from get_financial_health_summary), show the value excluding Trust as the main figure and, when different, add subtext for "Incl. Trust: £X" so the default view is excl. Trust.
7. **Date intelligence** - Use the CURRENT DATE CONTEXT above for ALL relative date phrases ("last month", "this year", "this month", "last week"). When calling analyze_spending for "last month", pass startDate and endDate from that context (the exact YYYY-MM-DD range given). For historical queries use get_financial_snapshot with asOfDate. For current data, omit asOfDate or use 'current'.
8. **Never output raw JSON** - Always format results in natural language with proper context and insights.
9. **Be analytical** - Provide insights, trends, and context. Don't just report numbers - explain what they mean.

EXAMPLE QUERIES YOU CAN HANDLE:
- "Summarise my financial health"
- "How am I doing overall? Account values, budget, and spending trends"
- "What's my net worth as of December 2024?"
- "How much did I spend on Uber last month?"
- "Am I over budget for Food this year?"
- "Show me my current GBP vs USD breakdown"
- "What are the top 5 categories where I'm over budget?"
- "Compare my Personal vs Trust balances"
- "What was my total spending in Q4 2025?"
- "Why did my budget gap shrink since last week?"
- "What drove the increase in my forecasted spend vs last month?"
- "How has my net worth changed over the last year?"
- "What's my cash runway?"

GUARDRAILS:
- This is analysis of your data, not financial advice. Only describe and interpret; never suggest specific investments or actions.

WHEN YOU CANNOT ANSWER:
If the user asks something you cannot answer with the available data (e.g., "How much did Kiran spend yesterday?" — there is no data indicating who the owner of each transaction is; or questions about people, households, or attributes not in the data), respond in natural language explaining why you can't answer. Then follow up with a short list of types of questions you *can* answer, for example:
- Financial health summary (e.g., "Summarise my financial health")
- Spending by category, merchant, or date range (e.g., "How much did I spend on Uber last month?")
- Net worth and account balances (current or historical, by currency or entity: Personal, Family, Trust)
- Budget vs actual (over/under budget by category, YTD, annual)
- Income vs expenses and trends
- Net worth over time and cash runway`,
      messages: modelMessages,
      // @ts-expect-error - maxSteps property exists at runtime but may not be in TypeScript types
      maxSteps: 5, // CRITICAL: Allow multiple steps so AI can call tool AND generate response
      stopWhen: () => false, // CRITICAL: Never stop early - allow all steps up to maxSteps
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
    },
    onFinish: async ({ text, toolCalls, toolResults, finishReason, response, steps }) => {
      // Check all steps for text content
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
        stepsText: steps?.map((s, i) => ({ step: i, textLength: s.text?.length, finishReason: s.finishReason }))
      })
      // Log if we have tool results but no text - this indicates the model stopped after tool call
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
          toolResults: s.toolResults?.length
        })), null, 2))
      }
    },
    tools: {
      get_financial_snapshot: {
        description: `Get financial snapshot including net worth, account balances, and historical trends. 
        Use this for questions about:
        - Current net worth or balances (use asOfDate: null or omit it)
        - Historical net worth for a specific date (use asOfDate: 'YYYY-MM-DD')
        - Balances grouped by currency, category, or entity (Personal/Family/Trust)
        - Net worth breakdown by entity (Personal, Family, Trust)`,
        inputSchema: z.object({
          asOfDate: z.string().optional().describe('Specific date for historical snapshot (YYYY-MM-DD format). Omit or use null for current balances.'),
          groupBy: z.enum(['currency', 'category', 'entity']).optional().describe('Group results by currency, category, or entity (Personal/Family/Trust)'),
          entity: z.enum(['Personal', 'Family', 'Trust']).optional().describe('Filter by specific entity (Personal, Family, or Trust)'),
        }),
        execute: async ({ asOfDate, groupBy, entity }) => {
          try {
            console.log('[chat] get_financial_snapshot: Starting execution', { asOfDate, groupBy, entity })
            
            const isHistorical = asOfDate && asOfDate !== 'null'
            
            if (isHistorical) {
              // Query historical_net_worth table for past dates
              let queryBuilder = supabase
                .from('historical_net_worth')
                .select('*')
                .eq('date', asOfDate)
                .order('category', { ascending: true })
              
              if (entity) {
                queryBuilder = queryBuilder.eq('category', entity)
              }
              
              const { data: historicalData, error } = await queryBuilder
              
              if (error) {
                console.error('[chat] get_financial_snapshot: Historical query error', error)
                return { error: error.message }
              }
              
              if (!historicalData || historicalData.length === 0) {
                return {
                  snapshot: null,
                  summary: `No historical net worth data found for ${asOfDate}.`,
                }
              }
              
              // Calculate totals by currency
              const totalsByCurrency: Record<string, { gbp: number; usd: number }> = {}
              historicalData.forEach((row) => {
                if (row.amount_gbp) {
                  if (!totalsByCurrency['GBP']) totalsByCurrency['GBP'] = { gbp: 0, usd: 0 }
                  totalsByCurrency['GBP'].gbp += Number(row.amount_gbp)
                }
                if (row.amount_usd) {
                  if (!totalsByCurrency['USD']) totalsByCurrency['USD'] = { gbp: 0, usd: 0 }
                  totalsByCurrency['USD'].usd += Number(row.amount_usd)
                }
              })
              
              const summary = Object.entries(totalsByCurrency)
                .map(([currency, totals]) => {
                  const symbol = currency === 'USD' ? '$' : '£'
                  const amount = currency === 'USD' ? totals.usd : totals.gbp
                  return `${symbol}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
                })
                .join(', ')
              
              return {
                snapshot: {
                  date: asOfDate,
                  type: 'historical',
                  data: historicalData,
                  totalsByCurrency,
                  groupedBy: groupBy || 'none',
                },
                summary: `Net worth as of ${asOfDate}: ${summary}`,
              }
            } else {
              // Query current account_balances for "now"
              const { data: balances, error } = await supabase
                .from('account_balances')
                .select('*')
                .order('date_updated', { ascending: false })
              
              if (error) {
                console.error('[chat] get_financial_snapshot: Current balances error', error)
                return { error: error.message }
              }
              
              if (!balances || balances.length === 0) {
                return {
                  snapshot: null,
                  summary: 'No account balances found.',
                }
              }
              
              // Get latest balance for each account
              const accountsMap = new Map<string, any>()
              balances.forEach((balance) => {
                const key = `${balance.institution}-${balance.account_name}`
                const existing = accountsMap.get(key)
                if (!existing || new Date(balance.date_updated) > new Date(existing.date_updated)) {
                  accountsMap.set(key, balance)
                }
              })
              
              const latestBalances = Array.from(accountsMap.values())
              
              // Apply entity filter if specified
              let filteredBalances = latestBalances
              if (entity) {
                // Map entity to balance columns: Personal -> balance_personal_local, Family -> balance_family_local
                if (entity === 'Personal') {
                  filteredBalances = latestBalances.filter(b => (b.balance_personal_local || 0) !== 0)
                } else if (entity === 'Family') {
                  filteredBalances = latestBalances.filter(b => (b.balance_family_local || 0) !== 0)
                } else if (entity === 'Trust') {
                  // Trust accounts might be in category or separate - check category
                  filteredBalances = latestBalances.filter(b => 
                    b.category?.toLowerCase().includes('trust') || 
                    (b.balance_family_local || 0) !== 0
                  )
                }
              }
              
              // Group according to groupBy parameter
              let grouped: any = {}
              
              if (groupBy === 'currency') {
                filteredBalances.forEach((balance) => {
                  const currency = balance.currency || 'GBP'
                  if (!grouped[currency]) {
                    grouped[currency] = { currency, total: 0, accounts: [] }
                  }
                  grouped[currency].total += balance.balance_total_local || 0
                  grouped[currency].accounts.push({
                    institution: balance.institution,
                    account_name: balance.account_name,
                    category: balance.category,
                    balance: balance.balance_total_local,
                    personal: balance.balance_personal_local,
                    family: balance.balance_family_local,
                  })
                })
              } else if (groupBy === 'category') {
                filteredBalances.forEach((balance) => {
                  const category = balance.category || 'Unknown'
                  if (!grouped[category]) {
                    grouped[category] = { category, total: 0, accounts: [] }
                  }
                  grouped[category].total += balance.balance_total_local || 0
                  grouped[category].accounts.push({
                    institution: balance.institution,
                    account_name: balance.account_name,
                    currency: balance.currency,
                    balance: balance.balance_total_local,
                  })
                })
              } else if (groupBy === 'entity') {
                filteredBalances.forEach((balance) => {
                  const personal = balance.balance_personal_local || 0
                  const family = balance.balance_family_local || 0
                  
                  if (personal !== 0) {
                    if (!grouped['Personal']) grouped['Personal'] = { entity: 'Personal', total: 0, accounts: [] }
                    grouped['Personal'].total += personal
                    grouped['Personal'].accounts.push({
                      institution: balance.institution,
                      account_name: balance.account_name,
                      category: balance.category,
                      currency: balance.currency,
                      balance: personal,
                    })
                  }
                  
                  if (family !== 0) {
                    if (!grouped['Family']) grouped['Family'] = { entity: 'Family', total: 0, accounts: [] }
                    grouped['Family'].total += family
                    grouped['Family'].accounts.push({
                      institution: balance.institution,
                      account_name: balance.account_name,
                      category: balance.category,
                      currency: balance.currency,
                      balance: family,
                    })
                  }
                })
              } else {
                // No grouping - just totals by currency
                filteredBalances.forEach((balance) => {
                  const currency = balance.currency || 'GBP'
                  if (!grouped[currency]) {
                    grouped[currency] = { currency, total: 0 }
                  }
                  grouped[currency].total += balance.balance_total_local || 0
                })
              }
              
              const summary = Object.values(grouped)
                .map((group: any) => {
                  const symbol = group.currency === 'USD' ? '$' : group.currency === 'EUR' ? '€' : '£'
                  const amount = group.total
                  const label = group.currency || group.category || group.entity || 'Total'
                  return `${symbol}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${label}`
                })
                .join(', ')
              
              return {
                snapshot: {
                  date: 'current',
                  type: 'current',
                  data: Object.values(grouped),
                  groupedBy: groupBy || 'none',
                  entity: entity || 'all',
                },
                summary: `Current balances: ${summary}`,
              }
            }
          } catch (err) {
            console.error('[chat] get_financial_snapshot: Execution error', err)
            return { error: err instanceof Error ? err.message : 'Unknown error' }
          }
        },
      },
      analyze_spending: {
        description: `Analyze spending, income, and transactions. Use this for questions about:
        - Spending by category, merchant, or time period
        - Income vs expenses
        - Specific merchant spending (e.g., "Uber", "Amazon")
        - Spending trends over date ranges
        For relative dates ("last month", "this year") use the exact startDate and endDate (YYYY-MM-DD) from the system message's CURRENT DATE CONTEXT. Do not guess. Automatically excludes 'Excluded', 'Income', 'Gift Money', and 'Other Income' categories unless explicitly requested.`,
        inputSchema: z.object({
          startDate: z.string().optional().describe('Start date for analysis (YYYY-MM-DD). For "last month" use the range from CURRENT DATE CONTEXT. Defaults to start of current year if not specified.'),
          endDate: z.string().optional().describe('End date for analysis (YYYY-MM-DD). For "last month" use the range from CURRENT DATE CONTEXT. Defaults to today if not specified.'),
          merchant: z.string().optional().describe('Search for specific merchant/counterparty (fuzzy search, case-insensitive)'),
          category: z.string().optional().describe('Filter by specific category'),
          transactionType: z.enum(['expenses', 'income', 'all']).optional().default('expenses').describe('Filter by transaction type: expenses (negative amounts), income (positive amounts), or all'),
          includeExcluded: z.boolean().optional().default(false).describe('Include excluded categories (Excluded, Income, Gift Money, Other Income). Default is false.'),
          groupBy: z.enum(['category', 'merchant', 'month']).optional().describe('Group results by category, merchant, or month'),
          limit: z.number().optional().default(100).describe('Maximum number of transactions to return (for detailed lists)'),
        }),
        execute: async ({ 
          startDate, 
          endDate, 
          merchant, 
          category, 
          transactionType = 'expenses',
          includeExcluded = false,
          groupBy,
          limit = 100 
        }) => {
          try {
            console.log('[chat] analyze_spending: Starting execution', { 
              startDate, endDate, merchant, category, transactionType, includeExcluded, groupBy 
            })
            
            const EXCLUDED_CATEGORIES = ['Excluded', 'Income', 'Gift Money', 'Other Income']
            
            // Set default date range if not provided
            const today = new Date()
            const start = startDate ? new Date(startDate) : new Date(today.getFullYear(), 0, 1)
            const end = endDate ? new Date(endDate) : today
            
            start.setHours(0, 0, 0, 0)
            end.setHours(23, 59, 59, 999)
            
            // Use a high limit for the DB query so aggregation (totals) includes ALL matching
            // transactions. The tool's `limit` param only caps how many we return in the response.
            const queryLimit = 10000
            let queryBuilder = supabase
              .from('transaction_log')
              .select('*')
              .gte('date', start.toISOString().split('T')[0])
              .lte('date', end.toISOString().split('T')[0])
              .order('date', { ascending: false })
              .limit(queryLimit)
            
            if (category) {
              queryBuilder = queryBuilder.eq('category', category)
            }
            
            if (merchant) {
              queryBuilder = queryBuilder.ilike('counterparty', `%${merchant}%`)
            }
            
            const { data: transactions, error } = await queryBuilder
            
            if (error) {
              console.error('[chat] analyze_spending: Query error', error)
              return { error: error.message }
            }
            
            if (!transactions || transactions.length === 0) {
              return {
                analysis: null,
                summary: 'No transactions found for the specified criteria.',
              }
            }
            
            // Filter transactions
            let filtered = transactions.filter((tx) => {
              // Exclude categories unless explicitly requested
              if (!includeExcluded && EXCLUDED_CATEGORIES.includes(tx.category || '')) {
                return false
              }
              
              // Filter by transaction type
              if (transactionType === 'expenses') {
                // Only negative amounts
                return (tx.amount_gbp && tx.amount_gbp < 0) || (tx.amount_usd && tx.amount_usd < 0)
              } else if (transactionType === 'income') {
                // Only positive amounts
                return (tx.amount_gbp && tx.amount_gbp > 0) || (tx.amount_usd && tx.amount_usd > 0)
              }
              // 'all' includes everything
              return true
            })
            
            // Get current FX rate for conversions
            const { data: fxRateData } = await supabase
              .from('fx_rate_current')
              .select('gbpusd_rate')
              .order('date', { ascending: false })
              .limit(1)
              .single()
            
            const fxRate = fxRateData?.gbpusd_rate || 1.27
            
            // Convert all amounts to a single currency (GBP) for aggregation
            const convertToGBP = (amountUsd: number | null, amountGbp: number | null): number => {
              if (amountGbp !== null) return Math.abs(amountGbp)
              if (amountUsd !== null) return Math.abs(amountUsd) / fxRate
              return 0
            }
            
            // Group according to groupBy parameter
            let grouped: any = {}
            let totalGBP = 0
            let totalUSD = 0
            
            filtered.forEach((tx) => {
              const gbpAmount = convertToGBP(tx.amount_usd, tx.amount_gbp)
              const usdAmount = tx.amount_usd ? Math.abs(tx.amount_usd) : (tx.amount_gbp ? Math.abs(tx.amount_gbp) * fxRate : 0)
              
              totalGBP += gbpAmount
              totalUSD += usdAmount
              
              if (groupBy === 'category') {
                const cat = tx.category || 'Unknown'
                if (!grouped[cat]) {
                  grouped[cat] = { category: cat, totalGBP: 0, totalUSD: 0, count: 0 }
                }
                grouped[cat].totalGBP += gbpAmount
                grouped[cat].totalUSD += usdAmount
                grouped[cat].count += 1
              } else if (groupBy === 'merchant') {
                const merch = tx.counterparty || 'Unknown'
                if (!grouped[merch]) {
                  grouped[merch] = { merchant: merch, totalGBP: 0, totalUSD: 0, count: 0 }
                }
                grouped[merch].totalGBP += gbpAmount
                grouped[merch].totalUSD += usdAmount
                grouped[merch].count += 1
              } else if (groupBy === 'month') {
                const date = new Date(tx.date)
                const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
                if (!grouped[monthKey]) {
                  grouped[monthKey] = { month: monthKey, totalGBP: 0, totalUSD: 0, count: 0 }
                }
                grouped[monthKey].totalGBP += gbpAmount
                grouped[monthKey].totalUSD += usdAmount
                grouped[monthKey].count += 1
              }
            })
            
            const summary = transactionType === 'expenses' 
              ? `Total spending: £${totalGBP.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GBP / $${totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD (${filtered.length} transactions)`
              : transactionType === 'income'
              ? `Total income: £${totalGBP.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GBP / $${totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD (${filtered.length} transactions)`
              : `Total: £${totalGBP.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GBP / $${totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD (${filtered.length} transactions)`
            
            return {
              analysis: {
                period: {
                  start: start.toISOString().split('T')[0],
                  end: end.toISOString().split('T')[0],
                },
                totals: {
                  gbp: totalGBP,
                  usd: totalUSD,
                  transactionCount: filtered.length,
                },
                grouped: groupBy ? Object.values(grouped).sort((a: any, b: any) => b.totalGBP - a.totalGBP) : null,
                transactions: !groupBy ? filtered.slice(0, limit).map(tx => ({
                  date: tx.date,
                  category: tx.category,
                  counterparty: tx.counterparty || 'Unknown',
                  amount_gbp: tx.amount_gbp,
                  amount_usd: tx.amount_usd,
                })) : null,
              },
              summary,
            }
          } catch (err) {
            console.error('[chat] analyze_spending: Execution error', err)
            return { error: err instanceof Error ? err.message : 'Unknown error' }
          }
        },
      },
      get_budget_vs_actual: {
        description: `Compare budget targets vs actual spending. Use this for questions about:
        - "Am I over budget?"
        - Budget variance by category
        - Categories with biggest overspend
        - Budget performance for specific categories or time periods`,
        inputSchema: z.object({
          category: z.string().optional().describe('Filter by specific category. Omit to analyze all categories.'),
          year: z.number().optional().describe('Year for budget comparison. Defaults to current year.'),
          period: z.enum(['ytd', 'annual']).optional().default('ytd').describe('Compare YTD (year-to-date) or annual budget vs actual'),
        }),
        execute: async ({ category, year, period = 'ytd' }) => {
          try {
            console.log('[chat] get_budget_vs_actual: Starting execution', { category, year, period })
            
            const currentYear = year || new Date().getFullYear()
            const today = new Date()
            const startOfYear = new Date(currentYear, 0, 1)
            const endDate = period === 'ytd' ? today : new Date(currentYear, 11, 31, 23, 59, 59)
            
            // Get budget targets
            let budgetQuery = supabase
              .from('budget_targets')
              .select('*')
            
            if (category) {
              budgetQuery = budgetQuery.eq('category', category)
            }
            
            const { data: budgets, error: budgetError } = await budgetQuery
            
            if (budgetError) {
              console.error('[chat] get_budget_vs_actual: Budget query error', budgetError)
              return { error: budgetError.message }
            }
            
            if (!budgets || budgets.length === 0) {
              return {
                comparison: null,
                summary: category 
                  ? `No budget target found for category: ${category}`
                  : 'No budget targets found.',
              }
            }
            
            // Get actual spending from transactions
            const { data: fxRateData } = await supabase
              .from('fx_rate_current')
              .select('gbpusd_rate')
              .order('date', { ascending: false })
              .limit(1)
              .single()
            
            const fxRate = fxRateData?.gbpusd_rate || 1.27
            
            const EXCLUDED_CATEGORIES = ['Excluded', 'Income', 'Gift Money', 'Other Income']
            
            // Get transactions for the period
            let transactionQuery = supabase
              .from('transaction_log')
              .select('*')
              .gte('date', startOfYear.toISOString().split('T')[0])
              .lte('date', endDate.toISOString().split('T')[0])
            
            if (category) {
              transactionQuery = transactionQuery.eq('category', category)
            }
            
            const { data: transactions, error: txError } = await transactionQuery
            
            if (txError) {
              console.error('[chat] get_budget_vs_actual: Transaction query error', txError)
              return { error: txError.message }
            }
            
            // Filter to expenses only and exclude excluded categories
            const expenseTransactions = (transactions || []).filter((tx) => {
              if (EXCLUDED_CATEGORIES.includes(tx.category || '')) return false
              // Only negative amounts (expenses)
              return (tx.amount_gbp && tx.amount_gbp < 0) || (tx.amount_usd && tx.amount_usd < 0)
            })
            
            // Calculate actual spending by category
            const actualByCategory: Record<string, { gbp: number; usd: number }> = {}
            
            expenseTransactions.forEach((tx) => {
              const cat = tx.category || 'Unknown'
              if (!actualByCategory[cat]) {
                actualByCategory[cat] = { gbp: 0, usd: 0 }
              }
              
              if (tx.amount_gbp) {
                actualByCategory[cat].gbp += Math.abs(tx.amount_gbp)
              }
              if (tx.amount_usd) {
                actualByCategory[cat].usd += Math.abs(tx.amount_usd)
              }
            })
            
            // Calculate variance for each budget category. Use GBP as source of truth, convert to USD with current FX rate.
            const comparisons = budgets.map((budget) => {
              const actual = actualByCategory[budget.category] || { gbp: 0, usd: 0 }
              
              // Use YTD or annual budget based on period parameter
              const budgetGBP = period === 'ytd' 
                ? (budget.ytd_gbp || 0) 
                : (budget.annual_budget_gbp || 0)
              const budgetUSD = (period === 'ytd' ? (budget.ytd_gbp ?? 0) : (budget.annual_budget_gbp ?? 0)) * fxRate
              
              // Calculate variance (Budget - Actual, positive = under budget, negative = over budget)
              const varianceGBP = budgetGBP - actual.gbp
              const varianceUSD = budgetUSD - actual.usd
              
              // Calculate percentage
              const percentUsedGBP = budgetGBP > 0 ? (actual.gbp / budgetGBP) * 100 : 0
              const percentUsedUSD = budgetUSD > 0 ? (actual.usd / budgetUSD) * 100 : 0
              
              return {
                category: budget.category,
                budgetGBP,
                budgetUSD,
                actualGBP: actual.gbp,
                actualUSD: actual.usd,
                varianceGBP,
                varianceUSD,
                percentUsedGBP,
                percentUsedUSD,
                isOverBudget: varianceGBP < 0 || varianceUSD < 0,
              }
            })
            
            // Sort by variance (biggest overspend first)
            comparisons.sort((a, b) => {
              const aVariance = Math.min(a.varianceGBP, a.varianceUSD)
              const bVariance = Math.min(b.varianceGBP, b.varianceUSD)
              return aVariance - bVariance // Most negative (over budget) first
            })
            
            // Generate summary
            const overBudget = comparisons.filter(c => c.isOverBudget)
            const underBudget = comparisons.filter(c => !c.isOverBudget)
            
            const summary = period === 'ytd'
              ? `YTD Budget Analysis: ${overBudget.length} category${overBudget.length === 1 ? '' : 'ies'} over budget, ${underBudget.length} under budget.`
              : `Annual Budget Analysis: ${overBudget.length} category${overBudget.length === 1 ? '' : 'ies'} over budget, ${underBudget.length} under budget.`
            
            return {
              comparison: {
                period,
                year: currentYear,
                comparisons,
                summary: {
                  totalCategories: comparisons.length,
                  overBudget: overBudget.length,
                  underBudget: underBudget.length,
                  topOverspend: comparisons.slice(0, 5).filter(c => c.isOverBudget),
                },
              },
              summary,
            }
          } catch (err) {
            console.error('[chat] get_budget_vs_actual: Execution error', err)
            return { error: err instanceof Error ? err.message : 'Unknown error' }
          }
        },
      },
      get_financial_health_summary: {
        description: `Get an overall financial health snapshot in one call: net worth, allocation, budget status (net income under/over), and top spending categories. Use when the user asks for an overall picture of their financial health, a summary of where they stand, or how they're doing (accounts, allocation, budget, spending trends).`,
        inputSchema: z.object({
          asOfDate: z.string().optional().describe('Specific date for snapshot (YYYY-MM-DD). Omit for current.'),
          currency: z.enum(['GBP', 'USD']).optional().default('GBP').describe('Currency for summary display.'),
        }),
        execute: async ({ asOfDate, currency = 'GBP' }) => {
          try {
            console.log('[chat] get_financial_health_summary: Starting', { asOfDate, currency })

            const isHistorical = asOfDate && asOfDate !== 'null'
            const fxRes = await supabase.from('fx_rate_current').select('gbpusd_rate').order('date', { ascending: false }).limit(1).single()
            const fxRate = fxRes.data?.gbpusd_rate ?? 1.27

            // 1) Net worth
            let totalGbp = 0
            let totalUsd = 0
            const allocationByCurrency: { currency: string; totalGbp: number; totalUsd: number }[] = []

            let totalGbpInclTrust = 0
            let totalUsdInclTrust = 0

            if (isHistorical) {
              const { data: histRows, error: histErr } = await supabase
                .from('historical_net_worth')
                .select('amount_gbp, amount_usd, category')
                .eq('date', asOfDate)
              if (!histErr && histRows?.length) {
                histRows.forEach((r: { amount_gbp?: number | null; amount_usd?: number | null; category?: string | null }) => {
                  const gbp = Number(r.amount_gbp ?? 0)
                  const usd = Number(r.amount_usd ?? 0)
                  totalGbpInclTrust += gbp
                  totalUsdInclTrust += usd
                  const isTrust = (r.category || '').toLowerCase().includes('trust')
                  if (!isTrust) {
                    totalGbp += gbp
                    totalUsd += usd
                  }
                })
                allocationByCurrency.push({ currency: 'GBP', totalGbp: totalGbpInclTrust, totalUsd: totalGbpInclTrust * fxRate })
                allocationByCurrency.push({ currency: 'USD', totalGbp: totalUsdInclTrust / fxRate, totalUsd: totalUsdInclTrust })
              }
            } else {
              const { data: balances, error: balErr } = await supabase.from('account_balances').select('*').order('date_updated', { ascending: false })
              if (balErr) throw new Error(balErr.message)
              const byAccount = new Map<string, { balance_total_local: number; currency: string; date_updated: string; category: string }>()
              ;(balances || []).forEach((b: { institution: string; account_name: string; date_updated: string; balance_total_local?: number | null; currency?: string | null; category?: string | null }) => {
                const key = `${b.institution}-${b.account_name}`
                const existing = byAccount.get(key)
                if (!existing || new Date(b.date_updated) > new Date(existing.date_updated)) {
                  byAccount.set(key, {
                    balance_total_local: Number(b.balance_total_local ?? 0),
                    currency: (b.currency || 'GBP').toUpperCase(),
                    date_updated: b.date_updated,
                    category: b.category || '',
                  })
                }
              })
              const byCurr: Record<string, { gbp: number; usd: number }> = {}
              byAccount.forEach(({ balance_total_local, currency: curr, category: cat }) => {
                const isTrust = (cat || '').toLowerCase().includes('trust')
                if (!byCurr[curr]) byCurr[curr] = { gbp: 0, usd: 0 }
                if (curr === 'GBP') {
                  byCurr[curr].gbp += balance_total_local
                  totalGbpInclTrust += balance_total_local
                  totalUsdInclTrust += balance_total_local * fxRate
                  if (!isTrust) {
                    totalGbp += balance_total_local
                    totalUsd += balance_total_local * fxRate
                  }
                } else {
                  byCurr[curr].usd += balance_total_local
                  totalUsdInclTrust += balance_total_local
                  totalGbpInclTrust += balance_total_local / fxRate
                  if (!isTrust) {
                    totalUsd += balance_total_local
                    totalGbp += balance_total_local / fxRate
                  }
                }
              })
              Object.entries(byCurr).forEach(([curr, { gbp, usd }]) => {
                allocationByCurrency.push({ currency: curr, totalGbp: gbp, totalUsd: usd })
              })
            }

            const fmtGbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
            const fmtUsd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
            const netWorthSummary = currency === 'USD'
              ? `Net worth (excl. Trust): ${fmtUsd(totalUsd)} USD`
              : `Net worth (excl. Trust): ${fmtGbp(totalGbp)} GBP`
            const netWorthIncludingTrust = (totalGbpInclTrust !== totalGbp || totalUsdInclTrust !== totalUsd)
              ? currency === 'USD'
                ? `Incl. Trust: ${fmtUsd(totalUsdInclTrust)} USD`
                : `Incl. Trust: ${fmtGbp(totalGbpInclTrust)} GBP`
              : null
            const allocationSummary = allocationByCurrency.length
              ? allocationByCurrency
                  .map((a) =>
                    a.currency === 'USD'
                      ? `$${(a.totalUsd || a.totalGbp * fxRate).toLocaleString('en-US', { maximumFractionDigits: 0 })} USD`
                      : `£${(a.totalGbp || a.totalUsd / fxRate).toLocaleString('en-GB', { maximumFractionDigits: 0 })} GBP`
                  )
                  .join(', ')
              : 'No allocation data'

            // 2) Budget (net income: income - expenses from budget_targets)
            const EXCLUDED = ['Excluded', 'Income', 'Gift Money', 'Other Income']
            const { data: budgetRows, error: budgetErr } = await supabase.from('budget_targets').select('category, annual_budget_gbp, tracking_est_gbp')
            if (budgetErr) throw new Error(budgetErr.message)

            let incomeBudget = 0
            let incomeTracking = 0
            let expensesBudget = 0
            let expensesTracking = 0
            const expenseCategories: { category: string; trackingGbp: number }[] = []

            ;(budgetRows || []).forEach((row: { category: string; annual_budget_gbp?: number | null; tracking_est_gbp?: number | null }) => {
              const budget = Math.abs(Number(row.annual_budget_gbp ?? 0))
              const tracking = Math.abs(Number(row.tracking_est_gbp ?? 0))
              if (row.category === 'Income' || row.category === 'Gift Money') {
                incomeBudget += budget
                incomeTracking += tracking
              } else if (!EXCLUDED.includes(row.category)) {
                expensesBudget += budget
                expensesTracking += tracking
                expenseCategories.push({ category: row.category, trackingGbp: tracking })
              }
            })

            const netIncomeBudget = incomeBudget - expensesBudget
            const netIncomeTracking = incomeTracking - expensesTracking
            const budgetGap = netIncomeTracking - netIncomeBudget
            const budgetStatus = budgetGap >= 0 ? 'under' : 'over'
            const gapDisplay = currency === 'USD' ? Math.abs(budgetGap) * fxRate : Math.abs(budgetGap)
            const budgetStatusSummary = budgetGap >= 0
              ? `Net income budget: Under by ${currency === 'USD' ? '$' : '£'}${gapDisplay.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
              : `Net income budget: Over by ${currency === 'USD' ? '$' : '£'}${gapDisplay.toLocaleString('en-US', { maximumFractionDigits: 0 })}`

            expenseCategories.sort((a, b) => b.trackingGbp - a.trackingGbp)
            const topSpend = expenseCategories.slice(0, 5)
            const topSpendCategories = topSpend.length
              ? `Top spending categories (Estimated Full Year): ${topSpend.map((s) => `${s.category} (£${s.trackingGbp.toLocaleString('en-GB', { maximumFractionDigits: 0 })})`).join(', ')}`
              : 'No expense categories'

            const summary = netWorthIncludingTrust
              ? `${netWorthSummary}. ${netWorthIncludingTrust}. ${budgetStatusSummary}. ${topSpendCategories}.`
              : `${netWorthSummary}. ${budgetStatusSummary}. ${topSpendCategories}.`

            return {
              health: {
                netWorthSummary,
                netWorthIncludingTrust,
                allocationSummary,
                budgetStatusSummary,
                topSpendCategories,
                netWorthGbp: totalGbp,
                netWorthUsd: totalUsd,
                netWorthGbpInclTrust: totalGbpInclTrust,
                netWorthUsdInclTrust: totalUsdInclTrust,
                budgetGapGbp: budgetGap,
                budgetStatus,
                topCategories: topSpend.map((s) => ({ category: s.category, trackingGbp: s.trackingGbp })),
              },
              summary,
            }
          } catch (err) {
            console.error('[chat] get_financial_health_summary: Execution error', err)
            return { error: err instanceof Error ? err.message : 'Unknown error' }
          }
        },
      },
      analyze_forecast_evolution: {
        description: `Analyze how the expenses gap to budget (budget minus tracking) has changed over time. Use when the user asks about changes in the forecast/gap (e.g., 'vs last week'). Uses expense categories only (excludes Income, Gift Money, Other Income, Excluded).`,
        inputSchema: z.object({
          startDate: z.string().describe('Start date for comparison (YYYY-MM-DD). Use CURRENT DATE CONTEXT for "last month", "last week", etc.'),
          endDate: z.string().optional().describe('End date for comparison (YYYY-MM-DD). Defaults to today if omitted.'),
          currency: z.enum(['GBP', 'USD']).optional().default('GBP').describe('Currency for summary display. All evolution data is in GBP; summary is converted if USD.'),
        }),
        execute: async ({ startDate, endDate, currency = 'GBP' }) => {
          try {
            const end = endDate || todayISO
            console.log('[chat] analyze_forecast_evolution: Starting', { startDate, endDate: end, currency })

            const EXCLUDED = ['Income', 'Gift Money', 'Other Income', 'Excluded']
            const toNum = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0)
            const isExpense = (c: string) => !EXCLUDED.includes(c)

            // Step A: Fetch start snapshot
            const { data: startRows, error: startError } = await supabase
              .from('budget_history')
              .select('category, forecast_spend, annual_budget')
              .eq('date', startDate)

            if (startError) {
              console.error('[chat] analyze_forecast_evolution: Start query error', startError)
              return { error: startError.message }
            }
            if (!startRows || startRows.length === 0) {
              return { error: `No historical data found for ${startDate}. Comparison not possible.` }
            }

            const startGapMap = new Map<string, number>()
            startRows
              .filter((r: { category: string }) => isExpense(r.category))
              .forEach((row: { category: string; annual_budget: unknown; forecast_spend: unknown }) => {
                const gap = toNum(row.annual_budget) - toNum(row.forecast_spend)
                startGapMap.set(row.category, gap)
              })

            // Step B: Fetch end snapshot (with fallback)
            const endGapMap = new Map<string, number>()
            let endDateUsed = end

            const { data: endRowsExact, error: endExactError } = await supabase
              .from('budget_history')
              .select('category, forecast_spend, annual_budget')
              .eq('date', end)

            if (!endExactError && endRowsExact && endRowsExact.length > 0) {
              endRowsExact
                .filter((r: { category: string }) => isExpense(r.category))
                .forEach((row: { category: string; annual_budget: unknown; forecast_spend: unknown }) => {
                  const gap = toNum(row.annual_budget) - toNum(row.forecast_spend)
                  endGapMap.set(row.category, gap)
                })
            } else {
              const { data: endRowsLatest, error: endLatestError } = await supabase
                .from('budget_history')
                .select('date, category, forecast_spend, annual_budget')
                .lte('date', end)
                .order('date', { ascending: false })
                .limit(500)

              if (!endLatestError && endRowsLatest && endRowsLatest.length > 0) {
                const latestDate = endRowsLatest[0].date
                endDateUsed = latestDate
                endRowsLatest
                  .filter((r: { date: string }) => r.date === latestDate)
                  .filter((r: { category: string }) => isExpense(r.category))
                  .forEach((row: { category: string; annual_budget: unknown; forecast_spend: unknown }) => {
                    const gap = toNum(row.annual_budget) - toNum(row.forecast_spend)
                    endGapMap.set(row.category, gap)
                  })
              } else {
                const { data: targets, error: targetsError } = await supabase
                  .from('budget_targets')
                  .select('category, annual_budget_gbp, tracking_est_gbp, ytd_gbp')

                if (targetsError || !targets?.length) {
                  return { error: 'No end snapshot available (no budget_history and no budget_targets).' }
                }
                targets
                  .filter((r: { category: string }) => isExpense(r.category))
                  .forEach((row: { category: string; annual_budget_gbp: unknown; tracking_est_gbp: unknown }) => {
                    const gap = toNum(row.annual_budget_gbp) - toNum(row.tracking_est_gbp)
                    endGapMap.set(row.category, gap)
                  })
              }
            }

            // Step C: Gap deltas (positive = gap improved)
            const allCategories = new Set([...startGapMap.keys(), ...endGapMap.keys()])
            const drivers: { category: string; change_gbp: number; impact: 'Positive' | 'Negative' | 'Neutral' }[] = []
            let totalGapChangeGBP = 0

            for (const category of allCategories) {
              const startGap = startGapMap.get(category) ?? 0
              const endGap = endGapMap.get(category) ?? 0
              const changeGbp = endGap - startGap
              totalGapChangeGBP += changeGbp
              const impact: 'Positive' | 'Negative' | 'Neutral' =
                changeGbp > 0 ? 'Positive' : changeGbp < 0 ? 'Negative' : 'Neutral'
              drivers.push({ category, change_gbp: changeGbp, impact })
            }

            drivers.sort((a, b) => Math.abs(b.change_gbp) - Math.abs(a.change_gbp))

            const gapImpactDirection: 'Positive' | 'Negative' | 'Neutral' =
              totalGapChangeGBP > 0 ? 'Positive' : totalGapChangeGBP < 0 ? 'Negative' : 'Neutral'

            let summary: string
            const fmtGbp = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`
            if (currency === 'USD') {
              const { data: fxRow } = await supabase
                .from('fx_rate_current')
                .select('gbpusd_rate')
                .order('date', { ascending: false })
                .limit(1)
                .single()
              const fxRate = fxRow?.gbpusd_rate ?? 1.27
              const fmtUsd = (n: number) => `$${Math.round(n * fxRate).toLocaleString('en-US')}`
              const direction =
                totalGapChangeGBP > 0 ? 'improved' : totalGapChangeGBP < 0 ? 'worsened' : 'stayed flat'
              const topDrivers = drivers.slice(0, 5)
              const driverParts = topDrivers
                .filter((d) => d.change_gbp !== 0)
                .map((d) => `${d.category} (${d.change_gbp >= 0 ? '+' : ''}${fmtUsd(d.change_gbp)})`)
              summary = `The expenses gap to budget ${direction} by ${fmtUsd(Math.abs(totalGapChangeGBP))} between ${startDate} and ${endDateUsed}. ${driverParts.length ? 'Main drivers: ' + driverParts.join(', ') + '.' : ''}`
            } else {
              const direction =
                totalGapChangeGBP > 0 ? 'improved' : totalGapChangeGBP < 0 ? 'worsened' : 'stayed flat'
              const topDrivers = drivers.slice(0, 5)
              const driverParts = topDrivers
                .filter((d) => d.change_gbp !== 0)
                .map((d) => `${d.category} (${d.change_gbp >= 0 ? '+' : ''}${fmtGbp(d.change_gbp)})`)
              summary = `The expenses gap to budget ${direction} by ${fmtGbp(Math.abs(totalGapChangeGBP))} between ${startDate} and ${endDateUsed}. ${driverParts.length ? 'Main drivers: ' + driverParts.join(', ') + '.' : ''}`
            }

            return {
              evolution: {
                startDate,
                endDate: endDateUsed,
                total_gap_change: totalGapChangeGBP,
                gap_impact_direction: gapImpactDirection,
                drivers,
              },
              summary,
            }
          } catch (err) {
            console.error('[chat] analyze_forecast_evolution: Execution error', err)
            return { error: err instanceof Error ? err.message : 'Unknown error' }
          }
        },
      },
      get_net_worth_trend: {
        description: `Get net worth over a date range (time series). Use when the user asks how their net worth has changed over time or for a trend over a date range. Use CURRENT DATE CONTEXT for relative dates.`,
        inputSchema: z.object({
          startDate: z.string().describe('Start date (YYYY-MM-DD). Use CURRENT DATE CONTEXT for "last year", "this year", etc.'),
          endDate: z.string().optional().describe('End date (YYYY-MM-DD). Defaults to today if omitted.'),
          groupBy: z.enum(['total', 'entity']).optional().default('total').describe('Return total only or breakdown by entity (category in historical_net_worth).'),
        }),
        execute: async ({ startDate, endDate, groupBy = 'total' }) => {
          try {
            const end = endDate || todayISO
            console.log('[chat] get_net_worth_trend: Starting', { startDate, endDate: end, groupBy })

            const { data: rows, error } = await supabase
              .from('historical_net_worth')
              .select('date, category, amount_gbp, amount_usd')
              .gte('date', startDate)
              .lte('date', end)
              .order('date', { ascending: true })

            if (error) {
              console.error('[chat] get_net_worth_trend: Query error', error)
              return { error: error.message }
            }
            if (!rows || rows.length === 0) {
              return {
                trend: null,
                summary: `No net worth data found between ${startDate} and ${end}.`,
              }
            }

            const fxRes = await supabase.from('fx_rate_current').select('gbpusd_rate').order('date', { ascending: false }).limit(1).single()
            const fxRate = fxRes.data?.gbpusd_rate ?? 1.27

            const byDate: Record<string, { totalGbp: number; totalUsd: number; byEntity?: Record<string, { gbp: number; usd: number }> }> = {}
            rows.forEach((r: { date: string; category: string; amount_gbp?: number | null; amount_usd?: number | null }) => {
              const gbp = Number(r.amount_gbp ?? 0)
              const usd = Number(r.amount_usd ?? 0)
              if (!byDate[r.date]) {
                byDate[r.date] = { totalGbp: 0, totalUsd: 0, ...(groupBy === 'entity' ? { byEntity: {} } : {}) }
              }
              byDate[r.date].totalGbp += gbp
              byDate[r.date].totalUsd += usd
              if (groupBy === 'entity' && byDate[r.date].byEntity) {
                const ent = r.category || 'Other'
                if (!byDate[r.date].byEntity![ent]) byDate[r.date].byEntity![ent] = { gbp: 0, usd: 0 }
                byDate[r.date].byEntity![ent].gbp += gbp
                byDate[r.date].byEntity![ent].usd += usd
              }
            })

            const sortedDates = Object.keys(byDate).sort()
            const firstDate = sortedDates[0]
            const lastDate = sortedDates[sortedDates.length - 1]
            const startVal = byDate[firstDate]
            const endVal = byDate[lastDate]
            const startGbp = startVal?.totalGbp ?? 0
            const endGbp = endVal?.totalGbp ?? 0
            const startUsd = startVal?.totalUsd ?? 0
            const endUsd = endVal?.totalUsd ?? 0
            const changeGbp = endGbp - startGbp
            const changeUsd = endUsd - startUsd

            const summary =
              changeGbp >= 0
                ? `Net worth increased from £${startGbp.toLocaleString('en-GB', { maximumFractionDigits: 0 })} to £${endGbp.toLocaleString('en-GB', { maximumFractionDigits: 0 })} GBP between ${firstDate} and ${lastDate} (+£${Math.abs(changeGbp).toLocaleString('en-GB', { maximumFractionDigits: 0 })}).`
                : `Net worth decreased from £${startGbp.toLocaleString('en-GB', { maximumFractionDigits: 0 })} to £${endGbp.toLocaleString('en-GB', { maximumFractionDigits: 0 })} GBP between ${firstDate} and ${lastDate} (-£${Math.abs(changeGbp).toLocaleString('en-GB', { maximumFractionDigits: 0 })}).`

            return {
              trend: {
                startDate: firstDate,
                endDate: lastDate,
                startGbp,
                endGbp,
                startUsd,
                endUsd,
                changeGbp,
                changeUsd,
                series: sortedDates.map((d) => ({
                  date: d,
                  totalGbp: byDate[d].totalGbp,
                  totalUsd: byDate[d].totalUsd,
                  ...(groupBy === 'entity' && byDate[d].byEntity ? { byEntity: byDate[d].byEntity } : {}),
                })),
              },
              summary,
            }
          } catch (err) {
            console.error('[chat] get_net_worth_trend: Execution error', err)
            return { error: err instanceof Error ? err.message : 'Unknown error' }
          }
        },
      },
      get_cash_runway: {
        description: `Get cash runway: liquid cash (Cash/Checking/Savings accounts) and average monthly burn from the last 3 full calendar months. Use when the user asks about runway, burn, or how long their cash will last.`,
        inputSchema: z.object({}),
        execute: async () => {
          try {
            console.log('[chat] get_cash_runway: Starting')

            const now = new Date()
            const utcYear = now.getUTCFullYear()
            const utcMonth = now.getUTCMonth()
            const startMonth = utcMonth - 3
            const startYear = startMonth < 0 ? utcYear - 1 : utcYear
            const adjustedStartMonth = startMonth < 0 ? startMonth + 12 : startMonth
            const endMonth = utcMonth - 1
            const endYear = endMonth < 0 ? utcYear - 1 : utcYear
            const adjustedEndMonth = endMonth < 0 ? endMonth + 12 : endMonth
            const startDateStr = `${startYear}-${String(adjustedStartMonth + 1).padStart(2, '0')}-01`
            const lastDay = new Date(Date.UTC(endYear, adjustedEndMonth + 1, 0))
            const endDateStr = lastDay.toISOString().split('T')[0]

            const { data: rpcData, error: rpcError } = await supabase.rpc('get_cash_runway_net_burn', {
              p_start: startDateStr,
              p_end: endDateStr,
            })
            if (rpcError) {
              console.error('[chat] get_cash_runway: RPC error', rpcError)
              return { error: rpcError.message }
            }
            const row = Array.isArray(rpcData) ? rpcData[0] : rpcData
            const gbpNet = row?.gbp_net != null ? Number(row.gbp_net) : 0
            const usdNet = row?.usd_net != null ? Number(row.usd_net) : 0
            const gbpAvgBurn = Math.max(0, -gbpNet) / 3
            const usdAvgBurn = Math.max(0, -usdNet) / 3

            const CASH_CATEGORIES = ['Cash', 'Checking', 'Savings']
            const { data: balancesData, error: balErr } = await supabase
              .from('account_balances')
              .select('institution, account_name, date_updated, balance_total_local, currency, category')
              .order('date_updated', { ascending: false })
            if (balErr) return { error: balErr.message }
            const byAccount = new Map<string, { balance_total_local: number; currency: string; category: string; date_updated: string }>()
            ;(balancesData || []).forEach((b: { institution: string; account_name: string; date_updated: string; balance_total_local?: number | null; currency?: string | null; category?: string | null }) => {
              const key = `${b.institution}-${b.account_name}`
              const existing = byAccount.get(key)
              if (!existing || new Date(b.date_updated) > new Date(existing.date_updated)) {
                byAccount.set(key, {
                  balance_total_local: Number(b.balance_total_local ?? 0),
                  currency: (b.currency || 'GBP').toUpperCase(),
                  category: b.category || '',
                  date_updated: b.date_updated,
                })
              }
            })
            let cashGbp = 0
            let cashUsd = 0
            byAccount.forEach(({ balance_total_local, currency, category }) => {
              if (CASH_CATEGORIES.includes(category)) {
                if (currency === 'GBP') cashGbp += balance_total_local
                else cashUsd += balance_total_local
              }
            })

            const gbpMonths = gbpAvgBurn > 0 ? cashGbp / gbpAvgBurn : (cashGbp > 0 ? Number.POSITIVE_INFINITY : 0)
            const usdMonths = usdAvgBurn > 0 ? cashUsd / usdAvgBurn : (cashUsd > 0 ? Number.POSITIVE_INFINITY : 0)

            const summaryParts: string[] = []
            if (cashGbp > 0) {
              const monthsStr = gbpMonths === Infinity ? 'no burn' : `~${Math.round(gbpMonths)} months`
              summaryParts.push(`GBP cash: £${cashGbp.toLocaleString('en-GB', { maximumFractionDigits: 0 })} (runway ${monthsStr} at £${Math.round(gbpAvgBurn).toLocaleString('en-GB')}/mo burn)`)
            }
            if (cashUsd > 0) {
              const monthsStr = usdMonths === Infinity ? 'no burn' : `~${Math.round(usdMonths)} months`
              summaryParts.push(`USD cash: $${cashUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })} (runway ${monthsStr} at $${Math.round(usdAvgBurn).toLocaleString('en-US')}/mo burn)`)
            }
            const summary = summaryParts.length ? summaryParts.join('. ') : 'No cash accounts (Cash/Checking/Savings) found.'

            return {
              runway: {
                gbp: { totalCash: cashGbp, avgMonthlyBurn: gbpAvgBurn, monthsOnHand: gbpMonths === Infinity ? null : gbpMonths },
                usd: { totalCash: cashUsd, avgMonthlyBurn: usdAvgBurn, monthsOnHand: usdMonths === Infinity ? null : usdMonths },
                period: { startDate: startDateStr, endDate: endDateStr },
              },
              summary,
            }
          } catch (err) {
            console.error('[chat] get_cash_runway: Execution error', err)
            return { error: err instanceof Error ? err.message : 'Unknown error' }
          }
        },
      },
    },
    })
    
    return result.toUIMessageStreamResponse()
  } catch (streamError) {
    console.error('[chat] Error creating streamText:', streamError)
    console.error('[chat] Stream error details:', {
      message: streamError instanceof Error ? streamError.message : String(streamError),
      name: streamError instanceof Error ? streamError.name : 'Unknown',
      stack: streamError instanceof Error ? streamError.stack : undefined,
    })
    // Re-throw to be caught by outer catch
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
