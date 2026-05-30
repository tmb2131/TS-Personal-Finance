/**
 * Date helpers that keep calendar dates in the user's local timezone.
 *
 * Calendar values stored as `YYYY-MM-DD` (e.g. transaction/account dates) have no
 * time component. Parsing them with `new Date('2026-01-01')` interprets the value
 * as UTC midnight, which renders as the previous day in negative UTC offsets
 * (e.g. UTC-4). These helpers parse/format such values in local time instead.
 */

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Parse a date value as a local Date.
 *
 * - `YYYY-MM-DD` strings are treated as local calendar dates (local midnight).
 * - Strings that include a time component (e.g. full ISO timestamps) are parsed
 *   as real instants via the native `Date` constructor.
 */
export function parseLocalDate(value: string): Date {
  const match = DATE_ONLY_PATTERN.exec(value)
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  }
  return new Date(value)
}

/** Format a Date as a `YYYY-MM-DD` string using its local calendar components. */
export function toLocalDateString(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Today's date as a local `YYYY-MM-DD` string. */
export function todayLocalDateString(): string {
  return toLocalDateString(new Date())
}

/**
 * Format a Date as a `YYYY-MM-DD` string in a specific IANA timezone (e.g.
 * "America/New_York"). Works on the server, where the host clock is UTC, so a
 * calendar date can be computed in the user's timezone instead of UTC.
 *
 * Falls back to the host's local components if no/invalid timezone is given.
 */
export function formatDateInTimeZone(date: Date, timeZone?: string | null): string {
  if (!timeZone) return toLocalDateString(date)
  try {
    // en-CA renders dates as YYYY-MM-DD
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date)
  } catch {
    return toLocalDateString(date)
  }
}

/** Today's date as a `YYYY-MM-DD` string in the given IANA timezone. */
export function todayInTimeZone(timeZone?: string | null): string {
  return formatDateInTimeZone(new Date(), timeZone)
}

/** The browser's IANA timezone (client-only). Returns undefined if unavailable. */
export function getClientTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
  } catch {
    return undefined
  }
}

/** Read the caller's IANA timezone from a request's `x-timezone` header or `tz` query param. */
export function getTimeZoneFromRequest(request: Request): string | undefined {
  const header = request.headers.get('x-timezone')
  if (header) return header
  try {
    const tz = new URL(request.url).searchParams.get('tz')
    return tz || undefined
  } catch {
    return undefined
  }
}
