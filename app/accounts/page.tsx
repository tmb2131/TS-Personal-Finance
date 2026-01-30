import { AccountsOverview } from '@/components/accounts/accounts-overview'

export default function AccountsPage() {
  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Accounts Overview</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Detailed view of all account balances
        </p>
      </div>
      <AccountsOverview />
    </div>
  )
}
