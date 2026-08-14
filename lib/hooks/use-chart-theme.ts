'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { CHART_SERIES } from '@/lib/chart-styles'

/**
 * Chart colours, resolved from the design tokens.
 *
 * This used to return a dozen hard-coded Tailwind greys, which meant every
 * chart in the app was themed independently of the palette — change the ground
 * colour and the grid lines stayed where they were. It now reads the same
 * custom properties as everything else, so charts follow light/dark and any
 * future palette change for free.
 *
 * Recharts writes most colours into SVG presentation attributes, where `var()`
 * support is inconsistent, so the values are resolved to concrete `hsl(...)`
 * strings here rather than passed through as var references.
 */

/** Light-mode values, used for the server render and the first paint. */
const FALLBACK = {
  gridStroke: 'hsl(36 14% 88%)',
  axisStroke: 'hsl(32 7% 46%)',
  tooltipBg: 'hsl(0 0% 100%)',
  tooltipBorder: 'hsl(36 14% 88%)',
  tooltipText: 'hsl(30 12% 12%)',
  tooltipSubtext: 'hsl(32 7% 42%)',
  labelFill: 'hsl(30 12% 12%)',
  positive: 'hsl(152 56% 30%)',
  negative: 'hsl(358 64% 46%)',
  primary: 'hsl(187 66% 27%)',
  series: [
    'hsl(187 66% 32%)',
    'hsl(231 48% 55%)',
    'hsl(24 72% 52%)',
    'hsl(268 40% 55%)',
    'hsl(199 62% 45%)',
    'hsl(44 62% 45%)',
  ],
}

export type ChartTheme = typeof FALLBACK & { isDark: boolean }

function readToken(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  const value = styles.getPropertyValue(name).trim()
  return value ? `hsl(${value})` : fallback
}

function resolveTheme(): Omit<ChartTheme, 'isDark'> {
  if (typeof window === 'undefined') return FALLBACK
  const styles = getComputedStyle(document.documentElement)
  return {
    gridStroke: readToken(styles, '--chart-grid', FALLBACK.gridStroke),
    axisStroke: readToken(styles, '--chart-axis', FALLBACK.axisStroke),
    tooltipBg: readToken(styles, '--popover', FALLBACK.tooltipBg),
    tooltipBorder: readToken(styles, '--border', FALLBACK.tooltipBorder),
    tooltipText: readToken(styles, '--popover-foreground', FALLBACK.tooltipText),
    tooltipSubtext: readToken(styles, '--muted-foreground', FALLBACK.tooltipSubtext),
    labelFill: readToken(styles, '--muted-foreground', FALLBACK.labelFill),
    positive: readToken(styles, '--positive', FALLBACK.positive),
    negative: readToken(styles, '--negative', FALLBACK.negative),
    primary: readToken(styles, '--primary', FALLBACK.primary),
    series: CHART_SERIES.map((_, index) =>
      readToken(styles, `--chart-${index + 1}`, FALLBACK.series[index]),
    ),
  }
}

export function useChartTheme(): ChartTheme & { seriesColor: (index: number) => string } {
  const { resolvedTheme } = useTheme()
  const [resolved, setResolved] = useState<Omit<ChartTheme, 'isDark'>>(FALLBACK)
  const [mounted, setMounted] = useState(false)

  // Re-read on theme change: the tokens are swapped by a class on <html>, so
  // the computed values are only correct after that class has been applied.
  useEffect(() => {
    setMounted(true)
    setResolved(resolveTheme())
  }, [resolvedTheme])

  const isDark = mounted && resolvedTheme === 'dark'

  return {
    ...resolved,
    isDark,
    seriesColor: (index: number) => resolved.series[index % resolved.series.length],
  }
}
