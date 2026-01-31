'use client'

import { useEffect, useState } from 'react'

const MOBILE_BREAKPOINT = 768

/**
 * Returns true when viewport width is below md (768px).
 * Used for mobile-first responsive patterns (charts, tables, carousels).
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  return isMobile
}
