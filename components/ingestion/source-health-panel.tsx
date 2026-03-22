'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useSync } from '@/lib/contexts/sync-context'
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  FileUp,
  PencilLine,
  ReceiptText,
  RefreshCw,
  Repeat,
  Wallet,
} from 'lucide-react'

function statusVariant(status: 'healthy' | 'attention' | 'idle'): 'default' | 'secondary' | 'outline' {
  if (status === 'healthy') return 'default'
  if (status === 'attention') return 'secondary'
  return 'outline'
}

function sourceAccent(status: 'healthy' | 'attention' | 'idle'): string {
  if (status === 'healthy') return 'border-emerald-500/40 bg-emerald-500/5'
  if (status === 'attention') return 'border-amber-500/40 bg-amber-500/5'
  return 'border-border bg-muted/30'
}

function datasetIcon(id: 'transactions' | 'account_balances' | 'recurring_payments') {
  if (id === 'transactions') return ReceiptText
  if (id === 'account_balances') return Wallet
  return Repeat
}

interface SourceHealthPanelProps {
  title?: string
  description?: string
  showActions?: boolean
}

export function SourceHealthPanel({
  title = 'Native ingestion',
  description = 'Track source health, freshness, and review items from one place.',
  showActions = true,
}: SourceHealthPanelProps) {
  const { ingestionStatus, syncing, handleSync } = useSync()

  const readinessPercent = ingestionStatus ? Math.round((ingestionStatus.readyDatasets / 3) * 100) : 0

  return (
    <Card className="overflow-hidden border border-border/70 bg-gradient-to-br from-background via-background to-muted/20">
      <CardHeader className="border-b border-border/60 bg-muted/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              {title}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant={ingestionStatus?.freshness === 'stale' ? 'secondary' : 'default'}>
              {ingestionStatus?.freshnessLabel ?? 'Loading source health...'}
            </Badge>
            {ingestionStatus?.reviewItems ? (
              <Badge variant="secondary">{ingestionStatus.reviewItems} review item(s)</Badge>
            ) : (
              <Badge variant="outline">No review blockers</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-border/70 bg-background p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Connected sources</div>
            <div className="mt-2 text-3xl font-semibold">{ingestionStatus?.connectedSources ?? '—'}</div>
            <p className="mt-1 text-sm text-muted-foreground">Google Sheets, CSV imports, and in-app manual flows.</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-background p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Datasets ready</div>
            <div className="mt-2 text-3xl font-semibold">{ingestionStatus?.readyDatasets ?? '—'}/3</div>
            <div className="mt-3">
              <Progress value={readinessPercent} />
            </div>
          </div>
          <div className="rounded-xl border border-border/70 bg-background p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Sheet freshness</div>
            <div className="mt-2 text-lg font-semibold">
              {ingestionStatus?.lastSyncAt ? 'Connected' : 'Optional'}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {ingestionStatus?.lastSyncAt ? `Last refresh ${new Date(ingestionStatus.lastSyncAt).toLocaleString()}` : 'Use only if you want spreadsheet refreshes.'}
            </p>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          {ingestionStatus?.sources?.map((source) => {
            const Icon = source.id === 'google_sheet' ? FileSpreadsheet : source.id === 'csv' ? FileUp : PencilLine
            return (
              <div
                key={source.id}
                className={`rounded-xl border p-4 transition-colors ${sourceAccent(source.status)}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border bg-background/90 p-2">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div>
                      <div className="font-medium">{source.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {source.totalRows.toLocaleString()} row{source.totalRows === 1 ? '' : 's'}
                      </div>
                    </div>
                  </div>
                  <Badge variant={statusVariant(source.status)}>
                    {source.connected ? (source.status === 'attention' ? 'Needs refresh' : 'Active') : 'Not connected'}
                  </Badge>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{source.description}</p>
              </div>
            )
          })}
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          {ingestionStatus?.datasets?.map((dataset) => {
            const Icon = datasetIcon(dataset.id)
            const reviewState = dataset.needsReviewCount > 0
            return (
              <div key={dataset.id} className="rounded-xl border border-border/70 bg-background p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border bg-muted/40 p-2">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div>
                      <div className="font-medium">{dataset.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {dataset.totalRows.toLocaleString()} row{dataset.totalRows === 1 ? '' : 's'}
                      </div>
                    </div>
                  </div>
                  {reviewState ? (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  )}
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  {dataset.latestDate ? `Latest coverage ${new Date(dataset.latestDate).toLocaleDateString('en-GB')}.` : 'No rows yet.'}{' '}
                  {reviewState ? `${dataset.needsReviewCount} item(s) need attention.` : 'No review blockers.'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full border bg-muted/30 px-2.5 py-1">Sheet {dataset.sources.google_sheet}</span>
                  <span className="rounded-full border bg-muted/30 px-2.5 py-1">CSV {dataset.sources.csv}</span>
                  <span className="rounded-full border bg-muted/30 px-2.5 py-1">Manual {dataset.sources.manual}</span>
                </div>
              </div>
            )
          })}
        </div>

        {showActions && (
          <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
            <Button onClick={handleSync} disabled={syncing} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Refreshing sheet...' : 'Refresh Sheet'}
            </Button>
            <Button asChild variant="outline">
              <Link href="/import">
                <FileUp className="mr-2 h-4 w-4" />
                Import CSV
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/transactions">
                <ReceiptText className="mr-2 h-4 w-4" />
                Review Transactions
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/accounts">
                <Wallet className="mr-2 h-4 w-4" />
                Update Accounts
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
