/**
 * Gemini serves a request's prompt from its cache only up to the first byte
 * that differs from an earlier request. These tests build consecutive
 * requests through the real cascade LLM (CartesiaCascadeProvider -> the Google
 * plugin; only its streaming call is stubbed), with the real instruction
 * composition and per-turn reminder, and find where the requests diverge.
 *
 * The cache prefix is taken as tools, then systemInstruction, then contents.
 * That order is inferred, not documented: on a prod call (2026-10-10) a
 * tool-set change with the same systemInstruction left 0 tokens cached.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DEFAULT_API_CONNECT_OPTIONS, llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { getEssentialTools } from '../../../config/tool-config.js';
import { composeAgentInstructions } from '../../multi-agent/agent-instructions.js';
import { withTurnReminder } from '../../personas/turn-request.js';
import { timeContext } from '../../shared/time-context.js';
import { CartesiaCascadeProvider } from '../cartesia-cascade.js';

interface CapturedRequest {
  model: string;
  contents: unknown[];
  config: { systemInstruction?: unknown; tools?: Array<{ functionDeclarations?: unknown[] }> };
}

const pluginEntry = createRequire(import.meta.url).resolve('@livekit/agents-plugin-google');
const genaiEntry = join(dirname(createRequire(pluginEntry).resolve('@google/genai')), 'index.mjs');
const { Models } = (await import(pathToFileURL(genaiEntry).href)) as {
  Models: { prototype: { generateContentStreamInternal: (p: CapturedRequest) => unknown } };
};

const bundles = join(dirname(fileURLToPath(import.meta.url)), '../../../personas/bundles');
const BASE = readFileSync(join(bundles, 'shared/voice-base-character.md'), 'utf8');
const PERSONA = readFileSync(join(bundles, 'ferni/identity/character.md'), 'utf8');

let captured: CapturedRequest[] = [];
const saved = { ...process.env };

beforeEach(() => {
  captured = [];
  process.env.GOOGLE_CLOUD_PROJECT ||= 'test-project';
  process.env.CASCADE_LLM_HEDGE_MS = 'off';
  delete process.env.CASCADE_FAST_LANE;
  vi.spyOn(Models.prototype, 'generateContentStreamInternal').mockImplementation(
    async (params: CapturedRequest) => {
      captured.push(params);
      return (async function* () {
        yield {
          candidates: [
            { content: { role: 'model', parts: [{ text: 'Sure.' }] }, finishReason: 'STOP' },
          ],
        };
      })();
    }
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...saved };
});

const tool = (name: string) =>
  llm.tool({
    description: `${name}: does what its name says for the caller, when they ask for it or it clearly helps.`,
    parameters: z.object({ query: z.string(), when: z.string().optional() }),
    execute: async () => 'ok',
  });
const toolSet = (names: string[]) => Object.fromEntries(names.map((n) => [n, tool(n)]));

// The prod call's tools, in miniature: the essential list, a calendar domain
// loaded after the greeting, then "play" loaded mid-call evicting part of it.
const ESSENTIAL = getEssentialTools().slice(0, 40);
const CALENDAR = ['checkAvailability', 'detectCalendarIssues', 'findFreeTime', 'getDailyBriefing'];
const PLAY = ['becomeSilly', 'cultivatePlayfulness', 'embraceLightness', 'noticeJoy'];

/** The call's instructions as agent-setup composes them for this caller and moment. */
function instructions(caller: string, at: string): string {
  const session = `${timeContext(new Date(at), 'America/New_York')}
---

## Who You're Talking To

You're talking to ${caller}.
Last time you talked about: their week.
`;
  return composeAgentInstructions(
    PERSONA,
    BASE + session,
    { modelInstructionsInAgentPrompt: true },
    { stableBase: BASE }
  );
}

async function send(
  system: string,
  turns: Array<[role: 'user' | 'assistant', text: string]>,
  tools: string[]
) {
  const model = (await new CartesiaCascadeProvider().createLLMModel({
    model: 'ignored',
    instructions: 'x',
  })) as llm.LLM;
  const history = llm.ChatContext.empty();
  history.addMessage({ role: 'system', content: system });
  for (const [role, content] of turns) history.addMessage({ role, content });
  // The per-turn reminder, as PersonaVoiceAgent.llmNode adds it (crisis-gate.ts).
  const chatCtx = withTurnReminder(history, { userData: {} });
  const stream = model.chat({
    chatCtx,
    toolCtx: new llm.ToolContext(toolSet(tools)),
    connOptions: DEFAULT_API_CONNECT_OPTIONS,
  });
  for await (const _chunk of stream) {
    // drain
  }
  return captured[captured.length - 1];
}

const SEGMENTS = ['tools', 'systemInstruction', 'contents'] as const;
const segments = (r: CapturedRequest) => [
  JSON.stringify(r.config.tools ?? null),
  JSON.stringify(r.config.systemInstruction ?? null),
  JSON.stringify(r.contents),
];

/** Bytes two requests share from the start, and where (and in what) they first differ. */
function firstDivergence(a: CapturedRequest, b: CapturedRequest) {
  const x = segments(a);
  const y = segments(b);
  let offset = 0;
  for (let s = 0; s < SEGMENTS.length; s++) {
    let i = 0;
    while (i < x[s].length && i < y[s].length && x[s][i] === y[s][i]) i++;
    if (i < x[s].length || i < y[s].length) {
      return { offset: offset + i, segment: SEGMENTS[s], at: y[s].slice(i, i + 40) };
    }
    offset += i;
  }
  return { offset, segment: null, at: '' };
}

const decls = (r: CapturedRequest) =>
  (r.config.tools?.[0]?.functionDeclarations ?? []) as Array<{ name: string }>;

describe('consecutive cascade requests keep a cacheable prefix', () => {
  it('turns with different per-turn reminders share at least 90% of the earlier request', async () => {
    const system = instructions('Seth', '2026-10-10T18:17:00Z');
    const tools = [...ESSENTIAL, ...CALENDAR];
    const said: Array<['user' | 'assistant', string]> = [
      ['user', 'Hey, how was your week?'],
      ['assistant', 'Quiet, mostly reading.'],
      ['user', 'What are you reading?'],
    ];
    const one = await send(system, said, tools);
    const two = await send(
      system,
      [...said, ['assistant', 'An old history book.'], ['user', 'Oh nice. Is it any good?']],
      tools
    );

    const div = firstDivergence(one, two);
    const [toolsJson, systemJson, contentsJson] = segments(one);
    // Only the earlier turn's own reminder, on its last message, differs:
    // everything before the message it answered is shared.
    const lastTurn =
      toolsJson.length + systemJson.length + contentsJson.lastIndexOf('{"role":"user"');
    expect(div.segment).toBe('contents');
    expect(div.offset).toBeGreaterThanOrEqual(lastTurn);
    expect(div.offset / segments(one).join('').length).toBeGreaterThanOrEqual(0.9);
  });

  it('PROMPT_STABLE_PREFIX=on: two calls share the persona prompt, not just the base', async () => {
    const said: Array<['user', string]> = [['user', 'Hey.']];
    const run = async () => [
      await send(instructions('Seth', '2026-10-10T18:17:00Z'), said, ESSENTIAL),
      await send(instructions('Ana', '2026-10-10T21:42:00Z'), said, ESSENTIAL),
    ];
    const [offA, offB] = await run();
    const before = firstDivergence(offA, offB);

    process.env.PROMPT_STABLE_PREFIX = 'on';
    const [onA, onB] = await run();
    const after = firstDivergence(onA, onB);

    // Off: the instructions differ at the call's clock, before the persona prompt.
    const offShared = before.offset - segments(offA)[0].length;
    expect(before.segment).toBe('systemInstruction');
    expect(offShared).toBeLessThan(JSON.stringify(BASE).length + 300);
    // On: base + persona (the instructions' stable text) is shared.
    const stableText = JSON.stringify(`${BASE.trim()}\n\n---\n\n${PERSONA}`).length - 1;
    const onShared = after.offset - segments(onA)[0].length;
    expect(after.segment).toBe('systemInstruction');
    expect(onShared / stableText).toBeGreaterThanOrEqual(0.9);
  });

  it('PROMPT_STABLE_PREFIX=on: a domain loaded mid-call leaves the essential declarations in place', async () => {
    const system = instructions('Seth', '2026-10-10T18:17:00Z');
    const said: Array<['user', string]> = [['user', 'Oh, I meant your martial arts training.']];
    const before = [...ESSENTIAL, ...CALENDAR];
    const after = [...ESSENTIAL, ...CALENDAR.slice(2), ...PLAY];
    const turns = async () =>
      firstDivergence(await send(system, said, before), await send(system, said, after));

    const off = await turns();
    process.env.PROMPT_STABLE_PREFIX = 'on';
    const on = await turns();
    const onRequest = captured[captured.length - 1];

    const essentialBytes = JSON.stringify(
      decls(onRequest).filter((d) => ESSENTIAL.includes(d.name))
    ).length;
    // Off: declarations are sorted by name, so "becomeSilly" lands early.
    expect(off.segment).toBe('tools');
    expect(off.offset).toBeLessThan(essentialBytes / 2);
    // On: every essential declaration comes first and is unchanged.
    expect(
      decls(onRequest)
        .slice(0, ESSENTIAL.length)
        .map((d) => d.name)
    ).toEqual([...ESSENTIAL].sort());
    expect(on.segment).toBe('tools');
    expect(on.offset).toBeGreaterThanOrEqual(essentialBytes);
  });
});
