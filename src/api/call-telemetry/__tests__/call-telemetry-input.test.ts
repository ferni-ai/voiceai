/**
 * The wire contract with the iPhone app. summary.json and felt-off.json are the
 * iOS client's own encoder output (copied from the iOS lead's fixtures), so a
 * schema change that breaks the client fails here first.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  callTelemetryBodySchema,
  feltOffBodySchema,
  summaryBodySchema,
} from '../call-telemetry-input.js';

type Json = Record<string, unknown>;
const fixture = (name: string): Json =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as Json;
const summary = () => fixture('summary.json');
const feltOff = () => fixture('felt-off.json');
const ok = (body: unknown) => callTelemetryBodySchema.safeParse(body).success;

const DROP = Symbol('drop');
/** A copy of `body` with each dotted path set to its value, or removed for DROP. */
function edit(body: Json, changes: Record<string, unknown>): Json {
  const copy = structuredClone(body);
  for (const [path, value] of Object.entries(changes)) {
    const keys = path.split('.');
    const last = keys.pop() as string;
    const parent = keys.reduce<Json>((node, k) => node[k] as Json, copy);
    if (value === DROP) delete parent[last];
    else parent[last] = value;
  }
  return copy;
}
const filled = (body: Json, list: 'samples' | 'events', length: number) => {
  const ring = body.ring as Record<string, unknown[]>;
  return edit(body, { [`ring.${list}`]: Array(length).fill(ring[list][0]) });
};

describe('the iOS contract fixtures', () => {
  it('parses the summary fixture, values unchanged', () => {
    expect(summaryBodySchema.parse(summary())).toEqual(summary());
  });

  it('parses the felt-off fixture, including the extras (tapAgainMs, max and n)', () => {
    const parsed = feltOffBodySchema.parse(feltOff());
    expect(parsed).toEqual(feltOff());
    expect(parsed.tapAgainMs).toBe(6400);
    expect(parsed.summarySoFar.turns?.stateToAudioMs).toEqual({
      p50: 180,
      p95: 340,
      max: 410,
      n: 24,
    });
  });

  it('routes each kind through the one discriminated schema', () => {
    expect(callTelemetryBodySchema.parse(summary()).kind).toBe('summary');
    expect(callTelemetryBodySchema.parse(feltOff()).kind).toBe('feltOff');
    expect(ok({ ...summary(), kind: 'crash' })).toBe(false);
    expect(ok({ ...summary(), schema: 2 })).toBe(false);
  });
});

describe('what a payload may not carry', () => {
  it('refuses an unknown key at the top, in a section and in a ring sample', () => {
    expect(ok({ ...summary(), personaId: 'ferni' })).toBe(false);
    expect(ok(edit(summary(), { 'build.deviceName': 'Seths iPhone' }))).toBe(false);
    expect(ok(edit(feltOff(), { 'ring.samples.0.caption': 'hello' }))).toBe(false);
  });

  it('refuses a room name that is not ios-<uuid>, and more than 3 rooms', () => {
    expect(ok({ ...summary(), rooms: ['voice-123'] })).toBe(false);
    expect(ok({ ...summary(), rooms: [] })).toBe(false);
    const four = Array(4).fill('ios-0f8e2a4c-1b3d-4e5f-8a9b-0c1d2e3f4a5b');
    expect(ok({ ...summary(), rooms: four })).toBe(false);
  });

  it('refuses a device name in deviceModel (only machine ids like iPhone17,1)', () => {
    expect(ok(edit(summary(), { 'build.deviceModel': "Seth's iPhone" }))).toBe(false);
    expect(ok(edit(summary(), { 'build.deviceModel': 'iPhone17,1 x' }))).toBe(false);
  });

  it('refuses a route that is not one of the closed kinds (never a port name)', () => {
    expect(ok(edit(summary(), { 'route.routeEnd': "Seth's AirPods" }))).toBe(false);
  });

  it('takes a note of 140 UTF-16 units and refuses 141', () => {
    expect(ok({ ...feltOff(), note: 'x'.repeat(140) })).toBe(true);
    expect(ok({ ...feltOff(), note: 'x'.repeat(141) })).toBe(false);
    expect(ok({ ...feltOff(), note: '😀'.repeat(70) })).toBe(true); // 140 units
    expect(ok({ ...feltOff(), note: '😀'.repeat(71) })).toBe(false); // 142 units, 71 code points
  });

  it('refuses a note on a summary (the only free text is the felt-off note)', () => {
    expect(ok({ ...summary(), note: 'hi' })).toBe(false);
  });

  it('takes 30 ring samples and refuses 31; takes 200 events and refuses 201', () => {
    expect(ok(filled(feltOff(), 'samples', 30))).toBe(true);
    expect(ok(filled(feltOff(), 'samples', 31))).toBe(false);
    expect(ok(filled(feltOff(), 'events', 200))).toBe(true);
    expect(ok(filled(feltOff(), 'events', 201))).toBe(false);
  });

  it('refuses an event kind outside the closed list', () => {
    expect(ok(edit(feltOff(), { 'ring.events.1.kind': 'handoff:Maya' }))).toBe(false);
  });
});

describe('missing means not measured, and one outlier never costs the report', () => {
  it('accepts a missing optional key, including deviceModel on a simulator', () => {
    const s = edit(summary(), {
      'build.deviceModel': DROP,
      'audio.synthesizedMs': DROP,
      avatar: DROP,
    });
    expect(ok(s)).toBe(true);
    const f = edit(feltOff(), {
      note: DROP,
      tapAgainMs: DROP,
      'summarySoFar.build.deviceModel': DROP,
    });
    expect(ok(f)).toBe(true);
  });

  it('refuses null for an optional the client omits', () => {
    expect(ok(edit(summary(), { 'audio.synthesizedMs': null }))).toBe(false);
    expect(ok({ ...feltOff(), note: null })).toBe(false);
  });

  it('takes appBuild only as a whole number', () => {
    expect(ok(edit(summary(), { 'build.appBuild': '57' }))).toBe(false);
    expect(ok(edit(summary(), { 'build.appBuild': 57.5 }))).toBe(false);
  });

  it('clamps an out-of-range number into its range instead of refusing the payload', () => {
    const s = edit(summary(), {
      'net.rttMsP95': 9_999_999_999,
      'audio.concealedRatio': 1.7,
      'call.mutedMs': -5,
    });
    const parsed = summaryBodySchema.parse(s);
    expect(parsed.net?.rttMsP95).toBe(600_000);
    expect(parsed.audio?.concealedRatio).toBe(1);
    expect(parsed.call?.mutedMs).toBe(0);
    expect(parsed.net?.rttMsP50).toBe(48); // the rest untouched
  });

  it('still refuses a number sent as a string, NaN or Infinity', () => {
    expect(ok(edit(summary(), { 'net.rttMsP95': '120' }))).toBe(false);
    expect(ok(edit(summary(), { 'net.rttMsP95': Number.POSITIVE_INFINITY }))).toBe(false);
    expect(ok(edit(summary(), { 'net.rttMsP95': Number.NaN }))).toBe(false);
  });
});
