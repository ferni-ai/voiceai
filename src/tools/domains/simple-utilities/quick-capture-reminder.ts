/**
 * quickCapture's reminder branch: a captured thought saved as a reminder. The
 * delivery job may text any reminder to the owner (reminder-text-guard.ts), so
 * this branch, and only this one, goes through ownerMessagePolicy: a caller
 * matched by caller ID alone must not get words of their choosing texted to
 * the real member. Notes, tasks, memories and shopping items reach no one and
 * are not gated.
 *
 * @module tools/domains/simple-utilities/quick-capture-reminder
 */

import { getLogger } from '../../../utils/safe-logger.js';
import { formatStoredLocalTime } from '../../../utils/time-zone.js';
import { asksToRepeat, NO_REPEAT_YET } from '../../utils/honest-schedule.js';
import { recordReminderPromise } from '../../../services/superhuman/semantic-intelligence/promise-keeper.js';
import type { ToolContext } from '../../registry/types.js';
import {
  ownerMessageNotDelivered,
  ownerMessagePolicy,
  type OwnerMessage,
} from '../proactive/outreach/owner-message-policy.js';

const log = getLogger();

export type CapturedReminder =
  | { refusal: string } // nothing stored: say this instead
  | { persisted: boolean; followUp: string };

/** Save the thought as a reminder, if this call may; the time comes from the caller's own words. */
export async function captureReminder(
  ctx: ToolContext,
  thought: string,
  opts: unknown
): Promise<CapturedReminder> {
  const message: OwnerMessage = {
    tool: 'quickCapture',
    ownerId: ctx.userId,
    opts,
    texts: [thought],
    spoken: false,
  };
  const decision = ownerMessagePolicy(message);
  if (decision.outcome === 'refused') return { refusal: decision.line };
  const footer = decision.outcome === 'unverified_allowed' ? decision.footer : null;
  try {
    const { createReminder, parseNaturalTime, userTimeZone } =
      await import('../../../services/scheduling/reminder-scheduler.js');
    const when = thought.match(/\b(?:at|by|tomorrow|next|in)\b[\w\s:]*/i)?.[0];
    const scheduledFor = parseNaturalTime(when ?? 'tomorrow at 9am', userTimeZone(ctx));
    if (scheduledFor && ctx.userId) {
      const reminder = await createReminder({
        userId: ctx.userId,
        message: footer ? `${thought}\n\n${footer}` : thought,
        scheduledFor,
        deliveryMethod: 'voice_message',
        deliveryAddress: '',
      });
      // "I'll remind you" is a promise the delivery job keeps or misses
      await recordReminderPromise(ctx.userId, reminder);
      const at = formatStoredLocalTime(scheduledFor, userTimeZone(ctx));
      const repeat = asksToRepeat(thought) ? NO_REPEAT_YET : '';
      return { persisted: true, followUp: `Saved one reminder for ${at}, as a message in the Ferni app.${repeat}` }; // prettier-ignore
    }
  } catch (err) {
    log.debug({ error: String(err) }, 'Could not create reminder, falling back');
  }
  if (decision.outcome === 'unverified_allowed') ownerMessageNotDelivered(message);
  return { persisted: false, followUp: '' };
}
