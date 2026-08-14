import type { CSSProperties } from 'react'

/**
 * Ordered series ramp.
 *
 * Charts previously reached for whatever colour was to hand, which put a raw
 * green or red on a series that had nothing to do with budget variance — in an
 * app where those two hues are load-bearing. These six are ordered by
 * separability, so a two-series chart automatically gets the two most
 * distinguishable colours, and none of them sits close to the positive/negative
 * pair.
 *
 * Read as CSS custom properties so light and dark each get their own values.
 */
export const CHART_SERIES = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--chart-6))',
] as const

/** Cycles, so a category list longer than the ramp still renders. */
export function seriesColor(index: number): string {
  return CHART_SERIES[index % CHART_SERIES.length]
}

/** Grid lines, axis labels and ticks. */
export const CHART_GRID = 'hsl(var(--chart-grid))'
export const CHART_AXIS = 'hsl(var(--chart-axis))'

/**
 * Shared Recharts axis/grid props. Passing these everywhere is what stops one
 * chart having tick marks and a boxed axis while the next has neither.
 */
export const CHART_AXIS_PROPS = {
  stroke: CHART_AXIS,
  tickLine: false,
  axisLine: false,
} as const

export const CHART_GRID_PROPS = {
  stroke: CHART_GRID,
  strokeDasharray: '0',
  vertical: false,
} as const

/**
 * Standard typography for Recharts (AreaChart, BarChart, LineChart).
 * Desktop and mobile both use 12px for readability; use interval/tickCount to reduce crowding.
 */
export const CHART_FONT = {
  /** Desktop: axis, legend, tooltip (matches text-xs) */
  desktop: 12,
  /** Mobile: axis, legend, tooltip (12px for readability on small screens) */
  mobile: 12,
} as const

export type ChartFontSize = typeof CHART_FONT.desktop | typeof CHART_FONT.mobile

/**
 * Returns axis/legend font size and icon size for the current viewport.
 * Use with useIsMobile() in chart components.
 */
export function getChartFontSizes(isMobile: boolean): {
  axisTick: number
  legend: number
  iconSize: number
  tooltipMin: number
} {
  const size = isMobile ? CHART_FONT.mobile : CHART_FONT.desktop
  return {
    axisTick: size,
    legend: size,
    iconSize: size,
    tooltipMin: size,
  }
}

export type ChartTooltipTheme = {
  tooltipBg: string
  tooltipBorder: string
  tooltipText: string
}

/**
 * Returns a consistent Recharts Tooltip contentStyle for the current theme.
 * Pass this to <Tooltip contentStyle={...} /> in every chart to guarantee
 * correct contrast in both light and dark mode.
 */
export function getChartTooltipContentStyle(
  theme: ChartTooltipTheme,
  options?: { fontSize?: number; padding?: string; isMobile?: boolean }
): CSSProperties {
  const padding = options?.padding ?? (options?.isMobile ? '6px 10px' : '8px 12px')
  return {
    backgroundColor: theme.tooltipBg,
    borderColor: theme.tooltipBorder,
    color: theme.tooltipText,
    borderRadius: '8px',
    boxShadow: 'var(--shadow-overlay)',
    padding,
    ...(options?.fontSize != null ? { fontSize: options.fontSize } : {}),
  }
}

/**
 * Returns Recharts Tooltip wrapperStyle so the outer wrapper (and any default
 * label) use the theme background/border. Use with contentStyle for full dark-mode support.
 */
export function getChartTooltipWrapperStyle(theme: ChartTooltipTheme): CSSProperties {
  return {
    backgroundColor: theme.tooltipBg,
    border: `1px solid ${theme.tooltipBorder}`,
    borderRadius: '8px',
    boxShadow: 'var(--shadow-overlay)',
    color: theme.tooltipText,
  }
}
