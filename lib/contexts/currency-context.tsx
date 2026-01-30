'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'

type Currency = 'USD' | 'GBP'

interface CurrencyContextType {
  currency: Currency
  setCurrency: (currency: Currency) => void
  convertAmount: (amount: number, fromCurrency: string, fxRate?: number) => number
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined)

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrency] = useState<Currency>('GBP')

  // Load currency preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('currency') as Currency
    if (saved === 'USD' || saved === 'GBP') {
      setCurrency(saved)
    }
  }, [])

  // Save currency preference to localStorage
  const handleSetCurrency = (newCurrency: Currency) => {
    setCurrency(newCurrency)
    localStorage.setItem('currency', newCurrency)
  }

  // Convert amount based on current currency selection
  const convertAmount = (amount: number, fromCurrency: string, fxRate?: number): number => {
    if (!fxRate) return amount
    
    // If UI currency matches account currency, no conversion needed
    if (currency === fromCurrency) {
      return amount
    }

    // If UI is USD and account is GBP -> multiply by fxRate
    if (currency === 'USD' && fromCurrency === 'GBP') {
      return amount * fxRate
    }

    // If UI is GBP and account is USD -> divide by fxRate
    if (currency === 'GBP' && fromCurrency === 'USD') {
      return amount / fxRate
    }

    return amount
  }

  return (
    <CurrencyContext.Provider
      value={{
        currency,
        setCurrency: handleSetCurrency,
        convertAmount,
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
