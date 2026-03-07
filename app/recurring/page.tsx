import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { RecurringPayments } from '@/components/recurring/recurring-payments'
import { RecurringPaymentsTable } from '@/components/recurring/recurring-payments-table'
import { AddRecurringPaymentDialog } from '@/components/recurring/add-recurring-payment-dialog'

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
      <div className="rounded-xl border border-l-[3px] border-l-violet-500 bg-gradient-to-r from-muted/50 to-muted/30 p-4 md:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl md:text-3xl font-bold">Recurring Payments</h1>
            <p className="text-sm md:text-base text-muted-foreground">
              Manage subscriptions and commitments directly in-app.
            </p>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border bg-background px-2.5 py-1 font-medium">Input Mode: In-App</span>
            </div>
          </div>
          <div className="md:w-auto">
            <AddRecurringPaymentDialog
              triggerLabel="Add Recurring Payment"
              triggerVariant="default"
              triggerSize="default"
              triggerClassName="w-full"
            />
          </div>
        </div>
      </div>
      <RecurringPaymentsTable />
      <div className="pt-3 md:pt-4 border-t border-border">
        <RecurringPayments />
      </div>
    </div>
  )
}
