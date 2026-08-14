/**
 * Short format for chart axis/tooltips on mobile (e.g. £10k, $1.2M).
 */
export function formatChartNumber(value: number, currency: string): string {
  const symbol = currency === 'USD' ? '$' : '£'
  const abs = Math.abs(value)
  // The sign goes in front of the symbol: -£10k, never £-10k.
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000_000) {
    return `${sign}${symbol}${(abs / 1_000_000).toFixed(1)}M`
  }
  if (abs >= 1_000) {
    return `${sign}${symbol}${(abs / 1_000).toFixed(0)}k`
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}
