import { HashRedirect } from '@/components/nav/hash-redirect'

export const metadata = {
  title: 'Moved',
}

/**
 * The Dashboard's sections now live on three different pages, so the
 * destination depends on the fragment. See components/nav/hash-redirect.tsx.
 */
const DESTINATIONS: Record<string, string> = {
  'net-worth-chart': '/position',
  'budget-table': '/spending',
  'annual-trends': '/trends',
  'monthly-trends': '/trends',
}

export default function DashboardRedirectPage() {
  return <HashRedirect map={DESTINATIONS} fallback="/" />
}
