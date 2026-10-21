/**
 * The per-turn writers behind live-superhuman-injections.ts: each one stores
 * something about the caller (a value, an energy reading, a person, a dream, a
 * life chapter) or schedules outreach to them, so each first asks MINOR_CARE
 * (minor-care.ts) and does nothing for a held session: a caller who sounds
 * under 18 and isn't a verified account owner.
 *
 * Split out of live-superhuman-injections.ts (over 500 lines, so it may not
 * grow) when these writers were found storing for held sessions (#1897 review).
 * Each is fire-and-forget at its call site; failures are logged, never thrown.
 *
 * @module agents/processors/live-superhuman-writes
 */
import { heldAfter } from '../../utils/minor-care.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'LiveSuperhumanWrites' });

/** What a writer needs from the turn. */
export interface TurnWrite {
  userId: string;
  sessionId: string;
  userText: string;
  emotionalState: { primary: string };
}

/** MINOR_CARE=on: this turn's words read first, so the turn that says "I'm 15 years old" is held too. */
function held(ctx: Pick<TurnWrite, 'sessionId' | 'userText'>): boolean {
  return heldAfter(ctx.sessionId, ctx.userText);
}

/** A value they stated ("I value my freedom"): values-alignment. */
export async function persistValue(ctx: TurnWrite): Promise<void> {
  if (held(ctx)) return;
  try {
    const m = await import('../../services/superhuman/values-alignment.js');
    const detected = m.detectValue(ctx.userText);
    if (detected) await m.recordValueMention(ctx.userId, detected);
  } catch (e) {
    log.debug({ error: String(e) }, 'Value recording skipped');
  }
}

/** An energy reading from capacity signals ("I'm exhausted"): capacity-guardian. */
export async function persistEnergy(
  ctx: TurnWrite,
  capacity: { level: 'moderate' | 'high' | 'critical'; signals: string[] }
): Promise<void> {
  if (held(ctx)) return;
  try {
    const m = await import('../../services/superhuman/capacity-guardian.js');
    const critical = capacity.level === 'critical';
    const high = capacity.level === 'high';
    await m.recordEnergyReading(ctx.userId, {
      energyLevel: critical ? 'depleted' : high ? 'low' : 'moderate',
      energyScore: critical ? 10 : high ? 25 : 40,
      detectedFrom: ['text'],
      indicators: capacity.signals,
    });
  } catch (e) {
    log.debug({ error: String(e) }, 'Energy recording skipped');
  }
}

/** A person in their life ("my mom Sarah"): relationship-network. */
export async function persistPerson(ctx: TurnWrite): Promise<void> {
  if (held(ctx)) return;
  try {
    const m = await import('../../services/superhuman/relationship-network.js');
    const person = m.extractPerson(ctx.userText);
    if (person) await m.recordMention(ctx.userId, person);
  } catch (e) {
    log.debug({ error: String(e) }, 'Relationship recording skipped');
  }
}

/** A dream ("I've always wanted to..."): dream-keeper. */
export async function persistDream(ctx: TurnWrite): Promise<void> {
  if (held(ctx)) return;
  try {
    const m = await import('../../services/superhuman/dream-keeper.js');
    const dream = m.detectDream(ctx.userText);
    if (dream) await m.recordDreamMention(ctx.userId, dream);
  } catch (e) {
    log.debug({ error: String(e) }, 'Dream recording skipped');
  }
}

/** A life chapter ("I quit my job"): life-narrative. */
export async function persistChapter(ctx: TurnWrite): Promise<void> {
  if (held(ctx)) return;
  try {
    const m = await import('../../services/superhuman/life-narrative.js');
    const chapter = m.detectChapterMoment(ctx.userText);
    if (!chapter) return;
    await m.createOrUpdateChapter(ctx.userId, {
      type: chapter.type,
      quote: ctx.userText.slice(0, 200),
      emotion: ctx.emotionalState.primary,
      conversationId: ctx.sessionId,
    });
  } catch (e) {
    log.debug({ error: String(e) }, 'Life narrative recording skipped');
  }
}

/**
 * Schedule pattern-based outreach to the caller. Never for a held session:
 * Ferni must not reach out to a caller who sounds under 18. Lazy import so the
 * turn processor never breaks when outreach is unavailable.
 */
export async function schedulePatternOutreachAsync(
  pattern: {
    pattern: string;
    patternDescription: string;
    tendency: string;
    suggestedOutreach: string;
    actionable: string;
  },
  ctx: {
    userId: string;
    sessionId: string;
    currentEmotion?: string;
    emotionIntensity?: number;
    topics?: string[];
  },
  said: string
): Promise<void> {
  if (held({ sessionId: ctx.sessionId, userText: said })) return;
  try {
    const { schedulePatternOutreachAsync: scheduleOutreach } =
      await import('../../services/outreach/pattern-outreach-integration.js');
    scheduleOutreach(pattern, ctx);
  } catch (error) {
    // Non-critical - outreach is optional
    log.debug({ error: String(error) }, 'Outreach scheduling unavailable (non-fatal)');
  }
}
