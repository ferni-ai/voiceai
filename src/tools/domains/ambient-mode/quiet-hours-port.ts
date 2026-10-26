/**
 * Where setQuietHours saves the window "When I'll Check In" shows: the caller's
 * messagingPrefs (services/messaging/prefs.ts), which the senders also read.
 * Tools (L3) may not import services/messaging (L4), so the call session
 * installs the writer (services/messaging/voice-quiet-hours.ts) and the tool
 * reads it here. Not installed: the tool saves nothing and says so.
 *
 * @module tools/domains/ambient-mode/quiet-hours-port
 */

/** 'same' when start and end are the same time, which the prefs refuse. */
export type QuietHoursWriter = (
  userId: string,
  quietStart: string,
  quietEnd: string
) => Promise<'saved' | 'same'>;

let writer: QuietHoursWriter | undefined;

export function setQuietHoursWriter(next: QuietHoursWriter | undefined): void {
  writer = next;
}

export function quietHoursWriter(): QuietHoursWriter | undefined {
  return writer;
}
