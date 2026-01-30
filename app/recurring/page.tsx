import { RecurringPayments } from '@/components/recurring/recurring-payments'
import { RecurringPaymentsTable } from '@/components/recurring/recurring-payments-table'

export default function RecurringPage() {
  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Recurring Payments</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Track your subscriptions and recurring bills
        </p>
      </div>
      <RecurringPaymentsTable />
      <RecurringPayments />
    </div>
  )
}
