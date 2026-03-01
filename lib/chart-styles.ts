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
