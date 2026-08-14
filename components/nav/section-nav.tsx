'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/utils/cn'

export interface SectionNavItem {
  id: string
  label: string
}

const SCROLL_OFFSET = 100

/**
 * Within-page section jumps.
 *
 * These were plain 12px grey links, indistinguishable from a caption — no
 * affordance, no hover target worth aiming at, and no way to tell which section
 * you were actually in. They are now a segmented control that tracks scroll
 * position, so the row doubles as a "you are here" for pages that run to five
 * or six screens.
 *
 * It is still a table of contents rather than a tab bar: every section stays
 * mounted and on the page, and the control scrolls rather than swapping panels.
 */
export function SectionNav({
  sections,
  className,
}: {
  sections: SectionNavItem[]
  className?: string
}) {
  const [activeId, setActiveId] = useState<string | null>(sections[0]?.id ?? null)
  const listRef = useRef<HTMLDivElement | null>(null)
  /**
   * A click scrolls smoothly, which fires a burst of intersection changes for
   * every section passed on the way. Without this latch the pill would skitter
   * across the control before landing.
   */
  const pendingTarget = useRef<string | null>(null)

  useEffect(() => {
    const main = document.querySelector('.main-content') as HTMLElement | null
    if (!main) return

    const onScroll = () => {
      // Resolved on every scroll rather than once on mount. Most sections on
      // these pages arrive inside Suspense boundaries, so at mount the list is
      // frequently empty — caching it there left the control permanently stuck
      // on the first item.
      const elements = sections
        .map((section) => document.getElementById(section.id))
        .filter((element): element is HTMLElement => element !== null)
      if (elements.length === 0) return

      const mainTop = main.getBoundingClientRect().top
      let current = elements[0].id
      for (const element of elements) {
        // The section that owns the reading line — the topmost one whose start
        // is still above the offset the jump links scroll to.
        if (element.getBoundingClientRect().top - mainTop <= SCROLL_OFFSET + 8) {
          current = element.id
        }
      }
      // Bottom of the scroller: the last section can be too short to ever reach
      // the reading line, so claim it explicitly.
      if (main.scrollHeight - main.scrollTop - main.clientHeight < 24) {
        current = elements[elements.length - 1].id
      }
      if (pendingTarget.current) {
        if (pendingTarget.current !== current) return
        pendingTarget.current = null
      }
      setActiveId(current)
    }

    onScroll()
    main.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      main.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [sections])

  // Keep the active pill in view on narrow screens, where the control scrolls.
  useEffect(() => {
    if (!activeId || !listRef.current) return
    const pill = listRef.current.querySelector<HTMLElement>(`[data-section="${activeId}"]`)
    pill?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeId])

  const scrollTo = (id: string) => {
    const element = document.getElementById(id)
    const main = document.querySelector('.main-content') as HTMLElement | null
    if (!element || !main) return

    const behavior: ScrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth'
    const relativeTop =
      element.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop
    pendingTarget.current = id
    setActiveId(id)
    main.scrollTo({ top: Math.max(0, relativeTop - SCROLL_OFFSET), behavior })
  }

  return (
    /* Sticky. These pages run to tens of thousands of pixels — the Spending
       page is over 80,000px tall with a full transaction list — so a table of
       contents that scrolls away at the top is a table of contents you cannot
       use. The negative top margin and matching padding let the canvas colour
       run behind it, so content does not appear to slide under a floating bar. */
    <nav
      aria-label="Sections on this page"
      className={cn(
        'sticky z-30 bg-background',
        // The scrollport's sticky constraint sits inside the main element's own
        // padding, so `top-0` would park the bar 16/24px down and let content
        // scroll through the gap above it. The negative top cancels that
        // padding and the matching negative margins plus padding let the canvas
        // colour bleed to the full width of the scroller.
        '-top-4 -mx-4 -mt-4 px-4 pb-2 pt-4',
        'md:-top-6 md:-mx-6 md:-mt-6 md:px-6 md:pt-6',
        className,
      )}
    >
      <div
        ref={listRef}
        className="scroll-touch flex w-full gap-1 overflow-x-auto rounded-lg bg-sunken p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {sections.map((section) => {
          const isActive = section.id === activeId
          return (
            <a
              key={section.id}
              href={`#${section.id}`}
              data-section={section.id}
              aria-current={isActive ? 'true' : undefined}
              onClick={(event) => {
                event.preventDefault()
                history.replaceState(null, '', `#${section.id}`)
                scrollTo(section.id)
              }}
              className={cn(
                'whitespace-nowrap rounded-md px-3 py-1.5 text-meta font-medium transition-colors duration-150',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                isActive
                  ? 'bg-raised text-foreground shadow-card'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {section.label}
            </a>
          )
        })}
      </div>
    </nav>
  )
}
