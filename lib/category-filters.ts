const EXCLUDED_CATEGORY_NAME = 'Excluded' as const

const INCOME_CATEGORY_NAMES = ['Income', 'Gift Money', 'Other Income'] as const

const INCOME_CATEGORY_SET = new Set<string>(INCOME_CATEGORY_NAMES)

export const EXCLUDED_CATEGORY = EXCLUDED_CATEGORY_NAME

export function isExcludedCategory(category: string | null | undefined): boolean {
  return category === EXCLUDED_CATEGORY_NAME
}

export function isIncomeCategory(category: string | null | undefined): boolean {
  return Boolean(category && INCOME_CATEGORY_SET.has(category))
}

export function isExpenseCategory(category: string | null | undefined): boolean {
  if (!category) return false
  return !isIncomeCategory(category) && !isExcludedCategory(category)
}
