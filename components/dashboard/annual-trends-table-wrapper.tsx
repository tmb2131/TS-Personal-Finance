import { createClient } from '@/lib/supabase/server'
import { AnnualTrendsTable } from '@/components/analysis/annual-trends-table'
import { AnnualTrend } from '@/lib/types'

async function fetchAnnualTrendsData() {
  const supabase = await createClient()
  
  const [trendsResult, fxResult] = await Promise.all([
    supabase.from('annual_trends').select('*').order('category'),
    supabase
      .from('fx_rate_current')
      .select('*')
      .order('date', { ascending: false })
      .limit(1)
      .single(),
  ])

  if (trendsResult.error) {
    console.error('Error fetching annual trends:', trendsResult.error)
    throw new Error('Failed to load annual trends data')
  }

  return {
    trends: trendsResult.data as AnnualTrend[],
    fxRate: fxResult.data?.gbpusd_rate || 1.25,
  }
}

export async function AnnualTrendsTableWrapper() {
  try {
    const { trends, fxRate } = await fetchAnnualTrendsData()
    return <AnnualTrendsTable initialData={trends} initialFxRate={fxRate} />
  } catch (error) {
    return (
      <div className="text-sm text-destructive p-4">
        Failed to load annual trends data. Please try refreshing the page.
      </div>
    )
  }
}
