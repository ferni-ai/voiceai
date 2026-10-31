/**
 * FERNI_PERSONA_SLIP_GUARD=on (persona-slip-guard.ts). Prod call 2026-10-11:
 * asked about friends, Ferni named "Peter and Maya on the team"; asked his age,
 * he joked about "whatever an algorithm counts". Built the way a call builds
 * them: the character-mode system prompt (loadSystemPrompt) and the caller's
 * turn with its team line (withTurnReminder), with Maya and Peter unlocked.
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadModelBaseInstructions, loadSystemPrompt } from '../prompt-loader.js';
import { withTurnReminder } from '../turn-request.js';
import { TEAMMATES_ARE_COLLEAGUES } from '../../../personas/persona-slip-guard.js';

const FLAG = 'FERNI_PERSONA_SLIP_GUARD';
const profile = { subscription: { tier: 'free' } };

/** What the model is told on the caller's turn. */
function callerTurn(words: string): string {
  const chat = llm.ChatContext.empty();
  chat.addMessage({ role: 'user', content: words });
  const session = { userData: { personaId: 'ferni', services: { userProfile: profile } } };
  return (withTurnReminder(chat, session).items.at(-1) as llm.ChatMessage).textContent ?? '';
}

/** Sentences that name a teammate and talk about friends. */
const teamAsFriends = (text: string): string[] =>
  text.split(/(?<=[.;!?])\s+/).filter((s) => /\b(Peter|Maya)\b/.test(s) && /\bfriends?\b/i.test(s));

describe('persona slip guard', () => {
  beforeAll(() => {
    // Parsed once per process (team-unlocks.ts): 2 = Maya and Peter, as on the call.
    process.env['BYPASS_TEAM_UNLOCKS'] = '2';
  });
  afterEach(() => {
    delete process.env[FLAG];
    delete process.env['PROMPT_MODE'];
  });

  it('off: the character prompt has no friends, no age and no rule about AI talk', async () => {
    process.env['PROMPT_MODE'] = 'character';
    const prompt = await loadSystemPrompt('ferni');
    expect(prompt).toContain('This is who you are, not a script');
    expect(prompt).not.toMatch(/Boyd|fifty-seven|Never bring up AI/);
    expect(teamAsFriends(prompt)).toEqual([]);
  });

  it('on: the character prompt gives his own friends and age, and the team as colleagues', async () => {
    process.env['PROMPT_MODE'] = 'character';
    process.env[FLAG] = 'on';
    const prompt = await loadSystemPrompt('ferni');
    expect(prompt).toContain('This is who you are, not a script');
    expect(prompt).toMatch(/closest friends .*Lyle.*Owen.*Boyd.*Marty.*Hollis/);
    expect(prompt).toContain("You're fifty-seven.");
    expect(prompt).toContain('Never bring up AI, algorithms, code');
    expect(prompt).toContain('not even as a joke');
    // The sincere-ask rule stays the one in shared/ai-honesty.md; this defers to it.
    expect(prompt).toContain('your rule for that still holds: never deny it');
    expect(prompt).not.toMatch(/sincerely asks/);
    // Every sentence tying a teammate to "friends" says they aren't.
    const tied = teamAsFriends(prompt);
    expect(tied.length).toBeGreaterThan(0);
    for (const s of tied) expect(s).toMatch(/\b(aren't|not)\b/);
    // The sheet comes before the tool guidance, not after it.
    expect(prompt.indexOf('## Your own people')).toBeLessThan(prompt.indexOf('# Ferni Tool Usage'));
  });

  it("reads the flag on every load: one caller's guard never reaches the next caller's prompt", async () => {
    // Cohort flags change process.env per call; a process-wide prompt cache would
    // hand the next caller the sheet built for the last one (cohort-flags.ts).
    process.env['PROMPT_MODE'] = 'character';
    process.env[FLAG] = 'on';
    expect(await loadSystemPrompt('ferni')).toContain("You're fifty-seven.");
    delete process.env[FLAG];
    expect(await loadSystemPrompt('ferni')).not.toContain("You're fifty-seven.");
    process.env[FLAG] = 'on';
    expect(await loadSystemPrompt('ferni')).toContain("You're fifty-seven.");
  });

  it('on: the sincere-ask honesty rule in the base instructions is unchanged', async () => {
    process.env[FLAG] = 'on';
    const base = await loadModelBaseInstructions();
    expect(base).toContain('tell them the truth in a few words ("I\'m an AI, yeah")');
  });

  it("the team line on the caller's turn calls the teammates colleagues only when on", () => {
    const off = callerTurn('Got many friends out there?');
    expect(off).toContain(
      "Of your teammates, only Maya and Peter are available to this caller; don't bring up the others."
    );
    expect(off).not.toContain(TEAMMATES_ARE_COLLEAGUES);

    process.env[FLAG] = 'on';
    const on = callerTurn('Got many friends out there?');
    expect(on).toContain(
      `only Maya and Peter are available to this caller; don't bring up the others. ${TEAMMATES_ARE_COLLEAGUES}`
    );
    expect(on).toContain('not your friends or family');
  });
});
