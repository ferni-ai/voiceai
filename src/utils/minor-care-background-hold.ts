/**
 * MINOR_CARE for background jobs: a nightly job asks backgroundHeld before it reads or rewrites a
 * user's memory (knowledge-graph consolidation, the weekly memory consolidation).
 *
 * Those jobs run in the web server, which never sees a call's in-process hold. The reader that
 * answers (services/outreach/minor-care-background-read.ts) reads the shared hold record and the
 * held calls' stored windows. A job route imports it before its job runs, and it registers itself
 * here: this layer can't import it.
 *
 * Fails closed. Until a reader is registered, and whenever it throws or answers anything but
 * false, the user is held: a job run without the reader consolidates nobody (a warning says why)
 * rather than a held caller.
 *
 * @module utils/minor-care-background-hold
 */
import { createLogger } from './safe-logger.js';

const log = createLogger({ module: 'minor-care-background-hold' });

export type BackgroundHoldReader = (userId: string) => Promise<boolean>;

let registered: BackgroundHoldReader | undefined;
let warned = false;

/** The reader module sets itself at load; tests set a fake or clear it. */
export function setBackgroundHoldReader(next: BackgroundHoldReader | undefined): void {
  registered = next;
  warned = false;
}

/**
 * Held from background jobs: held now, a held call's window still stored, or unknown. `read`
 * replaces the registered reader (a job's injected one). Never rejects; never logs the id.
 */
export async function backgroundHeld(
  userId: string,
  read: BackgroundHoldReader | undefined = registered
): Promise<boolean> {
  if (!read) {
    if (!warned) log.warn('MINOR_CARE background hold reader not loaded: every user held');
    warned = true;
    return true;
  }
  try {
    return (await read(userId)) !== false;
  } catch (error) {
    log.warn({ error: String(error) }, 'MINOR_CARE background hold unreadable: treated as held');
    return true;
  }
}
