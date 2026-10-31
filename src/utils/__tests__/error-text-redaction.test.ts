/**
 * The safe logger never writes the caller text an error quotes (#2663): a
 * real JSON.parse failure, an Error whose message quotes what the caller
 * said, unbalanced, mixed and multi-line quotes, a quote in a cause, and an
 * extra property an error object carries. Through the REAL safe logger
 * (createLogger, its children, getLogger) to the stderr sink, at every level.
 * A message is cut at its first quote of any kind; a stack keeps its frames.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.unmock('../safe-logger.js'); // the real logger and its sink, not setup.ts's stub
import { createLogger, getLogger } from '../safe-logger.js';
import { cutAtQuote, errorText, redactErrorValue, REDACTED } from '../error-text.js';

function capture(): () => string {
  const out: string[] = [];
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    out.push(String(chunk));
    return true;
  });
  return () => out.join('');
}

afterEach(() => vi.restoreAllMocks());

const S = 'ZEBULON_SENTINEL';
function parseFailure(): Error {
  try {
    JSON.parse(`{"note":"${S} said the divorce is final", "x":`);
  } catch (e) {
    return e as Error;
  }
  throw new Error('JSON.parse did not fail');
}

const cases: Array<[string, () => unknown]> = [
  ['a real JSON.parse failure', parseFailure],
  ['an Error quoting the caller', () => new Error(`could not handle "${S} relapsed"`)],
  ['an unbalanced quote', () => new Error(`bad input "${S} and no closing quote`)],
  ['mixed quote types', () => new Error(`bad 'x" ${S} ' y" z`)],
  ['a multi-line quoted span', () => new Error(`bad "first line\n${S} second line" end`)],
  ['a quote inside cause', () => new Error('outer failure', { cause: new Error(`inner "${S}"`) })],
  [
    'an extra enumerable property',
    () => Object.assign(new Error('request failed'), { details: S, body: { said: S } }),
  ],
  ['a stringified error', () => String(new Error(`parse of "${S}" failed`))],
  [
    'a serialized error object',
    () => ({
      name: 'Error',
      message: `x "${S}"`,
      stack: `Error: x "${S}"\n    at f (a.ts:1:1)`,
      extra: S,
    }),
  ],
];

describe('the safe logger and the text an error quotes', () => {
  it.each(cases)('%s: never written, in err or error, by any logger', (_label, make) => {
    const all = capture();
    const child = createLogger({ module: 'error-text-test' }).child({ op: 'parse' });
    for (const log of [createLogger({ module: 'error-text-test' }), child, getLogger()]) {
      log.error({ error: make() }, 'failed');
      log.warn({ err: make() }, 'failed');
      // An Error under any key is cut too; a string or plain object there is the guard's to catch.
      const value = make();
      if (value instanceof Error) log.info({ result: { failure: value } }, 'failed');
    }
    const text = all();
    expect(text).toContain('failed'); // the lines were written
    expect(text).not.toContain(S);
  });

  it('keeps what helps: the class, the message up to the quote, the code and the frames', () => {
    const e = Object.assign(new SyntaxError(`Unexpected token in "${S}"`), { code: 'E_PARSE' });
    const out = redactErrorValue(e) as Record<string, string>;
    expect(out.name).toBe('SyntaxError');
    expect(out.message).toBe(`Unexpected token in ${REDACTED}`);
    expect(out.code).toBe('E_PARSE');
    expect(out.stack).toMatch(/\n\s+at /);
    expect(Object.keys(out).sort()).toEqual(['code', 'message', 'name', 'stack']);
  });

  it('cuts at the first quote of any kind and caps the rest', () => {
    for (const q of ['"', "'", '`', '“', '‘', '«'])
      expect(cutAtQuote(`a ${q}${S}`)).toBe(`a ${REDACTED}`);
    expect(cutAtQuote('x'.repeat(500)).length).toBeLessThanOrEqual(121);
    expect(errorText(new Error(`bad "${S}"`))).toBe(`Error: bad ${REDACTED}`);
  });
});
