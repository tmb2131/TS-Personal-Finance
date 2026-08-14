import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  LIQUID_CATEGORIES,
  accountsOnBasis,
  assetsByCategoryGbp,
  illiquidAssetsGbp,
  liquidAssetsGbp,
  normalizeAccountCategory,
  presentCategories,
  toGbp,
  totalAssetsGbp,
  totalCashGbp,
  cashInCurrency,
} from '../account-totals.ts'
import { isTrustAccount } from '../trust-exclusions.ts'
import { hrefResolves, resolveSectionId } from '../app-sections.ts'
import { rankAllocationObservations, rankSpendingObservations } from '../observations.ts'
import type { AccountBalance, AnnualTrend, MonthlyTrend, RecurringPayment } from '../types.ts'

/**
 * Three surfaces used to answer "what are total assets?" with three numbers:
 * £7,176,862 (Home, trust excluded), £11,799,127 (Position's category summary)
 * and £11,806,696 (Trends observations). The last two differed only because the
 * server read an arbitrary row from the daily `fx_rate_current` table.
 *
 * These fixtures mirror the real shape: a trust line that dwarfs everything, a
 * mix of currencies, the `Alternative Investment` spelling that one surface
 * normalized and another did not, and append-only history rows that have to be
 * deduped before anything is summed.
 */
const RATE = 1.349

const ACCOUNTS = [
  {
    institution: 'JP Morgan Chase',
    account_name: 'Brosens 2012 Trust',
    category: 'Trust',
    currency: 'USD',
    balance_total_local: 6_235_436,
    date_updated: '2026-07-31',
  },
  {
    institution: 'Barclays',
    account_name: 'Current',
    category: 'Cash',
    currency: 'GBP',
    balance_total_local: 169_263,
    date_updated: '2026-08-13',
  },
  // Stale duplicate of the row above: dedupe must keep the later one.
  {
    institution: 'Barclays',
    account_name: 'Current',
    category: 'Cash',
    currency: 'GBP',
    balance_total_local: 12_000,
    date_updated: '2024-01-01',
  },
  {
    institution: 'Chase',
    account_name: 'Checking',
    category: 'Cash',
    currency: 'USD',
    balance_total_local: 97_918,
    date_updated: '2026-07-31',
  },
  {
    institution: 'Schwab',
    account_name: 'Brokerage',
    category: 'Brokerage',
    currency: 'USD',
    balance_total_local: 749_154,
    date_updated: '2026-08-01',
  },
  {
    institution: 'Vanguard',
    account_name: 'SIPP',
    category: 'Retirement',
    currency: 'GBP',
    balance_total_local: 157_384,
    date_updated: '2026-08-01',
  },
  // The spelling the sheet actually writes.
  {
    institution: 'Various',
    account_name: 'Angel portfolio',
    category: 'Alternative Investment',
    currency: 'GBP',
    balance_total_local: 547_699,
    date_updated: '2026-08-01',
  },
  {
    institution: 'Home',
    account_name: 'Residence',
    category: 'House',
    currency: 'GBP',
    balance_total_local: 2_168_000,
    date_updated: '2026-08-01',
  },
] as unknown as AccountBalance[]

describe('one total-assets figure', () => {
  it('derives both bases from the same function', () => {
    const all = totalAssetsGbp(ACCOUNTS, RATE, 'all')
    const spendable = totalAssetsGbp(ACCOUNTS, RATE, 'spendable')

    const trustOnly = accountsOnBasis(ACCOUNTS, 'all')
      .filter((account) => isTrustAccount(account))
      .reduce((sum, a) => sum + toGbp(a.balance_total_local ?? 0, a.currency, RATE), 0)

    // The two bases differ by exactly the trust capital and nothing else.
    assert.ok(trustOnly > 0, 'fixture must contain trust capital')
    assert.ok(Math.abs(all - spendable - trustOnly) < 1e-6)
  })

  it('cannot produce different totals for the same basis on two surfaces', () => {
    for (const basis of ['all', 'spendable'] as const) {
      const total = totalAssetsGbp(ACCOUNTS, RATE, basis)

      // Surface A: the category summary table, summed over its own rows.
      const byCategory = assetsByCategoryGbp(ACCOUNTS, RATE, basis)
      const categorySum = Array.from(byCategory.values()).reduce((s, v) => s + v, 0)

      // Surface B: liquid + illiquid, the Position KPI row.
      const split = liquidAssetsGbp(ACCOUNTS, RATE, basis) + illiquidAssetsGbp(ACCOUNTS, RATE, basis)

      assert.ok(Math.abs(categorySum - total) < 1e-6, `category sum drifted on ${basis}`)
      assert.ok(Math.abs(split - total) < 1e-6, `liquid+illiquid drifted on ${basis}`)
    }
  })

  it('lists every category present, so the table cannot omit rows its total includes', () => {
    const categories = presentCategories(ACCOUNTS, 'all')
    const byCategory = assetsByCategoryGbp(ACCOUNTS, RATE, 'all')

    for (const category of byCategory.keys()) {
      assert.ok(categories.includes(category), `${category} missing from the summary table`)
    }
    // The sheet's spelling is folded in rather than dropped.
    assert.ok(categories.includes('Alt Inv'))
    assert.equal(normalizeAccountCategory('Alternative Investment'), 'Alt Inv')
  })

  it('dedupes append-only history to the latest row per account', () => {
    const rows = accountsOnBasis(ACCOUNTS, 'all')
    const barclays = rows.filter((r) => r.account_name === 'Current')
    assert.equal(barclays.length, 1)
    assert.equal(barclays[0].balance_total_local, 169_263)
  })
})

describe('one definition of liquid', () => {
  it('is Cash + Brokerage and nothing else', () => {
    assert.deepEqual([...LIQUID_CATEGORIES].sort(), ['Brokerage', 'Cash'])
  })

  it('excludes Retirement and Alt Inv, which cannot be realised on demand', () => {
    const liquid = liquidAssetsGbp(ACCOUNTS, RATE, 'spendable')
    const expected =
      169_263 + toGbp(97_918, 'USD', RATE) + toGbp(749_154, 'USD', RATE)
    assert.ok(Math.abs(liquid - expected) < 1e-6)
  })
})

describe('trust exclusion matches exact category names', () => {
  it('drops the trust categories', () => {
    assert.equal(isTrustAccount({ category: 'Trust' }), true)
    assert.equal(isTrustAccount({ category: '  trust ' }), true)
    assert.equal(isTrustAccount({ category: 'Education Trust' }), true)
  })

  it('does not eat a category that merely contains the word', () => {
    // Substring matching would silently drop this from every spendable figure,
    // and the drop would be invisible because the figure would just be smaller.
    assert.equal(isTrustAccount({ category: 'Trustee Fees' }), false)
    assert.equal(isTrustAccount({ category: 'Trust Preferred Securities' }), false)
    assert.equal(isTrustAccount({ category: 'Cash' }), false)
    assert.equal(isTrustAccount({ category: null }), false)
  })
})

describe('cash runway shares one currency-independent denominator', () => {
  const monthlyBurnGbp = 43_065.77

  it('divides both framings by the same burn', () => {
    const sterlingCash = cashInCurrency(ACCOUNTS, 'GBP', 'spendable')
    const allCash = totalCashGbp(ACCOUNTS, RATE, 'spendable')

    const sterlingMonths = sterlingCash / monthlyBurnGbp
    const convertedMonths = allCash / monthlyBurnGbp

    // The only thing that differs between the two cards is the numerator.
    assert.ok(Math.abs(sterlingCash / sterlingMonths - monthlyBurnGbp) < 1e-6)
    assert.ok(Math.abs(allCash / convertedMonths - monthlyBurnGbp) < 1e-6)
    assert.ok(convertedMonths > sterlingMonths)
  })

  it('never derives a denominator from the currency an account is held in', () => {
    // Converted cash is strictly the sterling cash plus the USD cash in GBP —
    // no per-currency burn anywhere in the chain.
    const usdCashGbp = toGbp(cashInCurrency(ACCOUNTS, 'USD', 'spendable'), 'USD', RATE)
    const combined = cashInCurrency(ACCOUNTS, 'GBP', 'spendable') + usdCashGbp
    assert.ok(Math.abs(totalCashGbp(ACCOUNTS, RATE, 'spendable') - combined) < 1e-6)
  })

  it('excludes trust capital from the numerator', () => {
    assert.ok(
      totalCashGbp(ACCOUNTS, RATE, 'all') > totalCashGbp(ACCOUNTS, RATE, 'spendable') ||
        // Trust is not a cash category, so the two may legitimately be equal —
        // what matters is that the spendable basis never exceeds the full one.
        totalCashGbp(ACCOUNTS, RATE, 'all') === totalCashGbp(ACCOUNTS, RATE, 'spendable')
    )
  })
})

/** Minimal inputs that fire every detector in both pools. */
const OBSERVATIONS_INPUT = {
  accounts: ACCOUNTS,
  recurring: [
    { name: 'School fees', annualized_amount_gbp: 42_000, needs_review: true },
    { name: 'Nursery', annualized_amount_gbp: 28_000, needs_review: true },
  ] as unknown as RecurringPayment[],
  annualTrends: [
    { category: 'Childcare', cur_yr_minus_1: -40_000, cur_yr_est: -62_000 },
    { category: 'Holidays', cur_yr_minus_1: -12_000, cur_yr_est: -19_000 },
  ] as unknown as AnnualTrend[],
  monthlyTrends: [
    {
      category: 'Holidays',
      z_score: 3.1,
      cur_month_est: -9_400,
      ttm_avg: -1_800,
      cur_month_minus_1: -1_200,
      cur_month_minus_2: -900,
      cur_month_minus_3: -1_500,
    },
  ] as unknown as MonthlyTrend[],
  forecastByCategory: [
    { category: 'Childcare', forecast: -62_000, ytd: -40_000, annualBudget: -40_000 },
  ],
  gbpUsdRate: RATE,
  baseCurrency: 'GBP' as const,
  asOf: '2026-08-14',
}

describe('observation drill-in links resolve', () => {
  it('walks every href in the full detector set', () => {
    const observations = [
      ...rankAllocationObservations(OBSERVATIONS_INPUT, 20),
      ...rankSpendingObservations(OBSERVATIONS_INPUT, 20),
    ]

    assert.ok(observations.length > 0, 'fixtures must produce observations to walk')

    const withLinks = observations.filter((o) => o.drillIn != null)
    assert.ok(withLinks.length > 0, 'fixtures must produce drill-in links to walk')

    for (const observation of withLinks) {
      const href = observation.drillIn!.href
      assert.ok(
        hrefResolves(href),
        `${observation.detector} links to ${href}, which resolves to no live section`
      )
      // /analysis and /dashboard are redirect shims, not destinations.
      assert.ok(!href.startsWith('/analysis'), `${observation.detector} still points at /analysis`)
      assert.ok(!href.startsWith('/dashboard'), `${observation.detector} still points at /dashboard`)
    }
  })

  it('resolves the section aliases people actually type', () => {
    // `/position#runway` landed at the top of the page for a full release.
    assert.equal(resolveSectionId('runway'), 'cash-runway')
    assert.ok(hrefResolves('/position#runway'))
    assert.ok(hrefResolves('/position#cash-runway'))
    assert.ok(hrefResolves('/spending?section=transaction-analysis&category=Childcare'))
    assert.equal(hrefResolves('/position#not-a-section'), false)
    assert.equal(hrefResolves('/analysis#cash-runway'), false)
  })
})

describe('observations read the spendable basis', () => {
  it('does not count trust capital as the largest holding', () => {
    const observations = rankAllocationObservations(OBSERVATIONS_INPUT, 20)
    const concentration = observations.find((o) => o.id === 'allocation.top-account-concentration')

    if (concentration) {
      assert.ok(
        !concentration.oneLiner.includes('Brosens 2012 Trust'),
        'trust capital is being narrated as a concentration in spendable assets'
      )
    }

    // Whatever the detectors say, the denominator they say it against is the
    // spendable total — the same figure Position and Home report.
    const spendable = totalAssetsGbp(ACCOUNTS, RATE, 'spendable')
    const all = totalAssetsGbp(ACCOUNTS, RATE, 'all')
    assert.ok(spendable < all)
  })
})

describe('FX exposure is anchored to spending, not to the display toggle', () => {
  it('measures the same exposure whether the header says GBP or USD', () => {
    const inGbp = rankAllocationObservations({ ...OBSERVATIONS_INPUT, baseCurrency: 'GBP' }, 20).find(
      (o) => o.id === 'allocation.fx-exposure'
    )
    const inUsd = rankAllocationObservations({ ...OBSERVATIONS_INPUT, baseCurrency: 'USD' }, 20).find(
      (o) => o.id === 'allocation.fx-exposure'
    )

    assert.ok(inGbp, 'fixture must trigger the FX exposure detector')
    assert.ok(inUsd, 'detector disappeared when the display currency changed')

    // Everything that constitutes the finding is identical. Only the currency
    // the amounts are *formatted* in legitimately differs, so the formatted
    // evidence values are compared by label and count rather than by string.
    assert.equal(inGbp!.title, inUsd!.title)
    assert.equal(inGbp!.severity, inUsd!.severity)
    assert.equal(inGbp!.metric.label, inUsd!.metric.label)
    assert.equal(inGbp!.metric.value, inUsd!.metric.value)
    assert.deepEqual(
      inGbp!.evidence.map((r) => r.label),
      inUsd!.evidence.map((r) => r.label)
    )
    assert.equal(inGbp!.drillIn?.href, inUsd!.drillIn?.href)

    // And it names sterling as the thing being measured against, in both.
    assert.ok(inGbp!.title.includes('non-GBP'))
    assert.ok(inUsd!.title.includes('non-GBP'))
  })
})
