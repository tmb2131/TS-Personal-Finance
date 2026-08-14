import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BudgetTableWrapper } from '@/components/dashboard/budget-table-wrapper'
import { BudgetTableSkeleton } from '@/components/dashboard/skeletons'
import { TransactionAnalysis } from '@/components/analysis/transaction-analysis'
import { TransactionsList } from '@/components/transactions/transactions-list'
import { RecurringPayments } from '@/components/recurring/recurring-payments'
import { RecurringPaymentsTable } from '@/components/recurring/recurring-payments-table'
import { AddRecurringPaymentDialog } from '@/components/recurring/add-recurring-payment-dialog'
import { AddTransactionDialog } from '@/components/transactions/add-transaction-dialog'
import { TodayPageContent } from '@/components/today/today-page-content'
import { fetchTodayData } from '@/lib/today-data'
import { SectionNav } from '@/components/nav/section-nav'
import { HashScroll } from '@/components/nav/hash-scroll'
import { PageHeader } from '@/components/ui/page-header'

export const metadata = {
  title: 'Spending',
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

const SECTIONS = [
  { id: 'today', label: 'Today' },
  { id: 'budget-table', label: 'Budget' },
  { id: 'transaction-analysis', label: 'Analysis' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'recurring', label: 'Recurring' },
]

export default async function SpendingPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Deep links carried over from the old /analysis?section=transaction-analysis URLs.
  const params = await searchParams
  const section = typeof params?.section === 'string' ? params.section : undefined
  const period = typeof params?.period === 'string' ? params.period : undefined
  const yearParam = typeof params?.year === 'string' ? params.year : undefined
  const monthParam = typeof params?.month === 'string' ? params.month : undefined
  const category = typeof params?.category === 'string' ? params.category : undefined

  // Carried over from the retired /today route, which the spec's route table
  // did not assign: today's headroom is a spending question.
  const todayData = await fetchTodayData()

  return (
    <div className="space-y-4 md:space-y-6">
      <HashScroll />
      <PageHeader
        title="Spending"
        description="Budget, analysis, transactions, and recurring commitments."
        actions={
          <div className="flex items-center gap-2">
            <AddRecurringPaymentDialog triggerLabel="Add recurring" triggerVariant="outline" />
            <AddTransactionDialog />
          </div>
        }
      />

      <SectionNav sections={SECTIONS} />

      {todayData && (
        <section id="today" className="scroll-mt-24">
          <TodayPageContent data={todayData} />
        </section>
      )}

      <section id="budget-table" className="scroll-mt-24 border-t pt-4 md:pt-6">
        <Suspense fallback={<BudgetTableSkeleton />}>
          <BudgetTableWrapper />
        </Suspense>
      </section>

      <section id="transaction-analysis" className="scroll-mt-24 border-t pt-4 md:pt-6">
        <TransactionAnalysis
          initialSection={section === 'transaction-analysis' ? section : undefined}
          initialPeriod={period === 'YTD' || period === 'MTD' ? period : undefined}
          initialYear={yearParam ? parseInt(yearParam, 10) : undefined}
          initialMonth={monthParam ? parseInt(monthParam, 10) : undefined}
          initialCategory={category || undefined}
        />
      </section>

      <section id="transactions" className="scroll-mt-24 border-t pt-4 md:pt-6">
        <TransactionsList />
      </section>

      <section id="recurring" className="scroll-mt-24 border-t pt-4 md:pt-6 space-y-4 md:space-y-6">
        <RecurringPaymentsTable />
        <RecurringPayments />
      </section>
    </div>
  )
}
