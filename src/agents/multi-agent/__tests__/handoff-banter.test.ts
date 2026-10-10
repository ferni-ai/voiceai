/**
 * A handoff in a multi-agent call (the production path) speaks the written banter, not
 * fixed lines. The orchestrator used require() of a module that doesn't have these
 * functions; in this ES module that always threw, so every handoff said "Let me hand
 * you off to Maya." / "Hey! What's up?".
 */
import { describe, expect, it } from 'vitest';
import { AgentOrchestrator } from '../orchestrator.js';
import { getArrivingBanter, getHandoffBanter } from '../../../services/team-engagement/banter.js';

type Phrases = {
  getGoodbyePhrase(from: string, to: string): string | null;
  getGreetingPhrase(to: string, from: string, request: object): string | null;
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

    expect(orchestrator.getGoodbyePhrase('ferni', 'maya-santos')).not.toMatch(
      /^Let me hand you off to/
    );
    expect(orchestrator.getGreetingPhrase('maya-santos', 'ferni', {})).not.toBe("Hey! What's up?");
  });
});
