import { afterEach, describe, expect, it } from 'vitest';
import { extractionMoment, forgetExtractionContext } from '../extraction-moment.js';

const on = { EXTRACTION_CONTEXT: 'on' };
const at = Date.parse('2026-01-05T18:00:00Z');
const line = (sessionId: string, transcript: string) => ({ sessionId, timestamp: at, transcript });

afterEach(() => forgetExtractionContext());

describe('extractionMoment', () => {
  it('shows the lines said before this one, so "it" can be resolved', () => {
    extractionMoment(line('call-1', 'Hey, could you call my brother?'), on);
    extractionMoment(line('call-1', 'His name is Pete.'), on);
    const moment = extractionMoment(line('call-1', "It's uh 435 339 7687."), on);
    expect(moment).toContain('This call took place on');
    expect(moment).toContain('- "Hey, could you call my brother?"\n- "His name is Pete."');
    expect(moment).not.toContain('435 339 7687'); // the line itself is the transcript, not context
    expect(moment).toMatch(/never as "him"/);
  });

  it('keeps calls apart, and the first line of a call has no context', () => {
    extractionMoment(line('call-1', 'My sister Mindy lives in Utah.'), on);
    const other = extractionMoment(line('call-2', 'I play guitar at home.'), on);
    expect(other).not.toContain('Earlier in this call');
    expect(other).not.toContain('Mindy');
  });

  it('keeps only the last few lines', () => {
    for (let i = 1; i <= 8; i++) extractionMoment(line('call-1', `line ${i}`), on);
    const moment = extractionMoment(line('call-1', 'line 9'), on);
    expect(moment).toContain('- "line 3"');
    expect(moment).not.toContain('- "line 2"');
    expect(moment).toContain('- "line 8"');
  });

  it('is only the call date unless EXTRACTION_CONTEXT=on', () => {
    extractionMoment(line('call-1', 'His name is Pete.'), {});
    const moment = extractionMoment(line('call-1', "It's 435 339 7687."), {});
    expect(moment).toContain('This call took place on');
    expect(moment).not.toContain('Earlier in this call');
  });
});
