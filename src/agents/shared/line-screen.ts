/**
 * Who picked up: a person or a voicemail greeting.
 *
 * Once a call Ferni placed is answered (outbound-opener.ts), Ferni listens for
 * up to ~4 s before speaking. A person says "Hello?" and waits; a machine talks
 * on ("Hi, you've reached Doug, leave a message after the tone").
 * On a machine Ferni waits for the greeting to end, leaves one short message
 * with the same light AI disclosure as the opener, and hangs up: it never
 * converses with a recording. While it listens, the LLM does not reply.
 *
 * A call screener (Google/Apple: "say your name and why you're calling...
 * please stay on the line") is neither: with CALL_SCREEN_HANDLING=on Ferni
 * answers it once, in one line, then waits silently for the person to pick up
 * (normal opener) or for voicemail. It never converses with the screener.
 *
 * Off unless VOICEMAIL_DETECT=on (CALL_SCREEN_HANDLING=on adds the screener
 * step); off, the answer wait is exactly as before.
 *
 * @module agents/shared/line-screen
 */

import { getLogger } from '../../utils/safe-logger.js';
import {
  waitForCallAnswered,
  type AnswerWatchRoom,
  type OutboundParties,
} from './outbound-opener.js';

const log = getLogger().child({ module: 'line-screen' });

export function isVoicemailDetectOn(): boolean {
  return process.env.VOICEMAIL_DETECT === 'on';
}

export function isCallScreenHandlingOn(): boolean {
  return process.env.CALL_SCREEN_HANDLING === 'on';
}

const SCREENER_PHRASES =
  /\b(screening|call screen(er)?|(say|state|record) your name|your name and (the )?(reason|why)|reason for (your )?call(ing)?|why you'?re calling|stay on the line|see if (this person|they|he|she) (is |are )?available)\b/i;

const VOICEMAIL_PHRASES =
  /\b(leave (me )?(a |your )?(message|name|number)|please leave|(not|isn'?t) available|unavailable|can'?t (come to|take|get to) (the |your )?(phone|call)|(after|at) the (tone|beep)|voice ?mail|mail ?box|you'?ve reached|you have reached|record your message|get back to you|away from (the|my) phone)\b/i;

export interface LineEvidence {
  sinceAnswerMs: number;
  /** Everything transcribed so far, finals plus the latest interim. */
  text: string;
  /** How long they've been talking, counted from their first word, without a 1 s pause. */
  talkingMs: number;
  /** How long since they last made a sound (or since the answer, if they haven't). */
  silentMs: number;
}

export type Answerer = 'human' | 'voicemail';

/**
 * A person, a machine or a call screener, or undefined while it's still
 * unclear. `afterScreener`: Ferni has answered a screener and silence is
 * expected while the person decides, so silence alone is not a person.
 */
export function classifyLine(
  e: LineEvidence,
  afterScreener = false
): Answerer | 'screener' | undefined {
  const text = e.text.replace(/’/g, "'");
  if (isCallScreenHandlingOn() && SCREENER_PHRASES.test(text)) return 'screener';
  if (VOICEMAIL_PHRASES.test(text)) return 'voicemail';
  const words = e.text ? e.text.split(/\s+/).length : 0;
  // A person answers in a few words; a greeting keeps going.
  if (words >= 9 || e.talkingMs >= 3500) return 'voicemail';
  if (words > 0 && e.silentMs >= 900) return 'human'; // said hello, now waiting for us
  if (afterScreener) return undefined;
  if (e.sinceAnswerMs >= 4000) return words >= 5 || e.talkingMs >= 2500 ? 'voicemail' : 'human';
  return undefined;
}

/** The one message left on a machine: the opener's disclosure, no callback asked. */
export function voicemailMessage({
  recipientName,
  sponsorName,
  personal,
}: OutboundParties): string {
  const hi = recipientName ? `Hi ${recipientName}` : 'Hi';
  const later = "No need to call back, I'll try again another time.";
  if (!personal) {
    return `Hi, this is Ferni, an AI calling ${sponsorName ? `for ${sponsorName}` : "on someone's behalf"}. ${later}`;
  }
  return sponsorName
    ? `${hi}, it's Ferni, ${sponsorName}'s AI friend. ${sponsorName} asked me to check in, no need to call back, I'll try again another time.`
    : `${hi}, it's Ferni, an AI friend, just calling to check in. ${later}`;
}

/** The one line a call screener hears: who's calling, and why. */
export function screenerReply({ recipientName, sponsorName, personal }: OutboundParties): string {
  if (!personal) return `Hi, this is Ferni, an AI calling for ${sponsorName ?? 'someone'}.`;
  const who = sponsorName ? `${sponsorName}'s AI friend` : 'an AI friend';
  return `Hi, it's Ferni, ${who}, calling to check in${recipientName ? ` on ${recipientName}` : ''}.`;
}

// Sessions screening a call: FerniAgent.onUserTurnCompleted holds the reply.
const screening = new WeakSet<object>();

export function isScreeningCall(session: unknown): boolean {
  return typeof session === 'object' && session !== null && screening.has(session);
}

interface ScreenSession {
  on(event: string, fn: (ev: never) => void): unknown;
  off(event: string, fn: (ev: never) => void): unknown;
  say(text: string, opts?: { allowInterruptions?: boolean }): { waitForPlayout(): Promise<void> };
}

export interface LineDeps {
  hangUp(): Promise<void>;
  record(answerer: Answerer): Promise<void>;
  now?: () => number;
  tickMs?: number;
}

function listen(session: ScreenSession, now: () => number) {
  const started = now();
  let [finals, interim, speaking] = ['', '', false];
  let firstSound: number | undefined;
  let lastSound: number | undefined;
  const heard = () => {
    firstSound ??= now();
    lastSound = now();
  };
  const onText = (ev: { transcript?: string; isFinal?: boolean }) => {
    const t = ev.transcript?.trim();
    if (!t) return;
    if (ev.isFinal) [finals, interim] = [`${finals} ${t}`, ''];
    else interim = t;
    heard();
  };
  const onUser = (ev: { newState?: string }) => {
    speaking = ev.newState === 'speaking';
    heard();
  };
  session.on('user_input_transcribed', onText);
  session.on('user_state_changed', onUser);
  return {
    evidence(): LineEvidence {
      const t = now();
      const silentMs = speaking ? 0 : t - (lastSound ?? started);
      const talkingMs = firstSound !== undefined && silentMs < 1000 ? t - firstSound : 0;
      return {
        sinceAnswerMs: t - started,
        text: `${finals} ${interim}`.trim(),
        talkingMs,
        silentMs,
      };
    },
    stop() {
      session.off('user_input_transcribed', onText);
      session.off('user_state_changed', onUser);
    },
  };
}

async function poll<T>(check: () => T | undefined, tickMs: number): Promise<T> {
  for (;;) {
    const value = check();
    if (value !== undefined) return value;
    await new Promise((resolve) => {
      setTimeout(resolve, tickMs);
    });
  }
}

async function leaveMessage(
  session: ScreenSession,
  parties: OutboundParties,
  deps: LineDeps,
  ear: ReturnType<typeof listen>,
  tick: number
): Promise<void> {
  try {
    // The greeting has ended after a couple of seconds of quiet.
    await poll(() => {
      const e = ear.evidence();
      return e.silentMs >= 2000 || e.sinceAnswerMs >= 30_000 ? true : undefined;
    }, tick);
    await session.say(voicemailMessage(parties), { allowInterruptions: false }).waitForPlayout();
  } catch (error) {
    log.warn({ error: String(error) }, 'Could not leave the voicemail');
  }
  // Hang up either way: never talk with a machine.
  await deps
    .hangUp()
    .catch((error: unknown) => log.warn({ error: String(error) }, 'Hang-up failed'));
}

async function answerScreener(
  session: ScreenSession,
  parties: OutboundParties,
  ear: ReturnType<typeof listen>,
  tick: number
): Promise<void> {
  // Let the screener finish asking, then say who's calling, once.
  await poll(() => (ear.evidence().silentMs >= 700 ? true : undefined), tick);
  await session.say(screenerReply(parties), { allowInterruptions: false }).waitForPlayout();
}

/** Screen an answered line; on a machine, leave the message and hang up. */
export async function screenLine(
  session: ScreenSession,
  parties: OutboundParties,
  deps: LineDeps
): Promise<Answerer> {
  const now = deps.now ?? Date.now;
  const tick = deps.tickMs ?? 100;
  let ear = listen(session, now);
  let screener = false;
  screening.add(session);
  try {
    for (;;) {
      const heard = await poll(() => {
        const e = ear.evidence();
        // A screener that never puts anyone through: give up quietly after a minute.
        return screener && e.sinceAnswerMs >= 60_000 ? 'gave-up' : classifyLine(e, screener);
      }, tick);
      if (heard === 'gave-up') {
        await deps
          .hangUp()
          .catch((error: unknown) => log.warn({ error: String(error) }, 'Hang-up failed'));
        return 'voicemail';
      }
      if (heard !== 'screener') {
        if (heard === 'voicemail') await leaveMessage(session, parties, deps, ear, tick);
        await deps.record(heard).catch((error: unknown) => {
          log.warn({ error: String(error) }, 'Could not record who answered');
        });
        return heard;
      }
      if (!screener) await answerScreener(session, parties, ear, tick);
      // Every screener prompt after the first is let pass in silence.
      ear.stop();
      ear = listen(session, now);
      screener = true;
    }
  } finally {
    ear.stop();
    screening.delete(session);
  }
}

interface PhoneParticipant {
  identity: string;
  attributes: Record<string, string>;
}

function defaultDeps(
  room: AnswerWatchRoom & { name?: string },
  participant: PhoneParticipant,
  sessionId: string
): LineDeps {
  return {
    hangUp: async () => {
      const { RoomServiceClient } = await import('livekit-server-sdk');
      const { LIVEKIT_URL = '', LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
      const rooms = new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
      await rooms.removeParticipant(room.name ?? '', participant.identity);
    },
    record: async (answerer) => {
      const { getOutboundCallContext } =
        await import('../../intelligence/context-builders/external/outbound-call-context.js');
      const { recordAnsweredBy } = await import('../../services/outreach/answered-by.js');
      const call = getOutboundCallContext(sessionId);
      if (call) await recordAnsweredBy(call, answerer);
    },
  };
}

/**
 * Waits for the dialed phone to be answered. True when a person is on the
 * line and the opener should play; false when nobody answered or (with
 * VOICEMAIL_DETECT=on) a machine did and has already had its message.
 */
export async function personAnswered(
  room: AnswerWatchRoom & { name?: string },
  participant: PhoneParticipant,
  agent: { session: unknown },
  parties: OutboundParties,
  sessionId: string
): Promise<boolean> {
  const screen = isVoicemailDetectOn() && participant.attributes?.['sip.callStatus'] !== undefined;
  // Screening replaces the fixed pause after pickup: Ferni speaks once it knows who's there.
  if (!(await waitForCallAnswered(room, participant, undefined, screen ? 0 : undefined))) {
    log.info({ sessionId }, '📞 Outbound call not answered, no opener');
    return false;
  }
  if (!screen) return true;
  const deps = defaultDeps(room, participant, sessionId);
  const answerer = await screenLine(agent.session as ScreenSession, parties, deps).catch(
    (error: unknown) => {
      log.warn({ sessionId, error: String(error) }, 'Line screening failed; opening as usual');
      return 'human' as const;
    }
  );
  log.info({ sessionId, answerer }, '📞 Outbound call answered');
  return answerer === 'human';
}
