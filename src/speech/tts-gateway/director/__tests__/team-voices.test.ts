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

import { SONIC3_EMOTIONS } from '../../../sonic-emotions.js';
import type { ReplyStream } from '../../providers/cartesia-reply-stream.js';
import {
  deliveryFromManifest,
  personaDelivery,
  personaEmotion,
  personaPace,
  resetPersonaDeliveryCache,
} from '../persona-delivery.js';
import { directSpeech, type PlanSummary } from '../reply-director.js';
import { DirectorSessions } from '../session-state.js';

const BUNDLES = join(process.cwd(), 'src/personas/bundles');
const NAYAN_VOICE = '52f0a563-2a2a-4c4a-ab4f-000eaaed32b3';
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

describe('personaPace and personaEmotion', () => {
  const nayan = deliveryFromManifest('nayan', {
    default_speed: 0.85,
    speed_band: [0.8, 0.93],
    default_emotion: 'contemplative',
    emotion_range: ['contemplative', 'calm', 'affectionate'],
  });

  it("scales the Director's relative pace by the base, inside the band", () => {
    expect(personaPace(nayan, 1)).toBe(0.85);
    expect(personaPace(nayan, 1.08)).toBe(0.92);
    // An attuned "caller is low" pace (0.86) lowers Nayan from HIS base, to the band floor.
    expect(personaPace(nayan, 0.86)).toBe(0.8);
  });

  it('keeps a tone the persona uses, else its default or first fit, else none', () => {
    expect(personaEmotion(nayan, 'calm', 'neutral')).toBe('calm');
    expect(personaEmotion(nayan, 'curious', 'inquisitive')).toBe('contemplative');
    expect(personaEmotion(nayan, 'content', 'bright')).toBe('calm');
    expect(personaEmotion(nayan, 'sympathetic', 'heavy')).toBe('contemplative');
    expect(personaEmotion(nayan, undefined, 'neutral')).toBeUndefined();
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

  it('name only Sonic emotions', () => {
    const bad: string[] = [];
    for (const id of ids) {
      const voice =
        JSON.parse(readFileSync(join(BUNDLES, id, 'persona.manifest.json'), 'utf8')).voice ?? {};
      for (const name of [voice.default_emotion, ...(voice.emotion_range ?? [])]) {
        if (name !== undefined && !SONIC3_EMOTIONS.has(name)) bad.push(`${id}: ${name}`);
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
    // Contemplative pulls the Director's relative pace to 0.98; on Nayan's scale that is 0.83.
    expect(on.summary.relativeSpeed).toBe(0.98);
    expect(on.summary.speed).toBe(0.83);
    expect(tag(on.pushes[0], 'speed')).toBe(0.83);
    expect(tag(on.pushes[0], 'volume')).toBe(0.92);
    expect(on.summary.emotion).toBe('contemplative');
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
    expect(first.summary.relativeSpeed).toBe(0.97);
    expect(first.summary.speed).toBe(0.82);
    // The next reply smooths from relative 0.97. Carrying the scaled 0.82 instead
    // would compound the base: relative ~0.89, Nayan pinned at the 0.8 floor.
    expect(second.summary.relativeSpeed).toBeGreaterThanOrEqual(0.96);
    expect(second.summary.speed).toBeGreaterThan(0.8);
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
