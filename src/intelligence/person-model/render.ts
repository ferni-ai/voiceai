/**
 * Renders the person model as the call sheet: a short block of private notes
 * to Ferni, at most 3,000 characters, built only from sections that are fresh.
 * Pure: the clock and the forgotten topics come in as arguments.
 *
 * Privacy is enforced here, in code, not in the prompt (design sec. 3):
 * - a dirty or stale section is skipped, never rendered from old data;
 * - anything about a forgotten topic is dropped (isForgotten, as recall does);
 * - a sensitive person is only "they may bring up X; let them lead", and a
 *   sensitive item (grief, health, money...) is not rendered at all;
 * - a line with a run of 7+ digits or an "@" is stripped;
 * - mood is a direction for tone, never a label about the person.
 *
 * No caller yet, by design: the read path (call-sheet lane M6) adds it.
 *
 * @module intelligence/person-model/render
 */
import { isForgotten, isSensitiveThread } from '../../memory/index.js';
import { daysBetween } from '../world-model/dates/timex.js';
import { freshness, type Person, type PersonModel, type Provenance } from './types.js';
import { DAY, hasContactData, local, ms } from './util.js';

export const MAX_RENDERED_CHARS = 3000;
const MAX_PEOPLE = 8;

/** The existing memory-injection rule (agent-setup.ts "Who You're Talking To"), word for word. */
const USE_RULE = [
  "Use this awareness naturally. Don't announce what you know - just BE a friend who remembers.",
  "Reference past context when relevant, but don't force it. Let the conversation flow.",
].join('\n');

const INTRO = 'Private notes about this caller, for you only. Never read them out or quote them.';

export interface RenderOptions {
  now: Date;
  /** memory_state/forgotten topics. */
  forgottenTopics: readonly string[];
}

/** One section: its heading and item lines, in the priority order of the sheet. */
interface Block {
  heading: string;
  lines: string[];
}

const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Plain words for how long ago, or null when the time is unusable. */
function ago(iso: string | null, now: Date): string | null {
  const t = ms(iso);
  if (t === null || t > now.getTime()) return null;
  const days = Math.floor((now.getTime() - t) / DAY);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `about ${Math.round(days / 7)} weeks ago`;
  return `about ${Math.round(days / 30)} months ago`;
}

/** Plain words for when a date falls, from the caller's own calendar day. */
function inWords(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

function hourWords(startHour: number): string {
  if (startHour >= 5 && startHour < 12) return 'in the morning';
  if (startHour >= 12 && startHour < 17) return 'in the afternoon';
  if (startHour >= 17 && startHour < 21) return 'in the evening';
  return 'late at night';
}

interface Ctx {
  model: PersonModel;
  now: Date;
  usable: (p: Provenance) => boolean;
  gone: (text: string) => boolean;
  /** Grief, health, money...: never rendered as an item, only as "let them lead". */
  sensitive: (text: string, flagged?: boolean) => boolean;
  /** Fit to render as an item: one line, not forgotten, not sensitive. */
  fit: (text: string) => string | null;
}

const bullets = (c: Ctx, texts: string[]): string[] =>
  texts.flatMap((t) => {
    const text = c.fit(t);
    return text ? [`- ${text}`] : [];
  });

function openNow(c: Ctx): string[] {
  if (!c.usable(c.model.unfinished.prov)) return [];
  const { openLoops, upcomingDates } = c.model.unfinished.value;
  const today = local(c.now.getTime(), c.model.rhythms.value.timezone).day;
  const dates = upcomingDates.flatMap((d) => {
    const text = c.fit(d.text);
    const days = /^\d{4}-\d\d-\d\d$/.test(d.on) ? daysBetween(today, d.on) : null;
    return text && days !== null ? [`- Coming up ${inWords(days)}: ${text}`] : [];
  });
  return [
    ...bullets(
      c,
      openLoops.map((l) => l.text)
    ),
    ...dates,
  ];
}

function changed(c: Ctx): string[] {
  return c.usable(c.model.changed.prov) ? bullets(c, c.model.changed.value) : [];
}

function personLine(c: Ctx, p: Person): string | null {
  const name = oneLine(p.name);
  if (!name || c.gone(name) || c.sensitive(name)) return null;
  const thread = p.openThread ? oneLine(p.openThread) : '';
  if (c.sensitive(thread, p.sensitive)) return `- They may bring up ${name}; let them lead.`;
  const relation = p.relation ? c.fit(p.relation) : null;
  const open = thread && !c.gone(thread) ? thread : '';
  if (c.gone([name, relation, open].join(' '))) return null;
  const when = ago(p.lastMentioned, c.now);
  const parts = [
    `- ${name}${relation ? ` (${relation})` : ''}.`,
    when ? `Last mentioned ${when}.` : '',
    open ? `Open thread: ${open}.` : '',
  ];
  return parts.filter(Boolean).join(' ');
}

function people(c: Ctx): string[] {
  if (!c.usable(c.model.people.prov)) return [];
  const lines = c.model.people.value.map((p) => personLine(c, p));
  return lines.filter((l): l is string => l !== null).slice(0, MAX_PEOPLE);
}

function promised(c: Ctx): string[] {
  if (!c.usable(c.model.unfinished.prov)) return [];
  return c.model.unfinished.value.ferniOwes.flatMap((o) => {
    const text = c.fit(o.text);
    const since = ago(o.since, c.now);
    return text ? [`- You said you would: ${text}${since ? ` (${since})` : ''}`] : [];
  });
}

/** Rhythms and mood direction: tone cues only, never a label about the person. */
function tone(c: Ctx): string[] {
  const cues: string[] = [];
  if (c.usable(c.model.rhythms.prov)) {
    const r = c.model.rhythms.value;
    const usual = r.usualHours.find((h) => h.dow === 'any');
    if (usual) cues.push(`- They usually call ${hourWords(usual.startHour)}.`);
    if (r.medianGapDays !== null && r.medianGapDays >= 1)
      cues.push(`- They usually call about every ${Math.round(r.medianGapDays)} days.`);
  }
  if (c.usable(c.model.mood.prov)) {
    const { trend, vsBaseline } = c.model.mood.value;
    if (trend === 'down' || (vsBaseline !== null && vsBaseline <= -0.2))
      cues.push('- Their mood has been lower than their usual lately. Go gently.');
    else if (trend === 'up' || (vsBaseline !== null && vsBaseline >= 0.2))
      cues.push('- Their mood has been higher than their usual lately.');
  }
  return cues;
}

const stripContact = (lines: string[]): string[] => lines.filter((l) => !hasContactData(l));

const assemble = (list: Block[]): string =>
  list.length === 0
    ? ''
    : [INTRO, ...list.map((b) => [b.heading, ...b.lines].join('\n')), USE_RULE].join('\n\n');

export function renderPersonModel(model: PersonModel, opts: RenderOptions): string {
  const { now, forgottenTopics } = opts;
  const gone = (text: string): boolean => isForgotten(text, forgottenTopics);
  const sensitive = (text: string, flagged = false): boolean => flagged || isSensitiveThread(text);
  const c: Ctx = {
    model,
    now,
    usable: (p) => freshness(p, now, model.rhythms.value.lastCallAt) === 'fresh',
    gone,
    sensitive,
    fit: (text) => {
      const s = oneLine(text);
      return s && !gone(s) && !sensitive(s) ? s : null;
    },
  };
  // In priority order: the last one is dropped first when the sheet is too long.
  const blocks: Block[] = [
    { heading: 'Open now:', lines: openNow(c) },
    { heading: 'What changed since last time:', lines: changed(c) },
    { heading: 'People in their life:', lines: people(c) },
    { heading: 'What you promised them:', lines: promised(c) },
    { heading: 'Tone:', lines: tone(c) },
  ];
  // A section with no lines left after every filter is not rendered.
  const sections = blocks
    .map((b) => ({ heading: b.heading, lines: stripContact(b.lines) }))
    .filter((b) => b.lines.length > 0);

  // Over the cap: drop the lowest-priority section whole, never cut mid-line.
  while (sections.length > 0 && assemble(sections).length > MAX_RENDERED_CHARS) {
    if (sections.length > 1) sections.pop();
    else if (sections[0].lines.length > 1) sections[0].lines.pop();
    else sections.pop();
  }
  return assemble(sections);
}
