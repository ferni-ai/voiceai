/**
 * PRESENCE_CHECK_CAP: "you still there?" at most once per 3 minutes unless the
 * caller's audio really dropped (presence-check.ts). The two lines are the ones
 * Ferni said to a quiet caller on the 2026-10-11 dev call.
 */
import { EventEmitter } from 'node:events';
import { ReadableStream } from 'node:stream/web';

import { describe, expect, it } from 'vitest';

import {
  NO_PRESENCE_CHECK_NOTE,
  PRESENCE_CHECK_MIN_GAP_MS,
  capSilenceRequest,
  createPresenceCap,
  filterSilenceReply,
  isPresenceCheck,
  lastPresenceCheckAt,
  presenceCheckAllowed,
  presenceCheckGapMs,
  recordPresenceCheck,
  watchRemoteAudio,
} from '../presence-check.js';

const CALL_LINE_1 = 'Mm? You still there, or did the wind finally blow you away?';
const CALL_LINE_2 = 'Mm? You still there, or did the connection cut out?';
const MIN = 60_000;

function streamOf(...chunks: object[]): ReadableStream<object> {
  return new ReadableStream<object>({
    start(controller) {
      chunks.forEach((c) => controller.enqueue(c));
      controller.close();
    },
  });
}

const text = (content: string) => ({ id: 'c', delta: { role: 'assistant', content } });

async function read(stream: ReadableStream<object> | null): Promise<object[]> {
  const out: object[] = [];
  for await (const c of stream as unknown as AsyncIterable<object>) out.push(c);
  return out;
}

describe('isPresenceCheck', () => {
  it.each([
    CALL_LINE_1,
    CALL_LINE_2,
    'Are you there?',
    'You there?',
    'Still with me?',
    'Still there?',
    'Mm. Still there?',
    'Did I lose you?',
    'I think I lost you.',
    'Can you hear me?',
    'Hello?',
    'Mm. Hello?',
    'Did we get cut off?',
    'Did the call drop on you?',
    'Is anyone there?',
    '<emotion value="curious"/>You still there?',
  ])('matches %j', (line) => {
    expect(isPresenceCheck(line)).toBe(true);
  });

  it.each([
    "Mm, Sunday's good for that.",
    'Are you there yet?',
    'Is the bakery still there?',
    'Hello, Seth! Good to hear you.',
    "Still thinking about the trip, huh. I'd go for the coast.",
    'That connection to your dad really comes through.',
    'I can hear the rain where you are, I think.',
    'You were there for her, that counts.',
  ])('does not match %j', (line) => {
    expect(isPresenceCheck(line)).toBe(false);
  });
});

describe('presenceCheckAllowed / gap', () => {
  it('a second check within 3 minutes is not allowed; after 3 minutes it is', () => {
    expect(presenceCheckAllowed(undefined, 0, false)).toBe(true);
    expect(presenceCheckAllowed(0, 150_000, false, PRESENCE_CHECK_MIN_GAP_MS)).toBe(false);
    expect(presenceCheckAllowed(0, 3 * MIN, false, PRESENCE_CHECK_MIN_GAP_MS)).toBe(true);
  });

  it('with the audio dropped a check is allowed immediately', () => {
    expect(presenceCheckAllowed(0, 1_000, true, PRESENCE_CHECK_MIN_GAP_MS)).toBe(true);
  });

  it('the gap defaults to 3 minutes and PRESENCE_CHECK_MIN_GAP_MS overrides it', () => {
    expect(presenceCheckGapMs({})).toBe(180_000);
    expect(presenceCheckGapMs({ PRESENCE_CHECK_MIN_GAP_MS: '60000' })).toBe(60_000);
    expect(presenceCheckGapMs({ PRESENCE_CHECK_MIN_GAP_MS: 'soon' })).toBe(180_000);
    expect(presenceCheckGapMs({ PRESENCE_CHECK_MIN_GAP_MS: ' ' })).toBe(180_000);
  });
});

describe('capSilenceRequest + filterSilenceReply', () => {
  const request = { instructions: 'say something small', fallback: '', type: 'gentle' };

  it('inside the gap: the note is added and a presence-check reply is dropped', async () => {
    const session = {};
    recordPresenceCheck(session, 0);
    const capped = capSilenceRequest(session, request, false, 150_000);
    expect(capped.instructions).toBe(`say something small\n${NO_PRESENCE_CHECK_NOTE}`);
    expect(capped.type).toBe('gentle');
    const out = await read(
      filterSilenceReply(session, streamOf(text('Mm? '), text('You still there?')), () => 150_000)
    );
    expect(out).toEqual([]);
    expect(lastPresenceCheckAt(session)).toBe(0); // a dropped check is not recorded
  });

  it('inside the gap: a normal remark passes unchanged', async () => {
    const session = {};
    recordPresenceCheck(session, 0);
    capSilenceRequest(session, request, false, 150_000);
    const chunks = [text("Mm, Sunday's "), text('good for that.')];
    expect(await read(filterSilenceReply(session, streamOf(...chunks), () => 150_000))).toEqual(
      chunks
    );
  });

  it('first check, or after the gap: it passes and is recorded', async () => {
    const session = {};
    expect(capSilenceRequest(session, request, false, 10_000)).toBe(request);
    const chunks = [text(CALL_LINE_1)];
    expect(await read(filterSilenceReply(session, streamOf(...chunks), () => 10_000))).toEqual(
      chunks
    );
    expect(lastPresenceCheckAt(session)).toBe(10_000);

    expect(capSilenceRequest(session, request, false, 10_000 + 3 * MIN)).toBe(request);
    const later = [text(CALL_LINE_2)];
    expect(
      await read(filterSilenceReply(session, streamOf(...later), () => 10_000 + 3 * MIN))
    ).toEqual(later);
    expect(lastPresenceCheckAt(session)).toBe(10_000 + 3 * MIN);
  });

  it('with the audio dropped a check inside the gap passes', async () => {
    const session = {};
    recordPresenceCheck(session, 0);
    expect(capSilenceRequest(session, request, true, 5_000)).toBe(request);
    const chunks = [text('Did I lose you?')];
    expect(await read(filterSilenceReply(session, streamOf(...chunks), () => 5_000))).toEqual(
      chunks
    );
  });

  it('a dropped check keeps its tool calls', async () => {
    const session = {};
    recordPresenceCheck(session, 0);
    capSilenceRequest(session, request, false, 1_000);
    const tool = { id: 't', delta: { toolCalls: [{ name: 'playMusic' }] } };
    expect(
      await read(filterSilenceReply(session, streamOf(text('You there?'), tool), () => 1_000))
    ).toEqual([tool]);
  });

  it('a fallback line that is a check is cleared inside the gap', () => {
    const session = {};
    recordPresenceCheck(session, 0);
    expect(capSilenceRequest(session, { fallback: 'Still there?' }, false, 1_000).fallback).toBe(
      ''
    );
    expect(capSilenceRequest(session, { fallback: 'Take your time.' }, false, 1_000).fallback).toBe(
      'Take your time.'
    );
  });

  it('replies are untouched when nothing is armed, or the arming went stale', async () => {
    const session = {};
    const s = streamOf(text('You still there?'));
    expect(filterSilenceReply(session, s)).toBe(s); // never armed: same stream back
    recordPresenceCheck(session, 0);
    capSilenceRequest(session, request, false, 1_000);
    const stale = streamOf(text('You still there?'));
    expect(filterSilenceReply(session, stale, () => 1_000 + 60_000)).toBe(stale);
  });
});

describe('watchRemoteAudio', () => {
  function room(audio: { muted?: boolean } | null) {
    const pubs = new Map<string, unknown>();
    if (audio) pubs.set('TR_a', { kind: 1, muted: audio.muted ?? false });
    const caller = { identity: 'caller', trackPublications: pubs };
    return Object.assign(new EventEmitter(), {
      remoteParticipants: new Map<string, unknown>([['caller', caller]]),
      caller,
      pubs,
    });
  }

  it('a caller with a live microphone is not a drop', () => {
    const w = watchRemoteAudio(room({}));
    expect(w.dropped(Date.now())).toBe(false);
  });

  it('a muted or unpublished microphone is a drop', () => {
    expect(watchRemoteAudio(room({ muted: true })).dropped()).toBe(true);
    const r = room({});
    const w = watchRemoteAudio(r);
    r.pubs.clear(); // trackUnpublished
    expect(w.dropped()).toBe(true);
  });

  it('poor or lost connection quality for the caller is a drop until it recovers + 30 s', () => {
    const r = room({});
    const w = watchRemoteAudio(r);
    r.emit('connectionQualityChanged', 0, r.caller); // QUALITY_POOR
    expect(w.dropped()).toBe(true);
    r.emit('connectionQualityChanged', 1, r.caller); // QUALITY_GOOD
    expect(w.dropped()).toBe(true); // recent
    expect(w.dropped(Date.now() + 31_000)).toBe(false);
  });

  it("the agent's own quality changes are ignored", () => {
    const r = room({});
    const w = watchRemoteAudio(r);
    r.emit('connectionQualityChanged', 3, { identity: 'agent-self' });
    expect(w.dropped()).toBe(false);
  });

  it('a reconnecting room is a drop; stop() removes the listeners', () => {
    const r = room({});
    const w = watchRemoteAudio(r);
    r.emit('reconnecting');
    expect(w.dropped(Date.now() + 120_000)).toBe(true);
    w.stop();
    expect(r.listenerCount('reconnecting')).toBe(0);
    expect(r.listenerCount('connectionQualityChanged')).toBe(0);
  });

  it('no room: no evidence of a drop', () => {
    expect(watchRemoteAudio(undefined).dropped()).toBe(false);
  });
});

describe('createPresenceCap', () => {
  it('flag off: requests are unchanged and nothing is armed', async () => {
    const session = {};
    const cap = createPresenceCap(session, undefined, {});
    recordPresenceCheck(session, Date.now());
    const request = { instructions: 'say something small', fallback: 'Still there?' };
    expect(cap.cap(request)).toBe(request);
    const s = streamOf(text('You still there?'));
    expect(filterSilenceReply(session, s)).toBe(s);
  });

  it('flag on: a second request within the gap is capped; callerSpoke disarms', async () => {
    const session = {};
    const cap = createPresenceCap(session, undefined, { PRESENCE_CHECK_CAP: 'on' });
    recordPresenceCheck(session, Date.now());
    const capped = cap.cap({ instructions: 'say something small' });
    expect(capped.instructions).toContain(NO_PRESENCE_CHECK_NOTE);
    cap.callerSpoke();
    const s = streamOf(text('You still there?'));
    expect(filterSilenceReply(session, s)).toBe(s); // the caller's own turn is never held
    cap.stop();
  });
});
