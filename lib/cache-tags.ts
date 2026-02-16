import { revalidateTag } from 'next/cache'

/**
 * Cache tag constants — keep in sync with lib/data/cached-queries.ts
 */
export const CACHE_TAGS = {
  BUDGETS: 'budgets',
  ACCOUNTS: 'accounts',
  TRANSACTIONS: 'transactions',
  NET_WORTH: 'net-worth',
  FX_RATES: 'fx-rates',
  INVESTMENT_RETURNS: 'investment-returns',
  KIDS: 'kids',
  RECURRING: 'recurring',
  DEBT: 'debt',
  SYNC: 'sync',
} as const

/** Invalidate all data caches (used after full sync) */
export function revalidateAllData() {
  revalidateTag(CACHE_TAGS.SYNC, 'max')
}

/** Invalidate specific cache tags */
export function revalidateTags(...tags: string[]) {
  for (const tag of tags) {
    revalidateTag(tag, 'max')
  }
}
