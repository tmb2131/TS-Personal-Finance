import type { CSSProperties } from 'react'

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
    borderRadius: '6px',
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
    borderRadius: '6px',
    color: theme.tooltipText,
  }
}
