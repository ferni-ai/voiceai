/**
 * A try-first (demo) visitor's turn offers every protected support and safety tool a member's
 * turn offers (PROTECTED_TOOL_NAMES, persona-tool-policy.ts; SAFETY_TOOLS,
 * unverified-turn-tools.ts), and none of the account tools. Measured through the REAL
 * toolsForTurn over every domain tool id.
 *
 * Offering them must not store anything: each tool the visitor gains over the phone-safe set
 * runs for real, with the visitor's words in every argument, against a Firestore and a Redis
 * that record every write and its payload (tests/helpers/write-recorder.ts). For a demo id
 * nothing is written; a member running the same tools still writes, so "nothing" can't come
 * from a writer that stopped running. All data here is fictional.
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const rec = await vi.hoisted(async () => {
  const { createWriteRecorder } = await import('../../../tests/helpers/write-recorder.js');
  return createWriteRecorder();
});
vi.mock('../../../utils/firestore-utils.js', async (orig) => ({
  ...(await orig<object>()),
  getFirestoreDb: () => rec.db,
}));
vi.mock('../../../services/superhuman/firestore-utils.js', async (orig) => ({
  ...(await orig<object>()),
  getFirestoreDb: () => rec.db,
}));
vi.mock('firebase-admin/firestore', async (orig) => ({
  ...(await orig<object>()),
  getFirestore: () => rec.db,
}));
vi.mock('@google-cloud/firestore', async (orig) => {
  const actual = await orig<object>();
  class Firestore {
    constructor() {
      return rec.db;
    }
  }
  return { ...actual, Firestore, default: { ...actual, Firestore } };
});
vi.mock('../../../utils/shared-firestore.js', async (orig) => ({
  ...(await orig<object>()),
  sharedFirestore: () => rec.db,
}));
vi.mock('../../../memory/storage/redis-cache/factory.js', async (orig) => ({
  ...(await orig<object>()),
  getRedisCache: () => rec.redis,
  getRedisCacheAsync: async () => rec.redis,
}));

import { toolsForTurn } from '../turn-request.js';
import { SAFETY_TOOLS } from '../unverified-turn-tools.js';
import { phoneSafeTool } from '../../shared/phone-safe-tools.js';
import { DOMAIN_TOOL_IDS } from '../../shared/domain-tool-ids.generated.js';
import { PROTECTED_TOOL_NAMES } from '../../../tools/orchestrator/persona-tool-policy.js';
import type { ToolDefinition } from '../../../tools/registry/types.js';
import * as crisis from '../../../tools/domains/crisis/index.js';
import * as humanTransfer from '../../../tools/domains/human-transfer/index.js';
import * as traumaSupport from '../../../tools/domains/trauma-support/index.js';
import * as presence from '../../../tools/domains/presence/index.js';
import * as sobriety from '../../../tools/domains/sobriety/index.js';
import * as vulnerability from '../../../tools/domains/vulnerability/index.js';
import * as coachingSupport from '../../../tools/domains/coaching-support/index.js';
import * as newParent from '../../../tools/domains/new-parent/index.js';
import * as grief from '../../../tools/domains/grief/index.js';
import * as infidelity from '../../../tools/domains/infidelity/index.js';
import * as socialSkills from '../../../tools/domains/social-skills/index.js';

const DEMO = 'device:demo_1793560000000_k3x9q2'; // as /demo-token mints it
const MEMBER = 'member-uid-4b7e';
const WORDS = ['zqxmarker', '555-0142', 'sam@example.com', 'Sam Testwell', 'Lakeview'];
const SAID = `I'm Sam Testwell, zqxmarker, call me at 555-0142 or sam@example.com, I live in Lakeview`;
const ACCOUNT_TOOLS = ['rememberAboutUser', 'manageContact', 'setReminder', 'sendMessageNow'];

/** Every protected or safety tool in the domain catalog: what a member's turn offers. */
const PROTECTED_IN_CATALOG = DOMAIN_TOOL_IDS.filter(
  (name) => PROTECTED_TOOL_NAMES.has(name) || SAFETY_TOOLS.has(name)
);
/** The ones the phone-safe set alone doesn't keep: what the visitor gains. */
const GAINED = PROTECTED_IN_CATALOG.filter((name) => !phoneSafeTool(name));

const catalog = (): llm.ToolContext =>
  new llm.ToolContext(
    Object.fromEntries(
      [...new Set([...DOMAIN_TOOL_IDS, ...ACCOUNT_TOOLS])].map((name) => [
        name,
        llm.tool({ description: name, parameters: z.object({}), execute: async () => name }),
      ])
    ) as never
  );

let n = 0;
async function offered(userId: string): Promise<string[]> {
  const chat = llm.ChatContext.empty();
  chat.addMessage({ role: 'user', content: SAID });
  const userData = { userId, services: { sessionId: `try-first-tools-${++n}` } };
  const tools = await toolsForTurn({ userData }, chat, catalog(), { loggedLockedHandoffs: false });
  return Object.keys(tools.functionTools);
}

const DEFINITIONS = new Map<string, ToolDefinition>(
  [
    crisis,
    humanTransfer,
    traumaSupport,
    presence,
    sobriety,
    vulnerability,
    coachingSupport,
    newParent,
    grief,
    infidelity,
    socialSkills,
  ].flatMap((domain) => domain.definitions.map((def): [string, ToolDefinition] => [def.id, def]))
);

/** An argument of the visitor's words wherever the schema takes them, else the first valid value. */
function argsFor(parameters: unknown): Record<string, unknown> {
  const shape = (parameters as { shape?: Record<string, z.ZodType> }).shape ?? {};
  const options = (s: unknown): unknown[] => {
    const { options: own, unwrap } = s as { options?: unknown[]; unwrap?: () => unknown };
    return own ?? (unwrap ? options(unwrap.call(s)) : []);
  };
  return Object.fromEntries(
    Object.entries(shape).map(([key, schema]) => [
      key,
      [SAID, [SAID], 7, true, ...options(schema)].find((v) => schema.safeParse(v).success),
    ])
  );
}

/** Runs one tool as `userId`, the visitor's words in its arguments; the writes it made. */
async function run(name: string, userId: string): Promise<string[]> {
  const def = DEFINITIONS.get(name);
  if (!def) throw new Error(`no definition for ${name}`);
  rec.existing.add(`bogle_users/${userId}`); // the insight store writes only for a live record
  const tool = def.create({
    userId,
    sessionId: `tool-${name}`,
    agentId: 'ferni',
    agentDisplayName: 'Ferni',
  }) as {
    parameters: unknown;
    execute: (args: unknown, opts: unknown) => Promise<unknown>;
  };
  const from = rec.payloads.length;
  const opts = {
    ctx: { userData: { userId } },
    toolCallId: 'call-1',
    abortSignal: new AbortController().signal,
  };
  await tool.execute(argsFor(tool.parameters), opts);
  await new Promise((r) => {
    setTimeout(r, 150); // fire-and-forget persistence
  });
  return rec.payloads.slice(from);
}

afterEach(() => {
  rec.writes.length = 0;
  rec.payloads.length = 0;
});

describe("a try-first visitor's turn tools", { timeout: 60_000 }, () => {
  it('offers every protected and safety tool a member gets, and no account tool', async () => {
    const member = await offered(MEMBER);
    const demo = await offered(DEMO);
    expect(PROTECTED_IN_CATALOG.filter((t) => !member.includes(t))).toEqual([]); // member: all
    expect(PROTECTED_IN_CATALOG.filter((t) => !demo.includes(t))).toEqual([]);
    expect([...SAFETY_TOOLS].filter((t) => !demo.includes(t))).toEqual([]);
    expect(demo.filter((t) => ACCOUNT_TOOLS.includes(t))).toEqual([]);
    expect(member.filter((t) => ACCOUNT_TOOLS.includes(t)).length).toBeGreaterThan(0);
    expect(GAINED.length).toBeGreaterThan(0); // the phone-safe set alone would drop these
  });

  it('every gained tool runs for the visitor and writes nothing; a member still writes', async () => {
    vi.stubEnv('GOOGLE_PROJECT_ID', 'try-first-test'); // life-coaching persistence on
    const demoWrites: string[] = [];
    const memberWrites: string[] = [];
    for (const name of GAINED) {
      demoWrites.push(...(await run(name, DEMO)));
      memberWrites.push(...(await run(name, MEMBER)));
    }
    expect(demoWrites).toEqual([]); // no Firestore write at all, so none carries their words
    expect(
      rec.writes.filter((w) => w.includes(DEMO) || w.includes(DEMO.replace(':', '_')))
    ).toEqual([]);
    // The control: the same tools, run as a member, reach each writer.
    expect(memberWrites.some((w) => w.includes('/life_coaching/profile'))).toBe(true);
    expect(memberWrites.some((w) => w.includes('/team_insights/'))).toBe(true);
    expect(WORDS.some((word) => memberWrites.join('\n').includes(word))).toBe(true);
    vi.unstubAllEnvs();
  });
});
