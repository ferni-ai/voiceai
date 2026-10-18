/**
 * Wires the one journal store (services/journal/journal-ports.ts) into the
 * agent process, as api/journal-routes.ts does for the UI server. Imported for
 * its side effect by gce/job-executor.ts, which every process that runs a call
 * loads. The voice journal tools (tools/domains/productivity/call-journal.ts)
 * write through it when CALL_JOURNAL and JOURNAL_ONE_STORE are on; with
 * JOURNAL_ONE_STORE off nothing reads the port.
 *
 * @module agents/journal-store-register
 */
import { useJournalEntryStore } from '../services/journal/journal-ports.js';
import { firestoreJournalStore } from '../services/stores/journal-store.js';

useJournalEntryStore(firestoreJournalStore);
