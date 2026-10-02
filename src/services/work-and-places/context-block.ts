/**
 * Session-start "Their work & places" block.
 *
 * Gives the persona just enough to follow up like a friend would ("how did
 * the Q3 launch go?", "back from Lisbon yet?") without reciting a dossier.
 * Time-sensitive follow-ups come first; the block never exceeds its char
 * budget. Persona-agnostic, like the preference block.
 *
 * @module services/work-and-places/context-block
 */

import { createLogger } from '../../utils/safe-logger.js';
import { cleanText, effectiveStatus } from './rules.js';
import { listLifeItems } from './store.js';
import type { LifeItem } from './types.js';

const log = createLogger({ module: 'WorkAndPlacesContext' });

export const DEFAULT_WORK_PLACES_BUDGET = 650;
const HEADER = '\n---\n\n## Their Work & Places\n\n';
const FOOTER =
  '\nBring one of these up only when it fits, in your own words. Never list them. Past jobs and homes are history: mention them only if they do.\n';

const DAY = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function v(text: string | undefined): string {
  return cleanText(text ?? '', 60);
}

/** Epoch ms of a `YYYY-MM-DD` / `YYYY-MM` date (start of day / month). */
function ms(date: string | undefined): number | null {
  if (!date) return null;
  const t = Date.parse(date.length === 7 ? `${date}-01T00:00:00Z` : `${date}T00:00:00Z`);
  return Number.isNaN(t) ? null : t;
}

function when(date: string | undefined, nowMs: number): string {
  const t = ms(date);
  if (t === null || !date) return '';
  const label =
    date.length === 7
      ? `${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`
      : `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`;
  if (date.length === 7) return label;
  const todayMs = Date.parse(`${new Date(nowMs).toISOString().slice(0, 10)}T00:00:00Z`);
  const days = Math.round((t - todayMs) / DAY);
  if (days === 0) return `${label}, today`;
  if (days === 1) return `${label}, tomorrow`;
  if (days > 1 && days <= 30) return `${label}, in ${days} days`;
  return label;
}

function ageDays(item: LifeItem, nowMs: number): number {
  return (nowMs - Date.parse(item.lastMentionedAt)) / DAY;
}

/** Ordered candidate lines (most useful first). Pure. */
export function workAndPlacesLines(
  items: readonly LifeItem[],
  nowMs: number = Date.now()
): string[] {
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const lines: string[] = [];
  const of = (kind: LifeItem['kind']) => items.filter((i) => i.kind === kind);
  const status = (i: LifeItem) => effectiveStatus(i, today);

  // 1. Time-sensitive follow-ups.
  const upcoming = [...of('trip'), ...of('event'), ...of('application')]
    .filter((i) => status(i) === 'planned')
    .map((i) => ({ i, t: ms(i.startDate) }))
    .filter(({ t }) => t !== null && t - nowMs <= 30 * DAY && t - nowMs >= -DAY)
    .sort((a, b) => (a.t ?? 0) - (b.t ?? 0))
    .slice(0, 2)
    .map(({ i }) => `${v(i.title)} (${when(i.startDate, nowMs)})`);
  if (upcoming.length) lines.push(`Coming up: ${upcoming.join('; ')}.`);

  const justDone = [...of('trip'), ...of('event')]
    .filter((i) => status(i) === 'done')
    .filter((i) => {
      const end = ms(i.endDate ?? i.startDate);
      const since = end !== null ? (nowMs - end) / DAY : ageDays(i, nowMs);
      return since >= 0 && since <= 21;
    })
    .slice(0, 2)
    .map((i) =>
      i.kind === 'trip'
        ? `just back from ${v(i.place ?? i.title)}`
        : `${v(i.title).toLowerCase()} happened`
    );
  if (justDone.length) lines.push(`Recently: ${justDone.join('; ')} - ask how it went.`);

  const projects = of('project')
    .filter((i) => i.status === 'current' && ageDays(i, nowMs) <= 45)
    .slice(0, 2)
    .map((i) => v(i.title));
  if (projects.length)
    lines.push(`Working on: ${projects.join(', ')} - worth asking how it's going.`);

  const stresses = of('stress')
    .filter((i) => i.status === 'current' && ageDays(i, nowMs) <= 30)
    .slice(0, 2)
    .map((i) => v(i.title).toLowerCase());
  if (stresses.length) lines.push(`Work stress lately: ${stresses.join('; ')}. Check in gently.`);

  const wins = of('win')
    .filter((i) => ageDays(i, nowMs) <= 45)
    .slice(0, 2)
    .map((i) => v(i.title).toLowerCase());
  if (wins.length) lines.push(`Recent wins: ${wins.join('; ')}.`);

  // 2. Who they are at work and where they live.
  const jobs = of('job');
  const current = jobs.filter((j) => j.status === 'current').slice(0, 2);
  const pastJobs = jobs.filter((j) => j.status === 'past').slice(0, 1);
  if (current.length || pastJobs.length) {
    const now = current.map((j) => {
      const team = j.team ? `, ${v(j.team)}` : '';
      const since = j.startDate ? ` since ${when(j.startDate.slice(0, 7), nowMs)}` : '';
      return `${v(j.title)}${team}${since}`;
    });
    const before = pastJobs.map((j) => `used to be at ${v(j.employer ?? j.title)}`);
    lines.push(`Work: ${[...now, ...before].join('; ')}.`);
  }
  const goals = of('goal')
    .filter((i) => i.status === 'planned')
    .slice(0, 2)
    .map((i) => v(i.title).toLowerCase());
  if (goals.length) lines.push(`Career hopes: ${goals.join('; ')}.`);

  const homes = of('home');
  const home = homes.find((h) => h.status === 'current');
  const before = homes
    .filter((h) => h.status === 'past')
    .slice(0, 2)
    .map((h) => v(h.place ?? h.title));
  if (home || before.length) {
    const parts = [
      home ? `lives in ${v(home.place ?? home.title)}` : '',
      before.length ? `before: ${before.join(', ')}` : '',
    ].filter(Boolean);
    lines.push(`Home: ${parts.join('; ')}.`);
  }

  const meaningful = of('meaningful')
    .slice(0, 2)
    .map(
      (i) =>
        `${v(i.place ?? i.title)} (${v(i.meaning ?? '')
          .toLowerCase()
          .replace(/\byou\b/g, 'they')
          .replace(/\byour\b/g, 'their')})`
    );
  if (meaningful.length) lines.push(`Places that matter: ${meaningful.join('; ')}.`);
  const favorites = of('favorite')
    .filter((i) => i.status === 'current')
    .slice(0, 3)
    .map((i) => v(i.place ?? i.title));
  if (favorites.length) lines.push(`Favourite spots: ${favorites.join(', ')}.`);
  const bucket = of('bucket_list')
    .filter((i) => i.status === 'planned')
    .slice(0, 3)
    .map((i) => v(i.place ?? i.title));
  if (bucket.length) lines.push(`Dream destinations: ${bucket.join(', ')}.`);
  return lines;
}

/** Build the block within `budget` characters (header/footer included). '' when empty. */
export function buildWorkAndPlacesBlock(
  items: readonly LifeItem[],
  budget = DEFAULT_WORK_PLACES_BUDGET,
  nowMs: number = Date.now()
): string {
  const lines = workAndPlacesLines(items, nowMs);
  if (lines.length === 0) return '';
  let body = '';
  for (const line of lines) {
    const next = `${body}- ${line}\n`;
    if (HEADER.length + next.length + FOOTER.length > budget) break;
    body = next;
  }
  if (!body) {
    const room = budget - HEADER.length - 4;
    if (room <= 10) return '';
    return `${HEADER}- ${lines[0].slice(0, room - 1)}\n`;
  }
  return `${HEADER}${body}${FOOTER}`;
}

/** Load and build, bounded in time (session-start critical path). '' on timeout/error. */
export async function loadWorkAndPlacesBlock(
  userId: string | undefined,
  opts: { budget?: number; timeoutMs?: number } = {}
): Promise<string> {
  if (!userId || userId === 'anonymous') return '';
  const timeoutMs = opts.timeoutMs ?? 400;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const items = await Promise.race([
      Promise.all([listLifeItems(userId, 'work'), listLifeItems(userId, 'places')]).then(
        ([w, p]) => [...w, ...p]
      ),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
    if (!items) {
      log.debug({ userId, timeoutMs }, 'Work/places block timed out');
      return '';
    }
    return buildWorkAndPlacesBlock(items, opts.budget);
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Work/places block failed');
    return '';
  } finally {
    if (timer) clearTimeout(timer);
  }
}
