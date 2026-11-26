/**
 * Fills in a twin-response request from the caller's own twin.
 *
 * Talk to past self in the Chronicle posts only `{ userMessage, agentId }`
 * (agentId is usually null), so POST /api/journal/twin-response had no profile
 * to build the prompt from and answered 500 (journal audit 2026-10-13).
 * talk-to-twin builds the profile in the browser and sends it; the Chronicle
 * doesn't know the twin, so the server builds it from the caller's twin agent
 * and their journal, the same way talk-to-twin does.
 *
 * Owner-only: the agent and the journal are read for the verified uid only.
 *
 * @module services/custom-agent/twin-request
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import type { CustomAgent } from '../../types/custom-agent-api.js';
import { getJournalService } from '../journal/index.js';
import { getCustomAgent, listCustomAgents } from './custom-agent-persistence-service.js';
import { hasTwinProfile, type TwinResponseRequest } from './twin-reply.js';

/** How many entries the past self looks through, and how many it is shown. */
const JOURNAL_LOOKBACK = 50;
const RELEVANT_JOURNALS = 3;

export interface TwinRequestBody {
  userMessage?: string;
  agentId?: string | null;
  profile?: unknown;
  relevantJournals?: TwinResponseRequest['relevantJournals'];
  keyThemes?: string[];
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

function describeStyle(personality: Record<string, unknown>): string {
  const style = (personality.communicationStyle ?? {}) as Record<string, unknown>;
  const words: Array<[string, string]> = [
    ['speaksSlowly', 'thoughtful'],
    ['tellsStories', 'story-driven'],
    ['usesMetaphors', 'metaphorical'],
    ['asksQuestions', 'curious'],
    ['givesAdvice', 'advisory'],
  ];
  const picked = words.filter(([key]) => style[key] === true).map(([, word]) => word);
  return picked.length > 0 ? picked.join(', ') : 'natural and authentic';
}

const records = (value: unknown): Array<Record<string, unknown>> =>
  Array.isArray(value)
    ? value.filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
    : [];
const textOf = (value: unknown): string => (typeof value === 'string' ? value : '');
const fieldOf = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;

/** The twin's life events and people, mapped as talk-to-twin maps them (buildTwinContext). */
function lifeAndPeople(
  agent: CustomAgent
): Pick<TwinResponseRequest['profile'], 'lifeChapters' | 'relationships'> {
  // Stored on the agent document, though not on the API type (as the client reads them)
  const memories: unknown = agent.memories;
  return {
    lifeChapters: records(fieldOf(memories, 'lifeEvents')).map((event) => ({
      title: textOf(event.title),
      years: textOf(event.date),
      description: textOf(event.description),
    })),
    relationships: records(fieldOf(memories, 'relationships')).map((person) => ({
      name: textOf(person.personName),
      relationship: textOf(person.relationship),
    })),
  };
}

/**
 * The twin agent's profile, as talk-to-twin builds it (talk-to-twin.ui.ts buildTwinContext).
 * Its life events and people only under TWIN_CONVERSATION_V2.
 */
export function twinProfileFromAgent(
  agent: CustomAgent,
  env: Env = process.env
): TwinResponseRequest['profile'] {
  const personality = (agent.personality ?? {}) as unknown as Record<string, unknown>;
  const behaviors = (agent.behaviors ?? {}) as unknown as Record<string, unknown>;
  const celebrations = strings(behaviors.celebrationPhrases);
  return {
    name: agent.displayName || agent.name,
    mannerisms: strings(behaviors.catchphrases).slice(0, 10),
    values: strings(personality.values),
    communicationStyle: describeStyle(personality),
    philosophy: typeof personality.worldview === 'string' ? personality.worldview : '',
    passions: strings(personality.passions),
    emotionalExpressions: {
      happy: celebrations,
      sad: strings(behaviors.comfortPhrases),
      excited: celebrations.slice(0, 3),
      frustrated: [],
    },
    greetingStyle: strings(behaviors.greetings)[0] ?? '',
    farewellStyle: strings(behaviors.farewells)[0] ?? '',
    ...(flagOn('TWIN_CONVERSATION_V2', env) ? lifeAndPeople(agent) : {}),
  };
}

async function findTwin(uid: string, agentId?: string | null): Promise<CustomAgent | null> {
  if (agentId) {
    const agent = await getCustomAgent(uid, agentId);
    return agent?.type === 'twin' ? agent : null;
  }
  return (await listCustomAgents(uid)).find((agent) => agent.type === 'twin') ?? null;
}

/** Words too common to say what an entry is about ("the", "and", "you" match nearly every one). */
const STOP_WORDS = new Set(
  `the and you was are but not for with that this have had has were what when where
  who how why did does can could would should will just about from they them then
  than there their our your into been some very really`.split(/\s+/)
);

/** The words that can make an entry relevant: three letters or more, no stopwords. */
const words = (text: string) =>
  new Set(
    (text.toLowerCase().match(/[a-z']+/g) ?? []).filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
  );

/**
 * The request with a profile, relevant journal entries and themes filled in
 * from the caller's twin when the client sent no profile. Unchanged when it
 * already has one, or when the caller has no twin (the route then answers 400).
 *
 * TWIN_CONVERSATION_V2: the entries are picked here for talk-to-twin too, by the one
 * rule below, and the client's own pick is replaced. Limit: this reads the caller's
 * journal by uid, the client read its twin's entries. With one twin and JOURNAL_ONE_STORE
 * those are the same entries; a caller with several twins gets entries from all of them.
 */
export async function withOwnTwin(
  uid: string,
  body: TwinRequestBody,
  env: Env = process.env
): Promise<TwinRequestBody> {
  if (!body.userMessage) return body;
  if (hasTwinProfile(body.profile)) {
    if (!flagOn('TWIN_CONVERSATION_V2', env)) return body;
    const { relevantJournals } = await readJournal(uid, body.userMessage);
    return { ...body, relevantJournals };
  }
  const twin = await findTwin(uid, body.agentId);
  if (!twin) return body;
  const journal = await readJournal(uid, body.userMessage);
  return { ...body, profile: twinProfileFromAgent(twin, env), ...journal };
}

/** The entries the message is about (shared words, stopwords left out) and the journal's main themes. */
async function readJournal(
  uid: string,
  message: string
): Promise<Pick<Required<TwinRequestBody>, 'relevantJournals' | 'keyThemes'>> {
  const entries = await getJournalService().getAllEntries(uid, {
    limit: JOURNAL_LOOKBACK,
    sortOrder: 'desc',
  });
  const asked = words(message);
  const relevantJournals = entries
    .map((entry) => ({
      entry,
      score: [...words(entry.content)].filter((w) => asked.has(w)).length,
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, RELEVANT_JOURNALS)
    .map(({ entry }) => ({
      content: entry.content,
      mood: entry.mood?.label,
      date: entry.createdAt.toISOString(),
    }));
  const themeCounts = new Map<string, number>();
  for (const theme of entries.flatMap((entry) => entry.themes ?? [])) {
    themeCounts.set(theme, (themeCounts.get(theme) ?? 0) + 1);
  }
  const keyThemes = [...themeCounts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t]) => t);

  return { relevantJournals, keyThemes };
}
