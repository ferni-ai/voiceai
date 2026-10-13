/**
 * The face engine's model: tokens → eye and lid geometry the renderer applies
 * with transforms only, one name space, and who may change the face.
 */
import { describe, expect, it } from 'vitest';
import { EXPRESSIONS, type ExpressionId } from '../src/config/expressions.generated';
import { ALIASES, faceGeometry, mayReplace, resolveFace } from '../src/ui/face/face-model';

const ids = Object.keys(EXPRESSIONS) as ExpressionId[];

describe('one name space', () => {
  it('every alias for an older name points at a real token', () => {
    for (const [name, id] of Object.entries(ALIASES))
      expect(Object.keys(EXPRESSIONS), name).toContain(id);
  });

  it('resolves token ids as themselves, older names through the alias, and nothing else', () => {
    expect(resolveFace('happy')).toBe('happy');
    expect(resolveFace('contemplative')).toBe('thinking');
    expect(resolveFace('waiting')).toBe('resting');
    expect(resolveFace('not-a-face')).toBeNull();
  });
});

describe('faceGeometry', () => {
  it('gives every token face finite, in-range numbers', () => {
    for (const id of ids) {
      const g = faceGeometry(id);
      for (const v of [
        g.eyeScaleX,
        g.eyeScaleY,
        g.gazeX,
        g.gazeY,
        g.upperLid,
        g.lowerLid,
        g.arch,
        g.crease,
        g.halo,
      ])
        expect(Number.isFinite(v), id).toBe(true);
      expect(g.upperLid, id).toBeGreaterThanOrEqual(0);
      expect(g.upperLid, id).toBeLessThanOrEqual(0.95);
      expect(g.arch, id).toBeLessThanOrEqual(0.85);
    }
  });

  it('resting nearly closes his eyes; neutral leaves them open', () => {
    expect(faceGeometry('resting').upperLid).toBeGreaterThan(0.5);
    expect(faceGeometry('neutral').upperLid).toBeLessThan(0.2);
  });

  it('happy is an arch (the ^ ^), with the upper lid eased so it reads as a crescent', () => {
    const happy = faceGeometry('happy');
    expect(happy.arch).toBeGreaterThan(0.3);
    expect(happy.lowerLid).toBe(0);
    expect(happy.upperLid).toBeLessThan(faceGeometry('sleepy').upperLid);
    expect(faceGeometry('neutral').arch).toBe(0);
  });

  it('surprised widens the eyes and lifts the upper lid clear', () => {
    const s = faceGeometry('surprised');
    expect(s.eyeScaleY).toBeGreaterThan(1);
    expect(s.upperLid).toBe(0);
  });

  it('reads the body pose from the token transform', () => {
    const d = faceGeometry('delighted').body;
    expect(d.translateY).toBe(-6);
    expect(d.rotate).toBe(-2);
    expect(d.scaleX).toBeCloseTo(1.05);
  });

  it('copes with the speaking face whose lower lid is voice-driven', () => {
    expect(faceGeometry('speaking').lowerLid).toBe(0);
  });
});

describe('mayReplace', () => {
  const held = { id: 'happy' as ExpressionId, source: 'choreography' as const, until: 1000 };

  it('never replays the face already showing (the 4× re-animation per handoff)', () => {
    expect(mayReplace(held, { id: 'happy', source: 'choreography' }, 0)).toBe(false);
  });

  it('a lower source waits for a choreographed face’s hold to end', () => {
    expect(mayReplace(held, { id: 'curious', source: 'reaction' }, 500)).toBe(false);
    expect(mayReplace(held, { id: 'curious', source: 'reaction' }, 1000)).toBe(true);
  });

  it('the same or a higher source may change it at any time', () => {
    expect(mayReplace(held, { id: 'attentive', source: 'choreography' }, 10)).toBe(true);
    expect(mayReplace({ ...held, source: 'reaction' }, { id: 'warm', source: 'agent' }, 10)).toBe(
      true
    );
  });
});
