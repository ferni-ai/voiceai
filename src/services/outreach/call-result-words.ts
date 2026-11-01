/**
 * Small wording helpers for the call-result report-back (#2947): say the contact
 * the way the owner would hear it, and stamp the time in the owner's timezone.
 *
 * @module services/outreach/call-result-words
 */

/** What a notification step actually did, so the summary log reports it honestly. */
export type StepOutcome = 'sent' | 'failed' | 'skipped';

/** The contact as the owner would say it back: "my mom" (their words) becomes "your mom". */
export function contactForOwner(name: string): string {
  return name.trim().replace(/^my\s+/i, 'your ');
}

/** "Tuesday, October 27 at 3:05 PM" in the owner's timezone; '' when it is unknown or invalid. */
export function completedAtFor(timeZone: string | undefined, at = new Date()): string {
  if (!timeZone) return '';
  try {
    return at.toLocaleString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone,
    });
  } catch {
    return '';
  }
}
