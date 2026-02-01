'use client'

import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'
import { X } from 'lucide-react'

interface FullTableViewWrapperProps {
  fullView: boolean
  onClose: () => void
  children: React.ReactNode
  /** Optional class for the inner content when not full view (e.g. hidden md:block ...) */
  className?: string
}

/**
 * When fullView is true, renders children in a pop-out overlay: dimmed backdrop + centered card.
 * Uses a portal so the overlay appears above the whole page (true pop-out).
 * Table keeps its widths/styles; font size and row height are reduced so content fits.
 * When fullView is false, renders children in place with optional className.
 */
export function FullTableViewWrapper({
  fullView,
  onClose,
  children,
  className,
}: FullTableViewWrapperProps) {
  if (!fullView) {
    return <div className={className}>{children}</div>
  }

  const popOut = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in-0 duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="Full table view"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Close button on backdrop so it's always visible */}
      <Button
        type="button"
        variant="secondary"
        size="icon"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 h-9 w-9 shrink-0 rounded-full border bg-background/95 shadow-md backdrop-blur sm:h-10 sm:w-10"
        aria-label="Close full table view"
      >
        <X className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
      </Button>
      {/* Floating card: clearly separated from backdrop */}
      <div
        className={cn(
          'relative flex max-h-[95vh] max-w-[95vw] flex-col rounded-xl border bg-background shadow-2xl',
          'animate-in fade-in-0 zoom-in-95 duration-200',
          /* Denser table in full view: smaller font and row height, keep widths/styles */
          '[&_table]:text-[11px] [&_th]:h-7 [&_td]:h-7 [&_th]:py-0.5 [&_td]:py-0.5 [&_th]:px-2 [&_td]:px-2 [&_th]:text-[11px] [&_td]:tabular-nums'
        )}
      >
        <div className="overflow-auto rounded-xl min-h-0 px-5 py-6">
          {children}
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(popOut, document.body)
}
