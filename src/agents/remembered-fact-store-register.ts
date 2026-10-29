/**
 * Wires the Firestore fact store into remembered facts
 * (memory/dynamic/remembered-facts.ts), so rememberAboutUser can write what a
 * caller asked Ferni to remember where recall reads it (REMEMBER_TO_RECALL),
 * and the model that reads each one for a secret first (memory/secret-check.ts):
 * the crisis classifier's Gemini call on the classification model. With
 * MEMORY_TOOLS_HONEST, the store updateMemory replaces a remembered fact through
 * (memory/dynamic/replace-remembered.ts) and the contact-data rule the writer refuses
 * phone numbers and emails by (intelligence imports memory, so it is handed in).
 * Imported for its side effect by gce/job-executor.ts, which every process that
 * runs a call loads; with the flags off nothing writes or reads through any of them.
 *
 * @module agents/remembered-fact-store-register
 */
import { CLASSIFICATION_MODEL } from '../config/gemini-config.js';
import { hasContactData } from '../intelligence/index.js';
import { useContactDataCheck, useRememberedFactStore } from '../memory/dynamic/remembered-facts.js';
import { useRememberedFactControl } from '../memory/index.js';
import { firestoreMemoryControlStore } from '../memory/storage/memory-control-store.js';
import { useSecretModel } from '../memory/secret-check.js';
import { firestoreRememberedFactStore } from '../memory/storage/remembered-fact-store.js';
import { createGeminiCrisisGenerate } from '../services/safety/crisis-classifier.js';

useRememberedFactStore(firestoreRememberedFactStore);
useRememberedFactControl(firestoreMemoryControlStore);
useContactDataCheck(hasContactData);
useSecretModel(createGeminiCrisisGenerate(CLASSIFICATION_MODEL));
