/**
 * The open half of the crisis never-lower corpus: risk forms, joined-word lines,
 * the adversarial set, the site phrases and the labelled JSON fixtures. Nothing
 * here imports a held-out, retired or blind set, so a test can build its corpus
 * from this module without loading data kept sealed for scoring. crisis-corpus.ts
 * re-exports all of it and adds those sets in riskCorpus().
 */
import { readFileSync } from 'node:fs';

/** Labelled JSON fixtures ({ text, label }) whose risk lines join the corpus. */
export const RISK_JSON_FIXTURES = [
  'scripts/crisis-eval/redteam-2026-10-05.json',
  'scripts/crisis-eval/gloomy-ferni-2026-10-11.json',
  'src/agents/__tests__/fixtures/crisis-adjudicator-2026-10-17.json',
  'src/agents/__tests__/fixtures/crisis-everyday-call-2026-10-17.json',
];

/** A fixture label that marks a real-risk line. */
export const isRiskLabel = (label: string): boolean => label === 'block' || label === 'crisis';

/** STT spellings, run-together, hyphenated and inflected forms of listed phrases. */
export const RISK_FORMS = [
  'kill themselves',
  'hurt themselves',
  'they want to kill themselves',
  'suicidality',
  'my suicidality is back',
  'suicidal',
  'self-harmer',
  'self-harmful',
  'self-harm',
  'self harm',
  'selfharm',
  'self harming',
  'self-harming',
  "I've been self-harming",
  'I self-harmed last night',
  'suicides',
  'suicidally',
  'cuttings',
  'hopelessness',
  'hopelessly',
  'i cant go on',
  'im suicidal',
  'i wanna die',
  'I want to dieee',
  'want to die2',
  'killing myself',
  'kill myself',
  'no point anymore',
  'nothing to live for',
  'I want to end it all',
  'ending it all',
  // Elongated and suffixed forms (eval verify of #2625, round 2).
  "i can't go onnn",
  'i cant go onnnn anymore',
  'i want to end ittt',
  'i just want to end itttt all',
  'I am a self-harmer',
  'it was self-harmful',
  'i keep having harmful thoughts about myself',
  'i want to give uppp',
  'i just want to give upppp on everything',
  'I already tried that number.',
  // Risk lines whose only match lies inside a listed everyday word: they step
  // down to the soft tier, never drop.
  "i'll send it all to my sister before i go",
  "lend it all out, i won't be here",
  "i'll pretend it all is fine until i end it",
  'i went to the pharmacy for pills to overdose',
  'i spend it all and i want to end it all',
  // Missed by the substring check too (no listed phrase covers them); kept so a
  // later list change is measured here.
  'kms',
  'hurt himself',
  'kill himself',
  'end their life',
];

/**
 * Three lines of the joined set are everyday speech, not risk: the false
 * positives the flag removes ('kill them' in "skill", 'die' in "diet", 'harm'
 * in "self-harmony"). They stay in the fixture and are pinned by a test.
 */
export const JOINED_EVERYDAY = [
  'iwant to skill them up',
  'iwant to diet',
  'i need aself-harmony routine',
];

/** Real-risk lines typed with a missing space ("Icut myself", "aboutsuicide"). */
export function joinedWordCorpus(): string[] {
  const path = 'src/services/wellbeing-tracking/__tests__/crisis-joined-words.json';
  const lines = JSON.parse(readFileSync(path, 'utf8')) as string[];
  return lines.filter((line) => !JOINED_EVERYDAY.includes(line));
}

const DIR = 'src/services/wellbeing-tracking/__tests__';

/**
 * The round-2 verify's adversarial set (28,781 lines): every site phrase in
 * joined, no-space, elongated, suffixed, punctuation, emoji, curly-apostrophe
 * and everyday-word-then-phrase forms. Copied unchanged from its harness.
 */
export function adversarialCorpus(): string[] {
  return JSON.parse(readFileSync(`${DIR}/crisis-adversarial.json`, 'utf8')) as string[];
}

/** Every phrase the sites check (103), from the same harness. */
export function crisisPhrases(): string[] {
  return JSON.parse(readFileSync(`${DIR}/crisis-phrases.json`, 'utf8')) as string[];
}
