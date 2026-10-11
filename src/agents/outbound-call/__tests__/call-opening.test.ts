import { describe, expect, it, vi } from 'vitest';
import {
  openOnBehalfCall,
  voicemailInstructions,
  type CallOpeningPorts,
  type FirstWords,
} from '../call-opening.js';
import { outboundOpener, type OutboundParties } from '../../../services/outreach/opening-line.js';

const dad: OutboundParties = { recipientName: 'Doug', sponsorName: 'Seth', personal: true };

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
    await expect(openOnBehalfCall(dad, ports)).resolves.toBe('not_answered');
    expect(ports.hearFirstWords).not.toHaveBeenCalled();
    expect(order).toEqual(['hang up']);
  });

  it('lets the normal reply to "Hello?" be the opener, so only one voice answers', async () => {
    const { ports, order } = phone(true, { category: 'human', transcript: 'Hello?' });
    await expect(openOnBehalfCall(dad, ports)).resolves.toBe('person');
    expect(order).toEqual([]);
  });

  it('says the one opener to a silent pickup', async () => {
    const { ports, order } = phone(true, { category: 'uncertain', transcript: '' });
    await expect(openOnBehalfCall(dad, ports)).resolves.toBe('silence');
    expect(order).toEqual([
      "say: Hi Doug, it's Ferni, Seth's AI friend. Seth asked me to check in on you. Is now an okay time?",
    ]);
    expect(order).toEqual([`say: ${outboundOpener(dad)}`]);
  });

  it('treats an unclear answer as a person, never as a machine', async () => {
    const { ports } = phone(true, { category: 'uncertain', transcript: 'yeah hi' });
    await expect(openOnBehalfCall(dad, ports)).resolves.toBe('person');
    expect(ports.leaveVoicemail).not.toHaveBeenCalled();
    expect(ports.hangUp).not.toHaveBeenCalled();
  });

  it('leaves a voicemail after the greeting, then hangs up as voicemail_left', async () => {
    const { ports, order } = phone(true, { category: 'machine-vm', transcript: 'leave a message' });
    await expect(openOnBehalfCall(dad, ports)).resolves.toBe('voicemail');
    expect(order).toEqual(['voicemail', 'hang up (voicemail_left)']);
  });

  it('hangs up quietly on a full mailbox or a phone menu, as unreachable', async () => {
    for (const category of ['machine-unavailable', 'machine-ivr'] as const) {
      const { ports, order } = phone(true, { category, transcript: 'mailbox is full' });
      await expect(openOnBehalfCall(dad, ports)).resolves.toBe('unreachable');
      expect(order).toEqual(['hang up (unreachable)']);
      expect(ports.say).not.toHaveBeenCalled();
    }
  });

  it('never speaks or throws when something breaks; hangs up only if nobody had answered', async () => {
    const beforeAnswer = phone(new Error('room gone'), { category: 'human', transcript: '' });
    await expect(openOnBehalfCall(dad, beforeAnswer.ports)).resolves.toBe('error');
    expect(beforeAnswer.order).toEqual(['hang up']);

    const afterAnswer = phone(true, new Error('detector down'));
    await expect(openOnBehalfCall(dad, afterAnswer.ports)).resolves.toBe('error');
    expect(afterAnswer.order).toEqual([]); // the conversation carries on
  });

  it('still resolves when the hang-up after a failure fails too', async () => {
    const { ports } = phone(new Error('room gone'), { category: 'human', transcript: '' });
    ports.hangUp.mockRejectedValueOnce(new Error('room service down'));
    await expect(openOnBehalfCall(dad, ports)).resolves.toBe('error');
  });
});

describe('the voicemail', () => {
  it('opens with the same AI disclosure, says why, points back to Seth, and ends itself', () => {
    const text = voicemailInstructions(dad, 'see if he is still on for Sunday dinner');
    expect(text).toContain(`"Hi Doug, it's Ferni, Seth's AI friend."`);
    expect(text).toContain('see if he is still on for Sunday dinner');
    expect(text).toContain('call or text Seth');
    expect(text).toContain('nothing urgent');
    expect(text).toContain("Don't call endCall");
    expect(voicemailInstructions({ ...dad, personal: false }, 'x')).not.toContain('nothing urgent');
  });

  it('names nobody it does not know', () => {
    const text = voicemailInstructions({ personal: true }, 'say hello');
    expect(text).toContain(`"Hi, it's Ferni, an AI friend."`);
    expect(text).not.toMatch(/undefined/);
  });
});
