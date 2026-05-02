import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { RecurringPayments } from '@/components/recurring/recurring-payments'
import { RecurringPaymentsTable } from '@/components/recurring/recurring-payments-table'
import { AddRecurringPaymentDialog } from '@/components/recurring/add-recurring-payment-dialog'
import { PageHeader, PageHeaderBadge } from '@/components/ui/page-header'

export default async function RecurringPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <PageHeader
        title="Recurring Payments"
        description="Manage subscriptions and commitments directly in-app."
        accent="violet"
        badges={<PageHeaderBadge>Input Mode: In-App</PageHeaderBadge>}
        actions={
          <AddRecurringPaymentDialog
            triggerLabel="Add Recurring Payment"
            triggerVariant="default"
            triggerSize="default"
          />
        }
      />
      <RecurringPaymentsTable />
      <div className="pt-3 md:pt-4 border-t border-border">
        <RecurringPayments />
      </div>
    </div>
  )
}
