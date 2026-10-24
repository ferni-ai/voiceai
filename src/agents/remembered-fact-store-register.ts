/**
 * Wires the Firestore fact store into remembered facts
 * (memory/dynamic/remembered-facts.ts), so rememberAboutUser can write what a
 * caller asked Ferni to remember where recall reads it (REMEMBER_TO_RECALL),
 * and the model that reads each one for a secret first (memory/secret-check.ts):
 * the crisis classifier's Gemini call on the classification model.
 * Imported for its side effect by gce/job-executor.ts, which every process that
 * runs a call loads; with the flag off nothing writes or reads through either.
 *
 * @module agents/remembered-fact-store-register
 */
import { CLASSIFICATION_MODEL } from '../config/gemini-config.js';
import { useRememberedFactStore } from '../memory/dynamic/remembered-facts.js';
import { useSecretModel } from '../memory/secret-check.js';
import { firestoreRememberedFactStore } from '../memory/storage/remembered-fact-store.js';
import { createGeminiCrisisGenerate } from '../services/safety/crisis-classifier.js';

useRememberedFactStore(firestoreRememberedFactStore);
useSecretModel(createGeminiCrisisGenerate(CLASSIFICATION_MODEL));
