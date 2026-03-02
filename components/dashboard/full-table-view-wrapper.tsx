'use client'

import { useEffect, useRef, useState } from 'react'
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
  /** Optional class override for the floating full-view card container. */
  fullViewContainerClassName?: string
  /** When true, scales content down to fit the full-view viewport with no internal scrolling. */
  fitToViewport?: boolean
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
  fullViewContainerClassName,
  fitToViewport = false,
}: FullTableViewWrapperProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    if (!fullView) return

    const previousActive = document.activeElement as HTMLElement | null
    closeButtonRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previousActive?.focus()
    }
  }, [fullView, onClose])

  useEffect(() => {
    if (!fullView || !fitToViewport) {
      setScale(1)
      return
    }

    const viewport = viewportRef.current
    const content = contentRef.current
    if (!viewport || !content) return

    const updateScale = () => {
      const viewportWidth = viewport.clientWidth
      const viewportHeight = viewport.clientHeight
      const contentWidth = content.scrollWidth
      const contentHeight = content.scrollHeight

      if (!viewportWidth || !viewportHeight || !contentWidth || !contentHeight) return

      const widthScale = viewportWidth / contentWidth
      const heightScale = viewportHeight / contentHeight
      const nextScale = Math.min(widthScale, heightScale, 1)
      setScale(nextScale)
    }

    updateScale()

    const animationFrame = window.requestAnimationFrame(updateScale)
    const observer = new ResizeObserver(updateScale)
    observer.observe(viewport)
    observer.observe(content)
    window.addEventListener('resize', updateScale)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      observer.disconnect()
      window.removeEventListener('resize', updateScale)
    }
  }, [fullView, fitToViewport, children])

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
        ref={closeButtonRef}
        onClick={onClose}
        className="absolute top-4 right-4 z-10 h-12 w-12 min-h-[48px] min-w-[48px] shrink-0 rounded-full border bg-background/95 shadow-md backdrop-blur sm:h-10 sm:w-10 sm:min-h-0 sm:min-w-0"
        aria-label="Close full table view"
      >
        <X className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
      </Button>
      {/* Floating card: clearly separated from backdrop */}
      <div
        className={cn(
          'relative flex flex-col rounded-xl border bg-background shadow-2xl',
          fitToViewport
            ? 'h-[95vh] w-[95vw] max-h-[95vh] max-w-[95vw]'
            : 'w-[95vw] max-h-[95vh] max-w-[1200px]',
          fullViewContainerClassName,
          'animate-in fade-in-0 zoom-in-95 duration-200',
          /* Denser table in full view: smaller font and row height, keep widths/styles */
          '[&_table]:text-[11px] [&_th]:h-7 [&_td]:h-7 [&_th]:py-0.5 [&_td]:py-0.5 [&_th]:px-2 [&_td]:px-2 [&_th]:text-[11px] [&_td]:tabular-nums'
        )}
      >
        <div
          ref={viewportRef}
          className={cn(
            'rounded-xl min-h-0',
            fitToViewport ? 'flex-1 overflow-hidden p-3' : 'overflow-auto px-5 py-6'
          )}
        >
          {fitToViewport ? (
            <div
              ref={contentRef}
              className="mx-auto w-max"
              style={{
                transform: `scale(${scale})`,
                transformOrigin: 'top center',
                willChange: 'transform',
              }}
            >
              {children}
            </div>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(popOut, document.body)
}
