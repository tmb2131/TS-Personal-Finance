import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  RETURN_ASSUMPTIONS_BY_PROFILE,
  computeYearsUntilDepletion,
  getEffectiveTaxRate,
  isValidReturnRate,
  parseReturnAssumptions,
  resolveReturnCategory,
  weightedAfterTaxRealReturn,
  weightedNominalReturn,
  weightedRealReturn,
  type AssetMixEntry,
} from '../return-assumptions.ts'

const mix: AssetMixEntry[] = [
  { category: 'Cash', balance: 326_001 },
  { category: 'Brokerage', balance: 749_154 },
  { category: 'Taconic Credit Opps', balance: 1_534_025 },
  { category: 'Taconic Opportunity', balance: 1_318_114 },
  { category: 'Taconic Legacy', balance: 1_466_596 },
  { category: 'Taconic Merger Arb', balance: 635_337 },
]

describe('negative returns', () => {
  it('accepts a negative rate within bounds', () => {
    assert.equal(isValidReturnRate(-0.08), true)
    assert.equal(isValidReturnRate(-0.6), false)
    assert.equal(isValidReturnRate(0.6), false)
  })

  it('lets the Conservative profile produce a loss year', () => {
    const nominal = weightedNominalReturn(mix, RETURN_ASSUMPTIONS_BY_PROFILE.Conservative)
    assert.ok((nominal) < (0))
  })

  it('keeps Expected between Conservative and Base', () => {
    const conservative = weightedNominalReturn(mix, RETURN_ASSUMPTIONS_BY_PROFILE.Conservative)
    const expected = weightedNominalReturn(mix, RETURN_ASSUMPTIONS_BY_PROFILE.Expected)
    const base = weightedNominalReturn(mix, RETURN_ASSUMPTIONS_BY_PROFILE.Base)
    assert.ok((expected) > (conservative))
    assert.ok((expected) < (base))
  })
})

describe('tax', () => {
  it('reduces the real return', () => {
    const gross = weightedRealReturn(mix, RETURN_ASSUMPTIONS_BY_PROFILE.Base)
    const net = weightedAfterTaxRealReturn(mix, RETURN_ASSUMPTIONS_BY_PROFILE.Base)
    assert.ok((net) < (gross))
  })

  it('does not gross up a loss', () => {
    const net = weightedAfterTaxRealReturn(
      [{ category: 'Taconic Legacy', balance: 1_000_000 }],
      RETURN_ASSUMPTIONS_BY_PROFILE.Conservative
    )
    // -8% nominal must stay -8% before the inflation adjustment, not -4.4%.
    assert.ok(Math.abs((net) - ((1 - 0.08) / 1.03 - 1)) < Math.pow(10, -(6)) * 5, `expected ${net} close to ${(1 - 0.08) / 1.03 - 1}`)
  })

  it('treats retirement as untaxed', () => {
    assert.equal(getEffectiveTaxRate(RETURN_ASSUMPTIONS_BY_PROFILE.Base, 'Retirement'), 0)
  })
})

describe('backward compatibility', () => {
  it('parses a pre-split row and backfills the Taconic sub-funds', () => {
    const legacyRow = {
      defaultNominalReturn: 0.04,
      nominalReturns: {
        Cash: 0.03,
        Checking: 0.03,
        Savings: 0.03,
        Brokerage: 0.07,
        Retirement: 0.07,
        'Alt Inv': 0.06,
        Taconic: 0.06,
        House: 0.04,
        Property: 0.04,
        Other: 0.04,
      },
    }

    const parsed = parseReturnAssumptions(legacyRow)
    assert.notEqual(parsed, null)
    assert.equal(parsed!.nominalReturns['Taconic Credit Opps'], 0.06)
    assert.equal(parsed!.nominalReturns['Taconic Legacy'], 0.06)
    assert.equal(parsed!.effectiveTaxRates!['Taconic Legacy'], 0.45)
  })

  it('still rejects a malformed rate', () => {
    assert.equal(
      parseReturnAssumptions({ defaultNominalReturn: 0.04, nominalReturns: { Cash: 'nope' } }),
      null
    )
  })
})

describe('category resolution', () => {
  it('maps each Taconic account name to its sub-fund rate', () => {
    const cases: [string, string][] = [
      ['Taconic Credit Opportunities Fund L.P.', 'Taconic Credit Opps'],
      ['Taconic Merger Arbitrage Fund L.P.', 'Taconic Merger Arb'],
      ['Opportunity Fund L.P.', 'Taconic Opportunity'],
      ['CRE Dislocation Onshore Fund II L.P.', 'Taconic Legacy'],
      ['CRE Dislocation Onshore Fund III L.P.', 'Taconic Legacy'],
      ['European Credit Dislocation Fund II L.P.', 'Taconic Legacy'],
      ['European Credit Dislocation Fund III L.P.', 'Taconic Legacy'],
      ['Market Dislocation Onshore Fund III L.P.', 'Taconic Legacy'],
    ]
    for (const [name, expected] of cases) {
      assert.equal(resolveReturnCategory('Taconic', name), expected)
    }
  })

  it('does not let Opportunity Fund shadow Credit Opportunities', () => {
    assert.equal(
      resolveReturnCategory('Taconic', 'Taconic Credit Opportunities Fund L.P.'),
      'Taconic Credit Opps'
    )
  })

  it('aliases the sheet spelling of Alt Inv', () => {
    assert.equal(resolveReturnCategory('Alternative Investment'), 'Alt Inv')
  })

  it('passes through anything unrecognised', () => {
    assert.equal(resolveReturnCategory('Cash'), 'Cash')
    assert.equal(resolveReturnCategory('Taconic'), 'Taconic')
  })

  it('actually differentiates the Taconic sub-funds in a weighted return', () => {
    const named = weightedNominalReturn(
      [
        { category: 'Taconic', balance: 1_000_000, accountName: 'Taconic Credit Opportunities Fund L.P.' },
        { category: 'Taconic', balance: 1_000_000, accountName: 'CRE Dislocation Onshore Fund II L.P.' },
      ],
      RETURN_ASSUMPTIONS_BY_PROFILE.Base
    )
    // Credit Opps 7.0% and Legacy 1.5% average to 4.25%, not the 4.5% alias.
    assert.ok(Math.abs(named - 0.0425) < 1e-9, `got ${named}`)
  })
})

describe('depletion', () => {
  it('returns maxYears when nothing is withdrawn', () => {
    assert.equal(computeYearsUntilDepletion(1_000_000, 0, 0.02), 100)
  })

  it('depletes faster at a negative real return', () => {
    const flat = computeYearsUntilDepletion(1_000_000, 100_000, 0)
    const losing = computeYearsUntilDepletion(1_000_000, 100_000, -0.05)
    assert.ok(losing < flat)
  })
})
