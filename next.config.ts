import type { NextConfig } from 'next'

const isDev = process.env.NODE_ENV === 'development'

// The browser Supabase client talks to this origin directly, so it must be in connect-src.
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin
  } catch {
    return 'https://*.supabase.co'
  }
})()

// Fonts are self-hosted by next/font, and googleapis/serper are only ever called
// server-side, so no external origins are needed beyond Supabase and Vercel Analytics.
const csp = [
  `default-src 'self'`,
  // 'unsafe-inline' is required for Next's bootstrap and the next-themes anti-flash
  // script; 'unsafe-eval' only for webpack HMR in dev. External script origins stay blocked.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://va.vercel-scripts.com`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob:`,
  `font-src 'self' data:`,
  `connect-src 'self' ${supabaseOrigin} https://va.vercel-scripts.com https://vitals.vercel-insights.com`,
  `frame-ancestors 'none'`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ')

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns', 'recharts'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          // Redundant with frame-ancestors for modern browsers, kept for older ones.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
        ],
      },
    ]
  },
}

export default nextConfig
