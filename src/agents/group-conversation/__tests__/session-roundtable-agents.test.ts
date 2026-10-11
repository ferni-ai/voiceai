/**
 * Roundtable agents over the call's one session: each line is written with its persona's
 * identity and spoken through the session in that persona's voice (userData.speakingAs),
 * which is cleared when the line ends, fails or the agent leaves.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  cleanLine,
  createSessionRoundtableAgents,
  personaName,
  roundtableSystemPrompt,
  type SpeakingSession,
} from '../session-roundtable-agents.js';
import type { AgentCreationContext, ResponseContext } from '../team-roundtable.js';

function fakeSession() {
  const spoken: Array<{ text: string; voice: unknown }> = [];
  let finish: (() => void) | null = null;
  let fail: ((e: Error) => void) | null = null;
  const session: SpeakingSession = {
    userData: { personaId: 'ferni' },
    say: (text) => {
      spoken.push({ text, voice: session.userData.speakingAs });
      const playout = new Promise<void>((resolve, reject) => {
        finish = resolve;
        fail = reject;
      });
      return { waitForPlayout: () => playout };
    },
  };
  return { session, spoken, finish: () => finish?.(), fail: (e: Error) => fail?.(e) };
}

const creation = {} as AgentCreationContext;
const context: ResponseContext = {
  transcript: 'user: should I pay off my card or save?',
  lastSpeaker: 'user',
  lastUtterance: 'Maya, what do you think?',
  collaborationMode: 'discussion',
  topic: 'money',
  otherAgents: [
    { personaId: 'ferni', name: 'Ferni' },
    { personaId: 'peter-john', name: 'Peter' },
  ],
  wasAddressed: true,
};

describe('session roundtable agents', () => {
  it("speaks a line in its persona's voice and clears it when the line ends", async () => {
    const { session, spoken, finish } = fakeSession();
    const maya = await createSessionRoundtableAgents({ session, write: async () => 'x' })(
      'maya-habits',
      creation
    );

    const playing = maya.say('Pay the card first.');
    expect(spoken).toEqual([{ text: 'Pay the card first.', voice: 'maya-santos' }]);
    expect(session.userData.speakingAs).toBe('maya-santos');
    finish();
    await playing;
    expect(session.userData.speakingAs).toBeUndefined();
    expect(session.userData.personaId).toBe('ferni'); // who is on the call never changes
  });

  it('clears the voice when a line fails, and says nothing when muted or empty', async () => {
    const { session, spoken, fail } = fakeSession();
    const peter = await createSessionRoundtableAgents({ session, write: async () => 'x' })(
      'peter-john',
      creation
    );

    const playing = peter.say('Index funds.');
    fail(new Error('interrupted'));
    await expect(playing).rejects.toThrow('interrupted');
    expect(session.userData.speakingAs).toBeUndefined();

    peter.setMuted(true);
    await peter.say('muted line');
    peter.setMuted(false);
    await peter.say('   ');
    expect(spoken.map((s) => s.text)).toEqual(['Index funds.']);
  });

  it("writes its line as itself, knowing who else is there, and cleans the model's output", async () => {
    const write = vi.fn(
      async () => '**Maya:** "Pay the high-interest card first, then build a small cushion."'
    );
    const { session } = fakeSession();
    const maya = await createSessionRoundtableAgents({ session, write })('maya-habits', creation);

    expect(await maya.generateResponse(context)).toBe(
      'Pay the high-interest card first, then build a small cushion.'
    );
    const [system, prompt] = write.mock.calls[0] as unknown as [string, string];
    expect(system).toMatch(/^You are Maya/);
    expect(system).toContain('Ferni, Peter');
    expect(system).toContain('The topic: money');
    expect(prompt).toContain('They spoke to you directly.');
  });

  it('a writer that fails gives an empty line (nothing is spoken) rather than an error', async () => {
    const { session } = fakeSession();
    const alex = await createSessionRoundtableAgents({
      session,
      write: async () => {
        throw new Error('model down');
      },
    })('alex-chen', creation);
    expect(await alex.generateResponse(context)).toBe('');
  });
});

describe('names and lines', () => {
  it('resolves names through the persona registry, aliases included', () => {
    expect(personaName('maya-habits')).toBe('Maya');
    expect(personaName('peter-john')).toBe('Peter');
    expect(personaName('ferni')).toBe('Ferni');
    // The ids the group-conversation tool and the web send (they used to fall back to Ferni)
    expect(personaName('nayan-sharma')).toBe('Nayan');
  });

  it('keeps long lines to whole sentences', () => {
    const long = `${'This is a sentence about money. '.repeat(20)}`;
    const line = cleanLine(long, 'Maya');
    expect(line.length).toBeLessThanOrEqual(420);
    expect(line.endsWith('.')).toBe(true);
  });

  it('the system prompt names the persona and role', () => {
    expect(roundtableSystemPrompt('ferni', context)).toMatch(
      /^You are Ferni \(Ferni\), the life coach/
    );
  });
});
