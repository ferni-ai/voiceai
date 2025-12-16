/**
 * Date Formatting Utilities
 *
 * Provides locale-aware date and time formatting using Intl.DateTimeFormat.
 * Leverages design-system/tokens/i18n.json for locale-specific patterns.
 */

import { type SupportedLocale, DEFAULT_LOCALE } from '../types.js';

// ============================================================================
// DATE FORMATTING
// ============================================================================

/**
 * Format a date with various style options
 */
export function formatDate(
  date: Date,
  locale: SupportedLocale = DEFAULT_LOCALE,
  options?: Intl.DateTimeFormatOptions
): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    ...options,
  }).format(date);
}

/**
 * Format a date in short style (e.g., "12/14/24" or "14/12/24")
 */
export function formatDateShort(date: Date, locale: SupportedLocale = DEFAULT_LOCALE): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
  }).format(date);
}

/**
 * Format a date in long style (e.g., "December 14, 2024")
 */
export function formatDateLong(date: Date, locale: SupportedLocale = DEFAULT_LOCALE): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
  }).format(date);
}

/**
 * Format a date in full style (e.g., "Saturday, December 14, 2024")
 */
export function formatDateFull(date: Date, locale: SupportedLocale = DEFAULT_LOCALE): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'full',
  }).format(date);
}

// ============================================================================
// TIME FORMATTING
// ============================================================================

/**
 * Format a time
 */
export function formatTime(
  date: Date,
  locale: SupportedLocale = DEFAULT_LOCALE,
  options?: Intl.DateTimeFormatOptions
): string {
  return new Intl.DateTimeFormat(locale, {
    timeStyle: 'short',
    ...options,
  }).format(date);
}

/**
 * Format a time with seconds
 */
export function formatTimeLong(date: Date, locale: SupportedLocale = DEFAULT_LOCALE): string {
  return new Intl.DateTimeFormat(locale, {
    timeStyle: 'medium',
  }).format(date);
}

// ============================================================================
// DATE + TIME FORMATTING
// ============================================================================

/**
 * Format a date and time together
 */
export function formatDateTime(
  date: Date,
  locale: SupportedLocale = DEFAULT_LOCALE,
  options?: {
    dateStyle?: 'full' | 'long' | 'medium' | 'short';
    timeStyle?: 'full' | 'long' | 'medium' | 'short';
  }
): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: options?.dateStyle ?? 'medium',
    timeStyle: options?.timeStyle ?? 'short',
  }).format(date);
}

// ============================================================================
// RELATIVE TIME FORMATTING
// ============================================================================

/**
 * Format a relative time (e.g., "5 minutes ago", "in 2 days")
 */
export function formatRelativeTime(
  date: Date,
  locale: SupportedLocale = DEFAULT_LOCALE,
  baseDate: Date = new Date()
): string {
  const diff = date.getTime() - baseDate.getTime();
  const absDiff = Math.abs(diff);
  const isPast = diff < 0;

  const seconds = Math.floor(absDiff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (seconds < 60) {
    return rtf.format(isPast ? -seconds : seconds, 'second');
  } else if (minutes < 60) {
    return rtf.format(isPast ? -minutes : minutes, 'minute');
  } else if (hours < 24) {
    return rtf.format(isPast ? -hours : hours, 'hour');
  } else if (days < 7) {
    return rtf.format(isPast ? -days : days, 'day');
  } else if (weeks < 4) {
    return rtf.format(isPast ? -weeks : weeks, 'week');
  } else if (months < 12) {
    return rtf.format(isPast ? -months : months, 'month');
  } else {
    return rtf.format(isPast ? -years : years, 'year');
  }
}

/**
 * Get a human-friendly "time ago" string
 * Returns more natural language like "just now", "yesterday"
 */
export function formatTimeAgo(
  date: Date,
  locale: SupportedLocale = DEFAULT_LOCALE,
  baseDate: Date = new Date()
): string {
  const diff = baseDate.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (seconds < 10) {
    // "just now" - rtf handles this with numeric: 'auto'
    return rtf.format(0, 'second');
  } else if (seconds < 60) {
    return rtf.format(-seconds, 'second');
  } else if (minutes < 60) {
    return rtf.format(-minutes, 'minute');
  } else if (hours < 24) {
    return rtf.format(-hours, 'hour');
  } else if (days === 1) {
    // "yesterday"
    return rtf.format(-1, 'day');
  } else if (days < 7) {
    return rtf.format(-days, 'day');
  } else {
    // Fall back to formatted date for older items
    return formatDate(date, locale);
  }
}

// ============================================================================
// DURATION FORMATTING
// ============================================================================

/**
 * Format a duration in milliseconds to a human-readable string
 */
export function formatDuration(ms: number, locale: SupportedLocale = DEFAULT_LOCALE): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  const parts: string[] = [];

  if (hours > 0) {
    parts.push(new Intl.NumberFormat(locale).format(hours) + 'h');
  }
  if (minutes % 60 > 0 || (hours === 0 && minutes > 0)) {
    parts.push(new Intl.NumberFormat(locale).format(minutes % 60) + 'm');
  }
  if ((seconds % 60 > 0 || parts.length === 0) && hours === 0) {
    parts.push(new Intl.NumberFormat(locale).format(seconds % 60) + 's');
  }

  return parts.join(' ');
}

/**
 * Format a duration as "mm:ss" or "hh:mm:ss"
 */
export function formatDurationClock(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  const ss = String(seconds % 60).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');

  if (hours > 0) {
    const hh = String(hours).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }

  return `${mm}:${ss}`;
}

// ============================================================================
// DATE PARTS
// ============================================================================

/**
 * Get the day of the week name
 */
export function getDayName(
  date: Date,
  locale: SupportedLocale = DEFAULT_LOCALE,
  format: 'long' | 'short' | 'narrow' = 'long'
): string {
  return new Intl.DateTimeFormat(locale, { weekday: format }).format(date);
}

/**
 * Get the month name
 */
export function getMonthName(
  date: Date,
  locale: SupportedLocale = DEFAULT_LOCALE,
  format: 'long' | 'short' | 'narrow' = 'long'
): string {
  return new Intl.DateTimeFormat(locale, { month: format }).format(date);
}

// ============================================================================
// TIME OF DAY
// ============================================================================

/**
 * Get the time of day period (morning, afternoon, evening, night)
 */
export function getTimeOfDay(
  date: Date = new Date()
): 'morning' | 'afternoon' | 'evening' | 'night' {
  const hour = date.getHours();

  if (hour >= 5 && hour < 12) {
    return 'morning';
  } else if (hour >= 12 && hour < 17) {
    return 'afternoon';
  } else if (hour >= 17 && hour < 21) {
    return 'evening';
  } else {
    return 'night';
  }
}
