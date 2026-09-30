/**
 * Every note for the next reply, gathered in one place and judged together
 * (conversation/cue-arbiter.ts): heavy moments silence playfulness, and the
 * most important notes are kept when there are too many.
 *
 * @module agents/personas/reply-cues
 */

import { arbitrateCues, type Cue } from '../../conversation/cue-arbiter.js';
import { PLAYFUL_CUE } from '../../conversation/humor-fit.js';
import { leaveTakingCue } from '../../conversation/leave-taking.js';
import { nameRestCue } from '../../conversation/name-use.js';
import { sessionRepairCue } from '../../conversation/repair-cue.js';
import { formatTalkPreferences, type TalkPreference } from '../../conversation/talk-preferences.js';
import { yieldingCue } from '../../conversation/yielding.js';
import { nextReplyCues, type VoiceCapabilities } from '../../speech/expression/index.js';
import { silenceHold } from '../voice-agent/dead-air.js';

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

  add('yielding', yieldingCue(exchange.agentInterrupted, exchange.user));
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

  for (const laugh of nextReplyCues(userData, voice)) add('laugh', laugh, { light: true });

  const humor = typeof userData?.humorCue === 'string' ? userData.humorCue : null;
  add('humor', humor, { light: humor === PLAYFUL_CUE });

  add('name', nameRestCue(userData?.userName as string | undefined, recentReplies));

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

  return arbitrateCues(cues, undefined, heavyWords);
}
