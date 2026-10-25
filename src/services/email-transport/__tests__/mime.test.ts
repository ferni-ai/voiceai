import { describe, expect, it } from 'vitest';
import type { OutgoingEmail } from '../../../types/email-sender.js';
import {
  buildMimeMessage,
  encodeHeaderText,
  redactAddresses,
  toBase64Url,
  unsubscribeHeaders,
} from '../mime.js';

const FROM = { address: 'hello@ferni.ai', name: 'Ferni' };
const DATE = new Date('2026-10-18T12:00:00Z');
let n = 0;
const boundary = (): string => `B${++n}`;

const base: OutgoingEmail = {
  to: 'sam@example.com',
  subject: 'You are in',
  text: 'Plain hello',
  html: '<p>HTML hello</p>',
  kind: 'transactional',
};

/** Header block of a message (up to the first blank line), unfolded. */
function headersOf(raw: string): Record<string, string> {
  const block = raw.split('\r\n\r\n')[0]!.replace(/\r\n /g, ' ');
  return Object.fromEntries(
    block.split('\r\n').map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 2)])
  );
}

/** Decode each base64 body part of a given content type. */
function partBodies(raw: string, type: string): string[] {
  const re = new RegExp(
    `Content-Type: ${type}; charset=UTF-8\\r\\nContent-Transfer-Encoding: base64\\r\\n\\r\\n([A-Za-z0-9+/=\\r\\n]+?)\\r\\n(?:--|$)`,
    'g'
  );
  return [...raw.matchAll(re)].map((m) =>
    Buffer.from(m[1]!.replace(/\r\n/g, ''), 'base64').toString('utf8')
  );
}

/** RFC 2047 B-encoded words back to text (whitespace between two words is not part of the text). */
const decodeWords = (s: string): string =>
  s
    .replace(/\?=\s+(?==\?UTF-8\?B\?)/g, '?=')
    .replace(/=\?UTF-8\?B\?([^?]+)\?=/g, (_, b64: string) =>
      Buffer.from(b64, 'base64').toString('utf8')
    );

describe('buildMimeMessage', () => {
  it('writes From, To, Reply-To, Subject, Date and MIME-Version', () => {
    const raw = buildMimeMessage({ ...base, toName: 'Sam', replyTo: 'support@ferni.ai' }, FROM, {
      date: DATE,
      boundary,
    });
    const h = headersOf(raw);
    expect(h.From).toBe('"Ferni" <hello@ferni.ai>');
    expect(h.To).toBe('"Sam" <sam@example.com>');
    expect(h['Reply-To']).toBe('support@ferni.ai');
    expect(h.Subject).toBe('You are in');
    expect(h.Date).toBe('Sun, 18 Oct 2026 12:00:00 GMT');
    expect(h['MIME-Version']).toBe('1.0');
    expect(h['Content-Type']).toMatch(/^multipart\/alternative; boundary="B\d+"$/);
  });

  it('sends text then html as multipart/alternative, both UTF-8 base64', () => {
    const raw = buildMimeMessage({ ...base, text: 'Café ☕ ok', html: '<p>Café ☕</p>' }, FROM, {
      boundary,
    });
    expect(partBodies(raw, 'text/plain')).toEqual(['Café ☕ ok']);
    expect(partBodies(raw, 'text/html')).toEqual(['<p>Café ☕</p>']);
    expect(raw.indexOf('text/plain')).toBeLessThan(raw.indexOf('text/html'));
    expect(raw.trimEnd()).toMatch(/--B\d+--$/);
  });

  it('wraps base64 bodies at 76 characters', () => {
    const raw = buildMimeMessage({ ...base, html: undefined, text: 'x'.repeat(500) }, FROM, {
      boundary,
    });
    const body = raw.split('\r\n\r\n')[1]!.trim().split('\r\n');
    expect(body.length).toBeGreaterThan(1);
    expect(Math.max(...body.map((l) => l.length))).toBe(76);
  });

  it('sends a single part when only one body is given', () => {
    const raw = buildMimeMessage({ ...base, html: undefined }, FROM, { boundary });
    expect(headersOf(raw)['Content-Type']).toBe('text/plain; charset=UTF-8');
    expect(raw).not.toContain('multipart');
  });

  it('encodes non-ASCII subjects and display names as RFC 2047 words that decode back', () => {
    const subject =
      'Welcome to Ferni, José! 🌿 Your first week starts now, with a longer subject line';
    const raw = buildMimeMessage(
      { ...base, subject },
      { address: 'hello@ferni.ai', name: 'Ferní' },
      { boundary }
    );
    const h = headersOf(raw);
    expect(h.Subject).toMatch(/^=\?UTF-8\?B\?/);
    expect(decodeWords(h.Subject!)).toBe(subject);
    for (const word of h.Subject!.split(' ')) expect(word.length).toBeLessThanOrEqual(75);
    expect(decodeWords(h.From!)).toBe('Ferní <hello@ferni.ai>');
  });

  it('adds List-Unsubscribe and One-Click Post to bulk mail', () => {
    const raw = buildMimeMessage(
      {
        ...base,
        kind: 'bulk',
        unsubscribe: { url: 'https://ferni.ai/u?t=abc', mailto: 'unsubscribe@ferni.ai' },
      },
      FROM,
      { boundary }
    );
    const h = headersOf(raw);
    expect(h['List-Unsubscribe']).toBe('<mailto:unsubscribe@ferni.ai>, <https://ferni.ai/u?t=abc>');
    expect(h['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });

  it('leaves unsubscribe headers off transactional mail without a target', () => {
    const raw = buildMimeMessage(base, FROM, { boundary });
    expect(raw).not.toContain('List-Unsubscribe');
  });

  it('refuses bulk mail without an unsubscribe target, and non-https unsubscribe urls', () => {
    expect(() => buildMimeMessage({ ...base, kind: 'bulk' }, FROM)).toThrow(/unsubscribe/);
    expect(() =>
      unsubscribeHeaders({ ...base, kind: 'bulk', unsubscribe: { url: 'http://x.test/u' } })
    ).toThrow(/https/);
  });

  it('rejects header injection through subject, names and addresses', () => {
    expect(() => buildMimeMessage({ ...base, subject: 'hi\r\nBcc: evil@x.com' }, FROM)).toThrow(
      /line break/
    );
    expect(() => buildMimeMessage({ ...base, toName: 'Sam\nBcc: evil@x.com' }, FROM)).toThrow(
      /line break/
    );
    expect(() => buildMimeMessage({ ...base, replyTo: 'a@b.com\r\nBcc: e@x.com' }, FROM)).toThrow();
    expect(() => buildMimeMessage({ ...base, to: 'not-an-address' }, FROM)).toThrow(
      /not an email address/
    );
  });

  it('requires a body', () => {
    expect(() => buildMimeMessage({ ...base, text: undefined, html: undefined }, FROM)).toThrow(
      /neither text nor html/
    );
  });

  it('wraps attachments in multipart/mixed with a safe filename', () => {
    const content = Buffer.from('ID3 fake mp3').toString('base64');
    const raw = buildMimeMessage(
      {
        ...base,
        attachments: [{ filename: 'voice "msg".mp3', content, contentType: 'audio/mpeg' }],
      },
      FROM,
      { boundary }
    );
    expect(headersOf(raw)['Content-Type']).toMatch(/^multipart\/mixed; boundary=/);
    expect(raw).toContain('Content-Type: multipart/alternative; boundary=');
    expect(raw).toContain('Content-Disposition: attachment; filename="voice _msg_.mp3"');
    expect(raw).toContain(`\r\n\r\n${content}\r\n`);
  });

  it('encodes ASCII header text unchanged', () => {
    expect(encodeHeaderText('Plain subject')).toBe('Plain subject');
  });
});

describe('toBase64Url', () => {
  it('is url-safe and unpadded, and round-trips', () => {
    const msg = 'Subject: ??>>~~\r\n\r\nbody ÿÿ';
    const enc = toBase64Url(msg);
    expect(enc).not.toMatch(/[+/=]/);
    expect(Buffer.from(enc, 'base64url').toString('utf8')).toBe(msg);
  });
});

describe('no recipient addresses in errors', () => {
  it('rejects a bad address without echoing it', () => {
    for (const to of ['sam@example', 'sam@@example.com', 'sam @example.com']) {
      let message = '';
      try {
        buildMimeMessage({ ...base, to }, FROM);
      } catch (err) {
        message = (err as Error).message;
      }
      expect(message).toBe('not an email address');
    }
  });

  it('redactAddresses replaces every address-shaped token', () => {
    expect(redactAddresses('to <a.b+c@x.co.uk>, d@e.io: rejected')).toBe(
      'to <[address]>, [address]: rejected'
    );
    expect(redactAddresses('no address here')).toBe('no address here');
  });
});
