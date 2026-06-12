'use client'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { WEALTH_TARGET_TERMS_OPTIONS } from '@/lib/wealth-target-terms'
import type { WealthTargetTerms } from '@/lib/types'

interface WealthTargetTermsToggleProps {
  value: WealthTargetTerms
  onChange: (value: WealthTargetTerms) => void
  labelClassName?: string
}

export function WealthTargetTermsToggle({
  value,
  onChange,
  labelClassName,
}: WealthTargetTermsToggleProps) {
  return (
    <div className="space-y-2">
      <Label className={labelClassName ?? 'text-xs'}>Wealth target shown as</Label>
      <div className="grid grid-cols-2 gap-1.5">
        {WEALTH_TARGET_TERMS_OPTIONS.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={value === option.value ? 'default' : 'outline'}
            onClick={() => onChange(option.value)}
            className="h-8 px-1 text-xs"
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
