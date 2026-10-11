/**
 * Pre-call heads-up text: before Ferni calls someone for the user, a short
 * text so the call isn't a surprise ("Hi Mindy, it's Ferni, Seth's AI friend.
 * Seth asked me to give you a call later today.").
 *
 * Off unless HEADS_UP_TEXT=on. Nothing calls this yet: wiring it into call
 * placement is a separate decision. The sender is injected, so this module
 * adds no SMS path of its own.
 *
 * @module services/outreach/pre-call-heads-up
 */

export interface HeadsUpInput {
  contactName: string;
  contactPhone: string;
  userName: string;
}

export type HeadsUpSender = (to: string, body: string) => Promise<{ success: boolean }>;

export function isHeadsUpTextEnabled(): boolean {
  return process.env.HEADS_UP_TEXT === 'on';
}

export function buildHeadsUpText({ contactName, userName }: HeadsUpInput): string {
  const first = contactName.trim().split(/\s+/)[0] || contactName;
  return `Hi ${first}, it's Ferni, ${userName}'s AI friend. ${userName} asked me to give you a call later today.`;
}

/** Sends the heads-up text only when HEADS_UP_TEXT=on; otherwise sends nothing. */
export async function sendPreCallHeadsUp(
  input: HeadsUpInput,
  send: HeadsUpSender
): Promise<{ sent: boolean; reason?: string }> {
  if (!isHeadsUpTextEnabled()) return { sent: false, reason: 'HEADS_UP_TEXT is off' };
  if (!input.contactPhone) return { sent: false, reason: 'No phone number' };
  const result = await send(input.contactPhone, buildHeadsUpText(input));
  return result.success ? { sent: true } : { sent: false, reason: 'Send failed' };
}
