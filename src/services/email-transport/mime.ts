/**
 * RFC 2822 / MIME messages for the Gmail API's `raw` field.
 *
 * UTF-8 throughout: non-ASCII header text is an RFC 2047 encoded-word, bodies are
 * base64. Text and HTML go out as multipart/alternative (text first, so clients
 * that prefer the richer part pick HTML); attachments wrap that in multipart/mixed.
 *
 * @module services/email-transport/mime
 */

import { randomBytes } from 'node:crypto';
import type { OutgoingEmail } from '../../types/email-sender.js';

const CRLF = '\r\n';
const ADDRESS = /^[^\s<>@,;:"()[\]\\]+@[^\s<>@,;:"()[\]\\]+\.[^\s<>@,;:"()[\]\\]+$/;
const ASCII = /^[\x20-\x7e]*$/;

/** A line break in a header value would let caller text add headers of its own. */
function noBreaks(value: string, what: string): string {
  if (/[\r\n]/.test(value)) throw new Error(`${what} contains a line break`);
  return value;
}

function address(value: string): string {
  const a = noBreaks(value.trim(), 'address');
  if (!ADDRESS.test(a)) throw new Error('not an email address'); // never echo it: errors get logged
  return a;
}

/** Replace anything address-shaped in provider error text, so recipients never reach logs. */
export function redactAddresses(text: string): string {
  return text.replace(/[^\s<>"'(),;:@]+@[^\s<>"'(),;:@]+/g, '[address]');
}

/** RFC 2047 encoded-words (each under the 75-char limit), folded; ASCII passes through. */
export function encodeHeaderText(text: string): string {
  noBreaks(text, 'header text');
  if (ASCII.test(text)) return text;
  const chunks: string[] = [];
  let chunk = '';
  for (const ch of text) {
    if (Buffer.byteLength(chunk + ch, 'utf8') > 45) {
      chunks.push(chunk);
      chunk = '';
    }
    chunk += ch;
  }
  if (chunk) chunks.push(chunk);
  return chunks
    .map((c) => `=?UTF-8?B?${Buffer.from(c, 'utf8').toString('base64')}?=`)
    .join(`${CRLF} `);
}

export function formatAddress(addr: string, name?: string): string {
  const a = address(addr);
  if (!name) return a;
  const display = ASCII.test(name)
    ? `"${noBreaks(name, 'display name').replace(/[\\"]/g, '\\$&')}"`
    : encodeHeaderText(name);
  return `${display} <${a}>`;
}

/** List-Unsubscribe (+ One-Click Post for an https URL), or none when no unsubscribe target is given. */
export function unsubscribeHeaders(email: OutgoingEmail): Record<string, string> {
  const { url, mailto } = email.unsubscribe ?? {};
  if (email.kind === 'bulk' && !url && !mailto)
    throw new Error('bulk email needs an unsubscribe url or mailto');
  if (url && !/^https:\/\/[^\s<>]+$/.test(url)) throw new Error('unsubscribe url must be https');
  const targets = [mailto && `<mailto:${address(mailto)}>`, url && `<${url}>`].filter(Boolean);
  if (targets.length === 0) return {};
  const headers: Record<string, string> = { 'List-Unsubscribe': targets.join(', ') };
  if (url) headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  return headers;
}

const wrap76 = (b64: string): string => b64.replace(/\s+/g, '').replace(/.{76}(?=.)/g, `$&${CRLF}`);

function textPart(type: 'text/plain' | 'text/html', body: string): string {
  return [
    `Content-Type: ${type}; charset=UTF-8`,
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(Buffer.from(body, 'utf8').toString('base64')),
  ].join(CRLF);
}

function multipart(subtype: 'alternative' | 'mixed', parts: string[], boundary: string): string {
  const body = parts.map((p) => `--${boundary}${CRLF}${p}${CRLF}`).join('');
  return `Content-Type: multipart/${subtype}; boundary="${boundary}"${CRLF}${CRLF}${body}--${boundary}--`;
}

export interface MimeOptions {
  date?: Date;
  boundary?: () => string;
}

/** The whole message: headers, then the body entity. Throws on an invalid address or a missing body. */
export function buildMimeMessage(
  email: OutgoingEmail,
  from: { address: string; name?: string },
  opts: MimeOptions = {}
): string {
  if (!email.text && !email.html) throw new Error('email has neither text nor html');
  const boundary = opts.boundary ?? (() => `=_ferni_${randomBytes(12).toString('hex')}`);
  const to = Array.isArray(email.to) ? email.to : [email.to];
  if (to.length === 0) throw new Error('email has no recipient');

  const headers = [
    `From: ${formatAddress(from.address, from.name)}`,
    `To: ${to.length === 1 ? formatAddress(to[0] ?? '', email.toName) : to.map((a) => address(a)).join(', ')}`,
    ...(email.replyTo ? [`Reply-To: ${address(email.replyTo)}`] : []),
    `Subject: ${encodeHeaderText(email.subject)}`,
    `Date: ${(opts.date ?? new Date()).toUTCString()}`,
    ...Object.entries(unsubscribeHeaders(email)).map(([k, v]) => `${k}: ${v}`),
    'MIME-Version: 1.0',
  ];

  const parts = [
    email.text && textPart('text/plain', email.text),
    email.html && textPart('text/html', email.html),
  ].filter((p): p is string => !!p);
  let entity = parts.length === 2 ? multipart('alternative', parts, boundary()) : (parts[0] ?? '');

  if (email.attachments && email.attachments.length > 0) {
    const files = email.attachments.map((f) => {
      if (!/^[\w.+-]+\/[\w.+-]+$/.test(f.contentType))
        throw new Error(`bad attachment type: ${f.contentType}`);
      const name = f.filename.replace(/[^\w.\- ]/g, '_');
      return [
        `Content-Type: ${f.contentType}; name="${name}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${name}"`,
        '',
        wrap76(f.content),
      ].join(CRLF);
    });
    entity = multipart('mixed', [entity, ...files], boundary());
  }
  return `${headers.join(CRLF)}${CRLF}${entity}${CRLF}`;
}

/** base64url without padding, the encoding Gmail's users.messages.send expects for `raw`. */
export function toBase64Url(message: string): string {
  return Buffer.from(message, 'utf8').toString('base64url');
}
