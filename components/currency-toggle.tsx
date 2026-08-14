'use client'

import { useState, useEffect } from 'react'
import { useCurrency } from '@/lib/contexts/currency-context'

/**
 * One chip showing the active currency; tap to switch.
 *
 * This used to be two persistent buttons, which spent permanent header space
 * on a control that changes rarely — and showed the inactive option as
 * prominently as the active one, so the header never told you at a glance
 * which currency you were reading.
 */
export function CurrencyToggle() {
  const { currency, setCurrency } = useCurrency()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const other = currency === 'GBP' ? 'USD' : 'GBP'
  const symbol = currency === 'GBP' ? '£' : '$'

  return (
    <button
      type="button"
      onClick={() => setCurrency(other)}
      className="num inline-flex h-9 min-w-[44px] items-center justify-center gap-1 rounded-full border px-3 text-meta font-medium transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      aria-label={mounted ? `Currency: ${currency}. Switch to ${other}.` : 'Switch currency'}
      title={mounted ? `Switch to ${other}` : undefined}
    >
      <span aria-hidden>{symbol}</span>
      <span>{currency}</span>
    </button>
  )
}
