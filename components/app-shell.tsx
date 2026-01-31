'use client'

import { usePathname } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { Header } from '@/components/header'
import { ChatWidget } from '@/components/ai-assistant/chat-widget'
import { LoginHeader } from '@/components/login-header'
import { Toaster } from 'sonner'

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isLogin = pathname === '/login'

  if (isLogin) {
    return (
      <>
        <div className="flex min-h-screen flex-col bg-background">
          <LoginHeader />
          <div className="flex flex-1 flex-col items-center justify-center px-4 py-8">
            {children}
          </div>
        </div>
        <Toaster position="top-right" richColors />
      </>
    )
  }

  return (
    <>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header />
          <main className="main-content flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6">
            {children}
          </main>
        </div>
      </div>
      <Toaster position="top-right" richColors />
      <ChatWidget />
    </>
  )
}
