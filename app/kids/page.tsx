import { KidsAccountsOverview } from '@/components/kids/kids-accounts-overview'

export default function KidsAccountsPage() {
  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Kids Accounts</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Overview of kids account balances
        </p>
      </div>
      <KidsAccountsOverview />
    </div>
  )
}
