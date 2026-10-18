/**
 * Porch light at 2am (PORCH_LIGHT=on, off by default): when the caller
 * starts a call in their own small hours (23:00 to 04:59 local), Ferni
 * answers the way you would with someone awake at that hour: quieter, slower,
 * shorter sentences, the same warmth. The web app lights a lamp around the
 * avatar for the same calls (apps/web/src/ui/porch-light.ui.ts).
 *
 * Two small changes, both only on the call the caller started:
 * - one line in the turn reminder (turn-request.ts) asking for a softer,
 *   simpler delivery. It never names the hour, the night or sleep: Ferni
 *   brings none of that up unless the caller does;
 * - a gentler voice: this module only marks the call lit (ferni-energy.ts);
 *   how much slower and quieter is attune.ts's LATE_NIGHT, the second of its
 *   layers (persona, late night, caller), so attune stays the single owner of
 *   pace and loudness.
 *
 * The decision is made once, from the caller's time zone (userData
 * .callerTimezone, sent by their browser) at the start of the call. No known
 * zone: nothing changes. When the caller needs him (hard news, a crisis, real
 * distress) both go back to normal for the rest of the call: full presence,
 * never sleepy-sounding.
 *
 * @module agents/personas/porch-light
 */

import type { llm } from '@livekit/agents';

import { setPorchLight } from '../../speech/tts-gateway/director/ferni-energy.js';
import { isValidTimeZone } from '../../utils/time-zone.js';
import { createLogger } from '../../utils/safe-logger.js';
import { TURN_CONTEXT_HEADER } from '../multi-agent/turn-intelligence.js';
import { callerNeedsHim, localClock } from './ferni-state.js';
import { understandingFor } from './turn-understanding.js';

const log = createLogger({ module: 'PorchLight' });

export function porchLightEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.PORCH_LIGHT === 'on' || env.PORCH_LIGHT === 'true';
}

/** 23:00 to 04:59. */
export function inQuietHours(hour: number): boolean {
  return hour >= 23 || hour < 5;
}

/** The turn reminder line. No hour, no night, no sleep: see the module note. */
export const PORCH_LIGHT_NOTE =
  '[Keep your voice low and gentle: short, simple sentences, an unhurried pace, softer energy, the same warmth.]';

interface CallState {
  lit: boolean;
  needed: boolean;
}
const calls = new WeakMap<object, CallState>();

interface UserDataView {
  personaId?: string;
  callerTimezone?: string;
  services?: { sessionId?: string; sessionStartTime?: number };
}

/** Whether the call started in the caller's quiet hours; false with no known zone. */
export function startedInQuietHours(userData: UserDataView, now: Date): boolean {
  const zone = userData.callerTimezone;
  if (!isValidTimeZone(zone)) return false;
  const started = new Date(userData.services?.sessionStartTime ?? now.getTime());
  return inQuietHours(localClock(started, zone).hour);
}

function lastCallerTurn(chatCtx: llm.ChatContext): string {
  for (let i = chatCtx.items.length - 1; i >= 0; i--) {
    const item = chatCtx.items[i];
    if (item.type !== 'message' || item.role !== 'user') continue;
    const text = item.textContent ?? '';
    if (text && !text.startsWith(TURN_CONTEXT_HEADER)) return text;
  }
  return '';
}

/** This call's state, decided once from when the call started. */
function callFor(session: object, userData: UserDataView, now: Date): CallState {
  let call = calls.get(session);
  if (!call) {
    call = { lit: startedInQuietHours(userData, now), needed: false };
    calls.set(session, call);
    if (call.lit) log.info({ sessionId: userData.services?.sessionId }, 'PORCH_LIGHT on');
  }
  return call;
}

/** Hard news, a crisis or distress: full presence for the rest of the call. */
function noteNeed(call: CallState, session: object, said: string, careful: boolean): void {
  if (call.needed) return;
  if (!careful && !callerNeedsHim(said, understandingFor(session, said)?.mood)) return;
  call.needed = true;
  const { userData } = session as { userData?: UserDataView };
  log.info({ sessionId: userData?.services?.sessionId }, 'PORCH_LIGHT off: full presence');
}

/**
 * This turn's porch light line, and the Director's gentler voice. Empty, and
 * the voice as normal, when the flag is off, another persona speaks, the call
 * didn't start in the caller's quiet hours, or the caller needs him.
 */
export function porchLightNote(
  chatCtx: llm.ChatContext,
  session: object,
  options: { careful?: boolean; now?: Date; env?: Record<string, string | undefined> } = {}
): string {
  const userData = ((session as { userData?: unknown }).userData ?? {}) as UserDataView;
  const sessionId = userData.services?.sessionId;
  const ferni = userData.personaId === undefined || userData.personaId === 'ferni';
  let lit = false;
  if (ferni && porchLightEnabled(options.env)) {
    const call = callFor(session, userData, options.now ?? new Date());
    if (call.lit) noteNeed(call, session, lastCallerTurn(chatCtx), options.careful === true);
    lit = call.lit && !call.needed;
  }
  if (sessionId) setPorchLight(sessionId, lit);
  return lit ? PORCH_LIGHT_NOTE : '';
}
