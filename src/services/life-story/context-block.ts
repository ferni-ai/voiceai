/**
 * Session-start prompt block: "Their Story & Values".
 *
 * Short and char-budgeted: where they come from, stories they've already told
 * (so the persona can call back to them and never asks the same question
 * twice), turning points and chapters, recurring themes, what matters most to
 * them and how they decide. Faith only with the `beliefs` consent, and only
 * to honour it: never raised first, never judged, never preached.
 *
 * Topics the user asked Ferni to leave alone (preference boundaries) are left
 * out of the block entirely.
 *
 * @module services/life-story/context-block
 */

import { createLogger } from '../../utils/safe-logger.js';
import { beliefsEnabled } from './consent.js';
import { toThirdPerson } from './detect.js';
import { listItems } from './store.js';
import type { BeliefItem, StoryItem, ValueItem } from './types.js';
import { listValues } from './values-store.js';

const log = createLogger({ module: 'LifeStoryBlock' });

export const DEFAULT_LIFE_STORY_BUDGET = 700;

const HEADER = '\n\n## Their Story & Values\n';
const FOOTER =
  'Call back to these when it fits ("you told me about..."); never recite them, and don\'t ask about what\'s already here.\n';
const FAITH_RULE = 'Honour this; never raise faith first, never judge or preach.';

export interface LifeStoryInputs {
  readonly story: readonly StoryItem[];
  readonly values: readonly ValueItem[];
  /** Empty unless the user's Beliefs consent is on. */
  readonly beliefs: readonly BeliefItem[];
  /** Boundary check: false = leave this topic out. */
  readonly allowed?: (text: string) => boolean;
}

const short = (s: string, max = 70): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
const v = (s: string): string => short(toThirdPerson(s)).replace(/\.$/, '');

export function lifeStoryLines(input: LifeStoryInputs): string[] {
  const allowed = input.allowed ?? (() => true);
  const ok = (i: StoryItem) =>
    allowed(`${i.title} ${i.detail ?? ''} ${(i.people ?? []).map((p) => p.name).join(' ')}`);
  const of = (...kinds: StoryItem['kind'][]) =>
    input.story.filter((i) => kinds.includes(i.kind) && ok(i));
  const lines: string[] = [];

  const roots = of('origin', 'family', 'school')
    .slice(0, 4)
    .map((i) => v(i.title));
  if (roots.length) lines.push(`Roots: ${roots.join('; ')}.`);

  // Stories told most often (and most recently) first.
  const stories = of('story', 'moment')
    .sort((a, b) => b.sourceConversationIds.length - a.sourceConversationIds.length)
    .slice(0, 4)
    .map((i) => `${v(i.title)}${i.period ? ` (${i.period})` : ''}`);
  if (stories.length) lines.push(`Stories they've told you: ${stories.join('; ')}.`);

  const turns = of('turning_point', 'chapter')
    .slice(0, 3)
    .map((i) => `${v(i.title)}${i.period && i.kind === 'chapter' ? ` (${i.period})` : ''}`);
  if (turns.length) lines.push(`Turning points & chapters: ${turns.join('; ')}.`);

  const themes = of('theme')
    .slice(0, 2)
    .map((i) => v(i.title));
  if (themes.length) lines.push(`Recurring themes: ${themes.join('; ')}.`);

  const values = input.values
    .filter((x) => allowed(`${x.label} ${x.statement}`))
    .slice(0, 4)
    .map((x) => x.label);
  const decide = of('decision')
    .slice(0, 1)
    .map((i) => v(i.title));
  if (values.length || decide.length) {
    lines.push(
      [
        values.length ? `What matters most to them: ${values.join(', ')}.` : '',
        decide.length ? `How they decide: ${decide[0]}.` : '',
      ]
        .filter(Boolean)
        .join(' ')
    );
  }

  const faith = input.beliefs
    .filter((b) => allowed(`${b.title} faith religion`))
    .slice(0, 3)
    .map((b) => v(b.title));
  if (faith.length) lines.push(`Faith (they shared this): ${faith.join('; ')}. ${FAITH_RULE}`);
  return lines;
}

/** Build the block within `budget` characters (header/footer included). '' when empty. */
export function buildLifeStoryBlock(
  input: LifeStoryInputs,
  budget = DEFAULT_LIFE_STORY_BUDGET
): string {
  const lines = lifeStoryLines(input);
  if (lines.length === 0) return '';
  let body = '';
  for (const line of lines) {
    const next = `${body}- ${line}\n`;
    if (HEADER.length + next.length + FOOTER.length > budget) continue; // a later, shorter line may still fit
    body = next;
  }
  if (!body) return '';
  return `${HEADER}${body}${FOOTER}`;
}

async function boundaryCheck(userId: string): Promise<(text: string) => boolean> {
  try {
    const { getProactiveBoundaries, topicMatchesBoundary } =
      await import('../user-preferences/boundaries.js');
    const b = await getProactiveBoundaries(userId);
    const avoid = [...b.avoidTopics, ...b.sensitivities];
    return avoid.length ? (text) => !topicMatchesBoundary(text, avoid) : () => true;
  } catch (error) {
    log.debug({ userId, error: String(error) }, 'Boundaries unavailable; story block held back');
    return () => false;
  }
}

/** Load and build, bounded in time (session-start critical path). '' on timeout/error. */
export async function loadLifeStoryBlock(
  userId: string | undefined,
  opts: { budget?: number; timeoutMs?: number } = {}
): Promise<string> {
  if (!userId || userId === 'anonymous') return '';
  const timeoutMs = opts.timeoutMs ?? 400;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const load = async (): Promise<LifeStoryInputs> => {
      const [story, values, faithOn, allowed] = await Promise.all([
        listItems(userId, 'story'),
        listValues(userId),
        beliefsEnabled(userId),
        boundaryCheck(userId),
      ]);
      const beliefs = faithOn ? await listItems(userId, 'beliefs') : [];
      return { story, values, beliefs, allowed };
    };
    const inputs = await Promise.race([
      load(),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
    if (!inputs) {
      log.debug({ userId, timeoutMs }, 'Life story block timed out');
      return '';
    }
    return buildLifeStoryBlock(inputs, opts.budget);
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Life story block failed');
    return '';
  } finally {
    if (timer) clearTimeout(timer);
  }
}
