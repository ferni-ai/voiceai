/**
 * The CONTEXT_PACKET log line carries section names, token estimates and
 * dropped counts only: none of the caller's words, names, memory lines or
 * notes, even from items the budget, the ranker or supersession dropped.
 * Same approach as the turn receipt's no-PII test.
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => [] as unknown[]);
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  const logger = {
    debug: () => undefined,
    info: (...args: unknown[]) => logged.push(args),
    warn: (...args: unknown[]) => logged.push(args),
    error: (...args: unknown[]) => logged.push(args),
    child: () => logger,
  };
  return { ...actual, createLogger: () => logger };
});
vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => null }));

import { setDirector, type Director } from '../director-notes.js';
import { rememberForPacket, packetLogFields, turnPacket } from '../context-packet/turn-packet.js';
import { withTurnReminder } from '../turn-request.js';

const PII = [
  'Jane',
  'Doe',
  '555',
  '867',
  '5309',
  'jane@example.com',
  'lake story',
  'Biscuit',
  'deck',
];

function plant(session: object): void {
  rememberForPacket(
    session,
    {
      facts: [
        { entity: 'Jane Doe', key: 'phone', value: '+1 555 867 5309', confidence: 0.9 },
        { entity: 'Jane Doe', key: 'email', value: 'jane@example.com', confidence: 0.3 },
        ...Array.from({ length: 30 }, (_, i) => ({
          entity: 'Biscuit',
          key: `fact_${i}`,
          value: `Jane Doe chewed the deck ${i} times, call 555 867 5309`,
          confidence: 0.9,
        })),
      ],
      rest: null,
    },
    'Jane Doe'
  );
}

afterEach(() => {
  logged.length = 0;
  vi.unstubAllEnvs();
});

describe('CONTEXT_PACKET logging', () => {
  it('packetLogFields: counts only, though the packet itself carries every planted detail', () => {
    const session = { userData: { services: { sessionId: 'log-bare' } } };
    plant(session);
    const packet = turnPacket(session, {
      personaId: 'ferni',
      userName: 'Jane Doe',
      words: 'how do you know my number, 555 867 5309?',
      notes: [
        'You told the lake story already.',
        'Jane Doe: none of your teammates are available.',
        '[Director: Jane Doe sounds tired; stop explaining the deck. / Mention the lake story.]',
        'Game on: Jane Doe vs Ferni.',
        'Keep it short for Jane Doe.',
      ],
      now: Date.parse('2026-10-11T18:00:00Z'),
    });
    // Non-vacuous: the planted details really are in the packet.
    for (const pii of ['Jane', '5309', 'lake story', 'Biscuit']) expect(packet.text).toContain(pii);

    const json = JSON.stringify(packetLogFields(packet.accounting));
    for (const pii of PII) expect(json).not.toContain(pii);
    // The accounting the receipt will read carries no text either: ids are opaque.
    const accounting = JSON.stringify(packet.accounting);
    for (const pii of PII) expect(accounting).not.toContain(pii);
  });

  it('what withTurnReminder logs on the live path has none of it', () => {
    const session = {
      userData: { userName: 'Jane Doe', personaId: 'ferni', services: { sessionId: 'log-named' } },
    };
    plant(session);
    setDirector(session, {
      current: () => ['Jane Doe sounds tired; stop explaining the deck.'],
      told: () => 'You told the lake story already.',
    } as unknown as Director);
    const chat = llm.ChatContext.empty();
    chat.addMessage({ role: 'user', content: 'Jane Doe here, how do you know 555 867 5309?' });

    vi.stubEnv('CONTEXT_PACKET', 'on');
    const sent = (withTurnReminder(chat, session).items.at(-1) as llm.ChatMessage).textContent;
    expect(sent).toContain('5309');

    const packetLines = logged.filter((args) => (args as unknown[]).includes('CONTEXT_PACKET'));
    expect(packetLines).toHaveLength(1);
    const json = JSON.stringify(logged);
    for (const pii of PII) expect(json).not.toContain(pii);
  });
});
