/**
 * Plays short pre-rendered voice clips ("mm-hm", "yeah") on their own track.
 *
 * A backchannel spoken through the agent's TTS becomes an agent turn: it
 * enters the chat history, flips the agent to "speaking", and takes a TTS
 * round trip. A cached clip on a side track does none of that and starts in
 * milliseconds. Clips come from the conversational audio cache (24 kHz PCM in
 * the persona's voice, rendered at worker warmup); the mixer runs at 48 kHz.
 *
 * @module agents/integrations/clip-player
 */

import { voice } from '@livekit/agents';
import { AudioFrame, AudioResampler, type Room } from '@livekit/rtc-node';
import { createLogger } from '../../utils/safe-logger.js';
import { stayQuietOn } from '../shared/call-farewell.js';
import { synthHum, synthSnore, synthWhistle } from './presence-sounds.js';
import {
  createPresenceWatcher,
  LONG_QUIET,
  presenceHumEnabled,
  presenceSnoreEnabled,
  presenceSoundsEnabled,
} from './presence-watcher.js';
import { startToolHum } from './tool-hum.js';
import { presenceSilenceIsHeavy } from './presence-heavy.js';
import { startVoicedPresence, voicedPresenceEnabled } from './voiced-presence.js';
import { presenceClipName, presenceClipPickers } from './presence-clips.js';
import { reactionSidetrackDirect, startDirectClips } from './direct-clip-track.js';
import { LAUGH_CLIP } from './backchannel-policy.js';
import { recordQuirk } from '../../services/session/quirk-log.js';
import { withBackchannelSignal } from './backchannel-signal.js';
import { createSoundSignal, liveReactionKind, withSoundSignal } from './sound-signal.js';
import { createDataMessageSender } from '../shared/data-message-envelope.js';
import { avatarListenSignalsEnabled } from '../realtime/listen-turn-signals.js';
import { noteClipCut, withTimelineSounds } from '../shared/call-timeline.js';
import { backchannelTimingEnabled, timedLivePlay } from './backchannel-timing.js';
import {
  createSoundGate,
  liveSoundKind,
  soundConductorMode,
  type ConductedSound,
  type SoundGate,
} from './sound-conductor.js';

const log = createLogger({ module: 'ClipPlayer' });

type Opts = { pauseStartedAt?: number };

const CLIP_RATE = 24000;
const MIX_RATE = 48000;
const FRAME_SAMPLES = CLIP_RATE / 100; // 10 ms

/** 24 kHz mono s16le PCM → 48 kHz frames for the mixer. */
export async function* pcmToFrames(pcm: ArrayBuffer): AsyncGenerator<AudioFrame> {
  const samples = new Int16Array(pcm, 0, Math.floor(pcm.byteLength / 2));
  const resampler = new AudioResampler(CLIP_RATE, MIX_RATE, 1);
  for (let i = 0; i < samples.length; i += FRAME_SAMPLES) {
    const chunk = samples.slice(i, i + FRAME_SAMPLES);
    const frame = new AudioFrame(chunk, CLIP_RATE, 1, chunk.length);
    for (const out of resampler.push(frame)) yield out;
  }
  for (const out of resampler.flush()) yield out;
}

/** How far ahead of real time paced silence runs: a cushion against timer jitter. */
export const PACED_LEAD_MS = 60;

/** CLIP_TRACK_PACED=on: feed the keep-alive silence in real time (see silence()). */
export function clipTrackPaced(env: Record<string, string | undefined> = process.env): boolean {
  return env.CLIP_TRACK_PACED === 'on';
}

/**
 * Endless silence at mixer rate. The SDK's AudioMixer (rtc-node) ends itself
 * once its last stream is removed, and later play() calls then fail inside a
 * background task while still returning a handle: only the first clip of a
 * session was ever heard (measured 2026-09-28). A silent stream that never
 * ends keeps the mixer open.
 *
 * Unpaced, it yields as fast as the mixer takes it, so the player's 400 ms
 * AudioSource queue sits full of silence and every clip waits behind it:
 * play() to the wire took 688 ms (rtc-node mixer + source, n=8, 2026-10-10),
 * and 82% of mid-turn backchannels in dev evals started after the caller was
 * already talking again. Paced, each 100 ms block is released when it is due
 * (PACED_LEAD_MS early), so almost nothing is queued ahead of a clip: 219-242
 * ms to the wire.
 *
 * While a clip plays (`busy`), the silence runs unpaced again, so the mixer
 * fills the source queue with the clip at once: a 60 ms cushion alone would
 * break a clip up whenever the event loop stalls (VAD lag on dev ran ~470 ms
 * p50). A clip after that one still reaches the wire in ~200 ms (tested).
 */
export async function* silence(
  paced = clipTrackPaced(),
  busy: () => boolean = () => false
): AsyncGenerator<AudioFrame> {
  const samples = MIX_RATE / 10; // 100 ms, the mixer's block
  let due = Date.now();
  for (;;) {
    if (paced && !busy()) {
      const wait = due - PACED_LEAD_MS - Date.now();
      if (wait > 0) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, wait);
        });
      }
    }
    if (paced) due += 100;
    yield new AudioFrame(new Int16Array(samples), MIX_RATE, 1, samples);
  }
}

export class ClipPlayer {
  private readonly player = new voice.BackgroundAudioPlayer();
  private started = false;
  private current: voice.PlayHandle | null = null;

  async start(room: Room, session: voice.AgentSession): Promise<void> {
    await this.player.start({ room, agentSession: session });
    this.player.play({ source: silence(clipTrackPaced(), () => this.playing) });
    this.started = true;
  }

  /** True while a clip is still playing. */
  get playing(): boolean {
    return this.current !== null && !this.current.done();
  }

  /** Play one clip; returns false when not started or another clip is playing. */
  play(pcm: ArrayBuffer, volume = 1): boolean {
    if (!this.started || this.playing) return false;
    try {
      this.current = this.player.play({ source: pcmToFrames(pcm), volume });
      return true;
    } catch (error) {
      log.warn({ error: String(error) }, 'clip playback failed');
      return false;
    }
  }

  stop(): void {
    this.current?.stop();
  }

  /**
   * Never rejects: it runs from session cleanup, where a rejection reached the
   * global unhandled-rejection handler. At hang-up the room often goes first:
   * a disconnected room aborts the track unpublish ("This operation was
   * aborted") or has already dropped the track ("track not found").
   */
  async close(): Promise<void> {
    this.started = false;
    try {
      await this.player.close();
    } catch (error) {
      const roomGone =
        (error as { name?: string })?.name === 'AbortError' ||
        String(error).includes('track not found');
      if (roomGone)
        log.debug({ error: String(error) }, 'clip player closed after the room went away');
      else log.warn({ error: String(error) }, 'clip player close failed');
    }
  }
}

/** Backchannels are softer than speech. */
const BACKCHANNEL_VOLUME = 0.75;

/**
 * Start a clip player for a session's backchannels. Returns the `playClip`
 * callback for live backchanneling, or null when BACKCHANNEL_CLIPS=off or the
 * track could not be published (callers fall back to spoken backchannels).
 *
 * REACTION_SIDETRACK=direct: backchannel, laugh and opening clips play on a
 * mixer-free track (direct-clip-track.ts, ~56 ms to the wire instead of
 * ~650); presence sounds and the tool hum stay on the mixer track, except
 * VOICED_PRESENCE takes (voiced-presence.ts), which play direct. One clip at a
 * time across both, and one lastPlayedAt for all of them. SOUND_CONDUCTOR:
 * every clip on either track asks the call's conductor first (sound-conductor.ts).
 */
export async function startBackchannelClips(
  room: Room,
  session: voice.AgentSession,
  personaId: () => string,
  getClip: (text: string, personaId: string) => ArrayBuffer | null
): Promise<{
  playClip: (text: string, opts?: { pauseStartedAt?: number }) => boolean;
  lastPlayedAt: () => number;
  /** Cut a clip played moments ago (the caller carried on). True if cut. */
  cancelFresh: () => boolean;
  /**
   * play() to the wire for a clip: measured on the direct track (the last
   * clip), estimated on the mixer track (~650 ms; ~220 ms with #692's pacing).
   */
  wireDelayMs: () => number;
  /** playClip for the turn-opening clip: reports it as an 'opener' (CLIENT_SIGNALS_V2). */
  openerClip: (text: string) => boolean;
  /** playClip for the slow-turn "Mm" (slow-turn-sound.ts), conducted as its own kind. */
  slowTurnClip: (text: string) => boolean;
  /** What live backchanneling needs (live-backchanneling-integration.ts). */
  live: {
    playClip: (text: string, opts?: { pauseStartedAt?: number }) => boolean;
    cancelClip: () => boolean;
  };
  close: () => Promise<void>;
} | null> {
  if (process.env.BACKCHANNEL_CLIPS === 'off') return null;
  const player = new ClipPlayer();
  try {
    await player.start(room, session);
  } catch (error) {
    log.warn({ error: String(error) }, 'clip player failed to start');
    return null;
  }
  let lastPlayedAt = 0;
  // The clip that last played: a take, when a variation picked one (its sound_played label).
  let lastClip = '';
  const direct = reactionSidetrackDirect() ? await startDirectClips(room, session) : null;
  const mixerWireMs = (): number => (process.env.CLIP_TRACK_PACED === 'on' ? 220 : 650);
  const directWireMs = (): number => direct?.lastWireMs ?? 60;
  const wireDelayMs = (): number => (direct ? directWireMs() : mixerWireMs());
  // CLIENT_SIGNALS_V2: sound_played for every non-speech clip (sound-signal.ts); null when off.
  const sound = createSoundSignal(createDataMessageSender(room));
  // CALL_TIMELINE: every clip that plays is recorded at the gate (call-timeline.ts).
  const gate = withTimelineSounds(session, createSoundGate(soundConductorMode()), () =>
    sessionIdOf(session)
  );
  const stopPresence = startPresenceSounds(
    session,
    player,
    () => direct?.playing ?? false,
    personaId,
    (kind, label) => sound?.(kind, mixerWireMs(), label),
    gate
  );
  // The synthesized hum on the mixer; a voiced take is conducted in voiced-presence.ts.
  const humPlayer = {
    play: (pcm: ArrayBuffer, volume?: number) =>
      gate('tool_hum', 'hum', () => player.play(pcm, volume)),
    stop: () => player.stop(),
  };
  const stopToolHum = startToolHum(session, humPlayer, undefined, undefined, (onDirect) =>
    sound?.('hum', onDirect ? directWireMs() : mixerWireMs(), 'tool hum')
  );
  const voiced = startVoicedPresence({
    session,
    direct,
    mixerBusy: () => player.playing,
    getClip,
    personaId,
    onSound: (kind, label) => sound?.(kind, directWireMs(), label),
    gate,
  });
  // `kind` unset: a live reaction, a laugh or a backchannel by its clip.
  const playAt = (volume: () => number, kind?: ConductedSound) => (text: string, opts?: Opts) => {
    const pcm = getClip(text, personaId());
    if (pcm === null) return false;
    const played = gate(kind ?? liveSoundKind(text), text, () =>
      direct
        ? !player.playing && direct.play(pcm, volume(), text, opts?.pauseStartedAt)
        : player.play(pcm, volume())
    );
    if (!played) return false;
    lastPlayedAt = Date.now();
    lastClip = text;
    recordQuirk(sessionIdOf(session), {
      kind: text === LAUGH_CLIP ? 'laugh' : 'backchannel',
      source: 'clip',
      personaId: personaId(),
    });
    return true;
  };
  const playClip = playAt(() => BACKCHANNEL_VOLUME);
  const cancelFresh = (): boolean => {
    const cut = direct?.cancelIfFresh() ?? false;
    if (cut) noteClipCut(session, 'pause_ended');
    return cut;
  };
  // Live backchannels and laughs (not the turn-opening "Mm") tell the avatar they played.
  // VOICED_PRESENCE varies the live picks; the signal wraps the variation so
  // its kind follows the requested clip (a laugh take still signals 'laugh').
  const variedPlayClip = withSoundSignal(
    backchannelTimingEnabled()
      ? timedLivePlay(playAt, BACKCHANNEL_VOLUME, (p) => voiced?.vary(p) ?? p)
      : (voiced?.vary(playClip) ?? playClip),
    sound,
    liveReactionKind,
    wireDelayMs,
    () => lastClip
  );
  const livePlayClip = avatarListenSignalsEnabled()
    ? withBackchannelSignal(
        variedPlayClip,
        createDataMessageSender(room),
        wireDelayMs,
        () => lastClip
      )
    : variedPlayClip;
  return {
    playClip,
    lastPlayedAt: () => lastPlayedAt,
    cancelFresh,
    wireDelayMs,
    openerClip: withSoundSignal(
      playAt(() => BACKCHANNEL_VOLUME, 'opener'),
      sound,
      () => 'opener',
      wireDelayMs
    ),
    slowTurnClip: playAt(() => BACKCHANNEL_VOLUME, 'slow_turn'),
    live: { playClip: livePlayClip, cancelClip: cancelFresh },
    close: async () => {
      stopPresence();
      stopToolHum();
      voiced?.close();
      await direct?.close();
      await player.close();
    },
  };
}

/** A whistle or hum is heard in the room, not said to them: quieter than a backchannel. */
const WHISTLE_VOLUME = 0.5;

/**
 * Sounds of him being there in a silence (presence-watcher.ts), on the same
 * track as the backchannels: a whistle (or, with PRESENCE_HUM, a hum) in an
 * easy pause, and with PRESENCE_SNORE a mock snore in a long quiet. Returns
 * the cleanup; a no-op unless PRESENCE_SOUNDS=on.
 */
function startPresenceSounds(
  session: voice.AgentSession,
  player: ClipPlayer,
  otherTrackBusy: () => boolean = () => false,
  personaId: () => string = () => 'ferni',
  onSound: (kind: 'hum' | 'breath', label: string) => void = () => {},
  gate: SoundGate = (_kind, _clip, play) => play()
): () => void {
  // VOICED_PRESENCE: no whistle or snore until researched; voiced-presence.ts fills the quiet.
  if (!presenceSoundsEnabled() || voicedPresenceEnabled()) return () => {};
  const mood = () =>
    (session.userData as { voiceEmotion?: { primary?: string } } | undefined)?.voiceEmotion
      ?.primary;
  // What they said lately counts too, not only how their voice read (presence-heavy.ts).
  const serious = (): boolean => presenceSilenceIsHeavy(session);
  let endsAt = 0;
  const playing = (
    kind: 'hum' | 'whistle' | 'snore',
    pcm: ArrayBuffer,
    quietMs: number
  ): boolean => {
    const ok = !otherTrackBusy() && gate('presence', kind, () => player.play(pcm, WHISTLE_VOLUME));
    if (ok) {
      endsAt = Date.now() + pcm.byteLength / 48; // 24 kHz s16le
      log.info({ kind }, `PRESENCE_SOUND ${kind}`);
      // A whistle reads as a hum (sound-signal.ts); the label names it, and its recording when it has one.
      const file = presenceClipName(pcm);
      onSound(kind === 'snore' ? 'breath' : 'hum', file ? `recorded-${kind}:${file}` : kind);
      const secs = Math.round(quietMs / 1000);
      const voice = mood() ? `, their voice sounding ${mood()}` : '';
      recordQuirk(sessionIdOf(session), {
        kind,
        source: 'clip',
        personaId: personaId(),
        reason: `the line went quiet for about ${secs} seconds on an easy, light call${voice}`,
      });
    }
    return ok;
  };
  // Only our own sound, never a backchannel or opening "Mm" that started after it ended.
  const stop = () => {
    if (Date.now() < endsAt) player.stop();
    endsAt = 0;
  };
  // PRESENCE_SOUND_ASSETS: a recorded whistle or snore when one loaded, else the synthesized one
  const recorded = presenceClipPickers();
  const quiet = () => stayQuietOn(session);
  const watchers = [
    createPresenceWatcher({
      play: (quietMs) =>
        presenceHumEnabled() && Math.random() < 0.5
          ? playing('hum', synthHum(), quietMs)
          : playing('whistle', recorded?.whistle.next() ?? synthWhistle(), quietMs),
      stop,
      mood,
      serious,
      quiet,
    }),
  ];
  if (presenceSnoreEnabled()) {
    const snore = () => recorded?.snore.next() ?? synthSnore();
    watchers.push(
      createPresenceWatcher(
        { play: (quietMs) => playing('snore', snore(), quietMs), stop, mood, serious, quiet },
        LONG_QUIET
      )
    );
  }
  const onAgent = (ev: { newState?: string }) =>
    watchers.forEach((w) => w.onAgentState(ev.newState ?? ''));
  const onUser = (ev: { newState?: string }) =>
    watchers.forEach((w) => w.onUserState(ev.newState ?? ''));
  session.on(voice.AgentSessionEventTypes.AgentStateChanged, onAgent);
  session.on(voice.AgentSessionEventTypes.UserStateChanged, onUser);
  return () => {
    watchers.forEach((w) => w.close());
    session.off(voice.AgentSessionEventTypes.AgentStateChanged, onAgent);
    session.off(voice.AgentSessionEventTypes.UserStateChanged, onUser);
  };
}

/** The call's id (userData.services.sessionId), read when needed: userData is set after start. */
function sessionIdOf(session: voice.AgentSession): string | undefined {
  return (session.userData as { services?: { sessionId?: string } } | undefined)?.services
    ?.sessionId;
}
