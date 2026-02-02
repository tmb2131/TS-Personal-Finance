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
  const [currency, setCurrency] = useState<Currency>('USD')
  const [fxRate, setFxRate] = useState<number>(DEFAULT_FX_RATE)

  // Load currency: first from localStorage (session override), then from user profile (default_currency)
  useEffect(() => {
    const saved = localStorage.getItem('currency') as Currency
    if (saved === 'USD' || saved === 'GBP') {
      setCurrency(saved)
      return
    }
    const supabase = createClient()
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setCurrency('USD')
        return
      }
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('default_currency')
        .eq('id', user.id)
        .single()
      const preferred = profile?.default_currency === 'GBP' ? 'GBP' : 'USD'
      setCurrency(preferred)
      localStorage.setItem('currency', preferred)
    })()
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

  // Save currency to localStorage and user profile (so next login uses this default)
  const handleSetCurrency = (newCurrency: Currency) => {
    setCurrency(newCurrency)
    localStorage.setItem('currency', newCurrency)
    const supabase = createClient()
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        void supabase
          .from('user_profiles')
          .update({ default_currency: newCurrency, updated_at: new Date().toISOString() })
          .eq('id', user.id)
      }
    })
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
