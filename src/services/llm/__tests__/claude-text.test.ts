import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAllCircuitBreakers } from '../../../utils/circuit-breaker.js';
import { claudeTasks, claudeText, MIN_MAX_TOKENS, routesToClaude } from '../claude-text.js';

const ON = { CLAUDE_LLM_TASKS: 'summary,memory', ANTHROPIC_API_KEY: 'test-key' };

function reply(body: unknown, status = 200) {
  return vi.fn(
    async (..._args: Parameters<typeof fetch>) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      })
  );
}

const sent = (f: ReturnType<typeof reply>) => JSON.parse(String(f.mock.calls[0]?.[1]?.body));

beforeEach(() => resetAllCircuitBreakers());

describe('claude routing', () => {
  it('routes nothing when CLAUDE_LLM_TASKS is unset (off by default)', () => {
    expect(routesToClaude('summary', { ANTHROPIC_API_KEY: 'k' })).toBe(false);
  });

  it('routes a listed task only when a key is set', () => {
    expect(routesToClaude('summary', ON)).toBe(true);
    expect(routesToClaude('summary', { CLAUDE_LLM_TASKS: 'summary' })).toBe(false);
  });

  it('leaves unlisted and untagged calls on Gemini', () => {
    expect(routesToClaude('outreach', ON)).toBe(false);
    expect(routesToClaude(undefined, ON)).toBe(false);
  });

  it('ignores unknown and padded task names', () => {
    expect([...claudeTasks({ CLAUDE_LLM_TASKS: ' memory , bogus,' })]).toEqual(['memory']);
  });
});

describe('claudeText', () => {
  it('sends the model, low effort, a raised token floor and no temperature', async () => {
    const f = reply({ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' });
    await claudeText('hello', { maxTokens: 1000 }, ON, f);
    expect(f.mock.calls[0]?.[0]).toBe('https://api.anthropic.com/v1/messages');
    expect(sent(f)).toEqual({
      model: 'claude-sonnet-5-5',
      max_tokens: MIN_MAX_TOKENS,
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: 'hello' }],
    });
  });

  it('keeps a caller cap above the floor, and honours model and effort overrides', async () => {
    const f = reply({ content: [{ type: 'text', text: 'ok' }] });
    await claudeText(
      'p',
      { maxTokens: 9000 },
      { ...ON, CLAUDE_LLM_MODEL: 'claude-opus-5-5', CLAUDE_LLM_EFFORT: 'medium' },
      f
    );
    expect(sent(f)).toMatchObject({
      model: 'claude-opus-5-5',
      max_tokens: 9000,
      output_config: { effort: 'medium' },
    });
  });

  it('joins the text blocks and skips thinking blocks', async () => {
    const f = reply({
      content: [
        { type: 'thinking', thinking: 'hmm' },
        { type: 'text', text: '{"key' },
        { type: 'text', text: 'Points":[]}' },
      ],
    });
    expect(await claudeText('p', {}, ON, f)).toBe('{"keyPoints":[]}');
  });

  it('returns null without calling out when no key is set', async () => {
    const f = reply({});
    expect(await claudeText('p', {}, { CLAUDE_LLM_TASKS: 'summary' }, f)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it('returns null on an API error so the caller falls back to Gemini', async () => {
    const f = reply({ error: { type: 'overloaded_error', message: 'busy' } }, 529);
    expect(await claudeText('p', {}, ON, f)).toBeNull();
  });

  it('returns null on a refusal or an empty reply', async () => {
    expect(
      await claudeText('p', {}, ON, reply({ content: [], stop_reason: 'refusal' }))
    ).toBeNull();
    expect(
      await claudeText('p', {}, ON, reply({ content: [{ type: 'text', text: '  ' }] }))
    ).toBeNull();
  });

  it('returns null when the request throws (timeout, network)', async () => {
    const f = vi.fn(async () => {
      throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    });
    expect(await claudeText('p', { timeout: 5 }, ON, f)).toBeNull();
  });

  it('stops calling out after three failures in a row (circuit open)', async () => {
    const f = reply({ error: { type: 'api_error' } }, 500);
    for (let i = 0; i < 4; i++) await claudeText('p', {}, ON, f);
    expect(f).toHaveBeenCalledTimes(3);
  });
});
