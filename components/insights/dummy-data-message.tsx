'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Info } from 'lucide-react'
import Link from 'next/link'

export function DummyDataMessage() {
  return (
    <Card className="mb-4 border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20">
      <CardContent className="pt-6">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
          <div className="flex-1">
            <h3 className="font-semibold text-sm mb-1 text-blue-900 dark:text-blue-100">
              Dummy Data Loaded
            </h3>
            <p className="text-sm text-blue-800 dark:text-blue-200">
              You're viewing sample data to help you explore the app. To sync your own data,{' '}
              <Link href="/settings" className="font-medium underline hover:no-underline">
                update your Google Sheet ID in Settings
              </Link>
              .
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
