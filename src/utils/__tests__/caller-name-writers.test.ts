/**
 * Every writer of the caller's name, with NAME_CAPTURE_STRICT on and off.
 *
 * On: each takes the name from utils/caller-name.ts. Off: each keeps its old
 * patterns, including the prod bug of 2026-10-19 ("my name's not showing" ->
 * profile.name "not" via tracking/conversation-quality.ts).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const profileWrites = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock('../../memory/firestore-store.js', () => ({
  getFirestoreStore: () => ({
    getProfile: async () => ({ id: 'p', extractedDetails: [] }),
    atomicProfileUpdate: async (_id: string, fn: (p: Record<string, unknown>) => object) => {
      profileWrites.push(fn({ id: 'p' }) as Record<string, unknown>);
      return null;
    },
  }),
}));
vi.mock('@livekit/agents', () => ({
  llm: { tool: (config: Record<string, unknown>) => config },
}));

import { statedName } from '../../agents/personas/name-correction.js';
import { extractNameFromMessage } from '../../conversation/superhuman/nicknames.js';
import { extractSmallDetails as smallDetails } from '../../intelligence/conversation-quality/small-details.js';
import { extractSmallDetails as trackingDetails } from '../../intelligence/tracking/conversation-quality.js';
import { parseTranscript } from '../../services/concierge/parser/transcript-parser.js';
import nameSync from '../../services/data-layer/name-sync.js';
import { persistExtractedDetails } from '../../services/data/realtime-persistence.js';
import { createConversationTools } from '../../tools/domains/conversation/conversation-tools.js';

const userNames = (details: Array<{ type: string; value: string }>): string[] =>
  details.filter((d) => d.type === 'user_name').map((d) => d.value);

/** Each writer, reduced to "the name it would keep from this line". */
const WRITERS: Record<string, (line: string) => string | null> = {
  'tracking/conversation-quality (turn path -> profile.name)': (l) =>
    userNames(trackingDetails(l))[0] ?? null,
  'conversation-quality/small-details (-> realtime-persistence)': (l) =>
    userNames(smallDetails(l))[0] ?? null,
  'superhuman/nicknames': (l) => extractNameFromMessage(l)?.firstName ?? null,
  'data-layer/name-sync': (l) => nameSync.extractNameFromContent(l),
  'personas/name-correction': (l) => statedName(l),
  'concierge/transcript-parser': (l) => parseTranscript(l, 'hotel', 'Inn').contactName ?? null,
};

const CASES: Array<[string, string | null]> = [
  ["Oh, my name's not showing.", null],
  ['Hey Ferni, how are you', null],
  ['my name is Seth', 'Seth'],
  ["I'm Seth", 'Seth'],
  ['call me Sam', 'Sam'],
  ["I'm not sure", null],
  ['this is Seth', 'Seth'],
];

afterEach(() => {
  vi.unstubAllEnvs();
  profileWrites.length = 0;
});

describe('NAME_CAPTURE_STRICT=on: every name writer goes through utils/caller-name.ts', () => {
  for (const [writer, take] of Object.entries(WRITERS)) {
    it.each(CASES)(`${writer}: %j -> %j`, (line, name) => {
      vi.stubEnv('NAME_CAPTURE_STRICT', 'on');
      // name-sync reads stored facts, where the cue opens the line; the rest read speech.
      expect(take(line)).toBe(name);
    });
  }

  it('realtime-persistence keeps a non-name out of profile.name', async () => {
    vi.stubEnv('NAME_CAPTURE_STRICT', 'on');
    await persistExtractedDetails('member-strict', [{ type: 'user_name', value: 'not' }]);
    expect(profileWrites).toHaveLength(1);
    expect(profileWrites[0].name).toBeUndefined();
    await persistExtractedDetails('member-strict-2', [{ type: 'user_name', value: 'Seth' }]);
    expect(profileWrites[1].name).toBe('Seth');
  });

  it('rememberName refuses a non-name and keeps a real one', async () => {
    vi.stubEnv('NAME_CAPTURE_STRICT', 'on');
    const { rememberName } = createConversationTools() as unknown as {
      rememberName: {
        execute: (a: { name: string }, o: { ctx: { userData: object } }) => Promise<string>;
      };
    };
    const profile: { name?: string; id: string } = { id: 'u' };
    const userData = { services: { userProfile: profile, saveProfile: async () => {} } };
    expect(await rememberName.execute({ name: 'not' }, { ctx: { userData } })).toContain(
      'not a name'
    );
    expect(profile.name).toBeUndefined();
    await rememberName.execute({ name: 'Seth' }, { ctx: { userData } });
    expect(profile.name).toBe('Seth');
  });
});

describe('NAME_CAPTURE_STRICT off (default): the old patterns are unchanged', () => {
  it('tracking still takes "not" from "my name\'s not showing" (the prod bug, kept behind the flag)', () => {
    expect(userNames(trackingDetails("Oh, my name's not showing."))).toContain('not');
  });

  it('nicknames and name-sync still take "not" from "I\'m not sure"', () => {
    expect(extractNameFromMessage("I'm not sure")?.firstName).toBe('not');
    expect(nameSync.extractNameFromContent("I'm not sure")).toBe('Not');
  });

  it('a real name still comes through every writer', () => {
    for (const [writer, take] of Object.entries(WRITERS)) {
      expect(take('my name is Seth'), writer).toBe('Seth');
    }
  });

  it('realtime-persistence and rememberName write as before', async () => {
    await persistExtractedDetails('member-legacy', [{ type: 'user_name', value: 'not' }]);
    expect(profileWrites[0].name).toBe('not');
    const { rememberName } = createConversationTools() as unknown as {
      rememberName: {
        execute: (a: { name: string }, o: { ctx: { userData: object } }) => Promise<string>;
      };
    };
    const profile: { name?: string; id: string } = { id: 'u' };
    await rememberName.execute(
      { name: 'not' },
      { ctx: { userData: { services: { userProfile: profile, saveProfile: async () => {} } } } }
    );
    expect(profile.name).toBe('not');
  });
});
