/**
 * Standard typography for Recharts (AreaChart, BarChart, LineChart).
 * Aligns with global 11px floor: desktop 12px (text-xs), mobile 11px.
 * Use interval/tickCount to reduce crowding; do not shrink below 11px.
 */
export const CHART_FONT = {
  /** Desktop: axis, legend, tooltip (matches text-xs) */
  desktop: 12,
  /** Mobile: axis, legend, tooltip (global floor) */
  mobile: 11,
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
