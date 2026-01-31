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
1. **Financial Snapshots**: Answer questions about current and historical net worth, account balances grouped by currency (GBP/USD/EUR), category, or entity (Personal/Family/Trust). You can provide snapshots for any date in the past or current balances.

2. **Spending Analysis**: Analyze spending patterns, income vs expenses, merchant-specific spending (e.g., "Uber", "Amazon"), and trends over any date range. You automatically exclude non-expense categories (Excluded, Income, Gift Money, Other Income) unless explicitly requested.

3. **Budget Performance**: Compare budget targets vs actual spending, identify categories over/under budget, calculate variances, and highlight the biggest budget variances. You can analyze YTD (year-to-date) or annual budgets.

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
6. **Date intelligence** - Use the CURRENT DATE CONTEXT above for ALL relative date phrases ("last month", "this year", "this month", "last week"). When calling analyze_spending for "last month", pass startDate and endDate from that context (the exact YYYY-MM-DD range given). For historical queries use get_financial_snapshot with asOfDate. For current data, omit asOfDate or use 'current'.
7. **Never output raw JSON** - Always format results in natural language with proper context and insights.
8. **Be analytical** - Provide insights, trends, and context. Don't just report numbers - explain what they mean.

EXAMPLE QUERIES YOU CAN HANDLE:
- "What's my net worth as of December 2024?"
- "How much did I spend on Uber last month?"
- "Am I over budget for Food this year?"
- "Show me my current GBP vs USD breakdown"
- "What are the top 5 categories where I'm over budget?"
- "Compare my Personal vs Trust balances"
- "What was my total spending in Q4 2025?"`,
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
