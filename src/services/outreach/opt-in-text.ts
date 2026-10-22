/**
 * The one text that confirms an opt-in (CTIA): sent when texts go from off to
 * on in settings (writeOutreachConsent), through the guarded sender. In the
 * member's quiet hours it is held and goes at 08:00 their time (held-texts.ts).
 *
 * @module services/outreach/opt-in-text
 */
import { QUIET_END_HOUR, QUIET_START_HOUR } from '../follow-through/right-moment.js';
import {
  defaultTextDeps,
  sendGuardedText,
  type GuardedText,
  type TextDeps,
} from './guarded-text.js';
import { holdText } from './held-texts.js';
import {
  hoursWindow,
  isQuietAt,
  quietEndsAt,
  quietZonesOf,
  type QuietHoursUser,
} from './quiet-hours.js';

export const OPT_IN_CONFIRMATION =
  "Ferni here. You'll get reminders and check-ins at this number, up to 3 a day. Msg & data rates may apply. Reply STOP to cancel, HELP for help.";
/** One per opt-in (refId: when it was granted); toggling can't send more than one a minute. */
const OPT_IN_GAP_MS = 60 * 1000;
const QUIET_WINDOW = hoursWindow(QUIET_START_HOUR, QUIET_END_HOUR);

export interface OptInDeps {
  text: TextDeps;
  send: typeof sendGuardedText;
  hold: (t: GuardedText, releaseAt: Date, reason: string) => Promise<void>;
}

const defaults = (): OptInDeps => ({
  text: defaultTextDeps(),
  send: sendGuardedText,
  hold: (t, at, why) => holdText(t, at, why),
});

/** Texts the confirmation for the opt-in granted at `grantedAt`, or holds it until 08:00. */
export async function confirmSmsOptIn(
  userId: string,
  grantedAt: string,
  deps: OptInDeps = defaults()
): Promise<string> {
  const t: GuardedText = {
    userId,
    body: OPT_IN_CONFIRMATION,
    kind: 'opt-in',
    refId: grantedAt,
    minGapMs: OPT_IN_GAP_MS,
  };
  const now = deps.text.now();
  const zones = quietZonesOf((await deps.text.store.userDoc(userId)) as QuietHoursUser | undefined);
  if (isQuietAt(now, QUIET_WINDOW, zones)) {
    await deps.hold(t, quietEndsAt(now, QUIET_WINDOW, zones), 'quiet-hours');
    return 'held';
  }
  const outcome = await deps.send(t, deps.text);
  return outcome.sent ? 'sent' : outcome.reason;
}
