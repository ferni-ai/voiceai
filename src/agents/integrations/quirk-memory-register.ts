/**
 * After a call, a quirk that landed (the caller laughed right after it or
 * brought it up; quirk-note.ts marks it) becomes one life-ledger line, so next
 * call he can reference it once ("I promise not to doze off on you this
 * time"). Snore, whistle or hum only, one per call. Saved as is, not through
 * the extractor, whose FERNI_SELF_MEMORY filters drop remarks about a call.
 *
 * Each notable quirk is logged as QUIRK_OUTCOME {move: quirk_snore|..., landed}:
 * the hook for the move-outcomes log (MOVE_OUTCOMES, PR #720, not yet merged).
 * QUIRK_AWARENESS=on; LIFE_LEDGER=off stops the memory line.
 *
 * @module agents/integrations/quirk-memory-register
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  registerAfterCallTask,
  type AfterCallContext,
} from '../../services/session/after-call-tasks.js';
import {
  isNotable,
  quirkAwarenessEnabled,
  quirkMove,
  takeQuirks,
  type QuirkEvent,
} from '../../services/session/quirk-log.js';
import {
  firestoreLedgerStore,
  lifeLedgerEnabled,
  type LedgerFact,
  type LedgerStore,
} from '../personas/life-ledger.js';
import { isMemberIdentity } from '../../services/identity/member-identity.js';

const log = createLogger({ module: 'QuirkMemory' });

const REMEMBERED = ['snore', 'whistle', 'hum'] as const;

const DONE: Record<(typeof REMEMBERED)[number], string> = {
  snore: 'let out a playful mock snore during a long quiet on a call with them',
  whistle: 'whistled a few bars to himself during a quiet stretch on a call with them',
  hum: 'hummed a little tune to himself during a quiet stretch on a call with them',
};

/** The one line worth keeping from a call's quirks, or null. */
export function quirkMemoryFact(events: readonly QuirkEvent[], saidAt: string): LedgerFact | null {
  for (const kind of REMEMBERED) {
    const e = events.find((x) => x.kind === kind && x.landed);
    if (!e) continue;
    const personaId = e.personaId ?? 'ferni';
    const first = personaId.split('-')[0];
    const name = first.charAt(0).toUpperCase() + first.slice(1);
    const reaction = e.landed === 'laughed' ? 'they laughed' : 'they called him on it';
    return { personaId, fact: `${name} ${DONE[kind]}, and ${reaction}`, saidAt };
  }
  return null;
}

export async function rememberQuirks(
  ctx: AfterCallContext,
  store: LedgerStore = firestoreLedgerStore,
  env: Record<string, string | undefined> = process.env
): Promise<void> {
  const events = takeQuirks(ctx.sessionId);
  if (!quirkAwarenessEnabled(env)) return;
  for (const e of events.filter((x) => isNotable(x.kind))) {
    log.info(
      { sessionId: ctx.sessionId, move: quirkMove(e.kind), landed: e.landed ?? null },
      'QUIRK_OUTCOME'
    );
  }
  const fact = quirkMemoryFact(events, new Date().toISOString());
  if (!fact || !lifeLedgerEnabled(env) || !isMemberIdentity(ctx.userId)) return;
  await store.save(ctx.userId, [fact]);
  log.info({ sessionId: ctx.sessionId, personaId: fact.personaId }, 'QUIRK_REMEMBERED');
}

registerAfterCallTask('quirk-memory', async (ctx) => rememberQuirks(ctx), { timeoutMs: 10_000 });
