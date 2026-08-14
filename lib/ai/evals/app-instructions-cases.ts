export type ExpectedToolUsage = 'app_help_first' | 'finance_first' | 'mixed'

export interface AppInstructionEvalCase {
  id: string
  prompt: string
  expectedToolUsage: ExpectedToolUsage
  expectedPrimaryRoute: string
  routeHint?: string
  notes?: string
}

export const APP_INSTRUCTIONS_EVAL_CASES: AppInstructionEvalCase[] = [
  {
    id: 'A01',
    prompt: 'How do I connect my Google Sheet?',
    expectedToolUsage: 'app_help_first',
    expectedPrimaryRoute: '/settings',
  },
  {
    id: 'A02',
    prompt: 'Where do I import a CSV and which columns are required?',
    expectedToolUsage: 'app_help_first',
    expectedPrimaryRoute: '/settings',
  },
  {
    id: 'A03',
    prompt: 'Where can I change my default currency?',
    expectedToolUsage: 'app_help_first',
    expectedPrimaryRoute: '/settings',
  },
  {
    id: 'A04',
    prompt: 'What does the Liquidity page show?',
    expectedToolUsage: 'app_help_first',
    expectedPrimaryRoute: '/position',
  },
  {
    id: 'A05',
    prompt: 'How do I refresh data from the header?',
    expectedToolUsage: 'app_help_first',
    expectedPrimaryRoute: 'global',
  },
  {
    id: 'A06',
    prompt: 'How do I sign in with Google?',
    expectedToolUsage: 'app_help_first',
    expectedPrimaryRoute: '/login',
  },
  {
    id: 'A07',
    prompt: 'Where do I add an account manually?',
    expectedToolUsage: 'app_help_first',
    expectedPrimaryRoute: '/position',
  },
  {
    id: 'A08',
    prompt: 'How do I add a transaction manually?',
    expectedToolUsage: 'app_help_first',
    expectedPrimaryRoute: '/spending',
  },
  {
    id: 'A09',
    prompt: 'Where can I review recurring subscriptions and bills?',
    expectedToolUsage: 'app_help_first',
    expectedPrimaryRoute: '/spending',
  },
  {
    id: 'A10',
    prompt: 'Why is the Kids tab not showing in navigation?',
    expectedToolUsage: 'app_help_first',
    expectedPrimaryRoute: 'global',
  },
  {
    id: 'A11',
    prompt: 'Which page has cash runway analysis?',
    expectedToolUsage: 'app_help_first',
    expectedPrimaryRoute: '/position',
  },
  {
    id: 'A12',
    prompt: 'How do I jump to monthly trends on the dashboard?',
    expectedToolUsage: 'app_help_first',
    expectedPrimaryRoute: '/trends',
  },
  {
    id: 'A13',
    prompt: 'Why am I seeing a connect sheet popup on Key Insights?',
    expectedToolUsage: 'app_help_first',
    expectedPrimaryRoute: '/',
  },
  {
    id: 'A14',
    prompt: 'How do I import a CSV and then check if I am over budget?',
    expectedToolUsage: 'mixed',
    expectedPrimaryRoute: '/settings',
  },
  {
    id: 'A15',
    prompt: 'Where can I change the theme and what is my net worth now?',
    expectedToolUsage: 'mixed',
    expectedPrimaryRoute: '/settings',
  },
]
