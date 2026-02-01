import type { MetadataRoute } from 'next'

/**
 * Web App Manifest for PWA / "Add to Home Screen".
 * When users open the app from the home screen, it runs in standalone mode:
 * no URL bar, no browser bottom toolbar (back, share, open in Safari, etc.).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TS Personal Finance',
    short_name: 'TS Finance',
    description: 'Personal finance dashboard with net worth tracking and budget analysis',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0f172a',
    orientation: 'portrait-primary',
  }
}
