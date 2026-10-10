import { describe, expect, it } from 'vitest';
import { addressCheck, openingLine, type OpeningLineFacts } from '../opening-line.js';

const call = (recipientName: string, extra: Partial<OpeningLineFacts> = {}): OpeningLineFacts => ({
  recipientName,
  requesterName: 'Seth',
  personal: true,
  ...extra,
});

describe('addressCheck', () => {
  it('asks for people by the name they would answer to', () => {
    expect(addressCheck(call('Linda Ford'))).toBe('Linda');
    expect(addressCheck(call('Dr. Priya Patel'))).toBe('Dr. Patel');
    expect(addressCheck(call('Aunt Sue'))).toBe('Sue');
  });

  it("calls family words the requester's relative, never Ferni's", () => {
    expect(addressCheck(call('Mom'))).toBe("Seth's mom");
    expect(addressCheck(call('my grandma'))).toBe("Seth's grandma");
    expect(addressCheck(call('Mom', { requesterName: 'the user' }))).toBeNull();
  });

  it('asks about no name when the pipeline has none', () => {
    for (const placeholder of ['Unknown', 'them', 'Friend', '']) {
      expect(addressCheck(call(placeholder))).toBeNull();
    }
  });
});

describe('openingLine', () => {
  it('says who is asking, for whom, and on a personal call that nothing is wrong', () => {
    expect(openingLine(call('Linda Ford'))).toBe(
      "Hi, is this Linda? This is Ferni, I'm an AI that helps Seth out. Seth asked me to give you a quick call. Nothing's wrong, everything's fine."
    );
    expect(openingLine(call('Dr. Priya Patel', { personal: false }))).toBe(
      "Hi, is this Dr. Patel? This is Ferni, I'm an AI that helps Seth out. Seth asked me to give you a quick call."
    );
  });

  it('never says a placeholder out loud', () => {
    const line = openingLine(call('Unknown', { requesterName: 'the user' }));
    expect(line).not.toMatch(/unknown|the user/i);
    expect(line.startsWith('Hi there!')).toBe(true);
  });
});
