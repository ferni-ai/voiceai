/**
 * The journal tools on every persona from its first turn, behind CALL_JOURNAL
 * (with JOURNAL_ONE_STORE, the store they write; see call-journal.ts).
 *
 * The productivity domain is not loaded on a call: it is reached only through
 * findTools. On the 2026-10-17 dev eval (CALL_JOURNAL on) the journal tool was
 * not among the 90 offered, Ferni said "I don't actually have a journal here",
 * and on the other run he saved the request with quickNote, a session-only
 * note. These two tools are what "put that in my journal" needs; the rest of
 * the domain stays behind findTools.
 *
 * Cost: two more declarations on every request of every persona. Both are
 * essential while the flag is on (tool-config.ts), so capToolsToLimit keeps
 * them.
 *
 * @module agents/multi-agent/call-journal-tools
 */
import { CALL_JOURNAL_TOOLS } from '../../config/tool-config.js';
import { toolRegistry } from '../../tools/registry/index.js';
import { loadToolDomainsLazy } from '../../tools/registry/loader.js';
import type { ToolContext } from '../../tools/registry/types.js';
import {
  callJournalGratitude,
  callJournalOn,
} from '../../tools/domains/productivity/call-journal.js';
import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

/**
 * `tools` plus whichever CALL_JOURNAL_TOOLS it lacks, built for this agent.
 * Unchanged when the flag is off; a failure to build them is logged and leaves
 * them to findTools.
 */
export async function withCallJournalTools<T>(
  tools: Record<string, T>,
  ctx: ToolContext
): Promise<Record<string, T>> {
  if (!callJournalOn()) return tools;
  const missing = CALL_JOURNAL_TOOLS.filter((name) => !(name in tools));
  if (missing.length === 0) return tools;
  try {
    await loadToolDomainsLazy(['productivity']);
    const added: Record<string, T> = {};
    for (const def of toolRegistry.getByDomain('productivity')) {
      if (missing.includes(def.id)) added[def.id] = def.create(ctx) as T;
    }
    // Never in the registry, which is built once per process: it exists only for this caller.
    if (missing.includes('addGratitude')) added.addGratitude = callJournalGratitude() as T;
    const absent = missing.filter((name) => !(name in added));
    if (absent.length > 0) log.warn({ absent }, 'Call journal tools not in the registry');
    return { ...tools, ...added };
  } catch (error) {
    log.warn({ error: String(error) }, 'Could not add the call journal tools');
    return tools;
  }
}
