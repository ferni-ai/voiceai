/**
 * What the web server does with an error nobody caught (#2914).
 *
 * A rejected promise nobody awaited is reported and the server keeps serving:
 * a background read that failed hasn't left the process half-changed. Before
 * this, Node turned it into an uncaught exception and error-reporting's handler
 * exited, taking every in-flight request (a Twilio text's reply among them,
 * which Twilio doesn't retry) down with it.
 *
 * A thrown error may have left state broken, so the server still exits, but
 * only after it stops taking new requests and lets in-flight ones finish (up to
 * DRAIN_MS). Cloud Run sends new traffic to a fresh instance meanwhile.
 */
import type { Server } from 'node:http';
import { flushErrorReporting, reportError } from '../../utils/error-reporting.js';

export const DRAIN_MS = 10_000;

interface GuardOptions {
  server: Pick<Server, 'close'> & Partial<Pick<Server, 'closeIdleConnections'>>;
  /** The process to listen on; a fake in tests. */
  proc?: Pick<NodeJS.Process, 'on'>;
  exit?: (code: number) => void;
  drainMs?: number;
  /** Where the one-line notices go (stderr reaches Cloud Logging). */
  write?: (line: string) => void;
}

export function installProcessGuards({
  server,
  proc = process,
  exit = (code) => process.exit(code),
  drainMs = DRAIN_MS,
  write = (line) => process.stderr.write(line),
}: GuardOptions): void {
  proc.on('unhandledRejection', (reason: unknown) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    write(`[process-guards] unhandled rejection, still serving: ${error.stack ?? error.message}\n`);
    reportError(error, { source: 'unhandled-rejection' });
  });

  let draining = false;
  // error-reporting's own uncaughtException handler still reports it (fatal);
  // with this listener present it leaves the exit to us.
  proc.on('uncaughtException', (error: unknown, origin: string) => {
    const err = error instanceof Error ? error : new Error(String(error));
    write(`[process-guards] ${origin}, draining then exiting: ${err.stack ?? err.message}\n`);
    if (draining) return;
    draining = true;
    let exited = false;
    const finish = (): void => {
      if (exited) return;
      exited = true;
      clearTimeout(timer);
      void flushErrorReporting().then(() => exit(1));
    };
    const timer = setTimeout(finish, drainMs);
    try {
      server.close(() => finish());
      server.closeIdleConnections?.();
    } catch {
      finish();
    }
  });
}
