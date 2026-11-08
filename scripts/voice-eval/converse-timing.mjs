// converse.mjs's timing rules, kept out of that script so they can be tested without a room.

/** How long the caller waits for the greeting. It matches the agent's own startup limit
 *  (READY_TIMEOUT_MS in src/agents/gce/job-runner.ts): a cold server can take that long to join,
 *  and a caller who speaks first talks to an empty room. */
export const GREETING_WAIT_MS = 90000;

/** A caller line's audio length in ms: 48 kHz mono s16le, so 96 bytes per ms. */
export const audioMsOf = (pcm) => Math.round(pcm.length / 96);

/** A line's loudest sample (s16le), so a scripted "[[slnc N]]" line reads as silence. */
export const peakOf = (pcm) => {
  let peak = 0;
  for (let i = 0; i + 1 < pcm.length; i += 2) peak = Math.max(peak, Math.abs(pcm.readInt16LE(i)));
  return peak;
};

/** One userSpeech entry, [start, end, audioMs, peak]. Wall time far past audioMs means the harness
 *  stalled mid-line (predicates/index.mjs callerStalled), not that the agent was slow; a peak
 *  under SILENT_PEAK is a silence-only line, not a caller turn (callerSilent). */
export const callerLine = (start, end, pcm) => [start, end, audioMsOf(pcm), peakOf(pcm)];

// Sending the caller's audio in real time (#2740).
//
// The mic pump used to send one 10 ms frame per captureFrame() into a 40 ms queue, so audio went out
// only as fast as the process woke up. macOS coalesces the timers of a background process (launchd
// ProcessType=Background, as the daily red team runs) to about 100 ms, so 40 ms of audio went out
// per wake: every line took 1.6 to 4.5x its length, with gaps, and the agent answered each fragment
// as its own turn. Host load did the same, less evenly. Now the pump sends against the clock: on
// every wake it queues all the audio due up to SEND_LEAD_MS ahead, so a late wake sends a bigger
// frame instead of a slower line.

/** How far ahead of its play time the caller's audio is queued: longer than a coalesced wake. */
export const SEND_LEAD_MS = 200;
/** The AudioSource queue: the lead plus one catch-up frame as long as the lead. */
export const SEND_QUEUE_MS = 2 * SEND_LEAD_MS;
const RATE_PER_MS = 48;
const FRAME = 480; // 10 ms at 48 kHz

/** When each caller sample is due on the run clock (ms), and how many to send now. */
export class MicClock {
  constructor(now) {
    this.now = now;
    this.origin = null; // run-clock ms at which sample 0 plays
    this.sent = 0; // samples queued so far
    this.lateMs = 0; // total time the queue ran dry
  }

  /** Samples to queue now, in whole 10 ms frames; 0 means nothing is due yet. Audio that should
   *  already have played can't go out on time: after a stall the clock moves on, the gap goes out
   *  as silence, and the line it falls in runs long (callerAudioOf). */
  due() {
    const t = this.now();
    if (this.origin === null) this.origin = t;
    const late = t - this.playAt();
    if (late > 0) {
      this.origin += late;
      this.lateMs += late;
    }
    const want = Math.floor((t - this.origin + SEND_LEAD_MS) * RATE_PER_MS) - this.sent;
    return Math.max(0, Math.floor(want / FRAME) * FRAME);
  }

  /** Run-clock ms at which the sample `offset` after everything queued so far plays. */
  playAt(offset = 0) {
    return this.origin + (this.sent + offset) / RATE_PER_MS;
  }

  queued(samples) {
    this.sent += samples;
  }
}

/** One caller line going out through the mic, stamped with when its first and last samples play. */
export class LineSender {
  constructor(pcm) {
    this.pcm = pcm; // Int16Array, 48 kHz mono
    this.pos = 0;
    this.start = null;
    this.last = null; // play time of the last sample, once it is queued
    this.end = null; // set once that frame was accepted: done
  }

  /** Copy this line's next samples into the frame about to be queued on `clock`. */
  fill(frame, clock) {
    const take = this.pcm.subarray(this.pos, this.pos + frame.length);
    frame.set(take);
    if (this.start === null) this.start = Math.round(clock.playAt(0));
    this.pos += take.length;
    if (this.pos >= this.pcm.length) this.last = Math.round(clock.playAt(take.length));
  }

  get allQueued() {
    return this.last !== null;
  }

  /** The frame with the last sample was accepted at `t`: it can't have played before then. */
  accepted(t) {
    this.end = Math.max(this.last, Math.round(t));
  }

  get done() {
    return this.end !== null;
  }
}

/** A caller line sent over this many times its audio length is invalid for timing (#2740): the
 *  agent heard it in fragments, so reply gaps, talk-over and backchannels from that call measure
 *  the harness, and its content scores are confounded. */
export const MAX_SEND_RATIO = 1.2;
/** Lines shorter than this aren't timed: a few ms of jitter is a large ratio on them. */
export const MIN_TIMED_MS = 200;
/** What a timing number reads as when the call's caller audio was not sent in real time. */
export const TIMING_INVALID = 'timing invalid';

/** Each caller line's send ratio (wall time over audio length; null when untimed), the worst one,
 *  and whether the call's timing can be read. Works on older run files too: userSpeech has
 *  [start, end, audioMs] since 2026-10. */
export function callerAudioOf(userSpeech = []) {
  const ratios = userSpeech.map(([start, end, audioMs]) =>
    Number.isFinite(audioMs) && audioMs >= MIN_TIMED_MS
      ? Math.round(((end - start) / audioMs) * 100) / 100
      : null
  );
  const timed = ratios.filter((r) => r !== null);
  return {
    ratios,
    maxRatio: timed.length ? Math.max(...timed) : null,
    limit: MAX_SEND_RATIO,
    valid: !timed.some((r) => r > MAX_SEND_RATIO),
  };
}

/** A run's caller-audio verdict: the one converse.mjs recorded, else worked out from userSpeech. */
export const callerAudioOfRun = (run) => run?.callerAudio ?? callerAudioOf(run?.userSpeech);

/** One line for a report: why a call's timing numbers are not shown. */
export const timingInvalidNote = (audio) =>
  `${TIMING_INVALID}: caller audio sent at up to ${audio.maxRatio}x real time (limit ${audio.limit}x), so the agent heard fragments`;
