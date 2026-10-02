/**
 * The compact "What's on their mind" block for the session-start prompt and
 * the per-turn person note. Persona-agnostic: the active persona's name is
 * passed in, never assumed.
 *
 * @module services/personal-insights/session-block
 */

import { INSIGHTS_LIMITS } from './config.js';
import { roleLabel, truncate } from './text-utils.js';
import type { InsightBundle, PersonProfile } from './types.js';

export interface SessionBlockOptions {
  /** Display name of the active persona ("Maya"); omitted means "you". */
  readonly personaName?: string;
  readonly maxChars?: number;
}

function whenText(days: number): string {
  return days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
}

/**
 * Format the session-start block within a strict character budget. Lines are
 * added in priority order (people with open threads, dates, predicted
 * topics, openers, an insight) until the budget is spent. Null when empty.
 */
export function formatSessionBlock(
  bundle: InsightBundle | null,
  options: SessionBlockOptions = {}
): string | null {
  if (!bundle) return null;
  const max = options.maxChars ?? INSIGHTS_LIMITS.sessionBlockChars;
  const voice = options.personaName
    ? `in your own voice as ${options.personaName}`
    : 'in your own voice';
  const header = `## What's On Their Mind\n(Private notes from past conversations. Bring up at most one, ${voice}, only if it fits. Never list them or say you looked anything up.)`;
  const footer = bundle.safetyHold
    ? 'Something heavy came up recently: let them lead, and follow your safety guidance if it resurfaces.'
    : '';

  const lines: string[] = [];
  const people = bundle.people.slice(0, INSIGHTS_LIMITS.maxPeopleInBlock).map((p) => {
    const role = p.relationship ? roleLabel(p.relationship) : '';
    if (p.memorial)
      return `${p.name} (${role ? `${role}, ` : ''}in memory: speak of them lovingly, in the past tense)`;
    const rel = role ? ` (${role})` : '';
    return p.openThread ? `${p.name}${rel}: ${truncate(p.openThread, 90)}` : `${p.name}${rel}`;
  });
  if (people.length) lines.push(`People: ${people.join('; ')}`);
  const dates = bundle.upcomingDates.slice(0, 2).map((d) => `${d.title} ${whenText(d.daysAway)}`);
  if (dates.length) lines.push(`Coming up: ${dates.join('; ')}`);
  const topics = bundle.predictions
    .slice(0, 3)
    .map(
      (p) =>
        `${truncate(p.label, 50)} (${Math.round(p.confidence * 100)}%: ${truncate(p.reason, 70)})`
    );
  if (topics.length) lines.push(`Might come up: ${topics.join('; ')}`);
  if (!bundle.safetyHold) {
    for (const o of bundle.openers.slice(0, 2))
      lines.push(`Opener idea${o.sensitive ? ' (gently)' : ''}: ${o.text}`);
  }
  if (!bundle.safetyHold) {
    for (const n of (bundle.nudges ?? []).slice(0, 1))
      lines.push(`Keep in touch${n.sensitive ? ' (gently)' : ''}: ${n.text}`);
  }
  const insight = bundle.insights[0];
  if (insight) lines.push(`Noticed${insight.sensitive ? ' (handle gently)' : ''}: ${insight.text}`);
  if (lines.length === 0 && !footer) return null;

  let out = header;
  const reserve = footer ? footer.length + 1 : 0;
  for (const line of lines) {
    const next = `${out}\n${line}`;
    if (next.length + reserve > max) {
      const room = max - reserve - out.length - 1;
      if (room > 40) out = `${out}\n${truncate(line, room)}`;
      break;
    }
    out = next;
  }
  if (footer && out.length + footer.length + 1 <= max) out = `${out}\n${footer}`;
  return out.length > header.length ? truncate(out, max) : null;
}

/** The per-turn note when the user mentions someone. Null when there is nothing to add. */
export function formatPersonNote(
  person: PersonProfile,
  maxChars: number = INSIGHTS_LIMITS.personNoteChars
): string | null {
  const role = person.relationship ? `their ${roleLabel(person.relationship)}` : '';
  const rel = person.memorial ? `${role ? `${role}, ` : ''}who has died` : role;
  const aka = person.aliases
    .filter((a) => a !== person.name && !/^(my|our)\s/i.test(a))
    .slice(0, 2);
  const parts: string[] = [`[ABOUT ${person.name.toUpperCase()}${rel ? ` - ${rel}` : ''}]`];
  if (person.memorial)
    parts.push(
      'They have died: speak of them warmly and in the past tense, never as if alive. Let the user lead.'
    );
  if (aka.length) parts.push(`Also called: ${aka.join(', ')}`);
  const pet = person.pet;
  if (pet) {
    const kind = [pet.breed, pet.species].filter(Boolean).join(' ');
    if (kind || pet.age) parts.push(`- ${[kind, pet.age].filter(Boolean).join(', ')}`);
    for (const h of pet.health.slice(0, 2)) parts.push(`- Health: ${h}`);
    for (const r of pet.routines.slice(0, 1)) parts.push(`- Routine: ${r}`);
  }
  const ties = person.connection;
  if (ties?.howMet)
    parts.push(`- Knows them from ${ties.howMet}${ties.closeness === 'close' ? ' (close)' : ''}`);
  for (const e of ties?.lifeEvents.slice(-1) ?? []) parts.push(`- Their news: ${e.text}`);
  const bond = person.relationshipDetails;
  if (bond?.isFormer)
    parts.push('- A former partner: follow their lead, never bring them up yourself.');
  else if (bond?.status && bond.status !== 'reconciled')
    parts.push(`- Status: ${bond.status.replace(/_/g, ' ')}`);
  if (bond?.whatHelped[0])
    parts.push(`- When things got tense before, ${bond.whatHelped[0]} helped`);
  if (bond?.tensions[0])
    parts.push(`- Recurring friction: ${bond.tensions.slice(0, 2).join(', ')}`);
  for (const g of bond?.growthIntentions.slice(-1) ?? []) parts.push(`- They want to: ${g.text}`);
  if (bond?.appreciates[0]) parts.push(`- Appreciates: ${bond.appreciates[0]}`);
  for (const f of person.keyFacts.slice(0, 3)) parts.push(`- ${f.text}`);
  for (const t of person.openThreads.slice(0, 2)) parts.push(`- Open: ${t.text}`);
  const upcoming = person.importantDates.find((d) => d.recurring);
  if (upcoming) parts.push(`- ${upcoming.title}: ${upcoming.date.replace(/^--/, '')}`);
  if (person.sentimentTrend === 'declining')
    parts.push('- Things with them have sounded harder lately; be gentle.');
  if (parts.length === 1) return null;
  parts.push('Use this only if it helps, the way a friend who remembers would. Never recite it.');
  return truncate(parts.join('\n'), maxChars);
}
