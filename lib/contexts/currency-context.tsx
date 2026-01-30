'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type Currency = 'USD' | 'GBP'

const DEFAULT_FX_RATE = 1.27

interface CurrencyContextType {
  currency: Currency
  setCurrency: (currency: Currency) => void
  convertAmount: (amount: number, fromCurrency: string, fxRate?: number) => number
  /** Current GBP→USD rate (fetched once per session from fx_rate_current). */
  fxRate: number
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined)

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrency] = useState<Currency>('GBP')
  const [fxRate, setFxRate] = useState<number>(DEFAULT_FX_RATE)

  // Load currency preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('currency') as Currency
    if (saved === 'USD' || saved === 'GBP') {
      setCurrency(saved)
    }
  }, [])

  // Fetch current FX rate once (single source for all components)
  useEffect(() => {
    const supabase = createClient()
    void (async () => {
      try {
        const { data } = await supabase
          .from('fx_rate_current')
          .select('gbpusd_rate')
          .order('date', { ascending: false })
          .limit(1)
          .single()
        if (data?.gbpusd_rate != null && data.gbpusd_rate > 0) {
          setFxRate(data.gbpusd_rate)
        }
      } catch {
        /* keep default */
      }
    })()
  }, [])

  // Save currency preference to localStorage
  const handleSetCurrency = (newCurrency: Currency) => {
    setCurrency(newCurrency)
    localStorage.setItem('currency', newCurrency)
  }

  // Convert amount based on current currency selection
  const convertAmount = (amount: number, fromCurrency: string, rate?: number): number => {
    const r = rate ?? fxRate
    if (!r) return amount

    // If UI currency matches account currency, no conversion needed
    if (currency === fromCurrency) {
      return amount
    }

    // If UI is USD and account is GBP -> multiply by rate
    if (currency === 'USD' && fromCurrency === 'GBP') {
      return amount * r
    }

    // If UI is GBP and account is USD -> divide by rate
    if (currency === 'GBP' && fromCurrency === 'USD') {
      return amount / r
    }

    return amount
  }

  return (
    <CurrencyContext.Provider
      value={{
        currency,
        setCurrency: handleSetCurrency,
        convertAmount,
        fxRate,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  )
}

export function useCurrency() {
  const context = useContext(CurrencyContext)
  if (context === undefined) {
    throw new Error('useCurrency must be used within a CurrencyProvider')
  }
  return context
}
