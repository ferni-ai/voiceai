/**
 * The call-log guard (log-guard.ts) catches shape classes, not strings. Each
 * class below is planted in more than one form: the 28 shapes of the #2663
 * round-1 verify (labelled as there) plus other forms of the same class. And
 * the guard stays quiet on what is not content (lengths, counts, ids, kinds,
 * Math.log, error objects under err/error on the safe logger).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { offences, serializerWired } from './log-guard.js';

const caught = (src: string, path = 'planted.ts') => offences(path, src).length > 0;

const CLASSES: Record<string, string[]> = {
  'content carried by a name (taint)': [
    'const msg = `said ${event.transcript}`;\nlog.info(msg);', // T1
    "const msg = `said ${event.transcript}`;\nlog.info({ msg }, 'x');", // T2
    "const t = event.transcript;\ndiag.state('x', { said: t });", // T3
    'const t = event.transcript;\nlog.info({}, `heard ${t}`);', // T4
    "const words = userText.trim().toLowerCase();\nlog.debug({ w: words }, 'x');",
    "const a = profile.preferredName;\nconst b = a;\nlog.info({ who: b }, 'x');",
  ],
  'a spread object': [
    "log.info({ ...ctx, sessionId }, 'x');", // S1
    "diag.state('x', { ...userData });", // S2
    "log.warn({ ...turn.analysis }, 'x');",
  ],
  'a whole object serialized': [
    'process.stderr.write(`ctx ${JSON.stringify(ctx)}\\n`);', // J1
    "log.info({ snapshot: JSON.stringify(state) }, 'x');",
  ],
  'any logger': [
    "const lg = makeLogger();\nlg.info({ transcript }, 'x');", // H1
    "this.l.info({ transcript: cleaned }, 'x');", // H2
    "logger?.info({ transcript }, 'x');", // H3
    "log.fatal({ transcript }, 'x');", // F1
    "log['info']({ transcript }, 'x');", // N9
    "this.logger.trace({ userText }, 'x');",
    "turnMetricsLog.warn({ said: userMessage }, 'x');",
    'getLogger()?.["warn"]({ transcript }, \'x\');',
  ],
  'console and raw writes': [
    "console.debug('heard', cleanedTranscript);", // C1
    'console.dir(event);', // C2
    'process.stdout.write(`u ${event.transcript}\\n`);', // W1
    'const { stderr } = process;\nstderr.write(`u ${event.transcript}\\n`);', // W2
    'console.table(rows);',
    'process.stderr.write(line);',
  ],
  'a child logger bound to content': [
    'const l2 = log.child({ transcript: event.transcript });', // K1
    "logger.child({ caller: callerName }).info('x');",
  ],
  'a tagged template': [
    'log.info(fmt`said ${userText}`);', // G1
  ],
  'error text off the safe serializer': [
    "log.warn({ err: new Error(`bad ${t}`) }, 'x');", // E2
    "log.info({ reason: String(err) }, 'x');",
    'log.error({}, `failed: ${err.message}`);',
    'process.stderr.write(`failed ${String(error)}\\n`);',
    "console.error('failed', error);",
  ],
  'tool arguments': [
    "log.info({ sessionId, a: toolArgs.query }, 'x');", // N1
    "log.info({ args: toolCall.arguments }, 'x');", // N2
    "log.debug({ input: fnArgs }, 'x');",
  ],
  'a whole context object': [
    "log.debug({ context: macOSContext, ageMs }, 'x');", // N3
    "diag.state('x', { conversationContext });",
  ],
  'a stored preference or place': [
    "diag.info('x', { where: pref.value });", // N4
    "log.info({ home: preference.value }, 'x');",
    "log.info({ near: location }, 'x');",
  ],
  'a pending call changed': [
    "log.info({ trace: 'E2E_USER_INPUT', transcript: event.transcript, userName }, 'x');", // N5
  ],
  'contact details and message content': [
    "log.info({ email: profile.email, address: user.address }, 'x');", // N7
    "log.info({ content: msg.content }, 'x');", // N8
    "log.info({ to: contact.phoneNumber }, 'x');",
    "log.info({ body: item.textContent }, 'x');",
  ],
};

describe('the call-log guard catches every planted shape class', () => {
  for (const [name, forms] of Object.entries(CLASSES)) {
    it.each(forms)(`${name}: %s`, (src) => {
      expect(caught(src)).toBe(true);
    });
  }

  it("Ferni's own words are exempt only as listed, never another slice in that file", () => {
    // N6: agent-setup's say() preview is listed as text.slice(0, 60) under textPreview.
    const planted = "log.info({ preview: text.slice(0, 80) }, 'x');";
    expect(caught(planted, 'src/agents/multi-agent/agent-setup.ts')).toBe(true);
  });
});

describe('the call-log guard stays quiet on what is not content', () => {
  it.each([
    "log.info({ sessionId, callId, turnCount: 3 }, 'x');",
    "log.info({ transcriptChars: event.transcript.length, hasName: Boolean(userName) }, 'x');",
    "log.info({ keys: Object.keys(args) }, 'x');",
    "log.info({ city: metadata.city ? 'yes' : 'none' }, 'x');",
    "log.error({ error, sessionId }, 'x');",
    "log.warn({ err: String(err) }, 'x');",
    'const ratio = Math.log(x) / Math.log(2);',
    'process.stderr.write(`[x] failed: ${errorText(error)}\\n`);',
    "const t = event.transcript;\nlog.info({ n: t.length }, 'x');",
  ])('%s', (src) => {
    expect(offences('planted.ts', src)).toEqual([]);
  });
});

describe("the err/error exemption rests on the safe logger's redaction", () => {
  it('holds while safe-logger.ts cuts both fields', () => {
    expect(serializerWired()).toBe(true);
  });

  it('without that wiring, an err/error field is caught like any other error text', () => {
    const planted = "log.warn({ err: String(err) }, 'x');";
    expect(offences('planted.ts', planted)).toEqual([]);
    expect(offences('planted.ts', planted, undefined, false)).not.toEqual([]);
  });

  it('is gone the moment that wiring is', () => {
    const src = readFileSync('src/utils/safe-logger.ts', 'utf8');
    expect(
      serializerWired(src.replace(/withErrors\.err = redactErrorValue\(withErrors\.err\)/, ''))
    ).toBe(false);
  });
});
