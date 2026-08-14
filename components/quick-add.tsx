'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Receipt, Wallet, Repeat, CreditCard, Baby, FileUp } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { AddTransactionDialog } from './transactions/add-transaction-dialog'

const QUICK_ADD_EVENT = 'findash:open-quick-add'

const SHORTCUTS: { href: string; label: string; description: string; icon: typeof Receipt }[] = [
  { href: '/position#accounts', label: 'Account', description: 'Add a checking, brokerage or other account', icon: Wallet },
  { href: '/spending#recurring', label: 'Recurring payment', description: 'Track a subscription or fixed expense', icon: Repeat },
  { href: '/position#liquidity', label: 'Debt', description: 'Mortgage, loan, credit card or commitment', icon: CreditCard },
  { href: '/position#kids', label: 'Kids account', description: '529, UGMA or other custodial account', icon: Baby },
  { href: '/settings#import', label: 'Import CSV', description: 'Bulk import transactions or balances', icon: FileUp },
]

export function QuickAdd() {
  const [launcherOpen, setLauncherOpen] = useState(false)
  const [transactionOpen, setTransactionOpen] = useState(false)

  useEffect(() => {
    const handler = () => setLauncherOpen(true)
    window.addEventListener(QUICK_ADD_EVENT, handler)
    return () => window.removeEventListener(QUICK_ADD_EVENT, handler)
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!((e.metaKey || e.ctrlKey) && e.key === 'k')) return
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return
      e.preventDefault()
      setLauncherOpen((v) => !v)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const openTransaction = () => {
    setLauncherOpen(false)
    window.setTimeout(() => setTransactionOpen(true), 60)
  }

  return (
    <>
      <Dialog open={launcherOpen} onOpenChange={setLauncherOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" /> Quick add
            </DialogTitle>
            <DialogDescription>
              <span className="hidden md:inline">Press </span>
              <kbd className="hidden rounded border bg-muted px-1 py-0.5 text-[10px] font-medium md:inline">⌘K</kbd>
              <span className="hidden md:inline"> from anywhere to open this menu.</span>
              <span className="md:hidden">Pick what to add.</span>
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-1.5">
            <button
              type="button"
              onClick={openTransaction}
              className="flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Receipt className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-medium">Transaction</p>
                <p className="text-xs text-muted-foreground">Log a manual purchase or income</p>
              </div>
            </button>
            {SHORTCUTS.map((s) => {
              const Icon = s.icon
              return (
                <Link
                  key={s.href}
                  href={s.href}
                  onClick={() => setLauncherOpen(false)}
                  className="flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{s.label}</p>
                    <p className="text-xs text-muted-foreground">{s.description}</p>
                  </div>
                </Link>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>

      <AddTransactionDialog
        open={transactionOpen}
        onOpenChange={setTransactionOpen}
        hideTrigger
      />
    </>
  )
}
