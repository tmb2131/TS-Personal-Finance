import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { RecurringPayments } from '@/components/recurring/recurring-payments'
import { RecurringPaymentsTable } from '@/components/recurring/recurring-payments-table'
import { AddRecurringPaymentDialog } from '@/components/recurring/add-recurring-payment-dialog'
import { Button } from '@/components/ui/button'
import { FileUp } from 'lucide-react'

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
      <div className="rounded-xl border bg-muted/30 p-4 md:p-5">
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
          <div className="grid w-full gap-2 sm:grid-cols-2 md:w-auto md:min-w-[320px]">
            <AddRecurringPaymentDialog
              triggerLabel="Add Recurring Payment"
              triggerVariant="default"
              triggerSize="default"
              triggerClassName="w-full"
            />
            <Button asChild variant="outline" className="w-full">
              <Link href="/import?target=recurring_payments">
                <FileUp className="mr-2 h-4 w-4" />
                Import Recurring CSV
              </Link>
            </Button>
          </div>
        </div>
      </div>
      <RecurringPaymentsTable />
      <RecurringPayments />
    </div>
  )
}
