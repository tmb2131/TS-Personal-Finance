import { z } from 'zod'
import type { ToolContext } from './types'

export function createGetFinancialSnapshotTool(ctx: ToolContext) {
  return {
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
    execute: async ({ asOfDate, groupBy, entity }: { asOfDate?: string; groupBy?: 'currency' | 'category' | 'entity'; entity?: 'Personal' | 'Family' | 'Trust' }) => {
      try {
        console.log('[chat] get_financial_snapshot: Starting execution', { asOfDate, groupBy, entity })

        const isHistorical = asOfDate && asOfDate !== 'null'

        if (isHistorical) {
          let queryBuilder = ctx.supabase
            .from('historical_net_worth')
            .select('*')
            .eq('user_id', ctx.userId)
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
          const { data: balances, error } = await ctx.supabase
            .from('account_balances')
            .select('*')
            .eq('user_id', ctx.userId)
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

          const accountsMap = new Map<string, any>()
          balances.forEach((balance) => {
            const key = `${balance.institution}-${balance.account_name}`
            const existing = accountsMap.get(key)
            if (!existing || new Date(balance.date_updated) > new Date(existing.date_updated)) {
              accountsMap.set(key, balance)
            }
          })

          const latestBalances = Array.from(accountsMap.values())

          let filteredBalances = latestBalances
          if (entity) {
            if (entity === 'Personal') {
              filteredBalances = latestBalances.filter(b => (b.balance_personal_local || 0) !== 0)
            } else if (entity === 'Family') {
              filteredBalances = latestBalances.filter(b => (b.balance_family_local || 0) !== 0)
            } else if (entity === 'Trust') {
              filteredBalances = latestBalances.filter(b =>
                b.category?.toLowerCase().includes('trust') ||
                (b.balance_family_local || 0) !== 0
              )
            }
          }

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
  }
}
