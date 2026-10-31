/**
 * The card, once per session (spec §5.4.1): a handoff persona gets the first one's promise (no
 * reads, the same card). CARD_BUDGET_MS for the build; a late section is left out and budgetHit
 * set. Members only, never a MINOR_CARE account (checked first, failing closed); dropped at
 * session end through the cleanup registry.
 *
 * @module agents/multi-agent/caller-card/load
 */
import { isMemberIdentity } from '../../../services/identity/member-identity.js';
import { isUnverifiedUserId } from '../../../services/identity/unverified-user-id.js';
import { withTimeout } from '../../../services/session/utils.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { registerCleanup } from '../../session/event-cleanup-registry.js';
import type { CallerCardPorts } from './ports.js';
import type { CallerCard } from './types.js';

const log = createLogger({ module: 'caller-card' });

export const CARD_BUDGET_MS = 400;
const MAX_SESSIONS = 500;

/** sessionId -> the card being built or built for it, and whose it is. */
const cards = new Map<string, { userId: string; card: Promise<CallerCard | null> }>();
const dropCallerCard = (sessionId: string): void => {
  cards.delete(sessionId);
};

/** A verified member: no card for onbehalf:, anon:, phone:, device: or placeholder ids. */
export const mayHaveCard = (userId: string): boolean =>
  isMemberIdentity(userId) && !isUnverifiedUserId(userId);

/** The work's answer, 'late' past `ms`, or 'failed' (logged). Never rejects. */
export async function within<T>(
  work: Promise<T>,
  ms: number,
  what: string
): Promise<{ value: T } | 'late' | 'failed'> {
  const answer = withTimeout(
    work.then((value) => ({ value })),
    ms,
    what
  );
  try {
    return (await answer) ?? 'late';
  } catch (error) {
    log.warn({ what, error: String(error) }, 'CALLER_CARD read failed');
    return 'failed';
  }
}

async function build(userId: string, ports: CallerCardPorts): Promise<CallerCard | null> {
  const started = Date.now();
  const left = (): number => Math.max(0, CARD_BUDGET_MS - (Date.now() - started));
  const held = await within(ports.minorCare(userId), left(), 'caller card minor care');
  if (typeof held !== 'object' || held.value) {
    log.info({ event: 'CALLER_CARD skipped', reason: 'minor_care', held }, 'CALLER_CARD skipped');
    return null;
  }
  const home = await within(ports.home(userId), left(), 'caller card home');
  const place = typeof home === 'object' ? home.value : null;
  const card: CallerCard = {
    v: 1,
    userId,
    builtAt: new Date().toISOString(),
    home: place && { value: place, loadedMs: Date.now() - started },
    people: null,
    recentCalls: null,
    comingUp: null,
    budgetHit: home === 'late',
  };
  const sections = { home: place !== null, people: false, recentCalls: false, comingUp: false };
  const facts = { ms: Date.now() - started, budgetHit: card.budgetHit, sections };
  log.info(
    { event: 'CALLER_CARD built', ...facts, source: place?.source ?? null },
    'CALLER_CARD built'
  );
  return card;
}

/** This session's card: built on the first call, the same promise after. Null: no card. */
export async function getCallerCard(
  sessionId: string,
  userId: string,
  ports: CallerCardPorts
): Promise<CallerCard | null> {
  if (!mayHaveCard(userId)) return null;
  const hit = cards.get(sessionId);
  if (hit) return hit.userId === userId ? hit.card : null;
  const card = build(userId, ports);
  cards.set(sessionId, { userId, card });
  if (cards.size > MAX_SESSIONS) dropCallerCard(cards.keys().next().value ?? '');
  registerCleanup(sessionId, 'resource', 'caller card', () => dropCallerCard(sessionId));
  return card;
}
