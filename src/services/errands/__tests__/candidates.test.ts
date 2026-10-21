import { describe, expect, it } from 'vitest';
import { agreed, callable, dialsTo, shortlist } from '../candidates.js';
import type { Candidate, Errand } from '../errand.js';

const cand = (placeId: string, over: Partial<Candidate> = {}): Candidate => ({
  placeId,
  name: placeId,
  phone: '+15550100001',
  why: '',
  status: 'new',
  attempts: 0,
  ...over,
});

describe('callable', () => {
  it('only a looked-up landline or VoIP line', () => {
    expect(callable(cand('a', { lineChecked: true, lineType: 'landline' }))).toBe(true);
    expect(callable(cand('a', { lineChecked: true, lineType: 'voip' }))).toBe(true);
    expect(callable(cand('a', { lineChecked: false, lineType: 'landline' }))).toBe(false);
    expect(callable(cand('a', { lineChecked: true, lineType: 'mobile' }))).toBe(false);
    expect(callable(cand('a', { lineChecked: true, lineType: 'unknown' }))).toBe(false);
  });
});

describe('dialsTo', () => {
  it('counts calls to a number from every place that shares it', () => {
    const e = {
      candidates: [
        cand('a', { dials: ['t1'] }),
        cand('b', { dials: ['t2', 't3'] }),
        cand('c', { phone: '+15550100002', dials: ['t4'] }),
      ],
    } as unknown as Errand;
    expect(dialsTo(e, '+15550100001')).toEqual(['t1', 't2', 't3']);
  });
});

describe('shortlist', () => {
  it('adds fresh, unchecked candidates, drops unsafe ids and duplicates, and ignores a claimed line type', () => {
    const hours = { open: '08:00', close: '12:00' };
    const { added, unsafe } = shortlist(
      [cand('known')],
      [
        { placeId: 'p1', name: 'P', phone: '+1', why: 'w', lineType: 'landline', hours },
        { placeId: 'p1', name: 'again', phone: '+1', why: '' },
        { placeId: 'known', name: 'K', phone: '+1', why: '' },
        { placeId: 'p1+p2', name: 'X', phone: '+1', why: '' },
      ]
    );
    expect(unsafe).toBe(1);
    expect(added).toEqual([
      {
        placeId: 'p1',
        name: 'P',
        phone: '+1',
        why: 'w',
        hours,
        status: 'new',
        attempts: 0,
        lineChecked: false,
      },
    ]);
  });
});

describe('agreed', () => {
  it('keeps what the call settled; a blank confirmation counts as none', () => {
    const base = { type: 'call_outcome', placeId: 'p1', status: 'booked' } as const;
    expect(
      agreed({ ...base, confirmation: '  ', readBack: false, callId: 'c1', when: 'w' })
    ).toEqual({
      placeId: 'p1',
      when: 'w',
      readBack: false,
      evidence: 'c1',
    });
    expect(agreed({ ...base, confirmation: ' 4821 ', contactName: 'Dana' })).toEqual({
      placeId: 'p1',
      confirmation: '4821',
      contactName: 'Dana',
    });
  });
});
