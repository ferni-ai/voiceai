/**
 * SSML for a TwiML <Say>, made safe to interpolate.
 *
 * Call messages can come from the model, and the TwiML builders put them
 * inside <Say>…</Say>. Unescaped, a message like `</Say><Dial>+1900…</Dial>`
 * makes Twilio dial a number nobody chose. So all text is escaped, and only a
 * few speech tags survive, rebuilt from checked attributes and kept balanced.
 * Every other tag (speak, voice, Dial, Play, …) is dropped; its text stays.
 *
 * @module services/outreach/twilio-ssml
 */

const ATTRS: Record<string, Record<string, RegExp>> = {
  prosody: {
    rate: /^[a-z0-9.+%-]{1,16}$/i,
    pitch: /^[a-z0-9.+%-]{1,16}$/i,
    volume: /^[a-z0-9.+%-]{1,16}$/i,
  },
  break: {
    time: /^\d{1,5}(ms|s)$/,
    strength: /^(none|x-weak|weak|medium|strong|x-strong)$/,
  },
  emphasis: { level: /^(strong|moderate|reduced)$/ },
  'say-as': { 'interpret-as': /^[a-z-]{1,24}$/, format: /^[a-z0-9-]{1,24}$/i },
  s: {},
  p: {},
};

const TAG = /<(\/?)([a-zA-Z][\w:-]*)([^<>]*?)(\/?)>/g;
const ATTR = /([a-zA-Z][\w:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/** Escape text for XML. Entities already in the text are kept as they are. */
export function escapeXml(text: string): string {
  return text
    .replace(/&(?!(?:amp|lt|gt|quot|apos|#\d{1,7}|#x[0-9a-f]{1,6});)/gi, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function openTag(name: string, rawAttrs: string, selfClosing: boolean): string {
  const allowed = ATTRS[name];
  const kept: string[] = [];
  for (const [, key, dq, sq] of rawAttrs.matchAll(ATTR)) {
    const value = dq ?? sq ?? '';
    if (Object.hasOwn(allowed, key) && allowed[key].test(value)) kept.push(` ${key}="${value}"`);
  }
  return `<${name}${kept.join('')}${selfClosing ? '/' : ''}>`;
}

/** Our SSML (or plain text) as the inside of a TwiML <Say>. */
export function toTwilioSsml(ssml: string): string {
  const out: string[] = [];
  const open: string[] = [];
  let last = 0;
  for (const m of ssml.matchAll(TAG)) {
    out.push(escapeXml(ssml.slice(last, m.index)));
    last = (m.index ?? 0) + m[0].length;
    const [, closing, rawName, rawAttrs, selfClosing] = m;
    const name = rawName.toLowerCase();
    if (!Object.hasOwn(ATTRS, name)) continue;
    if (name === 'break') {
      if (!closing) out.push(openTag(name, rawAttrs, true));
    } else if (closing) {
      if (open[open.length - 1] === name) out.push(`</${open.pop()}>`);
    } else if (selfClosing) {
      continue;
    } else {
      out.push(openTag(name, rawAttrs, false));
      open.push(name);
    }
  }
  out.push(escapeXml(ssml.slice(last)));
  while (open.length) out.push(`</${open.pop()}>`);
  return out.join('');
}
