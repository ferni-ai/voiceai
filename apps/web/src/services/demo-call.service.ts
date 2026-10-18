/**
 * Demo call: a short voice call with Ferni for a visitor who is not signed in.
 *
 * Asks for the microphone, gets a demo room from `/demo-token` (the server
 * rate-limits and time-limits it), and joins it with the LiveKit client that
 * index.html already loads (window.LiveKit, as connection.service.ts does), so
 * nothing here adds the SDK to the startup bundle. The claim token goes where
 * demo-claim.service.ts already looks, so signing in afterwards claims this
 * conversation through the existing flow.
 * Used by ui/try-first.ui.ts behind the try-first flag.
 *
 * @module services/demo-call
 */

import { DEMO_KEYS } from '../config/storage-keys.js';
import { createLogger } from '../utils/logger.js';
import {
  AGENT_JOIN_TIMEOUT_MS,
  isAgentParticipant,
  waitForAgent,
  type PresenceParticipant,
  type PresenceRoom,
} from './agent-presence.js';

const log = createLogger('DemoCall');

/** Past the server's demo length, hang up ourselves in case the room never closes. */
export const DEMO_END_GRACE_MS = 30_000;
const DEFAULT_DEMO_MINUTES = 3;
const MAX_DEMO_MINUTES = 10;

/** Why a demo call could not start. */
export type DemoCallFailure = 'used_up' | 'cooldown' | 'mic_blocked' | 'unavailable';

export class DemoCallError extends Error {
  constructor(
    readonly failure: DemoCallFailure,
    cause?: unknown
  ) {
    super(`Demo call could not start: ${failure}`, { cause });
    this.name = 'DemoCallError';
  }
}

/** The part of a LiveKit room a demo call needs. */
export interface DemoRoom {
  connect(url: string, token: string): Promise<void>;
  enableMicrophone(): Promise<void>;
  /** Resolves once Ferni is in the room; rejects if he doesn't come within `timeoutMs`. */
  waitForAgent(timeoutMs: number): Promise<void>;
  /** Calls `onEnd` when the room closes or Ferni leaves it. */
  onEnd(onEnd: () => void): void;
  /** Calls `onChange(canPlay)` now and whenever the browser allows or blocks call audio. */
  onPlaybackChange(onChange: (canPlay: boolean) => void): void;
  /** Starts blocked audio; call it inside a tap. */
  startAudio(): Promise<void>;
  disconnect(): Promise<void>;
}

export interface DemoCallDeps {
  fetchFn?: typeof fetch;
  createRoom?: () => DemoRoom;
  requestMicrophone?: () => Promise<void>;
}

export interface DemoCall {
  /** Hang up. Safe to call more than once. */
  end(): void;
  /** Resolves once the call is over, however it ended. */
  ended: Promise<void>;
  /** Called with true while the browser blocks Ferni's audio (iPhone Safari autoplay). */
  onPlaybackBlocked(onChange: (blocked: boolean) => void): void;
  /** Plays blocked audio; call it from the visitor's tap. */
  resumeAudio(): Promise<void>;
}

type DemoTokenResponse = NonNullable<ReturnType<typeof parseDemoToken>>;

function parseDemoToken(body: unknown) {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.token !== 'string' || typeof b.url !== 'string' || typeof b.room !== 'string')
    return null;
  const minutes =
    typeof b.expires_in_minutes === 'number' ? b.expires_in_minutes : DEFAULT_DEMO_MINUTES;
  return {
    token: b.token,
    url: b.url,
    room: b.room,
    claimToken: typeof b.claim_token === 'string' ? b.claim_token : null,
    agentDispatched: b.agent_dispatched !== false,
    minutes: Math.min(Math.max(minutes, 1), MAX_DEMO_MINUTES),
  };
}

async function askForMicrophone(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  for (const track of stream.getTracks()) track.stop();
}

/** The slice of the UMD LiveKit Room (window.LiveKit) this uses. */
export interface UmdRoom extends PresenceRoom {
  readonly canPlaybackAudio: boolean;
  localParticipant: { setMicrophoneEnabled(enabled: boolean): Promise<unknown> };
  connect(url: string, token: string): Promise<void>;
  disconnect(): Promise<void>;
  startAudio(): Promise<void>;
  on(event: string, callback: (...args: never[]) => void): unknown;
  off(event: string, callback: (...args: never[]) => void): unknown;
}

const umdRoom = (): UmdRoom => new window.LiveKit.Room() as unknown as UmdRoom;

/** A DemoRoom over a LiveKit room. Event names are livekit-client's RoomEvent values. */
export function liveKitDemoRoom(makeRoom: () => UmdRoom = umdRoom): DemoRoom {
  const room = makeRoom();
  const players: HTMLMediaElement[] = [];
  room.on('trackSubscribed', (track: { kind: string; attach(): HTMLMediaElement }) => {
    if (track.kind !== 'audio') return;
    const el = track.attach();
    el.hidden = true;
    document.body.appendChild(el);
    players.push(el);
  });
  const removePlayers = (): void => {
    for (const el of players.splice(0)) el.remove();
  };
  return {
    connect: (url, token) => room.connect(url, token),
    enableMicrophone: async () => {
      await room.localParticipant.setMicrophoneEnabled(true);
      // Safari can refuse playback once the tap is spent; canPlaybackAudio then shows "Tap to hear".
      await room.startAudio().catch((error: unknown) => {
        log.warn('Audio playback blocked until a tap', { error: String(error) });
      });
    },
    waitForAgent: async (timeoutMs) => {
      await waitForAgent(room, timeoutMs);
    },
    onEnd: (onEnd) => {
      room.on('disconnected', () => {
        removePlayers();
        onEnd();
      });
      room.on('participantDisconnected', (participant: PresenceParticipant) => {
        if (isAgentParticipant(participant)) onEnd();
      });
    },
    onPlaybackChange: (onChange) => {
      room.on('audioPlaybackChanged', () => onChange(room.canPlaybackAudio));
      onChange(room.canPlaybackAudio);
    },
    startAudio: () => room.startAudio(),
    disconnect: async () => {
      await room.disconnect();
      removePlayers();
    },
  };
}

function rememberClaim(demo: DemoTokenResponse): void {
  if (!demo.claimToken) return;
  try {
    localStorage.setItem(DEMO_KEYS.CLAIM_TOKEN, demo.claimToken);
    localStorage.setItem(DEMO_KEYS.ROOM_NAME, demo.room);
    localStorage.setItem(DEMO_KEYS.SESSION_TIME, String(Date.now()));
  } catch (error) {
    log.warn('Could not store the demo claim token; sign-in will not carry this call over', {
      error: String(error),
    });
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch (error) {
    log.warn('Demo token response was not JSON', { status: response.status, error: String(error) });
    return null;
  }
}

async function fetchDemoToken(fetchFn: typeof fetch): Promise<DemoTokenResponse> {
  let response: Response;
  try {
    response = await fetchFn('/demo-token?persona_id=ferni');
  } catch (error) {
    throw new DemoCallError('unavailable', error);
  }
  if (response.status === 429) {
    const body = await readJson(response);
    const reason =
      typeof body === 'object' && body !== null ? (body as { error?: unknown }).error : undefined;
    throw new DemoCallError(reason === 'daily_limit' ? 'used_up' : 'cooldown');
  }
  if (!response.ok) throw new DemoCallError('unavailable', new Error(`HTTP ${response.status}`));
  const demo = parseDemoToken(await readJson(response));
  if (!demo) throw new DemoCallError('unavailable', new Error('Malformed demo token response'));
  if (!demo.agentDispatched)
    throw new DemoCallError('unavailable', new Error('Agent not dispatched'));
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
  rememberClaim(demo);

  const room = (deps.createRoom ?? liveKitDemoRoom)();
  let finish: () => void = () => undefined;
  const ended = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let over = false;
  let hardCap: ReturnType<typeof setTimeout> | null = null;
  const end = (): void => {
    if (over) return;
    over = true;
    if (hardCap) clearTimeout(hardCap);
    room.disconnect().catch((error: unknown) => {
      log.warn('Demo room disconnect failed', { error: String(error) });
    });
    finish();
  };
  room.onEnd(end);

  try {
    await room.connect(demo.url, demo.token);
    await room.enableMicrophone();
    await room.waitForAgent(AGENT_JOIN_TIMEOUT_MS);
    if (over) throw new Error('Demo room closed while connecting');
  } catch (error) {
    end();
    throw new DemoCallError('unavailable', error);
  }
  hardCap = setTimeout(
    () => {
      log.info('Demo call reached its time limit; hanging up', { room: demo.room });
      end();
    },
    demo.minutes * 60_000 + DEMO_END_GRACE_MS
  );
  log.info('Demo call started', { room: demo.room, minutes: demo.minutes });
  return {
    end,
    ended,
    onPlaybackBlocked: (onChange) =>
      room.onPlaybackChange((canPlay) => onChange(!over && !canPlay)),
    resumeAudio: () => room.startAudio(),
  };
}
