'use client'

import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { Header } from '@/components/header'
import { LoginHeader } from '@/components/login-header'
import { Toaster } from 'sonner'

const ChatWidget = dynamic(
  () => import('@/components/ai-assistant/chat-widget').then(m => ({ default: m.ChatWidget })),
  { ssr: false }
)

const DailySummaryWrapper = dynamic(
  () => import('@/components/insights/daily-summary-wrapper').then(m => ({ default: m.DailySummaryWrapper })),
  { ssr: false }
)

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isLogin = pathname === '/login'

  if (isLogin) {
    return (
      <>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <div className="flex min-h-dvh flex-col bg-background">
          <LoginHeader />
          <main
            id="main-content"
            tabIndex={-1}
            className="flex flex-1 flex-col items-center justify-center px-4 py-8 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
          >
            {children}
          </main>
        </div>
        <Toaster position="top-right" richColors />
      </>
    )
  }

  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <div className="flex h-dvh overflow-hidden bg-background">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header />
          <main
            id="main-content"
            tabIndex={-1}
            className="main-content flex-1 overflow-y-auto overscroll-y-contain p-4 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] md:p-6 md:pb-6"
          >
            {children}
          </main>
        </div>
      </div>
      <Toaster position="top-right" richColors />
      <ChatWidget />
      <DailySummaryWrapper />
    </>
  )
}
