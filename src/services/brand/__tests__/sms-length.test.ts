import { describe, expect, it } from 'vitest';
import { SMS_SEND_MAX_CHARS, validateSmsContent } from '../brand-hooks.js';
import { adaptForChannel } from '../channel-adapter.js';

const REMINDER =
  "It's Ferni. You asked me to remind you: pick up the dry cleaning on Main Street before they close at six, and grab the birthday card for your mom on the way home tonight.";
const BRIEF =
  "Morning Seth, it's Alex. Today: 10am standup, 2pm dentist and 4:30pm call with Dan. Due: call the plumber and renew the car registration. Still open: send Mindy the photos and finish the deck. Call me if you want to move anything.";

describe('SMS text before sending', () => {
  it('keeps a reminder longer than one segment whole (was cut to "It\'s Ferni.")', () => {
    expect(REMINDER.length).toBeGreaterThan(160);
    expect(validateSmsContent(REMINDER, 'ferni').message).toBe(REMINDER);
  });

  it("keeps a morning brief whole, close included", () => {
    const { message } = validateSmsContent(BRIEF, 'alex');
    expect(message).toBe(BRIEF);
    expect(message).toContain('Call me if you want to move anything.');
  });

  it('still shortens past what the sender joins into one text, at a sentence end', () => {
    const long = Array.from({ length: 25 }, (_, i) => `Sentence number ${i} is here.`).join(' ');
    expect(long.length).toBeGreaterThan(SMS_SEND_MAX_CHARS);
    const { message } = validateSmsContent(long, 'ferni');
    expect(message.length).toBeLessThanOrEqual(SMS_SEND_MAX_CHARS);
    expect(message.endsWith('.')).toBe(true);
  });

  it('leaves other uses of the sms channel at one segment', () => {
    expect(adaptForChannel(REMINDER, 'sms').length).toBeLessThanOrEqual(160);
  });
});
