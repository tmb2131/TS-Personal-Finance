import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/react'
import './globals.css'
import { CurrencyProvider } from '@/lib/contexts/currency-context'
import { SyncProvider } from '@/lib/contexts/sync-context'
import { InsightsDataProvider } from '@/components/insights/insights-data-context'
import { ThemeProvider } from '@/lib/contexts/theme-provider'
import { AppShell } from '@/components/app-shell'
import { fetchHeaderStatus } from '@/lib/data/cached-queries'

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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let initialHeaderData = null
  try {
    initialHeaderData = await fetchHeaderStatus()
  } catch {
    // Unauthenticated (login page) or error — Header falls back to its own fetch
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider>
          <CurrencyProvider>
            <SyncProvider initialHeaderData={initialHeaderData}>
              <InsightsDataProvider>
                <AppShell initialHeaderData={initialHeaderData}>{children}</AppShell>
              </InsightsDataProvider>
            </SyncProvider>
          </CurrencyProvider>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
