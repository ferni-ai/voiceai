/**
 * Session-start prompt block for health and mood, persona-agnostic and
 * char-budgeted (like the preference block).
 *
 * - Health on: a few ongoing things, upcoming appointments, the last week's
 *   sleep/energy notes, and one gentle mood-trend line. Never clinical.
 * - Sensitive memory never answered: one line telling the persona it may ask,
 *   once and lightly, if the user shares something personal.
 * - Otherwise: nothing.
 *
 * @module services/health-memory/context-block
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getConsent } from '../memory-consent/store.js';
import type { MemoryConsent } from '../memory-consent/types.js';
import { buildMoodInsight } from './mood-model.js';
import { listMoodTimeline } from './mood-timeline.js';
import { listHealthItems } from './store.js';
import { EPISODIC_KINDS, type HealthItem, type MoodConversation } from './types.js';

const log = createLogger({ module: 'HealthContextBlock' });

export const DEFAULT_HEALTH_BLOCK_BUDGET = 600;
const DAY = 86_400_000;

const HEADER = "\n\n## Health & Mood (what they've shared with you)\n";
const FOOTER =
  '\nBring these up only when it fits, kindly and briefly. Never diagnose or give medical advice.\n';
const ASK_HINT =
  '\n\n## Sensitive Memory\nThey haven\'t said whether you may remember health, money or faith details. If they share something like that, you can ask once, lightly: "Want me to remember things like that? You can change it anytime." If they say yes or no, use setMemoryConsent.\n';

function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export interface HealthBlockInput {
  readonly consent: MemoryConsent;
  readonly items: readonly HealthItem[];
  readonly timeline: readonly MoodConversation[];
  readonly now?: Date;
  readonly budget?: number;
}

/** Pure. Returns '' when there is nothing to say. */
export function buildHealthMoodBlock(input: HealthBlockInput): string {
  const { consent, items, timeline } = input;
  const budget = input.budget ?? DEFAULT_HEALTH_BLOCK_BUDGET;
  if (!consent.categories.health.enabled) {
    return consent.answeredAt === null && ASK_HINT.length <= budget ? ASK_HINT : '';
  }
  const now = (input.now ?? new Date()).getTime();
  const age = (iso: string) => now - Date.parse(iso);

  const ongoing = items
    .filter(
      (i) => !EPISODIC_KINDS.has(i.kind) && i.kind !== 'appointment' && i.status === 'current'
    )
    .slice(0, 4)
    .map((i) => `- ${i.text}`);
  const upcoming = items
    .filter(
      (i) =>
        i.kind === 'appointment' && i.status === 'upcoming' && age(i.lastMentionedAt) <= 21 * DAY
    )
    .slice(0, 2)
    .map((i) => `- ${i.text} (mentioned ${shortDate(i.lastMentionedAt)})`);
  const recent = items
    .filter((i) => EPISODIC_KINDS.has(i.kind) && age(i.lastMentionedAt) <= 7 * DAY)
    .slice(0, 3)
    .map((i) => `- ${i.text} (${shortDate(i.day ?? i.lastMentionedAt)})`);
  const insight = buildMoodInsight(timeline, input.now);

  const lines = [
    ...upcoming,
    ...ongoing,
    ...recent,
    ...(insight ? [`- Mood lately: ${insight}`] : []),
  ];
  if (lines.length === 0) return '';

  let body = '';
  for (const line of lines) {
    const next = `${body}${line}\n`;
    if (HEADER.length + next.length + FOOTER.length > budget) break;
    body = next;
  }
  return body ? `${HEADER}${body}${FOOTER}` : '';
}

/**
 * Load and build the block, bounded in time for the session-start critical
 * path. '' on timeout, error, or nothing to say.
 */
export async function loadHealthMoodBlock(
  userId: string,
  opts: { budget?: number; timeoutMs?: number } = {}
): Promise<string> {
  if (!userId || userId === 'anonymous') return '';
  const timeoutMs = opts.timeoutMs ?? 400;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const load = async (): Promise<string> => {
      const consent = await getConsent(userId);
      if (!consent.success) return '';
      if (!consent.data.categories.health.enabled) {
        return buildHealthMoodBlock({
          consent: consent.data,
          items: [],
          timeline: [],
          budget: opts.budget,
        });
      }
      const [items, timeline] = await Promise.all([
        listHealthItems(userId),
        listMoodTimeline(userId),
      ]);
      return buildHealthMoodBlock({ consent: consent.data, items, timeline, budget: opts.budget });
    };
    return await Promise.race([
      load(),
      new Promise<string>((resolve) => {
        timer = setTimeout(() => resolve(''), timeoutMs);
      }),
    ]);
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Health block failed');
    return '';
  } finally {
    if (timer) clearTimeout(timer);
  }
}
