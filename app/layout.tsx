import type { Metadata } from 'next'
import { Archivo, Instrument_Serif, Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/react'
import './globals.css'
import { CurrencyProvider } from '@/lib/contexts/currency-context'
import { SyncProvider } from '@/lib/contexts/sync-context'
import { InsightsDataProvider } from '@/components/insights/insights-data-context'
import { ThemeProvider } from '@/lib/contexts/theme-provider'
import { QueryProvider } from '@/lib/contexts/query-provider'
import { AppShell } from '@/components/app-shell'
import { fetchHeaderStatus } from '@/lib/data/cached-queries'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
})

/**
 * Numeric face. Archivo's digits are narrow and strongly built, so a column of
 * currency stays compact and a headline figure carries weight without needing
 * colour or a box around it. Used for every figure that gets scanned — KPI
 * values, table numerals, totals.
 */
const archivo = Archivo({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-num',
})

/**
 * Editorial face, used only for page titles and the single hero figure on Home.
 *
 * The pairing is the point: a high-contrast serif against Inter's neutral
 * grotesque is what gives the app a voice. It has one weight and thin hairlines,
 * so it works at 30px and falls apart at 14px — never apply it below the figure
 * step of the type scale.
 */
const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-serif',
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
      <body
        className={`${inter.variable} ${archivo.variable} ${instrumentSerif.variable} font-sans`}
      >
        <ThemeProvider>
          <QueryProvider>
            <CurrencyProvider>
              <SyncProvider initialHeaderData={initialHeaderData}>
                <InsightsDataProvider>
                  <AppShell initialHeaderData={initialHeaderData}>{children}</AppShell>
                </InsightsDataProvider>
              </SyncProvider>
            </CurrencyProvider>
          </QueryProvider>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
