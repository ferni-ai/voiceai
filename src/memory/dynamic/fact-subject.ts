/**
 * FACT_SUBJECT_GUARD (off by default): what the AI friend says about its own life never
 * becomes a fact about the caller.
 *
 * Prod 2026-10-31 and 11-02 (recall trace W15a): Ferni named two friends of his and the
 * caller's next line was just the two names; the after-call sweep, which read caller lines
 * only, stored them as the caller's friends. Two days later the caller said "I thought you
 * had a dog", Ferni said he had none, and deep extraction stored "User does not have a dog".
 *
 * With the flag on, the sweep reads the call with both sides tagged (fact-sweep.ts), and both
 * extractors are told whose "you" is (FACT_SUBJECT_RULE). Nothing is dropped after the model:
 * on a real model the tagged prompt alone stopped every leak, while word rules that dropped
 * facts afterwards also cost callers facts of their own.
 *
 * @module memory/dynamic/fact-subject
 */
import { personFlagOn } from '../../config/person-flag.js';
import type { Env } from '../../config/env-flag.js';

/** One turn of the call, in call order. */
export interface CallLine {
  speaker: 'caller' | 'persona';
  text: string;
}

/** Whether the flag is on for this person (their cohort value beats the env). */
export async function factSubjectGuardOn(
  userId: string | undefined,
  env: Env = process.env
): Promise<boolean> {
  return personFlagOn(userId, 'FACT_SUBJECT_GUARD', env);
}

/** Told to both extractors with the flag on. */
export const FACT_SUBJECT_RULE =
  '- A fact is about the caller only when the caller states it as theirs, or as about a person or thing in their life. "Your X", "you have/had X" and "how\'s your X" in the caller\'s words are about the AI friend, never the caller, and so is anything the AI friend says about its own life (its friends, pets, home, past). A name the caller only repeats or asks about is not a person in their life unless they make it theirs ("my friend Theo", "Theo? He\'s my nephew"). Filler ("you know", "thank you", "you have to try it") changes nothing.';
