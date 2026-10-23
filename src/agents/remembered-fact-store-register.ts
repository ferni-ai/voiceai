/**
 * Wires the Firestore fact store into remembered facts
 * (memory/dynamic/remembered-facts.ts), so rememberAboutUser can write what a
 * caller asked Ferni to remember where recall reads it (REMEMBER_TO_RECALL).
 * Imported for its side effect by gce/job-executor.ts, which every process that
 * runs a call loads; with the flag off nothing writes through it.
 *
 * @module agents/remembered-fact-store-register
 */
import { useRememberedFactStore } from '../memory/dynamic/remembered-facts.js';
import { firestoreRememberedFactStore } from '../memory/storage/remembered-fact-store.js';

useRememberedFactStore(firestoreRememberedFactStore);
