import { HashRedirect } from '@/components/nav/hash-redirect'

export const metadata = {
  title: 'Moved',
}

/**
 * Analysis was cut from seven sections to three and its remainder became
 * /trends. Cash Runway moved to /position and Transaction Analysis to
 * /spending, so the destination depends on the fragment.
 *
 * The three cumulative/evolution sections merged into a single Forecast section
 * with a period toggle; their old fragments land on it and the toggle opens on
 * the matching period.
 */
const DESTINATIONS: Record<string, string> = {
  'cash-runway': '/position',
  'transaction-analysis': '/spending',
  'forecast-evolution': '/trends',
  'ytd-spend': '/trends',
  'annual-cumulative': '/trends',
  'yoy-net-worth': '/trends',
  'monthly-category-trends': '/trends',
}

export default function AnalysisRedirectPage() {
  return <HashRedirect map={DESTINATIONS} fallback="/trends" />
}
