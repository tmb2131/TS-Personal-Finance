'use client'

import { type LucideIcon } from 'lucide-react'
import { cn } from '@/utils/cn'

export interface SectionNavigationItem {
  id: string
  label: string
  labelShort?: string
  icon: LucideIcon
}

interface SectionNavigationProps {
  items: SectionNavigationItem[]
  containerClassName: string
  mobileScrollable?: boolean
  compact?: boolean
  sectionOffset?: number
  className?: string
}

function shouldReduceMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function scrollToSection(id: string, sectionOffset: number) {
  const element = document.getElementById(id)
  if (!element) return

  const behavior: ScrollBehavior = shouldReduceMotion() ? 'auto' : 'smooth'
  const mainElement = document.querySelector('.main-content') as HTMLElement | null
  if (!mainElement) {
    const top = element.getBoundingClientRect().top + window.pageYOffset - sectionOffset
    window.scrollTo({ top, behavior })
    return
  }

  const elementRect = element.getBoundingClientRect()
  const mainRect = mainElement.getBoundingClientRect()
  const relativeTop = elementRect.top - mainRect.top + mainElement.scrollTop
  mainElement.scrollTo({ top: Math.max(0, relativeTop - sectionOffset), behavior })
}

export function SectionNavigation({
  items,
  containerClassName,
  mobileScrollable = false,
  compact = false,
  sectionOffset = 100,
  className,
}: SectionNavigationProps) {
  return (
    <div className={cn(containerClassName, className)}>
      {items.map((item) => {
        const Icon = item.icon
        return (
          <button
            key={item.id}
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              scrollToSection(item.id, sectionOffset)
            }}
            className={cn(
              'cursor-pointer rounded-lg border-2 border-primary/80 bg-primary text-primary-foreground transition-all duration-150',
              'flex flex-col items-center text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              'hover:scale-[1.02] hover:border-primary/70 hover:bg-primary/90 hover:shadow-md active:translate-y-px',
              compact ? 'gap-1.5 p-2.5 md:gap-2 md:p-3' : 'gap-2 p-4',
              mobileScrollable && 'max-w-[calc(33.333%-0.5rem)] min-w-[calc(33.333%-0.5rem)] shrink-0 snap-center md:min-w-0 md:max-w-none'
            )}
            aria-label={`Jump to ${item.label}`}
          >
            <Icon className={cn(compact ? 'h-4 w-4 md:h-5 md:w-5' : 'h-5 w-5 md:h-6 md:w-6', 'text-primary-foreground/80')} />
            <span className={cn('font-medium leading-tight', compact ? 'text-xs' : 'text-xs md:text-sm')}>
              <span className="hidden md:inline">{item.label}</span>
              <span className="md:hidden">{item.labelShort ?? item.label}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
