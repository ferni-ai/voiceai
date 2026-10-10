import { describe, expect, it, vi } from 'vitest';
import {
  openOnBehalfCall,
  voicemailInstructions,
  type CallOpeningFacts,
  type CallOpeningPorts,
  type FirstWords,
} from '../call-opening.js';
import { openingLine } from '../../../services/outreach/opening-line.js';

const mom: CallOpeningFacts = {
  recipientName: 'Linda Ford',
  requesterName: 'Seth',
  personal: true,
};

function phone(answered: boolean | Error, heard: FirstWords | Error) {
  const order: string[] = [];
  const ports = {
    waitForAnswer: vi.fn(async () => {
      if (answered instanceof Error) throw answered;
      return answered;
    }),
    hearFirstWords: vi.fn(async () => {
      if (heard instanceof Error) throw heard;
      return heard;
    }),
    say: vi.fn(async (text: string) => void order.push(`say: ${text}`)),
    leaveVoicemail: vi.fn(async () => void order.push('voicemail')),
    hangUp: vi.fn(async (d?: string) => void order.push(`hang up${d ? ` (${d})` : ''}`)),
  } satisfies CallOpeningPorts;
  return { ports, order };
}

describe('opening a call', () => {
  it('says nothing until someone answers, and hangs up if nobody does', async () => {
    const { ports, order } = phone(false, { category: 'human', transcript: 'Hello?' });
    await expect(openOnBehalfCall(mom, ports)).resolves.toBe('not_answered');
    expect(ports.hearFirstWords).not.toHaveBeenCalled();
    expect(order).toEqual(['hang up']);
  });

  it('lets the normal reply to "Hello?" be the opening, so only one voice answers', async () => {
    const { ports, order } = phone(true, { category: 'human', transcript: 'Hello?' });
    await expect(openOnBehalfCall(mom, ports)).resolves.toBe('person');
    expect(order).toEqual([]);
  });

  it('greets a silent pickup first, then introduces itself', async () => {
    const { ports, order } = phone(true, { category: 'uncertain', transcript: '' });
    await expect(openOnBehalfCall(mom, ports)).resolves.toBe('silence');
    expect(order).toEqual([`say: Hello? ${openingLine(mom)}`]);
  });

  it('treats an unclear answer as a person, never as a machine', async () => {
    const { ports } = phone(true, { category: 'uncertain', transcript: 'yeah hi' });
    await expect(openOnBehalfCall(mom, ports)).resolves.toBe('person');
    expect(ports.leaveVoicemail).not.toHaveBeenCalled();
    expect(ports.hangUp).not.toHaveBeenCalled();
  });

  it('leaves a voicemail after the greeting, then hangs up', async () => {
    const { ports, order } = phone(true, { category: 'machine-vm', transcript: 'leave a message' });
    await expect(openOnBehalfCall(mom, ports)).resolves.toBe('voicemail');
    expect(order).toEqual(['voicemail', 'hang up (voicemail_left)']);
  });

  it('hangs up quietly on a full mailbox or a phone menu, and says why', async () => {
    for (const category of ['machine-unavailable', 'machine-ivr'] as const) {
      const { ports, order } = phone(true, { category, transcript: 'mailbox is full' });
      await expect(openOnBehalfCall(mom, ports)).resolves.toBe('unreachable');
      expect(order).toEqual(['hang up (unreachable)']);
    }
  });

  it('never speaks or throws when something breaks; hangs up only if nobody had answered', async () => {
    const beforeAnswer = phone(new Error('room gone'), { category: 'human', transcript: '' });
    await expect(openOnBehalfCall(mom, beforeAnswer.ports)).resolves.toBe('error');
    expect(beforeAnswer.order).toEqual(['hang up']);

    const afterAnswer = phone(true, new Error('detector down'));
    await expect(openOnBehalfCall(mom, afterAnswer.ports)).resolves.toBe('error');
    expect(afterAnswer.order).toEqual([]); // the conversation carries on
  });
});

describe('the voicemail', () => {
  it('is short, says who and why, points back to the requester, and ends itself', () => {
    const text = voicemailInstructions(mom, 'see if she is still on for Sunday dinner');
    expect(text).toContain("Ferni, I'm an AI that helps Seth out");
    expect(text).toContain('see if she is still on for Sunday dinner');
    expect(text).toContain('call or text Seth');
    expect(text).toContain('nothing urgent');
    expect(text).toContain("Don't call endCall");
    expect(voicemailInstructions({ ...mom, personal: false }, 'x')).not.toContain('nothing urgent');
  });
});
