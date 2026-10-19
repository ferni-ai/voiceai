/**
 * TEAM_VOICES: each persona's delivery comes from its own manifest (pace
 * band, loudness, tones) instead of Ferni's, relative to the Director's pace.
 *
 * On dev 2026-10-04..12 Nayan's replies averaged speed 0.998 although his
 * manifest says 0.85 (sonic-capabilities audit, section 4).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ReadableStream } from 'node:stream/web';
import { beforeEach, describe, expect, it } from 'vitest';

import { LESTER_PRO_V3_VOICE_ID } from '../../../../config/voice-ids.js';
import { SONIC3_EMOTIONS, toSonicEmotion } from '../../../sonic-emotions.js';
import type { ReplyStream } from '../../providers/cartesia-reply-stream.js';
import { decideAttune, layerDelivery } from '../attune.js';
import {
  deliveryFromManifest,
  personaDelivery,
  personaEmotion,
  resetPersonaDeliveryCache,
} from '../persona-delivery.js';
import { directSpeech, type PlanSummary } from '../reply-director.js';
import { DirectorSessions } from '../session-state.js';

const BUNDLES = join(process.cwd(), 'src/personas/bundles');
const NAYAN_VOICE = '6da65da0-cad8-4820-901c-549561d93ff3';
const FERNI_VOICE = 'fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc';

class Recorder implements ReplyStream {
  pushes: string[] = [];
  push(text: string): void {
    this.pushes.push(text);
  }
  end(): void {}
  cancel(): void {}
  async *[Symbol.asyncIterator](): AsyncGenerator<ArrayBuffer> {}
}

async function reply(opts: {
  personaId: string;
  voiceId: string;
  env: Record<string, string>;
  sessions: DirectorSessions;
  text: string;
  userEmotion?: string;
}): Promise<{ pushes: string[]; summary: PlanSummary }> {
  const inner = new Recorder();
  let summary: PlanSummary | undefined;
  const directed = directSpeech(inner, {
    textStream: new ReadableStream<string>({
      start(c) {
        c.enqueue(opts.text);
        c.close();
      },
    }),
    voiceId: opts.voiceId,
    sessionId: 'team',
    personaId: opts.personaId,
    env: opts.env,
    sessions: opts.sessions,
    turnContext: opts.userEmotion ? { userEmotion: { primary: opts.userEmotion } } : undefined,
    onPlan: (s) => (summary = s),
  });
  for await (const _ of directed.textStream) {
    /* observe */
  }
  directed.reply.push(opts.text);
  directed.reply.end();
  return { pushes: inner.pushes, summary: summary! };
}

const LIVE = { SPEECH_DIRECTOR: 'live' };
const ON = { SPEECH_DIRECTOR: 'live', TEAM_VOICES: 'on' };
const tag = (push: string, name: 'speed' | 'volume'): number | undefined => {
  const m = new RegExp(`<${name} ratio="([\\d.]+)"/>`).exec(push);
  return m ? Number(m[1]) : undefined;
};

beforeEach(() => resetPersonaDeliveryCache());

describe('deliveryFromManifest', () => {
  it('reads base, band and volume, and maps non-Sonic emotion names', () => {
    const d = deliveryFromManifest('x', {
      default_speed: 0.85,
      speed_band: [0.8, 0.93],
      default_volume: 0.92,
      default_emotion: 'contemplative',
      emotion_range: ['wise', 'gentle', 'warm', 'amused', 'zzz'],
    });
    expect(d.base).toBe(0.85);
    expect(d.band).toEqual([0.8, 0.93]);
    expect(d.volume).toBe(0.92);
    expect([...(d.emotions ?? [])].sort()).toEqual([
      'affectionate',
      'calm',
      'contemplative',
      'content',
    ]);
    expect(d.dropped).toEqual(['zzz']);
  });

  it('falls back to settings.speed and a band around the base; no range = no limit', () => {
    const d = deliveryFromManifest('legend', { settings: { speed: 0.95 } });
    expect(d.base).toBe(0.95);
    expect(d.band).toEqual([0.85, 1.03]);
    expect(d.volume).toBe(1);
    expect(d.emotions).toBeUndefined();
  });

  it('ignores a band that does not contain the base', () => {
    expect(deliveryFromManifest('x', { default_speed: 1, speed_band: [0.8, 0.9] }).band).toEqual([
      0.9, 1.08,
    ]);
  });
});

describe('attune layers the persona under the caller, and personaEmotion', () => {
  const nayan = deliveryFromManifest('nayan', {
    default_speed: 0.85,
    speed_band: [0.8, 0.93],
    default_emotion: 'contemplative',
    emotion_range: ['contemplative', 'calm', 'affectionate'],
  });

  const pace = (relative: number) =>
    layerDelivery({ persona: nayan, caller: { speed: relative, volume: 1 } }, true).speed;

  it("places the Director's relative pace on the persona's base, the caller's answer last", () => {
    expect(pace(1)).toBe(0.85);
    expect(pace(1.08)).toBe(0.92);
    // An attuned "caller is low" pace (0.86) slows Nayan from HIS base as much as Ferni
    // (-14%), below his resting band: the caller's adjustment comes after the persona.
    expect(pace(0.86)).toBe(0.73);
  });

  it('keeps a tone the persona uses, else its default or first fit, else none', () => {
    expect(personaEmotion(nayan, 'calm', 'neutral')).toBe('calm');
    expect(personaEmotion(nayan, 'curious', 'inquisitive')).toBe('contemplative');
    expect(personaEmotion(nayan, 'content', 'bright')).toBe('calm');
    expect(personaEmotion(nayan, 'sympathetic', 'heavy')).toBe('contemplative');
    // Nothing chosen: his own default, when the words can carry it.
    expect(personaEmotion(nayan, undefined, 'neutral')).toBe('contemplative');
  });
});

/**
 * Attune is the single owner of speed and volume (decision 2026-10-14). Its
 * inputs are layered: persona base, then late night, then the caller.
 */
describe('layerDelivery: persona, then late night, then the caller', () => {
  const persona = { base: 1.03, band: [0.95, 1.08] as const, volume: 0.9 };
  const lateNight = { speed: 0.97, volume: 0.85 };

  it('applies the layers in order, each from the resting point the one before left', () => {
    const d = layerDelivery({ persona, lateNight, caller: { speed: 1, volume: 1 } }, true);
    expect(d.trace.map((t) => t.layer)).toEqual(['persona', 'late-night', 'caller']);
    expect(d.trace[0]).toMatchObject({ speed: 1.03, volume: 0.9 });
    // Late night moves the persona's rest, not Ferni's 1.0: 1.03 x 0.97, 0.9 x 0.85.
    expect(d.trace[1]).toMatchObject({ speed: 1, volume: 0.77 });
    // A neutral caller leaves that resting point as it is.
    expect(d).toMatchObject({ speed: 1, volume: 0.77 });
  });

  it("the caller's adjustment works from the late-night rest, not from 1", () => {
    // A bright caller (attune's 1.04 / 1.08) lifts from the softened rest.
    const d = layerDelivery({ persona, lateNight, caller: { speed: 1.04, volume: 1.08 } }, true);
    expect(d.speed).toBe(1.04); // 1.03 x 0.97 x 1.04
    expect(d.volume).toBe(0.83); // 0.9 x 0.85 x 1.08, under the persona's 0.9
  });

  it("the persona's band bounds the resting layers, not the caller's answer", () => {
    const slow = { base: 0.85, band: [0.84, 0.93] as const, volume: 1 };
    const d = layerDelivery({ persona: slow, lateNight, caller: { speed: 0.9, volume: 1 } }, true);
    expect(d.trace[1].speed).toBe(0.84); // 0.85 x 0.97 = 0.82, held at the band floor
    expect(d.speed).toBe(0.76); // the caller then moves from that rest: 0.84 x 0.9
  });

  it('keeps late night and the caller together inside attune bounds around the persona', () => {
    // 1.0 (late-night rest) x 0.8 = 0.8, but no more than 20% under the persona's 1.03.
    const low = layerDelivery({ persona, lateNight, caller: { speed: 0.8, volume: 0.7 } }, true);
    expect(low).toMatchObject({ speed: 0.82, volume: 0.63 }); // 1.03 x 0.8; 0.9 x 0.7
    // Without a persona the same bounds hold around Ferni's 1: never below 0.8 / 0.7.
    const ferni = layerDelivery({ lateNight, caller: { speed: 0.8, volume: 0.7 } }, true);
    expect(ferni).toMatchObject({ speed: 0.8, volume: 0.7 });
  });

  it('carries only the caller layer, so the resting layers never compound', () => {
    const d = layerDelivery({ persona, lateNight, caller: { speed: 0.92, volume: 1 } }, true);
    expect(d.relativeSpeed).toBe(0.92);
    expect(d.speed).toBe(0.92); // 1.03 x 0.97 = 1.0 at rest, x 0.92
  });

  it('with no resting layer is exactly the caller layer (all flags off: as on main)', () => {
    const attuned = decideAttune({ state: 'low', valence: 'neutral', previous: {} });
    const d = layerDelivery({ caller: attuned }, true);
    expect(d).toMatchObject({ speed: attuned.speed, volume: attuned.volume });
    expect(d.trace).toHaveLength(1);
    expect(layerDelivery({ caller: { speed: 1.01, volume: 0.9 } }, false)).toMatchObject({
      speed: 1, // under SPEED_EPSILON: no tag
      volume: 1, // loudness only with the pacing lever live
    });
  });
});

describe('the persona manifests', () => {
  const ids = readdirSync(BUNDLES, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((id) => {
      try {
        readFileSync(join(BUNDLES, id, 'persona.manifest.json'));
        return true;
      } catch {
        return false;
      }
    });

  it('name only Sonic emotions, or one the loader maps to its nearest', () => {
    // Maya's default "friendly" (-> happy) is rewritten in #1112, which edits the line next to it.
    const bad: string[] = [];
    for (const id of ids) {
      const voice =
        JSON.parse(readFileSync(join(BUNDLES, id, 'persona.manifest.json'), 'utf8')).voice ?? {};
      for (const name of [voice.default_emotion, ...(voice.emotion_range ?? [])]) {
        if (name === undefined || SONIC3_EMOTIONS.has(name)) continue;
        if (!(id === 'maya-santos' && toSonicEmotion(name) === 'happy')) bad.push(`${id}: ${name}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('give the team distinct resting paces, Nayan at ~0.85', () => {
    const base = (id: string) => personaDelivery(id)?.base;
    expect(base('nayan-patel')).toBe(0.85);
    expect(personaDelivery('nayan-patel')?.volume).toBe(0.92);
    expect(base('peter-john')).not.toBe(base('maya-santos'));
    expect(base('jordan-taylor')).toBeGreaterThan(1);
    expect(personaDelivery('ferni')).toBeUndefined();
    for (const id of ['john-bogle', 'peter-lynch', 'joel-dickson']) {
      expect(personaDelivery(id)?.emotions?.size).toBeGreaterThan(0);
    }
  });
});

describe('the Director with TEAM_VOICES', () => {
  const TEXT = 'That is a good question to sit with. What feels true to you right now?';

  it('voices Nayan from his own base and loudness, only when the flag is on', async () => {
    const off = await reply({
      personaId: 'nayan-patel',
      voiceId: NAYAN_VOICE,
      env: LIVE,
      sessions: new DirectorSessions(),
      text: TEXT,
    });
    const on = await reply({
      personaId: 'nayan-patel',
      voiceId: NAYAN_VOICE,
      env: ON,
      sessions: new DirectorSessions(),
      text: TEXT,
    });
    expect(off.summary.speed).toBe(1);
    expect(tag(off.pushes[0], 'volume')).toBeUndefined();
    // His rest, exactly: his default tone colours the tag but never moves the pace.
    expect(on.summary.relativeSpeed).toBe(1);
    expect(on.summary.speed).toBe(0.85);
    expect(tag(on.pushes[0], 'speed')).toBe(0.85);
    expect(tag(on.pushes[0], 'volume')).toBe(0.92);
    expect(on.summary.emotion).toBe('contemplative');
  });

  it('keeps his rest over many turns, whether or not VOICE_ATTUNE is on', async () => {
    for (const env of [ON, { ...ON, VOICE_ATTUNE: 'on' }]) {
      const sessions = new DirectorSessions();
      const speeds: number[] = [];
      for (let turn = 0; turn < 6; turn++) {
        const r = await reply({
          personaId: 'nayan-patel',
          voiceId: NAYAN_VOICE,
          env,
          sessions,
          text: TEXT,
        });
        speeds.push(r.summary.speed);
      }
      expect(speeds).toEqual([0.85, 0.85, 0.85, 0.85, 0.85, 0.85]);
      // The carry holds the Director's own tone, not the persona's colour of it.
      expect(sessions.get('team', 'nayan-patel').emotion).not.toBe('contemplative');
    }
  });

  it("an authored sympathetic reply keeps attune's hard-news drop on Nayan", async () => {
    const env = { ...ON, VOICE_ATTUNE: 'on' };
    const text = '<emotion value="sympathetic"/>Ah, hell. I am so sorry.';
    const ferniVoice = await reply({
      personaId: 'nayan-patel',
      voiceId: NAYAN_VOICE,
      env: { ...LIVE, VOICE_ATTUNE: 'on' },
      sessions: new DirectorSessions(),
      text,
    });
    const his = await reply({
      personaId: 'nayan-patel',
      voiceId: NAYAN_VOICE,
      env,
      sessions: new DirectorSessions(),
      text,
    });
    // Without TEAM_VOICES: attune's HEAVY, 0.86 / 0.8.
    expect([ferniVoice.summary.speed, ferniVoice.summary.volume]).toEqual([0.86, 0.8]);
    // With it: the same drop, from his rest (0.85 x 0.86, 0.92 x 0.8), whatever tone he colours it.
    expect(his.summary.relativeSpeed).toBe(0.86);
    expect(his.summary.layers).toBe('persona 0.85/0.92 > caller 0.73/0.74');
  });

  it("a Pro clone that ignores <speed> still gets the persona's loudness", async () => {
    const pro = await reply({
      personaId: 'nayan-patel',
      voiceId: LESTER_PRO_V3_VOICE_ID,
      env: ON,
      sessions: new DirectorSessions(),
      text: TEXT,
    });
    expect(pro.pushes[0]).toContain('<volume ratio="0.92"/>');
    expect(pro.pushes.join('')).not.toMatch(/<speed|<emotion/);
    expect(pro.summary.tempo).toBe(0.85); // his rest, as Stage 2 tempo
  });

  it('smooths across turns in relative space, so the persona base is not compounded', async () => {
    const sessions = new DirectorSessions();
    const heavy = "I'm so sorry about your father. That must be so hard.";
    const first = await reply({
      personaId: 'nayan-patel',
      voiceId: NAYAN_VOICE,
      env: ON,
      sessions,
      text: heavy,
    });
    expect(sessions.get('team', 'nayan-patel').speed).toBe(first.summary.relativeSpeed);
    const second = await reply({
      personaId: 'nayan-patel',
      voiceId: NAYAN_VOICE,
      env: ON,
      sessions,
      text: TEXT,
    });
    expect(first.summary.relativeSpeed).toBeLessThan(1);
    expect(first.summary.speed).toBe(Math.round(0.85 * first.summary.relativeSpeed! * 100) / 100);
    // The next reply smooths from the relative pace. Carrying the scaled speed instead
    // would compound the base and drag Nayan further down each turn.
    expect(second.summary.relativeSpeed).toBeGreaterThanOrEqual(first.summary.relativeSpeed!);
    expect(second.summary.speed).toBeGreaterThanOrEqual(first.summary.speed);
  });

  it("with VOICE_ATTUNE, the caller's softening lands on Nayan's rest (attune owns both)", async () => {
    const env = { ...ON, VOICE_ATTUNE: 'on' };
    const sad = await reply({
      personaId: 'nayan-patel',
      voiceId: NAYAN_VOICE,
      env,
      sessions: new DirectorSessions(),
      text: TEXT,
      userEmotion: 'sadness',
    });
    // Attune's low caller: 0.86 pace, 0.85 loudness, relative; on Nayan: 0.85 x 0.86, last.
    expect(sad.summary.layers).toBe('persona 0.85/0.92 > caller 0.73/0.78');
    expect(sad.summary.volume).toBe(0.85); // the caller layer, as main logs it
    expect(tag(sad.pushes[0], 'speed')).toBe(0.73);
    expect(tag(sad.pushes[0], 'volume')).toBe(0.78); // 0.92 x 0.85, one volume tag
    expect(sad.pushes.join('').match(/<volume /g)).toHaveLength(1);
  });

  it('leaves Ferni exactly as without the flag', async () => {
    const text = 'Oh that is wonderful news, congratulations! How are you celebrating?';
    const off = await reply({
      personaId: 'ferni',
      voiceId: FERNI_VOICE,
      env: LIVE,
      sessions: new DirectorSessions(),
      text,
    });
    const on = await reply({
      personaId: 'ferni',
      voiceId: FERNI_VOICE,
      env: ON,
      sessions: new DirectorSessions(),
      text,
    });
    expect(on.pushes).toEqual(off.pushes);
    expect(on.summary.speed).toBe(off.summary.speed);
    expect(on.summary.emotion).toBe(off.summary.emotion);
  });
});
