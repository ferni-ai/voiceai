/**
 * PERSONA_VOICE: each persona's own voice line rides the turn reminder, after
 * the shared style, so the reminder stops telling every persona to sound the
 * same. Off (the default) the reminder is byte for byte what it was; on, the
 * speaking persona's line and only that one; never on a crisis turn.
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PERSONA_VOICE_LINES, personaVoiceNote } from '../persona-voice.js';
import { withTurnReminder } from '../turn-request.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const TEAM = ['ferni', 'alex-chen', 'peter-john', 'maya-santos', 'jordan-taylor', 'nayan-patel'];

/** The reminder text appended to the caller's turn, for `personaId`. */
function reminderFor(personaId: string, options: { shape?: boolean } = {}): string {
  // Parts of the reminder are drawn at random; pin the draw so two builds compare byte for byte.
  vi.spyOn(Math, 'random').mockReturnValue(0.42);
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'user', content: 'I got the job!!' });
  const out = withTurnReminder(
    ctx,
    { userData: { userId: 'persona-voice-test', personaId } },
    options
  );
  const last = out.items[out.items.length - 1] as llm.ChatMessage;
  return last.content.filter((c): c is string => typeof c === 'string').join('');
}

describe('PERSONA_VOICE', () => {
  it('off: the reminder is what it was without the flag', () => {
    vi.stubEnv('PERSONA_VOICE', '');
    const unset = reminderFor('alex-chen');
    vi.stubEnv('PERSONA_VOICE', 'off');
    expect(reminderFor('alex-chen')).toBe(unset);
    expect(unset).not.toContain('You sound like');
  });

  it('on: each persona gets its own line and no one else’s', () => {
    vi.stubEnv('PERSONA_VOICE', 'on');
    for (const persona of TEAM) {
      const reminder = reminderFor(persona);
      expect(reminder, persona).toContain(PERSONA_VOICE_LINES[persona]);
      for (const other of TEAM.filter((p) => p !== persona)) {
        expect(reminder, `${persona} carries ${other}`).not.toContain(PERSONA_VOICE_LINES[other]);
      }
    }
  });

  it('on: the line comes after the shared style, so it is the one followed', () => {
    vi.stubEnv('PERSONA_VOICE', 'on');
    vi.stubEnv('TURN_SHAPE', 'on');
    const reminder = reminderFor('alex-chen');
    const style = reminder.indexOf('Talk like a close friend');
    expect(style).toBeGreaterThan(-1);
    expect(reminder.indexOf(PERSONA_VOICE_LINES['alex-chen'])).toBeGreaterThan(style);
  });

  it('on: a crisis turn (shape: false) carries no voice line', () => {
    vi.stubEnv('PERSONA_VOICE', 'on');
    expect(reminderFor('maya-santos', { shape: false })).not.toContain('You sound like');
  });

  it('a persona without a line, or no persona, gets nothing', () => {
    expect(personaVoiceNote('john-bogle', {}, { PERSONA_VOICE: 'on' })).toBe('');
    expect(personaVoiceNote(undefined, {}, { PERSONA_VOICE: 'on' })).toBe('');
    expect(personaVoiceNote('alex-chen', {}, { PERSONA_VOICE: 'off' })).toBe('');
  });

  it('every line is distinct, names its own persona and quotes nothing to parrot', () => {
    const names: Record<string, string> = {
      ferni: 'Ferni',
      'alex-chen': 'Alex',
      'peter-john': 'Peter',
      'maya-santos': 'Maya',
      'jordan-taylor': 'Jordan',
      'nayan-patel': 'Nayan',
    };
    expect(new Set(TEAM.map((p) => PERSONA_VOICE_LINES[p])).size).toBe(TEAM.length);
    for (const persona of TEAM) {
      expect(PERSONA_VOICE_LINES[persona], persona).toMatch(
        new RegExp(`^You sound like ${names[persona]}:`)
      );
      expect(PERSONA_VOICE_LINES[persona], persona).not.toMatch(/["“”]/);
    }
  });
});
