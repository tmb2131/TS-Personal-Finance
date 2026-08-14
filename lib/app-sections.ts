/**
 * The five destinations and the section ids each one actually renders.
 *
 * This exists so a link can be checked rather than trusted. Observation
 * drill-ins pointed at `/analysis?section=transactions&category=…` for a full
 * release after `/analysis` was split into `/trends` and `/spending`, and
 * nothing caught it because a dead fragment fails silently — the page loads,
 * it just does not go where it said it would.
 */

export const APP_SECTIONS = {
  '/': [],
  '/position': [
    'accounts',
    'net-worth-chart',
    'cash-runway',
    'liquidity',
    'sustainable-spend',
    'kids',
  ],
  '/spending': ['today', 'budget-table', 'transaction-analysis', 'transactions', 'recurring'],
  '/trends': [
    'observations',
    'forecast',
    'methodologies',
    'yoy-net-worth',
    'monthly-category-trends',
    'annual-trends',
    'monthly-trends',
  ],
  '/settings': [
    'google-sheet',
    'import',
    'category-planning',
    'financial-assumptions',
    'appearance',
    'account',
  ],
} as const satisfies Record<string, readonly string[]>

export type AppPath = keyof typeof APP_SECTIONS

export const APP_PATHS = Object.keys(APP_SECTIONS) as AppPath[]

/**
 * Shorter or older names people and links actually use, mapped to the id the
 * page renders. `/position#runway` was a reasonable guess that silently landed
 * at the top of the page, because the section is `cash-runway`.
 */
export const SECTION_ID_ALIASES: Record<string, string> = {
  runway: 'cash-runway',
  'cash-runway-cards': 'cash-runway',
  'net-worth': 'net-worth-chart',
  networth: 'net-worth-chart',
  budget: 'budget-table',
  budgets: 'budget-table',
  transactions_list: 'transactions',
  // `/analysis?section=transactions` predates the split; Transaction Analysis
  // is the section it meant.
  transactions_analysis: 'transaction-analysis',
  analysis: 'transaction-analysis',
  forecast_evolution: 'forecast',
  'forecast-evolution': 'forecast',
  'ytd-spend': 'forecast',
  'annual-cumulative': 'forecast',
  spend: 'transaction-analysis',
  recurring_payments: 'recurring',
  assumptions: 'financial-assumptions',
}

/** Canonical section id for a fragment or `?section=` value. */
export function resolveSectionId(rawId: string | null | undefined): string {
  const id = (rawId ?? '').trim()
  if (!id) return ''
  return SECTION_ID_ALIASES[id] ?? id
}

/** True when `path` is one of the five destinations and renders `sectionId`. */
export function sectionExists(path: string, sectionId: string): boolean {
  const sections = APP_SECTIONS[path as AppPath]
  if (!sections) return false
  if (!sectionId) return true
  return (sections as readonly string[]).includes(resolveSectionId(sectionId))
}

/**
 * True when an in-app href resolves: the path is a live destination and any
 * fragment or `?section=` names a section that page renders.
 *
 * Used by the observations href test to walk the whole detector set.
 */
export function hrefResolves(href: string): boolean {
  if (!href.startsWith('/')) return false

  const [pathAndQuery, fragment] = href.split('#')
  const [path, query] = pathAndQuery.split('?')

  const sections = APP_SECTIONS[path as AppPath]
  if (!sections) return false

  const sectionFromQuery = query ? new URLSearchParams(query).get('section') : null
  const target = fragment || sectionFromQuery
  if (!target) return true

  return sectionExists(path, decodeURIComponent(target))
}
