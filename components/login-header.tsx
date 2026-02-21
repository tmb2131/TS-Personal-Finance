'use client'

import { ThemeToggle } from '@/components/theme-toggle'

/**
 * Login-only header: app name + clean, modern logo.
 * Identity (from PRD): personal finance dashboard, net worth, budget, trends — professional and modern.
 */
export function LoginHeader() {
  return (
    <header className="flex shrink-0 flex-col border-b border-border bg-background pt-[env(safe-area-inset-top)]">
      <div className="flex h-16 items-center justify-between px-4">
      <div className="flex min-w-0 items-center gap-3">
        {/* Logo: minimal upward trend — growth, dashboard, finance (PRD: clean, modern) */}
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
          aria-hidden
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <path d="M4 18 L10 14 L16 10 L22 6" />
          </svg>
        </div>
        <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
          TS Personal Finance
        </h1>
      </div>
      <ThemeToggle />
      </div>
    </header>
  )
}
