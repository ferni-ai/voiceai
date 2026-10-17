/**
 * Demo call: a short voice call with Ferni for a visitor who is not signed in.
 *
 * Asks for the microphone, gets a demo room from `/demo-token` (the server
 * rate-limits and time-limits it), and joins it with livekit-client. The
 * claim token goes where demo-claim.service.ts already looks, so signing in
 * afterwards claims this conversation through the existing flow.
 *
 * Used by ui/try-first.ui.ts behind the try-first flag.
 *
 * @module services/demo-call
 */

import { Room, RoomEvent, Track } from 'livekit-client';
import { DEMO_KEYS } from '../config/storage-keys.js';
import { createLogger } from '../utils/logger.js';
import { isAgentParticipant } from './agent-presence.js';

const log = createLogger('DemoCall');

/** Why a demo call could not start. */
export type DemoCallFailure = 'used_up' | 'mic_blocked' | 'unavailable';

export class DemoCallError extends Error {
  constructor(readonly failure: DemoCallFailure, cause?: unknown) {
    super(`Demo call could not start: ${failure}`, { cause });
    this.name = 'DemoCallError';
  }
}

/** The part of a LiveKit room a demo call needs. */
export interface DemoRoom {
  connect(url: string, token: string): Promise<void>;
  enableMicrophone(): Promise<void>;
  /** Calls `onEnd` once when the room closes or Ferni leaves it. */
  onEnd(onEnd: () => void): void;
  disconnect(): Promise<void>;
}

export interface DemoCallDeps {
  fetchFn?: typeof fetch;
  createRoom?: () => DemoRoom;
  requestMicrophone?: () => Promise<void>;
  now?: () => number;
}

export interface DemoCall {
  /** Hang up. Safe to call more than once. */
  end(): void;
  /** Resolves once the call is over, however it ended. */
  ended: Promise<void>;
}

interface DemoTokenResponse {
  token: string;
  url: string;
  room: string;
  claimToken: string | null;
}

function parseDemoToken(body: unknown): DemoTokenResponse | null {
  if (typeof body !== 'object' || body === null) return null;
  const { token, url, room, claim_token: claim } = body as Record<string, unknown>;
  if (typeof token !== 'string' || typeof url !== 'string' || typeof room !== 'string') return null;
  return { token, url, room, claimToken: typeof claim === 'string' ? claim : null };
}

async function askForMicrophone(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  for (const track of stream.getTracks()) track.stop();
}

function liveKitDemoRoom(): DemoRoom {
  const room = new Room();
  const players: HTMLMediaElement[] = [];
  room.on(RoomEvent.TrackSubscribed, (track) => {
    if (track.kind !== Track.Kind.Audio) return;
    const el = track.attach();
    el.hidden = true;
    document.body.appendChild(el);
    players.push(el);
  });
  return {
    connect: (url, token) => room.connect(url, token),
    enableMicrophone: async () => {
      await room.startAudio();
      await room.localParticipant.setMicrophoneEnabled(true);
    },
    onEnd: (onEnd) => {
      room.on(RoomEvent.Disconnected, onEnd);
      room.on(RoomEvent.ParticipantDisconnected, (participant) => {
        if (isAgentParticipant(participant)) onEnd();
      });
    },
    disconnect: async () => {
      await room.disconnect();
      for (const el of players.splice(0)) el.remove();
    },
  };
}

function rememberClaim(demo: DemoTokenResponse, now: number): void {
  if (!demo.claimToken) return;
  try {
    localStorage.setItem(DEMO_KEYS.CLAIM_TOKEN, demo.claimToken);
    localStorage.setItem(DEMO_KEYS.ROOM_NAME, demo.room);
    localStorage.setItem(DEMO_KEYS.SESSION_TIME, String(now));
  } catch (error) {
    log.warn('Could not store the demo claim token; sign-in will not carry this call over', {
      error: String(error),
    });
  }
}

async function fetchDemoToken(fetchFn: typeof fetch): Promise<DemoTokenResponse> {
  let response: Response;
  try {
    response = await fetchFn('/demo-token?persona_id=ferni');
  } catch (error) {
    throw new DemoCallError('unavailable', error);
  }
  if (response.status === 429) throw new DemoCallError('used_up');
  if (!response.ok) throw new DemoCallError('unavailable', new Error(`HTTP ${response.status}`));
  const demo = parseDemoToken(await response.json().catch((error: unknown) => {
    log.warn('Demo token response was not JSON', { error: String(error) });
    return null;
  }));
  if (!demo) throw new DemoCallError('unavailable', new Error('Malformed demo token response'));
  return demo;
}

/** Start a demo call. Rejects with DemoCallError when it cannot start. */
export async function startDemoCall(deps: DemoCallDeps = {}): Promise<DemoCall> {
  const fetchFn = deps.fetchFn ?? ((input, init) => fetch(input, init));
  try {
    await (deps.requestMicrophone ?? askForMicrophone)();
  } catch (error) {
    throw new DemoCallError('mic_blocked', error);
  }

  const demo = await fetchDemoToken(fetchFn);
  rememberClaim(demo, (deps.now ?? Date.now)());

  const room = (deps.createRoom ?? liveKitDemoRoom)();
  let finish: () => void = () => undefined;
  const ended = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let over = false;
  const end = (): void => {
    if (over) return;
    over = true;
    room.disconnect().catch((error: unknown) => {
      log.warn('Demo room disconnect failed', { error: String(error) });
    });
    finish();
  };
  room.onEnd(end);

  try {
    await room.connect(demo.url, demo.token);
    await room.enableMicrophone();
  } catch (error) {
    end();
    throw new DemoCallError('unavailable', error);
  }
  log.info('Demo call started', { room: demo.room });
  return { end, ended };
}
