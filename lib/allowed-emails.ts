/**
 * Allowed emails for app access. Only from env – no developer bypass.
 * Set ALLOWED_EMAILS (comma-separated) in .env.local / environment.
 */
export function getAllowedEmails(): string[] {
  const envEmails = process.env.ALLOWED_EMAILS
  if (!envEmails || !envEmails.trim()) {
    return []
  }
  return envEmails.split(',').map((email) => email.trim()).filter(Boolean)
}
