/**
 * Pins our @livekit/agents patch (patches/@livekit__agents@1.5.1.patch): the
 * Gemini request never ends on a model turn.
 *
 * Gemini answers such a request with 400 "Requests ending with a model turn are
 * not supported." The formatter added a dummy user turn only when the last
 * chat ITEM wasn't a user message, so a trailing user message with no content
 * (it adds no turn) left the request ending on Ferni's reply. Local e2e,
 * 2026-10-04: the 400 fired twice on one reply; the hedged backup and the
 * SDK's retries resent the same request, adding ~2 s before Ferni answered.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const agentsDist = dirname(createRequire(import.meta.url).resolve('@livekit/agents'));
const load = <T>(file: string): Promise<T> => import(pathToFileURL(join(agentsDist, file)).href);

type Turn = { role: string; parts: unknown[] };
interface ChatCtx {
  addMessage(m: { role: string; content: string }): unknown;
  insert(item: unknown): void;
  toProviderFormat(format: 'google'): Promise<[Turn[], unknown]>;
}
interface Llm {
  ChatContext: { empty(): ChatCtx };
  FunctionCall: { create(o: object): unknown };
  FunctionCallOutput: { create(o: object): unknown };
}

let llm: Llm;

beforeAll(async () => {
  const { initializeLogger } = await load<{ initializeLogger: (o: object) => void }>('log.js');
  initializeLogger({ pretty: false, level: 'silent' });
  llm = await load<Llm>('llm/index.js');
});

const roles = (turns: Turn[]) => turns.map((t) => t.role);

describe('Gemini contents end on a user turn', () => {
  it('a trailing empty user message after a tool reply still ends on user', async () => {
    const ctx = llm.ChatContext.empty();
    ctx.addMessage({ role: 'user', content: "What's the weather tomorrow?" });
    ctx.insert(llm.FunctionCall.create({ callId: 'c1', name: 'getWeatherForecast', args: '{"days":1}' }));
    ctx.insert(
      llm.FunctionCallOutput.create({ callId: 'c1', name: 'getWeatherForecast', output: '"sunny"', isError: false })
    );
    ctx.addMessage({ role: 'assistant', content: 'Clear and sunny.' });
    ctx.addMessage({ role: 'user', content: '' });

    const [turns] = await ctx.toProviderFormat('google');

    expect(roles(turns).at(-1)).toBe('user');
    expect(roles(turns)).toEqual(['user', 'model', 'user', 'model', 'user']);
  });

  it('the caller speaking right after a tool call gets a turn apart from the tool result', async () => {
    // Measured against Vertex, 2026-10-04: a user turn holding a functionResponse
    // AND text got 400 "Requests ending with a model turn" from gemini-3.5-flash-lite
    // in 12/12 calls and empty replies from gemini-3.5-flash; split, 8/8 replied.
    const ctx = llm.ChatContext.empty();
    ctx.addMessage({ role: 'user', content: "What's the weather tomorrow?" });
    ctx.insert(llm.FunctionCall.create({ callId: 'c1', name: 'getWeatherForecast', args: '{"days":1}' }));
    ctx.insert(
      llm.FunctionCallOutput.create({ callId: 'c1', name: 'getWeatherForecast', output: '"sunny"', isError: false })
    );
    ctx.addMessage({ role: 'user', content: "I'm thinking of going for a hike." });

    const [turns] = await ctx.toProviderFormat('google');

    const kinds = turns.map((t) =>
      (t.parts as Array<Record<string, unknown>>).map((p) => ('functionResponse' in p ? 'fr' : 'text'))
    );
    expect(roles(turns)).toEqual(['user', 'model', 'user', 'user']);
    expect(kinds.at(-2)).toEqual(['fr']);
    expect(kinds.at(-1)).toEqual(['text']);
    for (const k of kinds) expect(k.includes('fr') && k.includes('text')).toBe(false);
  });

  it('an ordinary conversation gets no extra turn', async () => {
    const ctx = llm.ChatContext.empty();
    ctx.addMessage({ role: 'user', content: 'hi' });
    ctx.addMessage({ role: 'assistant', content: 'hey' });
    ctx.addMessage({ role: 'user', content: 'how are you' });

    const [turns] = await ctx.toProviderFormat('google');

    expect(roles(turns)).toEqual(['user', 'model', 'user']);
  });
});
