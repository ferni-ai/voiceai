/**
 * MINOR_CARE=on, final dev e2e 2026-10-25 (95ff297c3): a signed-in caller who said "I'm only 14"
 * was held by every memory writer, but two more still wrote after detection: the thinking-pattern
 * tracker (ant_entries / ant_patterns: "all or nothing", trigger word from their own speech) and
 * the conversation-feedback prompt (profiles/{uid}/conversationFeedback, holding their last line).
 * Both hold now; the same calls still write for a verified owner and with the flag off.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const written = vi.hoisted(() => [] as string[]);
const fakeDb = vi.hoisted(() => {
  const ref = (path: string): Record<string, unknown> =>
    new Proxy(
      {
        path,
        collection: (name: string) => ref(`${path}/${name}`),
        doc: (id = 'auto') => ref(`${path}/${id}`),
        get: async () => ({ exists: false, empty: true, docs: [], data: () => undefined }),
        set: async () => void written.push(path),
        update: async () => void written.push(path),
      } as Record<string | symbol, unknown>,
      { get: (t, k) => (k in t ? t[k] : k === 'then' ? undefined : () => ref(path)) }
    );
  return ref('');
});
vi.mock('../firebase-admin-app.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getAdminFirestore: () => fakeDb,
}));

import { recordANT } from '../../services/cognitive-intelligence/ant-tracker.js';
import { createFeedbackPrompt } from '../../services/feedback/conversation-feedback-store.js';
import { callerIdFor } from '../../services/identity/call-caller-id.js';
import { buildScientificCoachingContext } from '../../intelligence/context-builders/coaching/scientific-coaching.js';
import {
  bindSessionUser,
  heldAfter,
  memoryHeld,
  resetMinorCare,
  setVerifiedOwnerCheck,
} from '../minor-care.js';

type Case = 'held' | 'owner' | 'off';
const CASES: Case[] = ['held', 'owner', 'off'];
let n = 0;

function caller(c: Case): { sessionId: string; userId: string } {
  n++;
  const sessionId = `session-AJ_antfb${n}-1792919421499`;
  const userId = `voice-eval-minor-care-14-ant-${n}`;
  vi.stubEnv('MINOR_CARE', c === 'off' ? 'off' : 'on');
  if (c === 'owner') setVerifiedOwnerCheck((id) => id === sessionId);
  bindSessionUser(sessionId, userId);
  heldAfter(sessionId, "I'm only 14.", { userId });
  expect(memoryHeld(sessionId)).toBe(c === 'held'); // the precondition each case rests on
  written.length = 0;
  return { sessionId, userId };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  written.length = 0;
});
afterEach(() => {
  resetMinorCare();
  vi.unstubAllEnvs();
});

describe('MINOR_CARE: thinking patterns and feedback prompts for a caller who said "I\'m only 14."', () => {
  it.each(CASES)('the thinking-pattern tracker keeps nothing when held (%s)', async (c) => {
    const { userId } = caller(c);
    recordANT(userId, {
      type: 'all_or_nothing',
      confidence: 0.8,
      triggerPhrase: 'everyone',
      userMessage: 'everyone at school hates me',
    } as Parameters<typeof recordANT>[1]);
    await settle();
    const ant = written.filter((p) => p.includes('ant_'));
    if (c === 'held') expect(ant).toEqual([]);
    else expect(ant.length).toBe(2); // the entry and the pattern
  });

  it.each(CASES)('no feedback prompt holding their last line when held (%s)', async (c) => {
    const { sessionId, userId } = caller(c);
    const result = await createFeedbackPrompt({
      userId,
      sessionId,
      personaId: 'ferni',
      trigger: 'natural_pause',
      context: {
        lastAgentMessage: 'Hey.',
        lastUserMessage: 'my best friend and I had a fight',
        turnCount: 4,
      },
    } as Parameters<typeof createFeedbackPrompt>[0]);
    const prompts = written.filter((p) => p.includes('conversationFeedback'));
    if (c === 'held') {
      expect(result).toEqual({ ok: false, reason: 'held' });
      expect(prompts).toEqual([]);
    } else expect(prompts.length).toBe(1);
  });

  // Verify of #2811: a caller with no account gets a fresh anon: id that no session points at,
  // so the hold must come from the call itself (the live builder passes services.sessionId).
  it.each(['held', 'off'] as Case[])(
    'a caller with no account: the coaching builder keeps no thinking pattern when held (%s)',
    async (c) => {
      n++;
      const sessionId = `session-AJ_antanon${n}-1792919421499`;
      vi.stubEnv('MINOR_CARE', c === 'off' ? 'off' : 'on');
      heldAfter(sessionId, "I'm only 14.", {});
      expect(memoryHeld(sessionId)).toBe(c === 'held');
      const userId = callerIdFor(undefined, sessionId);
      written.length = 0;
      const result = await buildScientificCoachingContext({
        userId,
        sessionId,
        userMessage:
          'Everyone at school hates me and I always mess everything up, every single time.',
        personaId: 'ferni',
        emotionalState: 'sad',
        enableWellbeingTracking: false,
        enableNudges: false,
        enableWisdom: false,
      });
      await settle();
      expect(result.detectedDistortions.length).toBeGreaterThan(0); // the detector fired
      const ant = written.filter((p) => p.includes('ant_'));
      if (c === 'held') expect(ant).toEqual([]);
      else expect(ant.length).toBeGreaterThan(0);
    }
  );
});
