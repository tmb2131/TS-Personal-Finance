'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { isExpenseCategory } from '@/lib/category-filters'

/** A category must be this far past its annual budget before it is worth raising. */
const CATEGORY_OVER_BUDGET_THRESHOLD = 0.2
/** Sync runs daily at 06:00 UTC; past two missed runs the data is genuinely old. */
const STALE_SYNC_HOURS = 48
/** Below this, a percentage overshoot is noise rather than a decision. */
const NOISE_FLOOR_GBP = 500
const MAX_ITEMS = 3

export type ForecastCategoryRow = {
  category: string
  forecast: number
  ytd: number
  annualBudget: number
}

type AttentionItem = {
  id: string
  text: string
  href: string
}

/**
 * Zero to three items, and only when genuinely actionable.
 *
 * The empty state is a single line rather than a card: "nothing needs
 * attention" is the most common outcome, and it should take the least room on
 * the page, not sit in a box competing with the figures above it.
 */
export function AttentionList({
  lastSyncAt,
  forecastByCategory,
}: {
  lastSyncAt: string | null
  forecastByCategory: ForecastCategoryRow[]
}) {
  const items = useMemo<AttentionItem[]>(() => {
    const result: AttentionItem[] = []

    if (lastSyncAt) {
      const hoursSince = (Date.now() - new Date(lastSyncAt).getTime()) / 36e5
      if (hoursSince > STALE_SYNC_HOURS) {
        result.push({
          id: 'stale-sync',
          text: `Data last synced ${Math.floor(hoursSince / 24)} days ago`,
          href: '/settings#google-sheet',
        })
      }
    }

    const overBudget = forecastByCategory
      .filter((row) => isExpenseCategory(row.category))
      .map((row) => {
        const budget = Math.abs(Number(row.annualBudget ?? 0))
        const forecast = Math.abs(Number(row.forecast ?? 0))
        return { category: row.category, budget, overBy: forecast - budget }
      })
      .filter(
        (row) =>
          row.budget > 0 &&
          row.overBy > NOISE_FLOOR_GBP &&
          row.overBy / row.budget > CATEGORY_OVER_BUDGET_THRESHOLD,
      )
      .sort((a, b) => b.overBy / b.budget - a.overBy / a.budget)

    const year = new Date().getFullYear()
    for (const row of overBudget) {
      result.push({
        id: `over-${row.category}`,
        text: `${row.category} is tracking ${Math.round((row.overBy / row.budget) * 100)}% over budget`,
        href: `/spending?section=transaction-analysis&period=YTD&year=${year}&category=${encodeURIComponent(row.category)}`,
      })
    }

    return result.slice(0, MAX_ITEMS)
  }, [lastSyncAt, forecastByCategory])

  if (items.length === 0) {
    return <p className="text-body text-muted-foreground mt-1">Nothing needs attention.</p>
  }

  return (
    <ul className="mt-1 space-y-1.5">
      {items.map((item) => (
        <li key={item.id} className="text-body">
          <Link href={item.href} className="underline underline-offset-4 hover:no-underline">
            {item.text}
          </Link>
        </li>
      ))}
    </ul>
  )
}
