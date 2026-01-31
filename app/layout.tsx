import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { CurrencyProvider } from '@/lib/contexts/currency-context'
import { AuthTimeoutProvider } from '@/lib/contexts/auth-timeout-provider'
import { Sidebar } from '@/components/sidebar'
import { Header } from '@/components/header'
import { Toaster } from 'sonner'
import { ChatWidget } from '@/components/ai-assistant/chat-widget'

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
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <div className="flex flex-1 flex-col overflow-hidden">
              <Header />
              <main className="main-content flex-1 overflow-y-auto p-4 md:p-6 pb-44 md:pb-6">
                {children}
              </main>
            </div>
          </div>
          <Toaster position="top-right" richColors />
          <ChatWidget />
          </AuthTimeoutProvider>
        </CurrencyProvider>
      </body>
    </html>
  )
}
