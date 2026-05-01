import type { ToolContext } from './types'
import { createGetAppInstructionsTool } from './get-app-instructions'
import { createGetFinancialSnapshotTool } from './get-financial-snapshot'
import { createAnalyzeSpendingTool } from './analyze-spending'
import { createGetBudgetVsActualTool } from './get-budget-vs-actual'
import { createGetFinancialHealthSummaryTool } from './get-financial-health-summary'
import { createAnalyzeForecastEvolutionTool } from './analyze-forecast-evolution'
import { createGetNetWorthTrendTool } from './get-net-worth-trend'
import { createAnalyzeMonthlyCategoryTrendsTool } from './analyze-monthly-category-trends'
import { createGetCashRunwayTool } from './get-cash-runway'
import { createSearchWebTool } from './search-web'
import { createSurfaceObservationsTool } from './surface-observations'

export { type ToolContext } from './types'

export function createChatTools(ctx: ToolContext) {
  return {
    get_app_instructions: createGetAppInstructionsTool(ctx),
    get_financial_snapshot: createGetFinancialSnapshotTool(ctx),
    analyze_spending: createAnalyzeSpendingTool(ctx),
    get_budget_vs_actual: createGetBudgetVsActualTool(ctx),
    get_financial_health_summary: createGetFinancialHealthSummaryTool(ctx),
    analyze_forecast_evolution: createAnalyzeForecastEvolutionTool(ctx),
    get_net_worth_trend: createGetNetWorthTrendTool(ctx),
    analyze_monthly_category_trends: createAnalyzeMonthlyCategoryTrendsTool(ctx),
    get_cash_runway: createGetCashRunwayTool(ctx),
    search_web: createSearchWebTool(ctx),
    surface_observations: createSurfaceObservationsTool(ctx),
  }
}
