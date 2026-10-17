/**
 * Ferni never speaks the caller's answer to his own question (caller-voice-guard.ts).
 * On dev 2026-10-17 he asked "Whereabouts are you?" and went on with "I'm in
 * Manhattan, New York. 10011." Synthetic lines only.
 */
import { ReadableStream } from 'node:stream/web';
import { describe, expect, it } from 'vitest';

import { withCallerVoiceGuard } from '../caller-voice-guard.js';

type Chunk = string | object;

/** A reply stream from string chunks, as the model writes them. */
function replyOf(chunks: string[]): ReadableStream<string> {
  return new ReadableStream<string>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

/** Everything the guard lets out, joined. */
async function spoken(chunks: string[], env: Record<string, string> = {}): Promise<string> {
  const out = await withCallerVoiceGuard(replyOf(chunks), env);
  const reader = (out as unknown as ReadableStream<string>).getReader();
  let text = '';
  for (let next = await reader.read(); !next.done; next = await reader.read()) {
    text += typeof next.value === 'string' ? next.value : '';
  }
  return text;
}

describe('withCallerVoiceGuard', () => {
  it('cuts a reply that answers its own question in the first person', async () => {
    const text = await spoken([
      'Whereabouts are you?',
      ' I need your city.',
      " I'm in Manhattan, New York.",
      ' 10011.',
    ]);
    expect(text).toContain('Whereabouts are you?');
    expect(text).toContain('I need your city.');
    expect(text).not.toContain('Manhattan');
    expect(text).not.toContain('10011');
  });

  it('cuts an answer split across chunks', async () => {
    const text = await spoken(['Whereabouts are you?', ' I need', ' your city. I', "'m in Philadelphia."]);
    expect(text).toContain('Whereabouts are you?');
    expect(text).not.toContain('Philadelphia');
  });

  it('cuts a name given in the first person right after a question', async () => {
    const text = await spoken(['Who told you about me? My name is Linda, her mom.']);
    expect(text).toContain('Who told you about me?');
    expect(text).not.toContain('Linda');
  });

  it('cuts "Yeah, I live in" after a question', async () => {
    const text = await spoken(['Do you still live in Ohio? Yeah, I live in Ohio.']);
    expect(text).toContain('Do you still live in Ohio?');
    expect(text.match(/Yeah/)).toBeNull();
  });

  it('passes a reply that asks a question and answers nothing', async () => {
    const chunks = ['Where are you from? ', 'Tell me about your week.'];
    expect(await spoken(chunks)).toBe(chunks.join(''));
  });

  it('passes the same first person line when no question comes before it', async () => {
    const chunks = ["That's lovely. I'm in Manhattan this week, it's a treat."];
    expect(await spoken(chunks)).toBe(chunks.join(''));
  });

  it('passes a lowercase canon line after a question (not a place answer)', async () => {
    const chunks = ['Have you eaten yet? ', "I'm in the garden today, feeling good."];
    expect(await spoken(chunks)).toBe(chunks.join(''));
  });

  it('streams a reply with no question as it arrives, without holding a chunk', async () => {
    let feed: ReadableStreamDefaultController<string> | undefined;
    const source = new ReadableStream<string>({
      start(controller) {
        feed = controller;
      },
    });
    const reader = (
      (await withCallerVoiceGuard(source)) as unknown as ReadableStream<string>
    ).getReader();
    feed?.enqueue('Sure thing, ');
    // The first words are out before the model has finished the reply.
    expect((await reader.read()).value).toContain('Sure thing');
    feed?.close();
  });

  it('does nothing when CALLER_VOICE_GUARD=off', async () => {
    const chunks = ['Whereabouts are you?', " I'm in Manhattan, New York."];
    expect(await spoken(chunks, { CALLER_VOICE_GUARD: 'off' })).toBe(chunks.join(''));
  });

  it("passes a question followed by Ferni's own next line", async () => {
    const text = await spoken(['Where are you? ', 'Let me check.']);
    expect(text).toBe('Where are you? Let me check.');
  });

  it.each([
    ["What's your name? This is Linda.", 'Linda'],
    ["Where are you from? I'm from the Bronx.", 'Bronx'],
    ['Whereabouts are you? Manhattan, New York.', 'Manhattan'],
    ['Are you in Boston?” I’m in Boston.', 'I’m in Boston'],
    ['Are you near St. Louis? I ask because Dr. Smith said so. I’m in St. Louis.', 'in St. Louis.'],
  ])('cuts the caller-voiced answer in %j', async (reply, leaked) => {
    expect(await spoken([reply])).not.toContain(leaked);
  });

  it('cuts a caller answer that comes just before a tool call', async () => {
    const stream = new ReadableStream<Chunk>({
      start(controller) {
        controller.enqueue('Where are you? ');
        controller.enqueue("I'm in Boston");
        controller.enqueue({ id: 'r', delta: { role: 'assistant', toolCalls: [{ name: 'searchLocalBusinesses' }] } });
        controller.close();
      },
    });
    const reader = ((await withCallerVoiceGuard(stream)) as unknown as ReadableStream<Chunk>).getReader();
    let text = '';
    for (let next = await reader.read(); !next.done; next = await reader.read()) {
      if (typeof next.value === 'string') text += next.value;
    }
    expect(text).toBe('Where are you? ');
  });

  it.each([
    ['Remember the first computer you used? I grew up in Wyoming with a Commodore 64.'],
    ['Where did you grow up? I grew up in Wyoming, myself.'],
    ['Did I find anything? Yes, I have three options for you.'],
    ['Is it doable? Yes, I am confident it is.'],
    ['Was I worried? No, I was curious.'],
    ['Can I tell you about me? My name is Ferni, and I am a companion.'],
  ])('does not cut Ferni speaking for himself in %j', async (reply) => {
    expect(await spoken([reply])).toBe(reply);
  });

  it('keeps false positives at zero across realistic synthetic replies', async () => {
    const replies = [
      ['Good to hear from you. What would you like to talk about today?'],
      ['How was your walk? I went out early, and the light was lovely.'],
      ['Did you get the groceries done? I spent the morning in the kitchen.'],
      ['Sounds rough. Do you want to tell me more? I am here for it.'],
      ['Is your sister still in town? She mentioned Boston last time.'],
      ['Can I ask what made you think of that? I find that interesting.'],
      ['You sound tired. Are you getting enough sleep? Yes, that matters a lot.'],
      ['Want me to set a reminder? I can do that, no problem.'],
      ['What did the doctor say? I hope it was good news.'],
      ['Where did you grow up? I always liked the coast.'],
      ['Are you still in the same job? I remember you were thinking about a change.'],
      ['Who is coming to dinner? I would love to hear about it.'],
      ['Is it cold there? I was in the park earlier and it was chilly.'],
      ['Do you have a favourite season? Mine is autumn, the colours are wonderful.'],
      ['What is your favourite meal? I think I could eat soup every day.'],
      ['How did the call go? Were they pleased with the plan?'],
      ['Ready to go again? Yeah, I am glad we picked this back up.'],
      ['Feeling better today? No, I am sorry to hear it went badly.'],
      ['Shall we try the crossword? Sure, I will read the first clue.'],
      ['How is the garden doing? I am planting tomatoes this weekend.'],
    ];
    const cut = await Promise.all(
      replies.map(async (chunks) => (await spoken(chunks)) !== chunks.join(''))
    );
    expect(cut.filter(Boolean)).toHaveLength(0);
  });
});
