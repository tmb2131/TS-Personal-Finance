import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/react'
import './globals.css'
import { CurrencyProvider } from '@/lib/contexts/currency-context'
import { AuthTimeoutProvider } from '@/lib/contexts/auth-timeout-provider'
import { DailySummaryProvider } from '@/components/insights/daily-summary-context'
import { AppShell } from '@/components/app-shell'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'TS Personal Finance - Personal Finance Dashboard',
  description: 'Personal finance dashboard with net worth tracking and budget analysis',
  appleWebApp: {
    capable: true,
    title: 'TS Personal Finance',
    statusBarStyle: 'default',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <CurrencyProvider>
          <AuthTimeoutProvider>
            <DailySummaryProvider>
              <AppShell>{children}</AppShell>
            </DailySummaryProvider>
          </AuthTimeoutProvider>
        </CurrencyProvider>
        <Analytics />
      </body>
    </html>
  )
}
