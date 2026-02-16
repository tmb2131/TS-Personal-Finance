import { createBrowserClient } from '@supabase/ssr'

const noStoreFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: 'no-store' })

/** Browser client; may use cached responses. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

/** Browser client that bypasses HTTP cache (e.g. for refresh flows). Not a singleton. */
export function createClientNoCache() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { fetch: noStoreFetch }, isSingleton: false }
  )
}
