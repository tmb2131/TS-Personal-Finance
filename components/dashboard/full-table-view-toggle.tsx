'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'
import { Maximize2, Minimize2 } from 'lucide-react'

interface FullTableViewToggleProps {
  fullView: boolean
  onToggle: () => void
  className?: string
  'aria-label'?: string
}

export function FullTableViewToggle({
  fullView,
  onToggle,
  className,
  'aria-label': ariaLabel = 'Toggle full table view',
}: FullTableViewToggleProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onToggle}
      className={cn('shrink-0', className)}
      aria-label={ariaLabel}
      aria-pressed={fullView}
    >
      {fullView ? (
        <Minimize2 className="h-4 w-4 md:mr-1" aria-hidden />
      ) : (
        <Maximize2 className="h-4 w-4 md:mr-1" aria-hidden />
      )}
      <span className="hidden md:inline">{fullView ? 'Default view' : 'Full table view'}</span>
    </Button>
  )
}
