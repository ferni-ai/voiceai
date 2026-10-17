/**
 * Tool-call markup the model writes as text is never spoken (tool-markup-strip.ts).
 * The first case is the reply a caller heard on 2026-10-17.
 */
import { ReadableStream } from 'node:stream/web';
import { describe, expect, it } from 'vitest';

import {
  stripToolMarkup,
  ToolMarkupStripper,
  toolMarkupTransform,
  withToolMarkupStrip,
} from '../tool-markup-strip.js';

const LEAKED =
  "<template-call:default_api:softTeamIntro{ context: Seth is asking what Maya is up to, likely interested in habits, routines, or wellness. ,teammate_specialty: habits }</template-call:default_api:softTeamIntro> Stafford is, uh, Maya is probably winding down herself, but she's usually focused on helping people with their daily routines and habits.";
const SPOKEN =
  "Stafford is, uh, Maya is probably winding down herself, but she's usually focused on helping people with their daily routines and habits.";

/** Feed `text` in pieces cut at `cuts`, as a model stream would. */
function streamed(text: string, cuts: number[]): { out: string; tools: string[] } {
  const s = new ToolMarkupStripper();
  let out = '';
  let at = 0;
  for (const cut of [...cuts, text.length]) {
    out += s.push(text.slice(at, cut));
    at = cut;
  }
  out += s.flush();
  return { out, tools: s.stripped.map((c) => c.tool) };
}

describe('stripToolMarkup: whole text', () => {
  it('removes the logged template-call and keeps the reply after it', () => {
    const r = stripToolMarkup(LEAKED);
    expect(r.text).toBe(SPOKEN);
    expect(r.stripped).toEqual([{ tool: 'softTeamIntro', form: 'tag' }]);
  });

  it.each([
    [
      'default_api: form',
      'Sure. default_api:softTeamIntro{ teammate_specialty: habits } Maya is great.',
      'softTeamIntro',
    ],
    ['default_api. call', 'Okay default_api.playMusic(query="jazz") here you go.', 'playMusic'],
    [
      'print(default_api…)',
      'print(default_api.getWeather(location="St. Pete")) It is warm out.',
      'getWeather',
    ],
    [
      'JSON fn call',
      '{"fn": "playMusic", "args": {"query": "jazz"}} Here is some jazz.',
      'playMusic',
    ],
    [
      'JSON name/arguments',
      'One sec. {"name": "getWeather", "arguments": {"city": "Tampa"}} Done.',
      'getWeather',
    ],
    [
      'name{ key: value } block',
      'Let me see. softTeamIntro{ context: habits, teammate_specialty: habits } Maya loves that.',
      'softTeamIntro',
    ],
    [
      'name(key="value") call',
      'Hang on. handoffToMaya(reason="habits") She can help.',
      'handoffToMaya',
    ],
    [
      'tool_code fence',
      'Sure.\n```tool_code\nprint(default_api.playMusic(query="jazz"))\n```\nEnjoy.',
      'playMusic',
    ],
    [
      'tool_call tag with JSON',
      '<tool_call>{"name": "setReminder", "args": {"time": "9am"}}</tool_call> Got it.',
      'setReminder',
    ],
  ])('removes a %s', (_form, text, tool) => {
    const r = stripToolMarkup(text);
    expect(r.stripped.map((c) => c.tool)).toEqual([tool]);
    expect(r.text).not.toMatch(/default_api|[{}()<>`]|"fn"|_specialty|query=|reason=/);
    expect(r.text.trim().length).toBeGreaterThan(0);
  });

  it('keeps the words on both sides joined by one space', () => {
    expect(stripToolMarkup('Sure.default_api.playMusic(query="jazz")Enjoy.').text).toBe(
      'Sure. Enjoy.'
    );
    expect(stripToolMarkup('Sure. {"fn": "x"} Enjoy.').text).toBe('Sure. Enjoy.');
  });

  it('leaves ordinary speech alone', () => {
    for (const text of [
      'I said (laughing) that it was fine.',
      'It is 5:30, so: tea time.',
      'You, me, and the dog: a perfect night.',
      'Gotta love a <3 from you.',
      "He's at the store. Back soon!",
      'Use `this` word.',
    ]) {
      expect(stripToolMarkup(text)).toEqual({ text, stripped: [] });
    }
  });

  it('drops a label opening a reply (prod 2026-10-16), whole or split', () => {
    const text = "Stafford 3000: I can do that, but I don't have her number here.";
    const said = "I can do that, but I don't have her number here.";
    expect(stripToolMarkup(text)).toEqual({
      text: said,
      stripped: [{ tool: 'label', form: 'label' }],
    });
    for (let cut = 1; cut < text.length; cut++)
      expect(streamed(text, [cut]).out, `@${cut}`).toBe(said);
    // Only at the start, and only a word with a number: ordinary openings stay.
    for (const keep of [
      'Step 1: breathe in.',
      'Honestly: yes.',
      'I was at Stafford 3000: a mall.',
      'At 3000: no.',
    ]) {
      expect(stripToolMarkup(keep).text).toBe(keep);
    }
  });

  it('drops an unclosed call at the end of the reply rather than speaking it', () => {
    expect(stripToolMarkup('Okay. <template-call:default_api:softTeamIntro{ context: x').text).toBe(
      'Okay. '
    );
    expect(stripToolMarkup('Okay. {"fn": "playMusic", "args": {').text).toBe('Okay. ');
  });
});

describe('ToolMarkupStripper: split across stream chunks', () => {
  const cuts = [
    [1],
    [5],
    [14, 15],
    [27, 40],
    [LEAKED.indexOf('{') + 1],
    [LEAKED.indexOf('}') - 3, LEAKED.indexOf('}') + 1],
    [LEAKED.indexOf('</') + 1],
    [LEAKED.indexOf('</') + 2, LEAKED.indexOf('</') + 20],
    [LEAKED.indexOf('> ') + 1],
    Array.from({ length: 60 }, (_, i) => i * 7 + 1),
  ];
  it.each(cuts.map((c) => [c.slice(0, 3).join(','), c]))('logged reply cut at %s', (_n, at) => {
    const r = streamed(LEAKED, at as number[]);
    expect(r.out).toBe(SPOKEN);
    expect(r.tools).toEqual(['softTeamIntro']);
  });

  it('every two-way split of each form is stripped', () => {
    const forms = [
      'Hi. softTeamIntro{ context: habits } Bye.',
      'Hi. {"fn": "playMusic", "args": {"query": "jazz"}} Bye.',
      'Hi. print(default_api.playMusic(query="jazz")) Bye.',
      'Hi. ```tool_code\nplayMusic(query="jazz")\n``` Bye.',
      'Hi. default_api:softTeamIntro{ context: habits } Bye.',
      'Hi. <tool_call>{"name": "setReminder", "args": {"time": "9am"}}</tool_call> Bye.',
      'Hi. handoffToMaya(reason="habits") Bye.',
    ];
    for (const text of forms) {
      for (let cut = 1; cut < text.length; cut++) {
        const r = streamed(text, [cut]);
        expect(r.out, `${text} @${cut}`).toBe('Hi. Bye.');
        expect(r.tools.length, `${text} @${cut}`).toBe(1);
      }
    }
  });

  it('the logged reply split at every single position is stripped', () => {
    for (let cut = 1; cut < LEAKED.length; cut++) {
      expect(streamed(LEAKED, [cut]).out, `@${cut}`).toBe(SPOKEN);
    }
  });

  it('says plain speech as it arrives, holding back only the last word', () => {
    const s = new ToolMarkupStripper();
    expect(s.push('Maya is probably winding ')).toBe('Maya is probably winding ');
    expect(s.push('down herself')).toBe('down ');
    expect(s.push('. Anyway')).toBe('herself. ');
    expect(s.flush()).toBe('Anyway');
  });
});

describe('stream wrappers', () => {
  const chunks = (parts: unknown[]): ReadableStream<unknown> =>
    new ReadableStream({
      start(c) {
        for (const p of parts) c.enqueue(p);
        c.close();
      },
    });
  async function drain(stream: ReadableStream<unknown>): Promise<unknown[]> {
    const out: unknown[] = [];
    for await (const v of stream) out.push(v);
    return out;
  }

  it('withToolMarkupStrip cleans ChatChunk text and passes real tool calls through', async () => {
    const toolCall = { id: 'c', delta: { role: 'assistant', toolCalls: [{ name: 'playMusic' }] } };
    const parts = [LEAKED.slice(0, 50), LEAKED.slice(50, 200), LEAKED.slice(200)].map(
      (content) => ({
        id: 'c',
        delta: { role: 'assistant', content },
      })
    );
    const seen: string[] = [];
    const out = await drain(
      (await withToolMarkupStrip(chunks([...parts, toolCall]), (c) => seen.push(c.tool))) as never
    );
    const text = (out as { delta?: { content?: string } }[])
      .map((c) => c.delta?.content ?? '')
      .join('');
    expect(text).toBe(SPOKEN);
    expect(out).toContainEqual(toolCall);
    expect(seen).toEqual(['softTeamIntro']);
  });

  it('withToolMarkupStrip handles plain string replies and null', async () => {
    const out = await drain(
      (await withToolMarkupStrip(chunks([LEAKED.slice(0, 90), LEAKED.slice(90)]))) as never
    );
    expect(out.join('')).toBe(SPOKEN);
    expect(await withToolMarkupStrip(null)).toBeNull();
  });

  it('toolMarkupTransform strips text bound for TTS', async () => {
    const out = await drain(
      chunks([LEAKED.slice(0, 120), LEAKED.slice(120)]).pipeThrough(toolMarkupTransform()) as never
    );
    expect(out.join('')).toBe(SPOKEN);
  });
});
