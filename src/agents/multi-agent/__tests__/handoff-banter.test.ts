/**
 * A handoff in a multi-agent call (the production path) speaks the written banter, not
 * fixed lines. The orchestrator used require() of a module that doesn't have these
 * functions; in this ES module that always threw, so every handoff said "Let me hand
 * you off to Maya." / "Hey! What's up?".
 */
import { describe, expect, it } from 'vitest';
import { AgentOrchestrator } from '../orchestrator.js';
import {
  HANDOFF_BANTER,
  getArrivingBanter,
  getHandoffBanter,
} from '../../../services/team-engagement/banter.js';
import { getPersonaPronouns } from '../../../personas/persona-pronouns.js';

type Phrases = {
  getGoodbyePhrase(agent: object, request: object): string | null;
  getGreetingPhrase(to: string, from: string, firstLine?: string): string | null;
};

const newOrchestrator = (): Phrases =>
  new AgentOrchestrator({
    ctx: {} as never,
    room: {} as never,
    userParticipant: {} as never,
    createPersonaAgent: async () => ({}) as never,
    sessionId: 'banter-test',
  }) as unknown as Phrases;

describe('handoff banter in a multi-agent call', () => {
  it("Ferni's goodbye and Maya's greeting are the written banter", () => {
    const orchestrator = newOrchestrator();
    const goodbye = getHandoffBanter('ferni', 'maya-santos');
    const greeting = getArrivingBanter('maya-santos', 'ferni');
    expect(goodbye, 'there is banter for this pair').toBeTruthy();
    expect(greeting, 'there is banter for this pair').toBeTruthy();

    const ferni = { personaId: 'ferni', session: {} };
    expect(orchestrator.getGoodbyePhrase(ferni, { targetPersonaId: 'maya-santos' })).not.toMatch(
      /^Let me hand you off to/
    );
    expect(orchestrator.getGreetingPhrase('maya-santos', 'ferni')).not.toBe("Hey! What's up?");
  });
});

describe('handoff banter pronouns', () => {
  // Prod call 2026-10-17: "Let me get Ferni for you. They're great at this." Ferni is he/him.
  const THIRD_PERSON = /\b(he|him|his|she|her|hers|they|them|their)\b|\b(he|she|they)'/gi;

  it('refers to the teammate being brought in by their own pronouns', () => {
    for (const [from, targets] of Object.entries(HANDOFF_BANTER)) {
      for (const [to, lines] of Object.entries(targets)) {
        const own = Object.values(getPersonaPronouns(to));
        for (const line of lines) {
          for (const m of line.matchAll(THIRD_PERSON)) {
            const word = (m[1] ?? m[2]).toLowerCase();
            expect(own, `${from} → ${to}: ${line}`).toContain(word);
          }
        }
      }
    }
  });
});
