'use client'

import { useRef, useState, useCallback } from 'react'
import { ArrowDown, RefreshCw } from 'lucide-react'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
import { cn } from '@/utils/cn'

const PULL_THRESHOLD = 70
const RESISTANCE = 0.4
const MAX_PULL = 120

interface PullToRefreshProps {
  onRefresh: () => Promise<void>
  disabled?: boolean
  className?: string
  children: React.ReactNode
}

export function PullToRefresh({ onRefresh, disabled = false, className, children }: PullToRefreshProps) {
  const isMobile = useIsMobile()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const touchStartY = useRef<number | null>(null)

  const getScrollContainer = useCallback(() => {
    return wrapperRef.current?.parentElement as HTMLElement | null
  }, [])

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!isMobile || disabled || refreshing) return
      const scrollContainer = getScrollContainer()
      if (!scrollContainer || scrollContainer.scrollTop > 0) return
      touchStartY.current = e.touches[0].clientY
    },
    [isMobile, disabled, refreshing, getScrollContainer]
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isMobile || disabled || touchStartY.current === null) return
      const scrollContainer = getScrollContainer()
      if (!scrollContainer) return
      const currentY = e.touches[0].clientY
      const deltaY = currentY - touchStartY.current
      if (deltaY > 0 && scrollContainer.scrollTop <= 0) {
        e.preventDefault()
        const distance = Math.min(deltaY * RESISTANCE, MAX_PULL)
        setPullDistance(distance)
      } else if (deltaY < 0) {
        touchStartY.current = null
        setPullDistance(0)
      }
    },
    [isMobile, disabled, getScrollContainer]
  )

  const handleTouchEnd = useCallback(async () => {
    if (!isMobile || disabled) return
    const wasOverThreshold = pullDistance >= PULL_THRESHOLD
    touchStartY.current = null
    if (wasOverThreshold && !refreshing) {
      setRefreshing(true)
    }
    setPullDistance(0)

    if (wasOverThreshold && !refreshing) {
      try {
        await onRefresh()
      } finally {
        setRefreshing(false)
      }
    }
  }, [isMobile, disabled, pullDistance, refreshing, onRefresh])

  if (!isMobile) {
    return <div className={cn(className)}>{children}</div>
  }

  const offset = refreshing ? 56 : pullDistance
  const showSpinner = refreshing || (pullDistance >= PULL_THRESHOLD && pullDistance > 0)

  return (
    <div
      ref={wrapperRef}
      className={cn('relative', className)}
      style={{ touchAction: pullDistance > 0 ? 'pan-x' : undefined }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* Pull indicator above content */}
      <div
        className="flex items-center justify-center overflow-hidden transition-[height] duration-200 ease-out"
        style={{
          height: Math.max(0, offset),
          transition: pullDistance > 0 && !refreshing ? 'none' : 'height 0.2s ease-out',
        }}
        aria-hidden
      >
        <div className="flex h-14 flex-shrink-0 items-center justify-center text-muted-foreground">
          {showSpinner ? (
            <RefreshCw className="h-5 w-5 animate-spin" aria-label="Syncing" />
          ) : (
            <ArrowDown
              className="h-5 w-5 transition-transform duration-150"
              style={{
                transform: pullDistance > 0 ? `rotate(-180deg)` : 'rotate(0deg)',
              }}
              aria-hidden
            />
          )}
        </div>
      </div>
      {/* Content is pushed down by indicator height */}
      <div>{children}</div>
    </div>
  )
}
