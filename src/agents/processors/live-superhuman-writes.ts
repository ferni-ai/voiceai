/**
 * The per-turn writers behind live-superhuman-injections.ts: each one stores
 * something about the caller (a value, an energy reading, a person, a dream, a
 * life chapter) or schedules outreach to them.
 *
 * Moved out of live-superhuman-injections.ts (over 500 lines, so it may not
 * grow) so that every writer sits in one place a write-path check can reach.
 * Each is fire-and-forget at its call site; failures are logged, never thrown.
 *
 * @module agents/processors/live-superhuman-writes
 */
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'LiveSuperhumanWrites' });

/** What a writer needs from the turn. */
export interface TurnWrite {
  userId: string;
  sessionId: string;
  userText: string;
  emotionalState: { primary: string };
}

/** A value they stated ("I value my freedom"): values-alignment. */
export async function persistValue(ctx: TurnWrite): Promise<void> {
  try {
    const m = await import('../../services/superhuman/values-alignment.js');
    const detected = m.detectValue(ctx.userText);
    if (detected) void m.recordValueMention(ctx.userId, detected);
  } catch (e) {
    log.debug({ error: String(e) }, 'Value recording skipped');
  }
}

/** An energy reading from capacity signals ("I'm exhausted"): capacity-guardian. */
export async function persistEnergy(
  ctx: TurnWrite,
  capacity: { level: 'moderate' | 'high' | 'critical'; signals: string[] }
): Promise<void> {
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
  try {
    const m = await import('../../services/superhuman/relationship-network.js');
    const person = m.extractPerson(ctx.userText);
    if (person) void m.recordMention(ctx.userId, person);
  } catch (e) {
    log.debug({ error: String(e) }, 'Relationship recording skipped');
  }
}

/** A dream ("I've always wanted to..."): dream-keeper. */
export async function persistDream(ctx: TurnWrite): Promise<void> {
  try {
    const m = await import('../../services/superhuman/dream-keeper.js');
    const dream = m.detectDream(ctx.userText);
    if (dream) void m.recordDreamMention(ctx.userId, dream);
  } catch (e) {
    log.debug({ error: String(e) }, 'Dream recording skipped');
  }
}

/** A life chapter ("I quit my job"), keyed by session so one chat counts once: life-narrative. */
export async function persistChapter(ctx: TurnWrite): Promise<void> {
  try {
    const m = await import('../../services/superhuman/life-narrative.js');
    const chapter = m.detectChapterMoment(ctx.userText);
    if (!chapter) return;
    void m.createOrUpdateChapter(ctx.userId, {
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
 * Schedule pattern-based outreach to the caller (fire-and-forget). Lazy
 * import so the turn processor never breaks when outreach is unavailable.
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
  }
): Promise<void> {
  try {
    const { schedulePatternOutreachAsync: scheduleOutreach } =
      await import('../../services/outreach/pattern-outreach-integration.js');
    scheduleOutreach(pattern, ctx);
  } catch (error) {
    // Non-critical - outreach is optional
    log.debug({ error: String(error) }, 'Outreach scheduling unavailable (non-fatal)');
  }
}
