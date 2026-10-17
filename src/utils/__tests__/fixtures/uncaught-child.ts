/**
 * Child process for error-reporting.test.ts: initialises error reporting with an
 * in-memory transport that prints each sent event, then throws an uncaught error.
 * `crash` has no app handler; `survive` registers one, as the voice worker does.
 */

import { writeSync } from 'node:fs';

import * as Sentry from '@sentry/node';

import { initErrorReporting } from '../../error-reporting.js';

const transport = (options: Parameters<typeof Sentry.createTransport>[0]) =>
  Sentry.createTransport(options, async (request) => {
    const body =
      typeof request.body === 'string' ? request.body : new TextDecoder().decode(request.body);
    const lines = body.split('\n');
    for (let i = 1; i + 1 < lines.length; i += 2) {
      if ((JSON.parse(lines[i] ?? '{}') as { type?: string }).type !== 'event') continue;
      const event = JSON.parse(lines[i + 1] ?? '{}') as {
        level: string;
        tags: Record<string, string>;
        exception: { values: Array<{ value: string }> };
      };
      writeSync(
        1,
        `SENT ${event.level} ${event.tags['source']} ${event.exception.values.map((v) => v.value).join(' | ')}\n`
      );
    }
    return { statusCode: 200 };
  });

await initErrorReporting(process.env, async () => Sentry, { transport });

if (process.argv[2] === 'survive') {
  process.on('uncaughtException', () => {});
  setTimeout(() => {
    writeSync(1, 'still running\n');
    process.exit(0);
  }, 500);
} else {
  setTimeout(() => writeSync(1, 'still running\n'), 5000);
}

setTimeout(() => {
  throw new Error('caller said I keep thinking about the divorce');
}, 10);
