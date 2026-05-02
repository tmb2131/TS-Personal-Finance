'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, Filter, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'
import { DATE_PRESETS, type DatePresetId } from '@/lib/date-presets'

export interface TransactionFilterValue {
  search: string
  preset: DatePresetId
  categories: string[]
}

interface TransactionFilterBarProps {
  value: TransactionFilterValue
  onChange: (value: TransactionFilterValue) => void
  availableCategories: string[]
}

export function TransactionFilterBar({
  value,
  onChange,
  availableCategories,
}: TransactionFilterBarProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const activeFiltersCount =
    (value.preset === 'last-3-months' ? 0 : 1) + value.categories.length

  const toggleCategory = (cat: string) => {
    const next = value.categories.includes(cat)
      ? value.categories.filter((c) => c !== cat)
      : [...value.categories, cat]
    onChange({ ...value, categories: next })
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search counterparty or category"
            value={value.search}
            onChange={(e) => onChange({ ...value, search: e.target.value })}
            className="pl-9"
          />
        </div>
        <div className="relative" ref={containerRef}>
          <Button
            variant="outline"
            size="icon"
            className="relative h-10 w-10 rounded-full shrink-0"
            onClick={() => setOpen(!open)}
            aria-label="Filter"
            aria-expanded={open}
          >
            <Filter className="h-4 w-4" />
            {activeFiltersCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                {activeFiltersCount}
              </span>
            )}
          </Button>
          {open && (
            <div className="absolute right-0 top-full z-30 mt-2 w-72 rounded-lg border bg-popover p-3 shadow-lg">
              <div className="space-y-3">
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Date range</p>
                  <div className="flex flex-wrap gap-1.5">
                    {DATE_PRESETS.map((p) => (
                      <Button
                        key={p.id}
                        variant={value.preset === p.id ? 'default' : 'outline'}
                        size="sm"
                        className="text-xs"
                        onClick={() => onChange({ ...value, preset: p.id })}
                      >
                        {p.label}
                      </Button>
                    ))}
                  </div>
                </div>
                {availableCategories.length > 0 && (
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <p className="text-xs font-medium text-muted-foreground">Categories</p>
                      {value.categories.length > 0 && (
                        <button
                          type="button"
                          className="text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => onChange({ ...value, categories: [] })}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <div className="max-h-56 overflow-y-auto rounded-md border bg-background p-1.5">
                      {availableCategories.map((cat) => {
                        const checked = value.categories.includes(cat)
                        return (
                          <label
                            key={cat}
                            className={cn(
                              'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted',
                              checked && 'bg-muted',
                            )}
                          >
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 accent-primary"
                              checked={checked}
                              onChange={() => toggleCategory(cat)}
                            />
                            <span className="truncate">{cat}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      {value.categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => toggleCategory(cat)}
              className="inline-flex items-center gap-1 rounded-full border bg-muted px-2.5 py-0.5 text-xs font-medium hover:bg-muted/70"
              aria-label={`Remove ${cat} filter`}
            >
              {cat}
              <X className="h-3 w-3" aria-hidden />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
