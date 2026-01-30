'use client'

import { useState, useEffect } from 'react'
import { useCurrency } from '@/lib/contexts/currency-context'
import { Button } from '@/components/ui/button'

export function CurrencyToggle() {
  const { currency, setCurrency } = useCurrency()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className="flex items-center gap-1 md:gap-2">
      <Button
        variant={currency === 'GBP' ? 'default' : 'outline'}
        size="sm"
        onClick={() => setCurrency('GBP')}
        className="text-xs md:text-sm px-2 md:px-3"
      >
        {mounted ? (
          <>
            <span className="hidden sm:inline">£ GBP</span>
            <span className="sm:hidden">£</span>
          </>
        ) : (
          <span>£ GBP</span>
        )}
      </Button>
      <Button
        variant={currency === 'USD' ? 'default' : 'outline'}
        size="sm"
        onClick={() => setCurrency('USD')}
        className="text-xs md:text-sm px-2 md:px-3"
      >
        {mounted ? (
          <>
            <span className="hidden sm:inline">$ USD</span>
            <span className="sm:hidden">$</span>
          </>
        ) : (
          <span>$ USD</span>
        )}
      </Button>
    </div>
  )
}
