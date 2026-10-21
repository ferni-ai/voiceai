/**
 * Ferni never claims an action no tool carried out (action-claim-guard.ts,
 * action-claims.ts).
 *
 * Prod call 2026-10-14 (synthetic paraphrase here): the caller asked Ferni to
 * phone a relative and gave a number; Ferni said he was calling right now and
 * would report back. No call tool was open to the call and nothing was dialed.
 */
import { initializeLogger, llm, voice } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { actionInPlay, withActionClaimCheck } from '../action-claim-guard.js';
import { honestLine } from '../honest-line.js';
import {
  bareOnIt,
  callActions,
  claimedAction,
  kindsOfTool,
  type ActionKind,
} from '../action-claims.js';
import { PersonaVoiceAgent } from '../ferni-agent.js';
import { withTurnStyleReminder } from '../turn-style.js';

initializeLogger({ pretty: false, level: 'warn' });

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe('claimedAction', () => {
  it.each<[string, ActionKind]>([
    ["Okay, I'm calling him right now.", 'call'],
    ["I'll let you know as soon as I get ahold of her.", 'call'],
    ["I'll let you know when she picks up.", 'call'],
    ["I'm calling her now and I'll let you know if she picks up.", 'call'],
    ["I'm calling your sister now so you don't have to.", 'call'],
    ['Ringing her now.', 'call'],
    ['Okay, dialing.', 'call'],
    ['She should be getting a call any second.', 'call'],
    ["I've reached out to her.", 'call'],
    ['I just called her.', 'call'],
    ["Calling her now, don't worry.", 'call'],
    ["I'm calling her right now, okay?", 'call'],
    ['Let me call her right now.', 'call'],
    ['Let me give her a ring.', 'call'],
    ["I'm going to give her a call right now.", 'call'],
    ['Hang tight while I call her.', 'call'],
    ["Okay, I'm on it \u2014 calling Mom now.", 'call'],
    ["I'm on the phone with her now.", 'call'],
    ['Placing the call now.', 'call'],
    ["I'm getting her on the line.", 'call'],
    ["The call's ringing now.", 'call'],
    ["I'm calling that number right now.", 'call'],
    ["I'm calling the number you gave me now.", 'call'],
    ['Dialing 555-0134 now.', 'call'],
    ["I'm dialing that number now.", 'call'],
    ["Sure, give me a sec, I'm dialing.", 'call'],
    ['Calling Rosa now.', 'call'],
    ["I'll ring Mom right now.", 'call'],
    ["I'll ring her right away and let you know how it goes.", 'call'],
    ['Done! Message sent.', 'send'],
    ['Just sent it.', 'send'],
    ["I've texted your sister.", 'send'],
    ["I've let your brother know.", 'send'],
    ['I just shot her a text.', 'send'],
    ["I've booked it.", 'schedule'],
    ['Got you a table at seven.', 'schedule'],
    ["I've put it in your calendar.", 'schedule'],
    ["You're all booked.", 'schedule'],
    ["Your reminder's all set.", 'reminder'],
    ["I've set a reminder for nine.", 'reminder'],
    ['Saved.', 'save'],
    ["I've saved that.", 'save'],
    ["I'm reaching out to your sister now.", 'call'],
    ["I'm getting in touch with her now.", 'call'],
    ["I've left her a voicemail.", 'call'],
    ["I'll call her in a sec.", 'call'],
    ['I dropped her a line.', 'send'],
    ['Booked!', 'schedule'],
    ["I'm giving her a call right now.", 'call'],
    ["I'll give her a ring right now.", 'call'],
  ])('%j claims %s', (sentence, kind) => {
    expect(claimedAction(sentence)).toBe(kind);
  });

  it.each([
    'Want me to call him?',
    'Should I text your sister?',
    'I can set a reminder for you, if you like.',
    "Once you say yes, I'll ring her.",
    "I can't place calls from here.",
    "I haven't called anyone.",
    "I'll call Dana at five five five, zero one nine nine, to say you're running late. Want me to go ahead?",
    "I'll text Dana that you're running late.",
    'That\'s a text to Sam saying "I sent the forms already". Should I send it?',
    "Okay, I'll text Dana \u201cI've already booked the table\u201d once you say so.",
    "I'll message you on the app later.",
    "I'll call you back if we get cut off.",
    'I called my sister after that and we both cried.',
    'My sister was struggling, so I called her.',
    'I texted my mom about it and she laughed at me.',
    'Honestly I texted a friend once at 3am and regretted it.',
    'I rang my dad every Sunday for years.',
    'When I called the hospital, they put me on hold for an hour.',
    'We booked a cabin last summer and it rained the whole time.',
    'I called her yesterday.',
    "Yeah, I've called him a lot of names over the years.",
    "I'm sending you a big hug.",
    'I sent you a big hug in spirit.',
    'Sending you so much love.',
    "I'm so glad I'm on the phone with you tonight.",
    "I'm calling that a win!",
    "Honestly, I'm calling that progress.",
    "I'm calling you out, lovingly.",
    "I'm calling it, you're going to love that job.",
    'I called it, they won.',
    "Hmm, it's ringing a bell.",
    "I'll tell you what, let's talk to her together.",
    "It's booked solid on weekends, that place.",
    "I'll remind you of that next time you doubt yourself.",
    "I'll remind you to be gentle with yourself.",
    "I just want to remind you that you're doing great.",
    "I'm so glad you called.",
    "I'll keep you posted.",
    "I'll be here.",
    "I'll remember that.",
    'Give her a call when you get a minute.',
    "It sounds like she's going through a lot.",
    "He's going through so much since the divorce.",
    "They're going through a rough patch.",
    "They're connecting again, that's lovely.",
    "Oh your phone's ringing! Go grab it, I'll wait.",
    'Calling all the good vibes!',
    "I'm ringing in the new year with you!",
    "Wow, you're booked solid this week.",
    "So you're scheduled for surgery Tuesday morning.",
    'Your appointment is set for Thursday.',
    "Sounds like your alarm's set for five tomorrow.",
    'Sending a little sunshine your way.',
    'Her text sent you spinning, huh.',
    "That's saved my whole afternoon.",
    "It's stored somewhere deep in your heart.",
    "I know it's hard. Calling her number just to hear her voice, that makes so much sense.",
    "Texting him at two in the morning probably isn't the move.",
    'Calling her tonight sounds like a really good plan.',
    'Calling your mom tonight is a great idea.',
    'Calling Grandma every Sunday is such a sweet ritual.',
    'Calling Mom was brave.',
    'Texting her first might be easier.',
    'Texting Jake back can wait until tomorrow.',
    'Ringing your dad on his birthday is a lovely idea.',
    'Phoning him can feel scarier than texting.',
    'Dialing her number with shaking hands, I get it.',
    "Sent her flowers, wow, that's so thoughtful.",
    'Sent it, huh.',
    "She's getting a call back for the second interview, that's huge!",
    "They're getting a call from the school today.",
    "Oh it's ringing, go answer it!",
    "Sounds like it's ringing, go get it.",
    "I'll let you know a trick for when he answers the phone.",
    "I'm calling Dad's behavior what it is.",
    "That's saved, in my heart at least.",
    "She's probably asleep. She'll get the text when she wakes up.",
    "Your text was delivered, she's just busy.",
    "If you stop replying, he'll get the message.",
    "Give it time, they'll get the message.",
    'Calling your mom \u2014 I love that.',
    "Calling her, wow, that's a big step.",
    "Ah, calling Grandma, she'll love that.",
    "Calling Mom! That's so sweet.",
    'Calling her.',
    'Texting her.',
    'Message sent, loud and clear, huh.',
    "I've reached out to her before and it didn't land.",
    "I've texted my mom's old number too.",
    "I'm booking it to the finish line.",
    "I'm calling back to what you said earlier.",
    "Oh, the call's connecting now, can you hear me?",
    'The call is going through your head over and over.',
    "I'll get back to you when she answers your question about it.",
    "I'll let you know when she picks up the vibe, haha.",
    "I've booked it, I'm going to Lisbon in my imagination.",
    "I've sent it out into the universe.",
    // Known misses, left alone on purpose (they read like the caller's own news):
    "All set, she'll get the text.",
    'Message is on its way to Dana.',
    'On it, calling her.',
  ])('%j is not a claim', (sentence) => {
    expect(claimedAction(sentence)).toBeNull();
  });
});

describe('kindsOfTool', () => {
  it('reads tools by what they do, not by a substring', () => {
    expect(kindsOfTool('callOnBehalf')).toEqual(['call']);
    expect(kindsOfTool('reachOut')).toEqual(['call', 'send']);
    expect(kindsOfTool('setReminder')).toEqual(['reminder']);
    expect(kindsOfTool('createCalendarEvent')).toEqual(['schedule']);
    expect(kindsOfTool('recallFromMemory')).toEqual([]);
    expect(kindsOfTool('endCall')).toEqual([]);
  });
});

const user = (content: string): llm.ChatMessage =>
  llm.ChatMessage.create({ role: 'user', content });
const said = (content: string): llm.ChatMessage =>
  llm.ChatMessage.create({ role: 'assistant', content });
let n = 0;
const result = (name: string, output: string, isError = false): llm.FunctionCallOutput =>
  llm.FunctionCallOutput.create({ callId: `c${++n}`, name, output, isError });
const ctx = (...items: unknown[]) => ({ items });
const ASK = user('Can you ring my brother? Five five five, zero one nine nine.');

describe('callActions', () => {
  it('reads each kind by its latest result, across the whole call', () => {
    const preview = callActions(
      ctx(ASK, result('callOnBehalf', JSON.stringify('NOT SENT YET. Read this to the caller')))
    );
    expect([...preview.awaiting]).toEqual(['call']);
    const none = callActions(
      ctx(ASK, result('callOnBehalf', JSON.stringify('Nothing was dialed: no number.')))
    );
    expect([...none.failed]).toEqual(['call']);
    expect([...callActions(ctx(ASK, result('quickText', 'boom', true))).failed]).toEqual(['send']);
    const ok = callActions(
      ctx(ASK, result('callOnBehalf', JSON.stringify("Got it! I'm calling him now.")))
    );
    expect([...ok.done]).toEqual(['call']);
    // An earlier turn's send still counts; a later refusal of the same kind wins.
    const earlier = callActions(
      ctx(user('Text her.'), result('quickText', '"Sent."'), said('Sent.'), ASK)
    );
    expect([...earlier.done]).toEqual(['send']);
    const later = callActions(
      ctx(result('quickText', '"Sent."'), result('quickText', '"Nothing was sent: no number."'))
    );
    expect([...later.failed]).toEqual(['send']);
    // The tool asking for a number, or refusing on compliance, is not a call.
    const noNumber = callActions(
      ctx(
        result(
          'callOnBehalf',
          '"I found Sam, but I don\u2019t have a phone number for them. Could you provide their number?"'
        )
      )
    );
    expect([...noNumber.failed]).toEqual(['call']);
    const refused = callActions(
      ctx(result('callOnBehalf', '"I can\u2019t make this call because: outside calling hours."'))
    );
    expect([...refused.failed]).toEqual(['call']);
    for (const off of [
      "I don't have a number for Rosa.",
      'Calls are disabled right now.',
      'Outbound calling is turned off.',
    ]) {
      expect([...callActions(ctx(result('callOnBehalf', JSON.stringify(off)))).failed]).toEqual([
        'call',
      ]);
    }
    // "Sorry for the wait" is not a refusal.
    const sorry = callActions(
      ctx(result('callOnBehalf', '"Sorry for the wait, the call is ringing now."'))
    );
    expect([...sorry.done]).toEqual(['call']);
  });
});

describe('honestLine', () => {
  it('says plainly what did not happen and offers what Ferni can do, in voice-safe text', () => {
    const lines = [
      honestLine('call', 'no_tool', false),
      honestLine('call', 'no_tool', true),
      honestLine('call', 'failed', true),
      honestLine('reminder', 'no_tool', false),
    ];
    expect(lines[0]).toBe(
      "I can't actually make calls for you, so I haven't rung anyone. I can help you work out what to say, though."
    );
    expect(lines[1]).toBe(
      "I can't actually make calls for you, so I haven't rung anyone. Want me to remind you to do it?"
    );
    expect(lines[2]).toMatch(/didn't go through/);
    for (const line of lines) expect(line).not.toMatch(/\u2014|\u2013|\.\.\.|\u2026/);
  });
});

const chunk = (content: string, extra: object = {}): llm.ChatChunk => ({
  id: 'r',
  delta: { role: 'assistant', content },
  ...extra,
});
const toolCall = (name: string): llm.ChatChunk => ({
  id: 'r',
  delta: {
    role: 'assistant',
    toolCalls: [llm.FunctionCall.create({ callId: 'x', name, args: '{}' })],
  },
});
function streamOf(...parts: Array<string | llm.ChatChunk>): ReadableStream<llm.ChatChunk> {
  return new ReadableStream({
    start(c) {
      for (const p of parts) c.enqueue(typeof p === 'string' ? chunk(p) : p);
      c.close();
    },
  });
}
async function chunksOf(stream: ReadableStream<llm.ChatChunk>): Promise<llm.ChatChunk[]> {
  const out: llm.ChatChunk[] = [];
  for await (const c of stream as unknown as AsyncIterable<llm.ChatChunk>) out.push(c);
  return out;
}
const textOf = async (stream: ReadableStream<llm.ChatChunk>): Promise<string> =>
  (await chunksOf(stream)).map((c) => c.delta?.content ?? '').join('');
const toolsWith = (...names: string[]) => ({
  functionTools: Object.fromEntries(names.map((name) => [name, {}])),
});
const CLAIM = [
  "Okay, I'm calling",
  ' him right now. ',
  "I'll let you know as soon as I get ahold of him.",
];
const STREAM = { ACTION_CLAIM_STREAM: 'on' };
const check = (
  stream: ReadableStream<llm.ChatChunk>,
  items: unknown[],
  tools = toolsWith(),
  env: Record<string, string> = STREAM
) => withActionClaimCheck(Promise.resolve(stream), ctx(...items), tools, undefined, env);

describe('withActionClaimCheck', () => {
  it('no call tool: the claim is dropped and Ferni says he cannot make calls', async () => {
    const text = await textOf(await check(streamOf(...CLAIM), [ASK], toolsWith('setReminder')));
    expect(text).not.toMatch(/calling|get ahold/i);
    expect(text).toBe(
      "I can't actually make calls for you, so I haven't rung anyone. Want me to remind you to do it?"
    );
  });

  it('the honest line goes where the claim was', async () => {
    const parts = ['Sure. ', "I'm calling her right now. ", "How's the rest of your day?"];
    expect(await textOf(await check(streamOf(...parts), [ASK]))).toBe(
      "Sure. I can't actually make calls for you, so I haven't rung anyone. I can help you work out what to say, though. How's the rest of your day?"
    );
  });

  it('the call tool refused: the claim is dropped and the reply ends saying it did not go through', async () => {
    const items = [
      ASK,
      result('callOnBehalf', JSON.stringify("Nothing was dialed: I don't have a number.")),
    ];
    const parts = [...CLAIM, ' Anything else on your mind?'];
    expect(await textOf(await check(streamOf(...parts), items, toolsWith('callOnBehalf')))).toBe(
      "Anything else on your mind? That call didn't go through, so nothing's been dialed. I can help you work out what to say, though."
    );
  });

  it('after a refusal, a retry of the tool in the same reply gets no line', async () => {
    const items = [ASK, result('callOnBehalf', JSON.stringify('Nothing was dialed: no number.'))];
    const stream = streamOf('Calling him now. ', toolCall('callOnBehalf'));
    const out = await chunksOf(await check(stream, items, toolsWith('callOnBehalf')));
    expect(out.map((c) => c.delta?.content ?? '').join('')).toBe('');
    expect(out.some((c) => c.delta?.toolCalls?.length)).toBe(true);
  });

  it('the confirm flow streams untouched: read-back, the yes turn, and the tool call', async () => {
    const items = [
      ASK,
      result('quickText', JSON.stringify('NOT SENT YET. Read this to the caller')),
    ];
    const tools = toolsWith('quickText');
    const readBack = [
      'That\'s a text to Sam saying "I sent the forms already". ',
      'Should I send it?',
    ];
    expect(await textOf(await check(streamOf(...readBack), items, tools))).toBe(readBack.join(''));
    const yes = await chunksOf(
      await check(
        streamOf('Great, sending it now. ', toolCall('quickText')),
        [...items, said(readBack.join('')), user('Yes.')],
        tools
      )
    );
    expect(yes[0].delta?.content).toBe('Great, sending it now. ');
    expect(yes[1].delta?.toolCalls?.[0].name).toBe('quickText');
  });

  it('a call tool open but not called is left to the model and its tool', async () => {
    expect(await textOf(await check(streamOf(...CLAIM), [ASK], toolsWith('callOnBehalf')))).toBe(
      CLAIM.join('')
    );
  });

  it('a send that went out on an earlier turn can be talked about', async () => {
    const items = [
      user('Text her.'),
      result('quickText', '"Sent to Dana."'),
      said('Sent.'),
      user('Did you text her?'),
    ];
    const reply = "Yep, I've texted her for you.";
    expect(await textOf(await check(streamOf(reply), items, toolsWith('quickText')))).toBe(reply);
  });

  it('words and tool calls keep their order, with a partial sentence before the call', async () => {
    const stream = streamOf('Sure, let me check the weather', toolCall('getWeather'));
    const out = await chunksOf(await check(stream, [ASK], toolsWith('getWeather')));
    expect(out[0].delta?.content).toBe('Sure, let me check the weather');
    expect(out[1].delta?.toolCalls?.[0].name).toBe('getWeather');
  });

  it('empathy on a phone-only call (no action tools) streams untouched', async () => {
    const parts = [
      "It sounds like she's going through a lot. ",
      "I know it's hard. Calling her number just to hear her voice, that makes so much sense. ",
      "She'll get the text when she wakes up. ",
      'Calling your mom, I love that. ',
      'Calling her. ',
      "I'm here with you.",
    ];
    expect(await textOf(await check(streamOf(...parts), [ASK], toolsWith('endCall')))).toBe(
      parts.join('')
    );
  });

  it('a sentence ending with no space before the next one is still its own sentence', async () => {
    const text = await textOf(await check(streamOf('Calling her now!Hang tight.'), [ASK]));
    expect(text).toMatch(/Hang tight\.$/);
    expect(text).not.toMatch(/Calling her/);
  });

  it('chunks out carry no usage of the chunk they came from', async () => {
    const stream = streamOf(chunk('Hi there. ', { usage: { completionTokens: 5 } }));
    expect((await chunksOf(await check(stream, [ASK]))).every((c) => !('usage' in c))).toBe(true);
  });

  it('a reply with no claim streams through unchanged', async () => {
    const parts = ['That sounds like a lot. ', 'Want me to set a reminder?'];
    expect(await textOf(await check(streamOf(...parts), [ASK]))).toBe(parts.join(''));
  });

  it('ACTION_CLAIM_GUARD=off (and the announced-check log and caller voice guard off) returns the very same stream', async () => {
    const stream = streamOf(...CLAIM);
    const off = {
      ACTION_CLAIM_GUARD: 'off',
      ANNOUNCED_CHECK_LOG: 'off',
      CALLER_VOICE_GUARD: 'off',
    };
    expect(
      await withActionClaimCheck(Promise.resolve(stream), ctx(ASK), toolsWith(), undefined, off)
    ).toBe(stream);
  });
});

/** A model stream that has sent these chunks and is still open: nothing after them is known yet. */
function openStreamOf(...parts: string[]): ReadableStream<llm.ChatChunk> {
  return new ReadableStream({
    start(c) {
      for (const p of parts) c.enqueue(chunk(p));
    },
  });
}
async function firstOut(stream: ReadableStream<llm.ChatChunk>): Promise<string | undefined> {
  const reader = stream.getReader();
  const next = await Promise.race([
    reader.read(),
    new Promise<'held'>((resolve) => setTimeout(() => resolve('held'), 50)),
  ]);
  void reader.cancel();
  return next === 'held' ? undefined : (next.value?.delta?.content ?? undefined);
}

describe('no hold at the head of the reply (dev latency, increment 3)', () => {
  const SMALL_TALK = [user('I had a long day.'), said('Oh no.'), user('Work kept piling it on.')];

  it('an action is in play when the caller asked for one lately or an action tool ran', () => {
    expect(actionInPlay(ctx(ASK))).toBe(true);
    expect(actionInPlay(ctx(user('Remind me to call the dentist.')))).toBe(true);
    expect(actionInPlay(ctx(user('Text my sister I am late.')))).toBe(true);
    expect(actionInPlay(ctx(user('Okay so are you calling him now?')))).toBe(true);
    expect(actionInPlay(ctx(user('Hi'), result('quickText', '"Sent."'), user('Thanks')))).toBe(
      true
    );
    expect(actionInPlay(ctx(...SMALL_TALK))).toBe(false);
    const later = ['ok', 'anyway', 'my day was long', 'yeah', 'the dog', 'mm', 'right'].map((t) =>
      user(t)
    );
    expect(actionInPlay(ctx(ASK, ...later.slice(0, 5)))).toBe(true);
    expect(actionInPlay(ctx(ASK, ...later))).toBe(false);
    for (const ask of [
      'Give my brother a buzz.',
      'Can you get hold of my mom?',
      'Hit up Dave for me.',
      'FaceTime my dad.',
      'WhatsApp my wife.',
      'Get my mom on the line.',
      'Tell Dave I am late.',
      'Wake me up at seven.',
      'Jot that down.',
      'Set up a meeting with Sam.',
      'cal my mom',
      'tex my sister',
      'Llama a mi mamá.',
      'Appelle ma mère.',
      'Can you connect me with my mom?',
      'Could you get my mom for me?',
      'Put me through to my mom.',
      'I want to talk to my mom.',
      'Loop in my sister.',
      'Holler at my brother.',
      'Ask my sister to pick me up.',
      'Can you get in touch with my mom?',
      'Could you give my mom a shout?',
      'Give my brother a bell.',
      'Patch me through to my sister.',
      'Can you notify my sister?',
      'Drop my mom a line.',
      'Can you check in on my mom for me?',
      'Video chat my sister.',
      'Can you hook me up with my brother?',
      'Order me a pizza.',
      'Can you buy me tickets?',
      'Get me an ambulance.',
      'Can you order a taxi?',
      'Can you pay my bill?',
    ])
      expect([ask, actionInPlay(ctx(user(ask)))]).toEqual([ask, true]);
    // Speech-to-text capitalises each sentence, so a request or emergency holds at the start too
    for (const ask of [
      'Can you get the vet?',
      'Please get the vet.',
      "Can you help me? I can't breathe.",
      'Get help!',
      'Help me, I fell.',
      'I need help, my chest hurts.',
      'I think it is a heart attack.',
      "I can't breathe.",
      'Someone is breaking in.',
      'She is bleeding a lot.',
      'He took an overdose.',
      'I keep thinking about suicide.',
      'My boss kept piling it on.',
      'Her phone is off.',
    ])
      expect([ask, actionInPlay(ctx(user(ask)))]).toEqual([ask, true]);
    // Ferni offered to act, so the caller's yes is the ask
    for (const offer of [
      'Should I text your sister?',
      'Want me to book a table?',
      'Shall I call her for you?',
      'I can send that to him now if you like.',
      'Would you like me to set a reminder?',
    ])
      for (const yes of ['Yes.', 'Do it.', 'Sure, go for it.'])
        expect([offer, yes, actionInPlay(ctx(said(offer), user(yes)))]).toEqual([offer, yes, true]);
    // Verifier round 5: more emergencies, asks and offer wordings
    for (const ask of [
      "He's not breathing!",
      'She collapsed.',
      'He passed out.',
      'She is unconscious',
      "i think he's having a stroke",
      "she's choking",
      "he's having a seizure",
      "There's a fire!",
      "i've been in a car accident",
      "he's got a gun",
      'i need the cops',
      'I want to kill myself.',
      "I don't want to live anymore.",
      'i want to end it all',
      'ayuda',
      'I can\u2019t breathe.',
      'can not breathe',
      'Get me a cab.',
      'Find me a cab.',
      'I need a ride to the airport.',
      'Get us a table.',
      'Sort me out a table for two.',
      'Get me in at the dentist.',
      'Notify the landlord.',
    ])
      expect([ask, actionInPlay(ctx(user(ask)))]).toEqual([ask, true]);
    for (const offer of [
      'Want me to set that up?',
      'Can I call her for you?',
      'Is it okay if I call her?',
      'Mind if I text her?',
      'How about I text her?',
      'Happy to text her if you like.',
      'Do you need me to call someone?',
      "Say the word and I'll call her.",
      "I'll text her if you want.",
      'Want me to get you a cab?',
      'Should I get you a table?',
      'Shall I get an ambulance?',
      'Want me to get help?',
      'I can sort that out for you.',
    ])
      expect([offer, actionInPlay(ctx(said(offer), user('Go on then.')))]).toEqual([offer, true]);
    for (const bare of [
      'Want me to do that?',
      'Should I go ahead?',
      'Want me to handle it?',
      'Should I?',
    ])
      expect([
        bare,
        actionInPlay(ctx(said('Your sister would love a message.'), said(bare), user('Yes.'))),
      ]).toEqual([bare, true]);
    // An offer with no action in it doesn't hold
    expect(actionInPlay(ctx(said('Want me to keep going?'), user('Yes.')))).toBe(false);
    expect(actionInPlay(ctx(user('Tell me something interesting.')))).toBe(false);
    expect(actionInPlay(ctx(user("Hey Ferni, how's it going?")))).toBe(false);
    expect(actionInPlay(ctx(user('How was it?'), said("That's on this call, so I'm here.")))).toBe(
      false
    );
    expect(actionInPlay(ctx(result('getWeather', '"Sunny."')))).toBe(false);
  });

  it("reads only the caller's spoken words, never the turn reminder after them", () => {
    const chat = llm.ChatContext.empty();
    chat.addMessage({ role: 'user', content: 'Work kept piling it on.' });
    const reminded = withTurnStyleReminder(chat);
    expect(JSON.stringify(reminded.items)).toMatch(/on a call/);
    expect(actionInPlay(reminded)).toBe(false);
    chat.addMessage({ role: 'user', content: 'Can you text my sister?' });
    expect(actionInPlay(withTurnStyleReminder(chat))).toBe(true);
  });

  it('with no action in play, each chunk goes out as it comes, before the sentence ends', async () => {
    const out = await check(openStreamOf('Oh,'), SMALL_TALK);
    expect(await firstOut(out)).toBe('Oh,');
  });

  it('ACTION_CLAIM_STREAM off (the default): small talk holds and a claim is never spoken', async () => {
    expect(await firstOut(await check(openStreamOf('Oh,'), SMALL_TALK, toolsWith(), {}))).toBe(
      undefined
    );
    const parts = ["I've texted her for you. ", 'Anything else?'];
    expect(await textOf(await check(streamOf(...parts), SMALL_TALK, toolsWith(), {}))).toBe(
      "I can't actually send messages for you, so nothing's gone out. I can help you word it, though. Anything else?"
    );
  });

  it('with no action in play, the words come out exactly as the model wrote them', async () => {
    const parts = ['Hey', "! It's going really well,", ' thanks for asking. How are', ' you?'];
    expect(await textOf(await check(streamOf(...parts), SMALL_TALK))).toBe(parts.join(''));
  });

  it('with no action in play, a claim is corrected straight after it, between sentences', async () => {
    const parts = ["I've texted her for you. ", 'Anything else?'];
    expect(await textOf(await check(streamOf(...parts), SMALL_TALK))).toBe(
      "I've texted her for you. Scratch that, I can't actually send messages for you, so nothing's gone out. I can help you word it, though. Anything else?"
    );
  });

  it('with no action in play, a correction never lands inside a word', async () => {
    const parts = ["I'm calling her now. Sh", "e'll be glad to hear from you."];
    expect(await textOf(await check(streamOf(...parts), SMALL_TALK))).toBe(
      "I'm calling her now. Scratch that, I can't actually make calls for you, so I haven't rung anyone. I can help you work out what to say, though. She'll be glad to hear from you."
    );
  });

  it('with no action in play, words after a tool call mid-reply come through intact', async () => {
    const stream = streamOf(
      'Let me look',
      toolCall('searchMemory'),
      ' that up for you. ',
      'Here it is.'
    );
    const out = await chunksOf(await check(stream, SMALL_TALK, toolsWith('searchMemory')));
    expect(out.map((c) => c.delta?.content ?? '').join('')).toBe(
      'Let me look that up for you. Here it is.'
    );
    expect(out.findIndex((c) => c.delta?.toolCalls?.length)).toBe(1);
    const claim = streamOf('Okay, so', toolCall('searchMemory'), " I'm calling her now. Bye.");
    expect(await textOf(await check(claim, SMALL_TALK, toolsWith('searchMemory')))).toBe(
      "Okay, so I'm calling her now. Scratch that, I can't actually make calls for you, so I haven't rung anyone. I can help you work out what to say, though. Bye."
    );
  });

  it.each([
    [['Let me ring her at 5.', '30 right now.']],
    [['Let me dial 555.', '867.5309 right now.']],
    [["I'll call 555.", '867.5309 now.']],
  ])('with an action in play, a claim with a number in it is never spoken: %j', async (parts) => {
    expect(await textOf(await check(streamOf(...parts), [ASK]))).toBe(
      "I can't actually make calls for you, so I haven't rung anyone. I can help you work out what to say, though."
    );
  });

  it('with an action in play, a sentence is held until it is known to end, as before', async () => {
    expect(
      await firstOut(await check(openStreamOf("Okay, I'm calling him right now."), [ASK]))
    ).toBe(undefined);
  });
});

describe('prod call 2026-10-15: "dialing her now" turn after turn, no dial tool', () => {
  const REPLY = ["I'm dialing her now.", " I'll call you right back on this line."];
  const HONEST =
    "I can't actually make calls for you, so I haven't rung anyone. I can help you work out what to say, though.";

  it('"I\'ll call you right back on this line" is a claim of a call', () => {
    expect(claimedAction("I'll call you right back on this line.")).toBe('call');
    expect(claimedAction("I'll call you back once she picks up.")).toBe('call');
    expect(claimedAction('Want me to call you back later?')).toBeNull();
  });

  it.each([
    ['after the ask', [user('Can you call my mom for me?')]],
    ['after a yes', [user('Can you call my mom for me?'), said(HONEST), user('Yes.')]],
    [
      "five turns on, the ask long gone from the caller's last messages",
      [
        user('Can you call my mom for me?'),
        said(HONEST),
        user('Yes.'),
        said(HONEST),
        user('Okay.'),
        said(HONEST),
        user('Hello?'),
        said(HONEST),
        user('Are you there?'),
        said(HONEST),
        user('So?'),
        said(HONEST),
        user('Yes please.'),
      ],
    ],
  ])('%s: never spoken, the honest line instead', async (_label, items) => {
    expect(actionInPlay(ctx(...items))).toBe(true);
    const text = await textOf(await check(streamOf(...REPLY), items));
    expect(text).not.toMatch(/dialing|call you right back/i);
    expect(text).toBe(HONEST);
  });
});

describe('prod call 2026-10-16: "dialing her now" while the call waits for a yes', () => {
  const tools = toolsWith('callOnBehalf');
  const preview = () =>
    result('callOnBehalf', JSON.stringify('NOT SENT YET. Read this to the caller word for word'));
  const NOT_YET = "I haven't actually dialed yet, though. Should I go ahead and call?";
  const asked = [
    user('Hey, have you called my mom recently?'),
    said("I haven't called her yet. Shall I go ahead and make that check-in call right now?"),
    user("Yeah, check in, tell her I said hi and I'll call her tomorrow."),
    preview(),
  ];

  it('"I\'ll take care of that call right now" claims a call; with a condition it does not', () => {
    expect(claimedAction("I'll take care of that call to your mom right now.")).toBe('call');
    expect(claimedAction("I'll take care of that call once you say yes.")).toBeNull();
    expect(claimedAction("I'll take care of it, don't worry.")).toBeNull();
  });

  it('the turn after the read-back: the claim goes, and Ferni asks instead', async () => {
    const reply = [
      'Well, I am dialing her now to let her know you say hello. ',
      "I'll let you know how it goes.",
    ];
    const text = await textOf(await check(streamOf(...reply), asked, tools));
    expect(text).not.toMatch(/dialing/i);
    expect(text).toBe(`${NOT_YET} I'll let you know how it goes.`);
  });

  it('"Thanks, buddy" is not a yes: the next claim goes too', async () => {
    const items = [...asked, said(NOT_YET), user('Thanks, buddy.')];
    const reply = [
      "You've got it. ",
      "I'll take care of that call to your mom right now, and then you can get back to relaxing.",
    ];
    const text = await textOf(await check(streamOf(...reply), items, tools));
    expect(text).not.toMatch(/take care of that call/i);
    expect(text).toBe(`You've got it. ${NOT_YET}`);
  });

  it('a plain yes: the confirming tool call goes out; the claim waits for its result', async () => {
    // Prod 2026-10-17: the call this claim ran ahead of was held for later (held-call-claim.test.ts).
    const items = [...asked, said(NOT_YET), user('Yeah, go ahead.')];
    const out = await chunksOf(
      await check(streamOf('Calling her now. ', toolCall('callOnBehalf')), items, tools)
    );
    expect(out.map((c) => c.delta?.content ?? '').join('')).toBe('');
    expect(out[0].delta?.toolCalls?.[0].name).toBe('callOnBehalf');
  });

  // Owner call 2026-10-18: on a yes, "All right, I'm on it... wish me luck." and no call tool ran.
  it('"I\'m on it" on the yes with no call: dropped, and Ferni asks again', async () => {
    const items = [...asked, said(NOT_YET), user('Yes.')];
    const reply = "All right, I'm on it\u2026 wish me luck.";
    expect(await textOf(await check(streamOf(reply), items, tools))).toBe(NOT_YET);
    // With the call in the reply, it goes with no words: the tool's result is spoken next.
    const out = await chunksOf(
      await check(streamOf("I'm on it. ", toolCall('callOnBehalf')), items, tools)
    );
    expect(out.map((c) => c.delta?.content ?? '').join('')).toBe('');
    expect(out[0].delta?.toolCalls?.[0].name).toBe('callOnBehalf');
  });

  it('"I\'m on it" stands when no call is waiting on this yes', async () => {
    const notYes = [...asked, said(NOT_YET), user('Thanks, buddy.')];
    expect(await textOf(await check(streamOf("I'm on it."), notYes, tools))).toBe("I'm on it.");
    const noCall = [user('Can you remember that for me?'), user('Yes.')];
    expect(await textOf(await check(streamOf("I'm on it."), noCall, tools))).toBe("I'm on it.");
    expect(bareOnIt('Okay.')).toBe(false);
    expect(bareOnIt('On it!')).toBe(true);
    expect(bareOnIt("I'm on it, and it was lovely.")).toBe(false);
  });

  it('once the call went through, the claim stands', async () => {
    const items = [...asked, user('Yes.'), result('callOnBehalf', JSON.stringify('Calling now.'))];
    const text = await textOf(await check(streamOf("I'm calling her now."), items, tools));
    expect(text).toBe("I'm calling her now.");
  });

  it('ACTION_CLAIM_GUARD=off leaves the claim alone', async () => {
    const reply = ['Well, I am dialing her now.'];
    const stream = await withActionClaimCheck(streamOf(...reply), ctx(...asked), tools, undefined, {
      ACTION_CLAIM_GUARD: 'off',
    });
    expect(await textOf(stream)).toBe(reply[0]);
  });
});

/** FakeLLM keyed on a fragment of the request's last item, since the turn reminder rides on the user's words. */
class ScriptLLM extends voice.testing.FakeLLM {
  constructor(private readonly script: voice.testing.FakeLLMResponse[]) {
    super(script);
  }
  lookup(input: string) {
    const hit = this.script.find((r) => input.includes(r.input));
    return hit ? super.lookup(hit.input) : undefined;
  }
}

describe('a call request on a real agent session', () => {
  const SPOKEN = 'Can you ring my brother? His number is five five five, zero one nine nine.';
  async function run(env: Record<string, string>, tools: Record<string, unknown> = {}) {
    Object.assign(process.env, env);
    const model = new ScriptLLM([
      {
        input: 'ring my brother',
        content:
          "Okay, I'm calling him right now. I'll let you know as soon as I get ahold of him.",
      },
    ]);
    const agent = new PersonaVoiceAgent('You are Ferni.', {
      tools: tools as unknown as llm.ToolContext,
      skipGreeting: true,
    });
    const session = new voice.AgentSession({ llm: model, userData: { personaId: 'ferni' } });
    await session.start({ agent });
    const turn = session.run({ userInput: SPOKEN });
    await turn.wait();
    const words = turn.events
      .filter((e) => e.type === 'message')
      .map((e) => (e as { item: llm.ChatMessage }).item.textContent)
      .join(' ');
    await session.close();
    return words;
  }

  it('with no call tool, Ferni says he cannot place the call and offers help instead', async () => {
    const words = await run({});
    expect(words).not.toMatch(/calling him|get ahold/i);
    expect(words).toMatch(/can't actually make calls for you/);
  });

  it('with a reminder tool open, he offers to set a reminder to call', async () => {
    const setReminder = llm.tool({
      description: 'Set a reminder.',
      parameters: z.object({ what: z.string() }),
      execute: async () => 'set',
    });
    expect(await run({}, { setReminder })).toMatch(
      /can't actually make calls.*remind you to do it/
    );
  });

  it('with the guard off, the false claim is spoken (the prod call)', async () => {
    expect(await run({ ACTION_CLAIM_GUARD: 'off' })).toMatch(/calling him right now/);
  });
});
