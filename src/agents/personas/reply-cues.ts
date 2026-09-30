/**
 * Every note for the next reply, gathered in one place and judged together
 * (conversation/cue-arbiter.ts): heavy moments silence playfulness, and the
 * most important notes are kept when there are too many.
 *
 * @module agents/personas/reply-cues
 */

import { judgeCues, type Cue } from '../../conversation/cue-arbiter.js';
import { PLAYFUL_CUE } from '../../conversation/humor-fit.js';
import { leaveTakingCue } from '../../conversation/leave-taking.js';
import { nameRestCue } from '../../conversation/name-use.js';
import { formatTheirWords, type TheirWords } from '../../conversation/their-words.js';
import { sessionRepairCue } from '../../conversation/repair-cue.js';
import { formatTalkPreferences, type TalkPreference } from '../../conversation/talk-preferences.js';
import { yieldingCue } from '../../conversation/yielding.js';
import { nextReplyCues, type VoiceCapabilities } from '../../speech/expression/index.js';
import { silenceHold } from '../voice-agent/dead-air.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ReplyCues' });

export interface ReplyCueInput {
  userData: Record<string, unknown> | undefined;
  sessionId?: string;
  exchange: { user?: string; agent?: string; agentInterrupted?: boolean };
  /** The last few agent replies, oldest first (for name use). */
  recentReplies: readonly string[];
  voice: VoiceCapabilities;
}

const LOSS_DAY = /anniversary of losing/i;
const SUBDUED_VOICE = /soften you/i;

export function replyCues({
  userData,
  sessionId,
  exchange,
  recentReplies,
  voice,
}: ReplyCueInput): string[] {
  const cues: Cue[] = [];
  const add = (kind: Cue['kind'], text: string | null | undefined, extra: Partial<Cue> = {}) => {
    if (text) cues.push({ kind, text, ...extra });
  };

  const spokeOver = exchange.agentInterrupted === true || userData?.spokeOverReply === true;
  add('yielding', yieldingCue(spokeOver, exchange.user));
  add('repair', sessionRepairCue(userData, sessionId, exchange.user, exchange.agent));
  add(
    'talk',
    formatTalkPreferences(
      new Set((userData?.talkPreferences as TalkPreference[] | undefined) ?? [])
    )
  );
  add('leaving', leaveTakingCue(exchange.user));

  const day = typeof userData?.daysThatMatter === 'string' ? userData.daysThatMatter : null;
  add('day', day, { heavy: day !== null && LOSS_DAY.test(day) });

  const voiceToday = (userData?.voiceToday as { cue?: string | null } | undefined)?.cue;
  add('voice', voiceToday, { heavy: !!voiceToday && SUBDUED_VOICE.test(voiceToday) });

  // nextReplyCues records the cue (starting its cooldown); undone below if it is dropped
  const laughRecordBefore = userData?.laughCue;
  for (const laugh of nextReplyCues(userData, voice)) add('laugh', laugh, { light: true });

  const humor = typeof userData?.humorCue === 'string' ? userData.humorCue : null;
  add('humor', humor, { light: humor === PLAYFUL_CUE });

  add('name', nameRestCue(userData?.userName as string | undefined, recentReplies));
  add('words', formatTheirWords((userData?.theirWords as TheirWords | undefined) ?? {}));

  // What they just said may itself be heavy ("my dad passed away")
  const analysis = userData?.lastEmotionAnalysis as
    | { distressLevel?: number; primary?: string }
    | undefined;
  const heavyWords =
    silenceHold({
      lastUserText: exchange.user,
      distressLevel: analysis?.distressLevel,
      emotion: analysis?.primary,
    }) > 1;

  const { kept, dropped, heavy } = judgeCues(cues, undefined, heavyWords);
  if (userData && dropped.some((d) => d.kind === 'laugh')) userData.laughCue = laughRecordBefore;
  // One line per reply: what shaped it, and what was held back (for live testing)
  if (cues.length > 0) {
    log.info(
      {
        notes: kept.map((c) => c.kind),
        ...(dropped.length > 0 ? { dropped } : {}),
        ...(heavy ? { heavy } : {}),
      },
      'Reply notes'
    );
  }
  return kept.map((c) => c.text);
}
