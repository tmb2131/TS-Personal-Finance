'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

export function useChartTheme() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = mounted && resolvedTheme === 'dark'

  return {
    gridStroke: isDark ? '#374151' : '#e5e7eb',
    axisStroke: isDark ? '#9ca3af' : '#6b7280',
    tooltipBg: isDark ? '#1f2937' : '#ffffff',
    tooltipBorder: isDark ? '#374151' : '#e5e7eb',
    tooltipText: isDark ? '#f3f4f6' : '#374151',
    tooltipSubtext: isDark ? '#d1d5db' : '#6b7280',
    labelFill: isDark ? '#d1d5db' : '#374151',
    isDark,
  }
}
