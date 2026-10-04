import { describe, expect, it } from 'vitest';
import {
  Director,
  buildDirectorPrompt,
  formatNotes,
  linesFromChat,
  parseNotes,
} from '../director-notes.js';

const lines = [
  { speaker: 'user' as const, text: 'My manager moved the deadline up again.' },
  { speaker: 'ferni' as const, text: 'Again? That guy.' },
];

describe('director notes', () => {
  it('keeps at most two notes and drops NONE, numbering and quoted lines', () => {
    expect(parseNotes('NONE')).toEqual([]);
    expect(parseNotes(undefined)).toEqual([]);
    expect(parseNotes('1. They said "again": this keeps happening\n- Keep it light\n3. third')).toEqual([
      'They said "again": this keeps happening',
      'Keep it light',
    ]);
    // A line for Ferni to say is not a note.
    expect(parseNotes('"Wow, that sounds hard."')).toEqual([]);
  });

  it('drops generic therapist notes and notes about things nobody said', () => {
    expect(parseNotes('Acknowledge their frustration\nValidate the feeling', lines)).toEqual([]);
    // Invented: nothing about weather was said in this call.
    expect(parseNotes('They laughed at the weather bit', lines)).toEqual([]);
    expect(parseNotes('The deadline moved again: take their side first', lines)).toEqual([
      'The deadline moved again: take their side first',
    ]);
  });

  it('drops notes that push on a pause or a skipped question', () => {
    // Seen on dev: "Sam didn't respond. Call that out." / "He didn't answer your question. Ask again."
    expect(
      parseNotes("Sam didn't respond about the deadline. Call that out.\nHe didn't answer about the manager. Ask again.", lines)
    ).toEqual([]);
  });

  it('shows the director the recent call with the names', () => {
    const prompt = buildDirectorPrompt(lines, 'Seth');
    expect(prompt).toContain('Seth: My manager moved the deadline up again.');
    expect(prompt).toContain('Ferni: Again? That guy.');
  });

  it('writes notes after a reply and keeps them for every request of the next one', async () => {
    const d = new Director({ sessionId: 's', writer: async () => 'The deadline moved again; ask nothing, just side with them' });
    expect(d.current()).toEqual([]);
    await d.observe(lines);
    expect(d.current()).toEqual(['The deadline moved again; ask nothing, just side with them']);
    expect(d.current()).toHaveLength(1); // reading doesn't consume
    expect(formatNotes(d.current())).toBe('[Director: The deadline moved again; ask nothing, just side with them]');
  });

  it('drops a slow turn once a newer one has started, and gives no note on timeout', async () => {
    let release!: (v: string) => void;
    const slow = new Promise<string>((r) => (release = r));
    const replies = [slow, Promise.resolve('fresh note about the deadline')];
    const d = new Director({ sessionId: 's', writer: () => replies.shift()! });
    const first = d.observe(lines);
    await d.observe(lines);
    release('stale note about the manager');
    await first;
    expect(d.current()).toEqual(['fresh note about the deadline']);

    const late = new Director({ sessionId: 's', budgetMs: 10, writer: () => new Promise(() => {}) });
    await late.observe(lines);
    expect(late.current()).toEqual([]);
  });

  it('reads the spoken conversation from the chat, without speech markup', () => {
    expect(
      linesFromChat([
        { type: 'message', role: 'system', textContent: 'prompt' },
        { type: 'message', role: 'user', textContent: 'hey' },
        { type: 'message', role: 'assistant', textContent: '<emotion value="calm"/>Hey.  What\'s up?' },
        { type: 'function_call' },
      ])
    ).toEqual([
      { speaker: 'user', text: 'hey' },
      { speaker: 'ferni', text: "Hey. What's up?" },
    ]);
  });
});
