/**
 * The caller card (CALLER_CARD, off by default; spec docs/plans/2026-10-31-right-moment-memory.md
 * §5.4): private notes in every persona's "Who You're Talking To", handoffs included. Home only.
 *
 * @module agents/multi-agent/caller-card
 */
import { flagOn } from '../../../config/env-flag.js';
import { minorHeld } from '../../../utils/minor-care.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { ownerProvenHere } from '../recent-texts-awareness.js';
import { outboundPartiesFor } from '../../shared/outbound-opener.js';
import { CARD_BUDGET_MS, getCallerCard, mayHaveCard, within } from './load.js';
import type { CallerCardPorts } from './ports.js';
import { renderCallerCard } from './render.js';
import { callerCardPorts, type CardServices } from './wiring.js';
export { whoYoureTalkingTo } from './who-block.js';

const log = createLogger({ module: 'caller-card' });

/**
 * This persona's card text, or null (flag off, no card for this caller, nothing to say).
 * Only when the account owner is proven on the line (ownerProvenOnLine, as recent texts).
 * Called at every persona setup: the card is built once per session, and the forgotten
 * topics are read again each time, in parallel, so a forget mid-call holds for the next
 * persona (ruling 4). Done within CARD_BUDGET_MS; never rejects.
 */
export async function callerCardText(
  sessionId: string,
  services: CardServices,
  phoneCall = false,
  ports: CallerCardPorts = callerCardPorts(services)
): Promise<string | null> {
  const userId = services.userId ?? '';
  if (!flagOn('CALLER_CARD') || !mayHaveCard(userId)) return null;
  // Before any read or the shared build: caller ID can be spoofed; Ferni's own calls reach others.
  if (!ownerProvenHere(sessionId, phoneCall) || outboundPartiesFor(sessionId)) return null;
  const [card, topics] = await Promise.all([
    getCallerCard(sessionId, userId, ports),
    within(ports.forgotten(userId), CARD_BUDGET_MS, 'caller card forgotten'),
  ]);
  // A call that sounded under 18 since the card was built gets no card from here on.
  if (!card || minorHeld(sessionId)) return null;
  const forgottenTopics = typeof topics === 'object' ? topics.value : null;
  if (forgottenTopics === null) log.info({ why: topics }, 'CALLER_CARD forgotten_timeout');
  return renderCallerCard(card, { forgottenTopics }) || null;
}
