/**
 * callOnBehalf's (and callAndConverse's) parameters.
 *
 * callNow and lateConfirmed carry the owner's explicit "call now" to the
 * call-hours guard (services/outreach/call-now-override.ts,
 * CALL_NOW_OWNER_OVERRIDE): the model sets them from what the caller said, so
 * nothing parses the caller's words for it.
 *
 * @module tools/domains/telephony/call-on-behalf-schema
 */

import { z } from 'zod';

export const callOnBehalfSchema = z.object({
  contactQuery: z.string().describe('Who to call (e.g., "my doctor", "mom", "Olive Garden")'),
  phoneNumber: z
    .string()
    .optional()
    .describe(
      'Phone number if provided by user (e.g., "8015550142", "+1-801-555-0142"). Use this if the user explicitly provides a number.'
    ),
  purpose: z
    .string()
    .describe('Why you are calling (e.g., "reschedule my appointment to next week")'),
  additionalContext: z
    .string()
    .optional()
    .describe('Any additional context or preferences for the call'),
  preferredTimes: z
    .array(z.string())
    .optional()
    .describe('Preferred times if scheduling (e.g., ["morning", "after 2pm"])'),
  recordingConsent: z
    .boolean()
    .optional()
    .default(true)
    .describe('Whether the user consents to call recording'),
  callNow: z
    .boolean()
    .optional()
    .describe(
      'true ONLY when the caller explicitly asks for the call to happen right away rather than ' +
        'wait for a good hour: "call now", "call her now", "she\'s up, call now", "don\'t wait". ' +
        'Never set it on your own, and not for a plain "call my mom". Leave it unset otherwise.'
    ),
  lateConfirmed: z
    .boolean()
    .optional()
    .describe(
      'true ONLY after this tool said it is late or early where they are, you told the caller, ' +
        'and the caller said to call anyway. Send it together with callNow: true.'
    ),
});
