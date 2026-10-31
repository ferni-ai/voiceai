/**
 * A real Node process with the web server's process guards, for
 * process-guards.test.ts: /reject leaves a rejected promise nobody awaits,
 * /throw throws in a timer, /slow answers after 400 ms.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { installProcessGuards } from '../../process-guards.js';

const server = http.createServer((req, res) => {
  if (req.url === '/slow') {
    setTimeout(() => res.end('slow-done'), 400);
    return;
  }
  if (req.url === '/reject') {
    void Promise.reject(new Error('stray background rejection'));
    res.end('rejected');
    return;
  }
  if (req.url === '/throw') {
    setTimeout(() => {
      throw new Error('thrown in a timer');
    }, 0);
    res.end('will-throw');
    return;
  }
  res.end('ok');
});
if (process.env.GUARDS !== 'off') installProcessGuards({ server, drainMs: 3_000 });
server.listen(0, '127.0.0.1', () => {
  process.stdout.write(`PORT ${(server.address() as AddressInfo).port}\n`);
});
