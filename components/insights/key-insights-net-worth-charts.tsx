'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
  LabelList,
} from 'recharts'
import { getChartFontSizes, getChartTooltipContentStyle } from '@/lib/chart-styles'

type ChartThemeProps = {
  gridStroke: string
  labelFill: string
  tooltipBg: string
  tooltipBorder: string
  tooltipText: string
}

type NetWorthChartPoint = {
  label: string
  total: number
  isYearTick?: boolean
  month?: string
}

type PieDatum = {
  name: string
  value: number
  fill: string
}

interface KeyInsightsNetWorthChartsProps {
  isMobile: boolean
  hasTrustData: boolean
  chartTheme: ChartThemeProps
  netWorthChartData: NetWorthChartPoint[]
  hasPersonalFamilySplit: boolean
  personalVsFamilyPie: PieDatum[]
  categoryPie: PieDatum[]
  formatCurrencyLarge: (value: number) => string
}

export function KeyInsightsNetWorthCharts({
  isMobile,
  hasTrustData,
  chartTheme,
  netWorthChartData,
  hasPersonalFamilySplit,
  personalVsFamilyPie,
  categoryPie,
  formatCurrencyLarge,
}: KeyInsightsNetWorthChartsProps) {
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div>
        <h3 className="text-sm font-semibold mb-3">Net worth over time</h3>
        {netWorthChartData.length > 0 ? (
          <div className="h-[180px] md:h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={netWorthChartData} margin={{ top: 25, right: isMobile ? 10 : 15, left: 0, bottom: isMobile ? 25 : 15 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: getChartFontSizes(isMobile).axisTick, fontWeight: 600 }}
                  interval={0}
                  angle={isMobile ? -45 : 0}
                  textAnchor={isMobile ? 'end' : 'middle'}
                  height={isMobile ? 50 : 35}
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(value, index) => {
                    const data = netWorthChartData[index]
                    if (data && data.isYearTick) {
                      return value
                    }
                    return value
                  }}
                />
                <YAxis
                  tick={{ fontSize: getChartFontSizes(isMobile).axisTick, fontWeight: 400 }}
                  tickFormatter={(v) => {
                    if (v === 0) return '0'
                    if (v >= 1e6) {
                      const m = v / 1e6
                      return m % 1 === 0 ? `${m}M` : `${m.toFixed(1)}M`
                    }
                    if (v >= 1000) {
                      const k = v / 1000
                      return k % 1 === 0 ? `${k}k` : `${k.toFixed(1)}k`
                    }
                    return String(v)
                  }}
                />
                <Tooltip
                  contentStyle={getChartTooltipContentStyle(chartTheme, { fontSize: getChartFontSizes(isMobile).tooltipMin, isMobile })}
                  formatter={(v: number) => [formatCurrencyLarge(v), 'Total']}
                  labelFormatter={(label, payload) => {
                    if (!payload || payload.length === 0) return label
                    const data = payload[0].payload as { month?: string } | undefined
                    if (data?.month) {
                      const [year, month] = data.month.split('-')
                      const monthNames = [
                        'January',
                        'February',
                        'March',
                        'April',
                        'May',
                        'June',
                        'July',
                        'August',
                        'September',
                        'October',
                        'November',
                        'December',
                      ]
                      return `${monthNames[parseInt(month, 10) - 1]} ${year}`
                    }
                    return label
                  }}
                />
                <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} dot={false}>
                  <LabelList
                    dataKey="total"
                    position="top"
                    offset={8}
                    content={({ x, y, value, index }: { x?: string | number; y?: string | number; value?: string | number; index?: number }) => {
                      if (value == null || x == null || y == null || typeof x === 'string' || typeof y === 'string' || typeof value === 'string') return null
                      const data = netWorthChartData
                      const isFirst = index === 0
                      const isLast = index === data.length - 1
                      const peakIndex = data.reduce((maxIdx, item, i) => (item.total > data[maxIdx].total ? i : maxIdx), 0)
                      const isPeak = index === peakIndex
                      if (!isFirst && !isLast && !isPeak) return null
                      return (
                        <text
                          key={index}
                          x={x}
                          y={y - 8}
                          textAnchor={isFirst ? 'start' : isLast ? 'end' : 'middle'}
                          fontSize={getChartFontSizes(isMobile).axisTick}
                          fill={chartTheme.labelFill}
                        >
                          {formatCurrencyLarge(value)}
                        </text>
                      )
                    }}
                  />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No historical data yet.</p>
        )}
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold">
            {hasPersonalFamilySplit ? 'Personal vs Family' : 'Net Worth by Category'}
          </h3>
          {!hasPersonalFamilySplit && hasTrustData && (
            <span className="text-xs text-muted-foreground">(Trust excluded)</span>
          )}
        </div>
        {(personalVsFamilyPie.length > 0 || categoryPie.length > 0) ? (
          <div className="h-[200px] md:h-[280px] w-full flex items-center justify-center pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={{ top: 8, right: 10, bottom: 0, left: 10 }}>
                <Pie
                  data={hasPersonalFamilySplit ? personalVsFamilyPie : categoryPie}
                  cx="50%"
                  cy="48%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="name"
                  stroke="#fff"
                  strokeWidth={1}
                >
                  {(hasPersonalFamilySplit ? personalVsFamilyPie : categoryPie).map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => formatCurrencyLarge(v)}
                  contentStyle={getChartTooltipContentStyle(chartTheme, { fontSize: getChartFontSizes(isMobile).tooltipMin, isMobile })}
                />
                <Legend
                  wrapperStyle={{
                    paddingTop: isMobile ? '10px' : '20px',
                    fontSize: getChartFontSizes(isMobile).legend,
                  }}
                  iconType="square"
                  iconSize={getChartFontSizes(isMobile).iconSize}
                  formatter={(value) => (
                    <span style={{ fontSize: getChartFontSizes(isMobile).legend, marginRight: isMobile ? '16px' : '24px' }}>
                      {value}
                    </span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No balance data yet.</p>
        )}
      </div>
    </div>
  )
}
