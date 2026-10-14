/**
 * Prod 2026-10-13: after Ferni handed the call to Jordan in one session, the
 * director labelled Jordan's lines "Ferni", wrote "Clarify that you are still
 * Ferni, not Jordan." and Jordan said "Hey, I'm actually still Ferni."
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Director, buildDirectorPrompt, linesFromChat, parseNotes } from '../director-notes.js';
import {
  SpeakerLog,
  claimsIdentity,
  directorPersonaAware,
  speakerNote,
} from '../director-persona.js';

const PROD_NOTE =
  'Seth sounds confused about who he is talking to. Clarify that you are still Ferni, not Jordan.';

const call = [
  { speaker: 'user' as const, text: 'Hey, can I talk to Jordan?' },
  { speaker: 'ferni' as const, text: 'Sure, handing you over.', by: 'Ferni' },
  { speaker: 'ferni' as const, text: "Hey, it's Jordan." },
  { speaker: 'user' as const, text: 'Hey Jordan, who is this?' },
];

afterEach(() => vi.unstubAllEnvs());

describe('director persona awareness', () => {
  it('is off unless DIRECTOR_PERSONA_AWARE is on', () => {
    expect(directorPersonaAware({})).toBe(false);
    expect(directorPersonaAware({ DIRECTOR_PERSONA_AWARE: 'on' })).toBe(true);
  });

  it('labels each assistant line with who said it, the speaker for unknown lines', () => {
    const prompt = buildDirectorPrompt(call, 'Seth', 'Jordan');
    expect(prompt).toContain('Ferni: Sure, handing you over.');
    expect(prompt).toContain("Jordan: Hey, it's Jordan.");
    expect(prompt).toContain("Your notes for Jordan's next reply:");
  });

  it('without a speaker labels every assistant line Ferni, as before', () => {
    const prompt = buildDirectorPrompt(call, 'Seth');
    expect(prompt).toContain("Ferni: Hey, it's Jordan.");
    expect(prompt).not.toContain('Jordan:');
    expect(prompt).toContain("Your notes for Ferni's next reply:");
  });

  it('tells the director a teammate is on the call and never to claim an identity', () => {
    const note = speakerNote('Jordan');
    expect(note).toContain('teammate Jordan, who is on the call now');
    expect(note).toContain('Never tell Jordan to say who they are');
    expect(speakerNote('Ferni')).not.toContain('teammate');
  });

  it("drops the prod note only when it knows who's speaking", () => {
    expect(claimsIdentity(PROD_NOTE)).toBe(true);
    expect(claimsIdentity("Seth asked how you're doing; answer that directly")).toBe(false);
    expect(claimsIdentity('Keep it short: he asked for the band name')).toBe(false);
    expect(parseNotes(PROD_NOTE, call, 'Jordan')).toEqual([]);
    expect(parseNotes(PROD_NOTE, call)).toEqual([PROD_NOTE]);
  });

  it('linesFromChat carries who said an assistant line when told', () => {
    const items = [
      { id: 'u1', type: 'message', role: 'user', textContent: 'Hey Jordan' },
      { id: 'a1', type: 'message', role: 'assistant', textContent: 'Hi there.' },
    ];
    expect(linesFromChat(items, (i) => (i.id === 'a1' ? 'Jordan' : undefined))).toEqual([
      { speaker: 'user', text: 'Hey Jordan' },
      { speaker: 'ferni', text: 'Hi there.', by: 'Jordan' },
    ]);
    expect(linesFromChat(items)).toEqual([
      { speaker: 'user', text: 'Hey Jordan' },
      { speaker: 'ferni', text: 'Hi there.' },
    ]);
  });

  it('SpeakerLog records the persona on the call when each assistant line is added', () => {
    let personaId: string | undefined = 'ferni';
    const log = new SpeakerLog(() => personaId);
    log.onItemAdded({ item: { id: 'a1', type: 'message', role: 'assistant' } });
    personaId = 'jordan-taylor';
    log.onItemAdded({ item: { id: 'a2', type: 'message', role: 'assistant' } });
    log.onItemAdded({ item: { id: 'u1', type: 'message', role: 'user' } });
    expect(log.by({ id: 'a1' })).toBe('Ferni');
    expect(log.by({ id: 'a2' })).toBe('Jordan');
    expect(log.by({ id: 'u1' })).toBeUndefined();
    expect(log.now()).toBe('Jordan');
    personaId = undefined;
    expect(log.now()).toBe('Ferni');
  });

  it('the Director sends the speaker to the model and drops identity notes', async () => {
    const seen: Array<{ system: string; prompt: string }> = [];
    const director = new Director({
      sessionId: 's',
      userName: 'Seth',
      speaking: () => 'Jordan',
      writer: async (system, prompt) => {
        seen.push({ system, prompt });
        return PROD_NOTE;
      },
    });
    await director.observe(call);
    expect(seen[0].system).toContain('Jordan, who is on the call now');
    expect(seen[0].prompt).toContain("Jordan: Hey, it's Jordan.");
    expect(director.current()).toEqual([]);
  });
});
