import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Only the network edges are stubbed: TTS rendering, the Gemini call and the text judges.
const calls = vi.hoisted(() => ({
  render: [] as { personaId: string; voiceId: string; text: string; userText: string }[],
  generate: [] as unknown[],
  ask: [] as unknown[][],
  samples: 2400,
}));
vi.mock('../render-lib.js', () => ({
  RENDER_RATE: 24000,
  renderReply: async (r: (typeof calls.render)[number]) => {
    calls.render.push(r);
    return new Float32Array(calls.samples).fill(0.25);
  },
}));
vi.mock('../../first-call-eval/vertex.js', () => ({
  generate: async (req: unknown) => {
    calls.generate.push(req);
    return '{"companion":"B"}';
  },
}));
vi.mock('../../voice-eval/judge.mjs', () => {
  const provider = (model: string) => ({
    model: () => model,
    ask: async (...args: unknown[]) => {
      calls.ask.push([model, ...args]);
      return { companion: 'C' };
    },
  });
  return {
    PROVIDERS: { qwen: provider('qwen-x'), claude: provider('claude-x'), gemini: provider('g') },
  };
});

import { spokenVoiceId } from '../../../src/agents/shared/spoken-voice.js';
import { judgesFor, networkClients } from '../persona-audio-id.js';

describe('the real clients', () => {
  let out = '';
  afterEach(() => {
    rmSync(out, { recursive: true, force: true });
    calls.render.length = calls.generate.length = calls.ask.length = 0;
    calls.samples = 2400;
  });

  it('render through the registry voice, send Gemini the clip, and send the text judge the words', async () => {
    out = mkdtempSync(join(tmpdir(), 'persona-audio-'));
    const clients = networkClients(out, {
      audioModel: 'audio-x',
      textJudge: 'qwen',
      text: { model: 'qwen-x', project: 'demo-project' },
    })('reply');

    const wav = await clients.render('ferni', 'sounds like a lot.', 'ugh. long day.', 0);
    expect(calls.render).toEqual([
      expect.objectContaining({
        personaId: 'ferni',
        voiceId: spokenVoiceId('ferni', undefined),
        text: 'sounds like a lot.',
        userText: 'ugh. long day.',
      }),
    ]);
    expect(wav.subarray(0, 4).toString()).toBe('RIFF');
    expect(readFileSync(join(out, 'reply', 'ferni-1.wav'))).toEqual(wav);

    expect(await clients.hear(wav, 'which one?')).toBe('{"companion":"B"}');
    expect(calls.generate).toEqual([
      expect.objectContaining({
        model: 'audio-x',
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'audio/wav', data: wav.toString('base64') } },
              { text: 'which one?' },
            ],
          },
        ],
      }),
    ]);

    expect(JSON.parse(await clients.read('said: "x"'))).toEqual({ companion: 'C' });
    expect(calls.ask).toEqual([
      ['qwen-x', 'said: "x"', { model: 'qwen-x', project: 'demo-project' }],
    ]);
  });

  it('use claude for the transcript only when asked', async () => {
    out = mkdtempSync(join(tmpdir(), 'persona-audio-'));
    const clients = networkClients(out, {
      audioModel: 'audio-x',
      textJudge: 'claude',
      text: { model: 'claude-x', project: 'demo-project' },
    })('reply');
    await clients.read('said: "y"');
    expect(calls.ask.map((c) => c[0])).toEqual(['claude-x']);
    expect(calls.generate).toHaveLength(0);
  });

  it('refuse an empty clip instead of sending the judge a bare header', async () => {
    out = mkdtempSync(join(tmpdir(), 'persona-audio-'));
    calls.samples = 0;
    const clients = networkClients(out, {
      audioModel: 'gemini-x',
      textJudge: 'qwen',
      text: { model: 'qwen-x', project: 'demo-project' },
    })('reply');
    await expect(clients.render('ferni', 'hi.', 'ugh.', 0)).rejects.toThrow(/clip is empty/);
    expect(calls.generate).toHaveLength(0);
  });
});

describe('the judges', () => {
  const audioOf = (env: NodeJS.ProcessEnv) => judgesFor(env, 'qwen', 'demo-project').audioModel;

  it('hear with Gemini pro, or the Gemini model JUDGE_MODEL names (aliases resolved)', () => {
    expect(audioOf({})).toMatch(/^gemini-.*pro/);
    expect(audioOf({ JUDGE_MODEL: 'pro' })).toMatch(/^gemini-.*pro/);
    expect(audioOf({ JUDGE_MODEL: 'flash' })).toMatch(/^gemini-.*flash/);
    expect(audioOf({ JUDGE_MODEL: 'gemini-x-audio' })).toBe('gemini-x-audio');
    expect(judgesFor({}, 'claude', 'demo-project')).toMatchObject({
      textJudge: 'claude',
      text: { model: 'claude-x', project: 'demo-project' },
    });
  });

  it('refuse a model that would drop the clip and judge the text alone, before any call', () => {
    for (const JUDGE_MODEL of ['qwen/qwen3-235b-a22b-instruct-2507-maas', 'claude-x'])
      expect(() => audioOf({ JUDGE_MODEL })).toThrow(/cannot hear audio/);
    expect(calls.generate).toHaveLength(0);
  });
});
