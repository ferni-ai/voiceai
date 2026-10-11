import { describe, expect, it, vi } from 'vitest';
import {
  extractWorldObservations,
  isAfterCallExtractionOn,
  transcriptOf,
} from '../after-call-extraction.js';
import { buildExtractionPrompt, callMomentFor } from '../extraction-prompt.js';
import { parseObservations, validDate } from '../parse-observations.js';

const ctx = { sessionId: 's1', observedAt: '2026-10-10T15:00:00.000Z', callDate: '2026-10-10' };
const reply = (observations: unknown[]) => JSON.stringify({ observations });
const item = (over: Record<string, unknown>) => ({
  subject: 'Mindy',
  subjectKind: 'person',
  relation: 'sister',
  attribute: 'event',
  value: 'knee surgery',
  eventDate: '2026-10-13',
  confidence: 0.9,
  quote: 'Mindy has knee surgery Tuesday',
  ...over,
});

describe('callMomentFor', () => {
  it("uses the caller's local day, not UTC", () => {
    // 03:00 UTC on the 11th is still Saturday the 10th in New York.
    expect(callMomentFor(new Date('2026-10-11T03:00:00Z'), 'America/New_York')).toEqual({
      date: '2026-10-10',
      weekday: 'Saturday',
      timezone: 'America/New_York',
    });
  });

  it('falls back to UTC for an unknown timezone', () => {
    expect(callMomentFor(new Date('2026-10-11T03:00:00Z'), 'Mars/Olympus').date).toBe('2026-10-11');
  });
});

describe('buildExtractionPrompt', () => {
  it('tells the model the call date and weekday to resolve "Tuesday" against', () => {
    const p = buildExtractionPrompt('CALLER: hi', {
      date: '2026-10-10',
      weekday: 'Saturday',
      timezone: 'America/New_York',
    });
    expect(p).toContain('Saturday 2026-10-10');
    expect(p).toContain('CALLER: hi');
  });
});

describe('parseObservations', () => {
  it('keeps a well-formed observation with its date, relation and quote', () => {
    const [o] = parseObservations(reply([item({})]), ctx);
    expect(o).toMatchObject({
      subject: 'Mindy',
      relation: 'sister',
      attribute: 'event',
      eventDate: '2026-10-13',
      observedAt: ctx.observedAt,
      source: { kind: 'turn', sessionId: 's1', quote: 'Mindy has knee surgery Tuesday' },
    });
  });

  it('never files Ferni, the AI or a pronoun as a person in the caller life', () => {
    const out = parseObservations(
      reply([
        item({ subject: 'Ferni' }),
        item({ subject: 'AI Assistant' }),
        item({ subject: 'They' }),
        item({}),
      ]),
      ctx
    );
    expect(out.map((o) => o.subject)).toEqual(['Mindy']);
  });

  it('drops a date that is not a real day or is far from the call, but keeps the fact', () => {
    const [bad, far] = parseObservations(
      reply([item({ eventDate: '2026-02-30' }), item({ eventDate: '2031-01-01' })]),
      ctx
    );
    expect(bad).toBeDefined();
    expect(bad?.eventDate).toBeUndefined();
    expect(far?.eventDate).toBeUndefined();
  });

  it('drops unknown attributes and empty values, normalises self, clamps confidence', () => {
    const out = parseObservations(
      reply([
        item({ attribute: 'favourite_colour' }),
        item({ value: '   ' }),
        item({
          subject: 'me',
          subjectKind: 'self',
          relation: 'x',
          attribute: 'goal',
          value: 'run a half marathon',
          confidence: 7,
        }),
      ]),
      ctx
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ subject: 'self', attribute: 'goal', confidence: 1 });
    expect(out[0]?.relation).toBeUndefined();
  });

  it('keeps a change marker so the store can close the old fact, and drops a bad one', () => {
    const [quit, junk] = parseObservations(
      reply([
        item({
          subject: 'me',
          subjectKind: 'self',
          attribute: 'job',
          value: 'quit Acme',
          replaces: { attribute: 'job', priorValue: 'Acme' },
        }),
        item({ replaces: { attribute: 'mood' } }),
      ]),
      ctx
    );
    expect(quit?.replaces).toEqual({ attribute: 'job', priorValue: 'Acme' });
    expect(junk).toBeDefined();
    expect(junk?.replaces).toBeUndefined();
  });

  it('returns [] for a reply with no usable JSON', () => {
    expect(parseObservations('sorry, no', ctx)).toEqual([]);
    expect(parseObservations('{"observations": "nope"}', ctx)).toEqual([]);
    expect(parseObservations(null, ctx)).toEqual([]);
  });
});

describe('validDate', () => {
  it('accepts a real day near the call only', () => {
    expect(validDate('2026-10-13', '2026-10-10')).toBe('2026-10-13');
    expect(validDate('2026-13-01', '2026-10-10')).toBeUndefined();
    expect(validDate('Tuesday', '2026-10-10')).toBeUndefined();
  });
});

describe('extractWorldObservations', () => {
  const call = {
    sessionId: 's1',
    startedAt: new Date('2026-10-10T15:00:00Z'),
    timezone: 'America/New_York',
  };

  it('does not call the model when the caller said nothing', async () => {
    const llm = vi.fn();
    expect(
      await extractWorldObservations([{ role: 'assistant', content: 'Hello?' }], call, llm)
    ).toEqual([]);
    expect(llm).not.toHaveBeenCalled();
  });

  it('sends the dated transcript and returns the parsed observations', async () => {
    const llm = vi.fn().mockResolvedValue(reply([item({})]));
    const out = await extractWorldObservations(
      [
        { role: 'user', content: 'Mindy has knee surgery Tuesday.' },
        { role: 'assistant', content: 'Oh no, I hope it goes well.' },
      ],
      call,
      llm
    );
    expect(out).toHaveLength(1);
    const prompt = llm.mock.calls[0]?.[0] as string;
    expect(prompt).toContain('Saturday 2026-10-10');
    expect(prompt).toContain('CALLER: Mindy has knee surgery Tuesday.');
    expect(prompt).toContain('FERNI: Oh no, I hope it goes well.');
  });

  it('returns [] when the model fails', async () => {
    const out = await extractWorldObservations(
      [{ role: 'user', content: 'hi' }],
      call,
      async () => null
    );
    expect(out).toEqual([]);
  });
});

describe('transcriptOf', () => {
  it('keeps the start and the end of a long call', () => {
    const turns = Array.from({ length: 2000 }, (_, i) => ({
      role: i % 2 ? 'assistant' : 'user',
      content: `line ${i}`,
    }));
    const t = transcriptOf(turns);
    expect(t.length).toBeLessThan(17_000);
    expect(t).toContain('CALLER: line 0');
    expect(t).toContain('FERNI: line 1999');
  });
});

describe('isAfterCallExtractionOn', () => {
  it('is off unless AFTER_CALL_EXTRACTION=on', () => {
    expect(isAfterCallExtractionOn({})).toBe(false);
    expect(isAfterCallExtractionOn({ AFTER_CALL_EXTRACTION: 'true' })).toBe(false);
    expect(isAfterCallExtractionOn({ AFTER_CALL_EXTRACTION: 'on' })).toBe(true);
  });
});
