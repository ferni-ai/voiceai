/**
 * Session-start "How they like to be talked to" block.
 *
 * Persona-agnostic: the same block is injected for every persona; it describes
 * the user, never the persona. Only ACTIVE preferences are used (explicit,
 * user-edited, or inferred with enough evidence). Lines are added in priority
 * order and the block never exceeds the char budget.
 *
 * @module services/user-preferences/context-block
 */

import { createLogger } from '../../utils/safe-logger.js';
import { boundariesFrom } from './boundaries.js';
import { constraintsFrom, foodProfileFrom, isHealthCategoryEnabled } from './food.js';
import { interestsFrom } from './interests.js';
import { mediaProfileFrom } from './media.js';
import { isActive } from './rules.js';
import { listPreferences } from './store.js';
import type { UserPreference } from './types.js';

const log = createLogger({ module: 'UserPreferenceContext' });

export const DEFAULT_BLOCK_BUDGET = 700;
const HEADER = '\n---\n\n## How They Like to Be Talked To\n\n';
const FOOTER =
  '\nFollow these quietly; never recite them. Boundaries are hard limits for anything you raise on your own.\n';

const LENGTH: Record<string, string> = {
  short: 'Keep answers short - a sentence or two unless they ask for more.',
  medium: 'Medium-length answers.',
  long: 'They enjoy fuller, story-like answers.',
};
const DIRECTNESS: Record<string, string> = {
  gentle: 'Be gentle and soft in how you say hard things.',
  balanced: '',
  direct: 'Be direct - get to the point, no cushioning.',
};
const PACE: Record<string, string> = {
  slow: 'Take it slow.',
  normal: '',
  fast: 'Keep a brisk pace.',
};
const HUMOR: Record<string, string> = {
  none: 'Skip the jokes.',
  light: 'A little light humour is welcome.',
  lots: 'They love humour - be playful.',
};
const FOLLOW_UPS: Record<string, string> = {
  fewer: 'Ask fewer follow-up questions.',
  normal: '',
  more: 'They like follow-up questions.',
};

/** User text goes into the system prompt: one line, no markup, short. */
export function cleanValue(value: string): string {
  return value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[#*`<>[\]{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

function single(prefs: readonly UserPreference[], domain: string, key: string): string | undefined {
  return prefs.find((p) => p.domain === domain && p.key === key)?.value;
}

/** Ordered candidate lines (highest priority first). Pure. */
export function preferenceLines(
  raw: readonly UserPreference[],
  opts: { healthEnabled?: boolean } = {}
): string[] {
  const all = raw.map((p) => ({ ...p, value: cleanValue(p.value) }));
  const prefs = all.filter(isActive);
  const lines: string[] = [];
  const name = single(prefs, 'conversation', 'preferredName');
  const pronouns = single(prefs, 'conversation', 'pronouns');
  if (name) lines.push(`Call them ${name}${pronouns ? ` (${pronouns})` : ''}.`);
  else if (pronouns) lines.push(`Pronouns: ${pronouns}.`);

  const b = boundariesFrom(all);
  if (b.avoidTopics.length) lines.push(`Never bring up on your own: ${b.avoidTopics.join(', ')}.`);
  if (b.sensitivities.length) lines.push(`Handle gently: ${b.sensitivities.join(', ')}.`);

  const diet = constraintsFrom(all, opts.healthEnabled === true);
  const needs = [
    ...diet.allergies.map((a) => `allergic to ${a.item}${a.severity ? ` (${a.severity})` : ''}`),
    ...diet.intolerances.map((a) => `${a.item} intolerance`),
    ...diet.diets,
    ...diet.medical.map((m) => `doctor says avoid ${m}`),
  ];
  if (needs.length)
    lines.push(`Food needs (never suggest anything that breaks these): ${needs.join('; ')}.`);

  const language = single(prefs, 'conversation', 'language');
  if (language) lines.push(`Speak ${language}.`);
  const style = [
    LENGTH[single(prefs, 'conversation', 'responseLength') ?? ''],
    DIRECTNESS[single(prefs, 'conversation', 'directness') ?? ''],
    PACE[single(prefs, 'conversation', 'pace') ?? ''],
    HUMOR[single(prefs, 'conversation', 'humor') ?? ''],
    FOLLOW_UPS[single(prefs, 'conversation', 'followUpQuestions') ?? ''],
  ].filter((s): s is string => Boolean(s));
  lines.push(...style);
  const tone = single(prefs, 'conversation', 'tone');
  if (tone) lines.push(`Tone they like: ${tone}.`);

  const accountability = single(prefs, 'coaching', 'accountabilityStyle');
  const motivation = single(prefs, 'coaching', 'motivationStyle');
  const tendency = single(prefs, 'coaching', 'fourTendency');
  const coaching = [
    accountability ? `${accountability} accountability` : '',
    motivation ? `motivated by ${motivation}` : '',
    tendency ? `${tendency} (Four Tendencies)` : '',
  ].filter(Boolean);
  if (coaching.length) lines.push(`Coaching: ${coaching.join('; ')}.`);

  const interests = interestsFrom(prefs, { activeOnly: true })
    .slice(0, 3)
    .map((i) => {
      const extra = [i.level, i.specifics[i.specifics.length - 1]]
        .filter(Boolean)
        .map((x) => cleanValue(String(x)));
      return extra.length ? `${i.name} (${extra.join('; ')})` : i.name;
    });
  if (interests.length) lines.push(`Into (good conversation material): ${interests.join(', ')}.`);

  const media = mediaProfileFrom(prefs);
  const now = media.inProgress
    .slice(0, 2)
    .map((i) => `${i.name}${i.progress ? ` (${i.progress})` : ''}`);
  if (now.length) lines.push(`Currently into: ${now.join(', ')}.`);
  const music = media.music.favorites.slice(0, 3).map((i) => i.name);
  const noMusic = media.music.dislikes.slice(0, 2).map((i) => i.name);
  if (music.length || noMusic.length) {
    lines.push(
      `Music: ${[music.length ? `loves ${music.join(', ')}` : '', noMusic.length ? `not ${noMusic.join(', ')}` : ''].filter(Boolean).join('; ')}.`
    );
  }

  const food = foodProfileFrom(prefs, false);
  const tastes = [
    ...food.tastes.cuisines,
    ...food.tastes.dishes,
    ...food.tastes.comfortFoods,
  ].slice(0, 3);
  const cooking = [
    food.cooking.skill ? `${food.cooking.skill} cook` : '',
    ...food.followUps.slice(0, 1).map((r) => `ask how the ${r.name} went`),
  ].filter(Boolean);
  if (tastes.length || cooking.length) {
    lines.push(
      `Food: ${[tastes.length ? `loves ${tastes.join(', ')}` : '', ...cooking].filter(Boolean).join('; ')}.`
    );
  }

  const likes = prefs.filter((p) => p.domain === 'likes');
  const liked = likes
    .filter((p) => p.sentiment !== 'dislike')
    .slice(0, 4)
    .map((p) => p.value);
  const disliked = likes
    .filter((p) => p.sentiment === 'dislike')
    .slice(0, 3)
    .map((p) => p.value);
  if (liked.length) lines.push(`Likes: ${liked.join(', ')}.`);
  if (disliked.length) lines.push(`Dislikes: ${disliked.join(', ')}.`);
  return lines;
}

/** Build the block within `budget` characters (header/footer included). '' when nothing applies. */
export function buildPreferenceBlock(
  prefs: readonly UserPreference[],
  budget = DEFAULT_BLOCK_BUDGET,
  opts: { healthEnabled?: boolean } = {}
): string {
  const lines = preferenceLines(prefs, opts);
  if (lines.length === 0) return '';
  let body = '';
  for (const line of lines) {
    const next = `${body}- ${line}\n`;
    if (HEADER.length + next.length + FOOTER.length > budget) break;
    body = next;
  }
  if (!body) {
    // Even the first line doesn't fit with the footer: hard-truncate the first line.
    const room = budget - HEADER.length - 4;
    if (room <= 10) return '';
    return `${HEADER}- ${lines[0].slice(0, room - 1)}\n`;
  }
  return `${HEADER}${body}${FOOTER}`;
}

/**
 * Load and build the block, bounded in time so it can sit on the session-start
 * critical path. Returns '' on timeout or error.
 */
export async function loadPreferenceBlock(
  userId: string,
  opts: { budget?: number; timeoutMs?: number } = {}
): Promise<string> {
  if (!userId || userId === 'anonymous') return '';
  const timeoutMs = opts.timeoutMs ?? 400;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const [prefs, healthEnabled] = await Promise.race([
      Promise.all([listPreferences(userId), isHealthCategoryEnabled(userId)]),
      new Promise<[null, false]>((resolve) => {
        timer = setTimeout(() => resolve([null, false]), timeoutMs);
      }),
    ]);
    if (!prefs) {
      log.debug({ userId, timeoutMs }, 'Preference block timed out');
      return '';
    }
    return buildPreferenceBlock(prefs, opts.budget, { healthEnabled });
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Preference block failed');
    return '';
  } finally {
    if (timer) clearTimeout(timer);
  }
}
