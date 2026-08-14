'use client'

import { useEffect, useState } from 'react'

const MOBILE_BREAKPOINT = 768
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

/**
 * Returns true when viewport width is below md (768px).
 * Used for mobile-first responsive patterns (charts, tables, carousels).
 *
 * The initial value is always `false` so the first client render matches the
 * server HTML. Reading `matchMedia` during `useState` initialisation instead
 * made every sub-768px page load fail hydration — the server has no viewport,
 * so it always rendered the desktop branch — which threw away the server HTML
 * and re-rendered the whole tree on exactly the devices least able to afford
 * it. The real value lands in the effect below, on the tick after hydration.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const query = window.matchMedia(MOBILE_QUERY)
    const sync = () => setIsMobile(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  return isMobile
}
