import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { CurrencyProvider } from '@/lib/contexts/currency-context'
import { AuthTimeoutProvider } from '@/lib/contexts/auth-timeout-provider'
import { AppShell } from '@/components/app-shell'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'TS Personal Finance - Personal Finance Dashboard',
  description: 'Personal finance dashboard with net worth tracking and budget analysis',
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
            <AppShell>{children}</AppShell>
          </AuthTimeoutProvider>
        </CurrencyProvider>
      </body>
    </html>
  )
}
