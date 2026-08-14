'use client'

import { cn } from '@/utils/cn'

export interface SectionNavItem {
  id: string
  label: string
}

/**
 * Within-page section jumps. Plain text links, no icons and no fill: this is a
 * table of contents, not a row of buttons competing with the content below it.
 */
export function SectionNav({
  sections,
  className,
}: {
  sections: SectionNavItem[]
  className?: string
}) {
  const scrollTo = (id: string) => {
    const element = document.getElementById(id)
    const main = document.querySelector('.main-content') as HTMLElement | null
    if (!element || !main) return

    const behavior: ScrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth'
    const relativeTop =
      element.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop
    main.scrollTo({ top: Math.max(0, relativeTop - 100), behavior })
  }

  return (
    <nav
      aria-label="Sections on this page"
      className={cn('scroll-touch -mx-1 flex gap-x-4 gap-y-1 overflow-x-auto px-1', className)}
    >
      {sections.map((section) => (
        <a
          key={section.id}
          href={`#${section.id}`}
          onClick={(event) => {
            event.preventDefault()
            history.replaceState(null, '', `#${section.id}`)
            scrollTo(section.id)
          }}
          className="whitespace-nowrap rounded text-meta text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {section.label}
        </a>
      ))}
    </nav>
  )
}
