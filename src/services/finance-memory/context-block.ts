/**
 * Session-start prompt block for money memory: short, char-budgeted, kind.
 *
 * Only with Money consent. It helps the persona follow up gently ("how's the
 * credit card payoff going?") and never shame, lecture, or advise beyond what
 * the persona already does. Amounts appear rounded and conversational
 * ("about $2k a month"). Items that touch a topic the user asked Ferni not to
 * raise (`isTopicAllowedProactively`) are left out; when money itself is off
 * limits, the block is empty.
 *
 * @module services/finance-memory/context-block
 */

import { createLogger } from '../../utils/safe-logger.js';
import { isCategoryEnabled } from '../memory-consent/store.js';
import { formatAmountConversational } from './amounts.js';
import { listFinanceItems } from './store.js';
import type { FinanceItem, FinanceKind } from './types.js';

const log = createLogger({ module: 'FinanceContextBlock' });

export const DEFAULT_FINANCE_BLOCK_BUDGET = 520;
const DAY = 86_400_000;
const RECENT_DAYS = 45;

const HEADER = '\n\n## Money (private; what they chose to share)\n';
const FOOTER =
  '\nFollow up gently when it fits (e.g. "how\'s the payoff going?"). Celebrate wins. Never shame, lecture, or give investment advice; let them lead.\n';

/** Order: what's live and actionable first. */
const ORDER: readonly FinanceKind[] = [
  'decision',
  'debt',
  'savings',
  'bill',
  'purchase',
  'worry',
  'win',
  'income',
  'budget',
  'feeling',
];

function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  return `${n}${teen ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;
}

/** One line for the prompt, amounts rounded. */
export function lineFor(item: FinanceItem): string {
  const amount = item.amount ? formatAmountConversational(item.amount) : '';
  let line = item.text;
  if (item.kind === 'debt' && item.status === 'done') line = `${item.text} (a win)`;
  else if (amount) line = `${item.text} (${amount})`;
  if (item.kind === 'bill' && item.dueDay && !/due on/.test(line)) {
    line += `, due the ${ordinal(item.dueDay)}`;
  }
  return `- ${line}`;
}

function relevant(item: FinanceItem, now: number): boolean {
  const age = now - Date.parse(item.lastMentionedAt);
  switch (item.kind) {
    case 'worry':
    case 'win':
    case 'feeling':
      return age <= RECENT_DAYS * DAY;
    case 'decision':
    case 'purchase':
      return item.status !== 'done' || age <= RECENT_DAYS * DAY;
    case 'debt':
      return item.status !== 'done' || age <= RECENT_DAYS * DAY;
    default:
      return true;
  }
}

export interface FinanceBlockInput {
  readonly items: readonly FinanceItem[];
  /** Items whose topic may be raised proactively (ids); default all. */
  readonly allowed?: ReadonlySet<string>;
  readonly now?: Date;
  readonly budget?: number;
}

/** Pure. '' when there is nothing to say. */
export function buildFinanceBlock(input: FinanceBlockInput): string {
  const budget = input.budget ?? DEFAULT_FINANCE_BLOCK_BUDGET;
  const now = (input.now ?? new Date()).getTime();
  const lines = input.items
    .filter((i) => (!input.allowed || input.allowed.has(i.id)) && relevant(i, now))
    .sort(
      (a, b) =>
        ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) ||
        b.lastMentionedAt.localeCompare(a.lastMentionedAt)
    )
    .slice(0, 6)
    .map(lineFor);
  let body = '';
  for (const line of lines) {
    const next = `${body}${line}\n`;
    if (HEADER.length + next.length + FOOTER.length > budget) break;
    body = next;
  }
  return body ? `${HEADER}${body}${FOOTER}` : '';
}

type TopicCheck = (userId: string, topic: string) => Promise<boolean>;

async function defaultTopicCheck(): Promise<TopicCheck> {
  const { isTopicAllowedProactively } = await import('../user-preferences/boundaries.js');
  return isTopicAllowedProactively;
}

/**
 * Load and build the block, bounded in time for the session-start critical
 * path. '' on timeout, error, Money off, or nothing to say.
 */
export async function loadFinanceBlock(
  userId: string,
  opts: { budget?: number; timeoutMs?: number; topicCheck?: TopicCheck } = {}
): Promise<string> {
  if (!userId || userId === 'anonymous') return '';
  const timeoutMs = opts.timeoutMs ?? 400;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const load = async (): Promise<string> => {
      if (!(await isCategoryEnabled(userId, 'finances'))) return '';
      const items = await listFinanceItems(userId);
      if (items.length === 0) return '';
      const check = opts.topicCheck ?? (await defaultTopicCheck());
      if (!(await check(userId, 'money'))) return '';
      const allowed = new Set<string>();
      for (const item of items) {
        if (await check(userId, `${item.subject} ${item.text}`)) allowed.add(item.id);
      }
      return buildFinanceBlock({ items, allowed, budget: opts.budget });
    };
    return await Promise.race([
      load(),
      new Promise<string>((resolve) => {
        timer = setTimeout(() => resolve(''), timeoutMs);
      }),
    ]);
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Finance block failed');
    return '';
  } finally {
    if (timer) clearTimeout(timer);
  }
}
