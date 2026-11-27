/**
 * Every literal injection category a context builder emits is classified: it carries stored
 * caller memory (CALLER_MEMORY_CATEGORIES, held on crisis turns by CRISIS_NO_MEMORY_RECALL), is
 * safety guidance (SAFETY_CATEGORIES), or is listed here as carrying none. A builder that adds an
 * unlisted category fails this guard until someone decides which it is, so a new kind of stored
 * memory cannot reach a crisis reply unnoticed.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { carriesCallerMemory } from '../caller-memory-categories.js';
import { SAFETY_CATEGORIES } from '../injection-filter.js';

/** Where context builders emit injections. */
const BUILDER_DIRS = [
  'src/intelligence/context-builders',
  'src/intelligence/memory-intelligence',
  'src/intelligence/revived',
  'src/agents/processors',
  'src/agents/voice-agent',
];

/** Read, for each, from the code that builds its content: live turn state, persona text, labels. */
const NO_CALLER_MEMORY: ReadonlySet<string> = new Set([
  'account-linking',
  'advanced_humanization',
  'ambient_awareness',
  'anger',
  'anxiety',
  'audio_native',
  'behavioral',
  'calendar',
  'capability-awareness',
  'cartesia',
  'catchphrase',
  'cognitive',
  'compliance',
  'concern_detected',
  'conflict',
  'constraints',
  'contact_detected',
  'crisis',
  'data_capture',
  'decision',
  'deep_human',
  'desktop-awareness',
  'distress',
  'emotional',
  'emotional_granularity',
  'emotional_guidance',
  'emotional_intelligence',
  'emotional_journey',
  'emotional_moment',
  'emotional_transition',
  'emotional_vocabulary',
  'energy_matching',
  'engagement',
  'feedback',
  'first-call-onboarding',
  'first-meeting',
  'gemini',
  'goal',
  'guidance',
  'handoff',
  'health_awareness',
  'honesty',
  'humanizing',
  'humor',
  'identity',
  'identity_verification',
  'inbound-call',
  'intelligence',
  'laughter_contagion',
  'listening',
  'mode_transition',
  'motivation',
  'music',
  'narrative_arc',
  'naturalness',
  'obstacle',
  'outbound-call',
  'pacing',
  'persona',
  'persona-identity',
  'principal_attachment',
  'principal_overall',
  'principal_referral',
  'principal_transparency',
  'principal_truth',
  'principal_values',
  'pushback',
  'referral_history',
  'relational',
  'resonance_check',
  'response',
  'response_length',
  'response_prefix',
  'response-style',
  'rhythm',
  'sadness',
  'secret_mode',
  'service_availability',
  'service_health',
  'silence',
  'situational_response',
  'speech_naturalizer',
  'story_opportunity',
  'story_preference',
  'stt',
  'superhuman_ambient',
  'superhuman_callback',
  'superhuman_capacity',
  'superhuman_data_capture',
  'superhuman_deep_voice',
  'superhuman_dream',
  'superhuman_narrative',
  'superhuman_pattern_trigger',
  'superhuman_predictive',
  'superhuman_relationship',
  'superhuman_timing',
  'superhuman_values',
  'superhuman_voice',
  'superhuman_voice_identity',
  'system_state',
  'tasks',
  'team',
  'time-pressure',
  'timing_state',
  'tool_hint',
  'tool_history',
  'tool_in_flight',
  'tool-timing',
  'tools',
  'topic_transition',
  'user-action',
  'values',
  'viral_growth',
  'voice',
  'voice_biomarker',
  'voice-emotion',
  'voice-verification',
  'vulnerability',
  'work-context',
  'wrap_up',
]);

const SKIPPED = /__tests__|\.test\.ts$|fixtures|heldout|held-out|blind|sealed|corpus/;
const LITERAL = /category: ['"]([\w-]+)['"]/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (SKIPPED.test(path)) return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

function literalCategories(): Set<string> {
  const found = new Set<string>();
  for (const file of BUILDER_DIRS.flatMap(sourceFiles)) {
    for (const match of readFileSync(file, 'utf8').matchAll(LITERAL)) found.add(match[1]);
  }
  return found;
}

const classified = (category: string): boolean =>
  carriesCallerMemory(category) ||
  SAFETY_CATEGORIES.has(category) ||
  NO_CALLER_MEMORY.has(category);

describe('caller memory categories', () => {
  it('every literal category a builder emits is classified', () => {
    const literals = literalCategories();
    expect(literals.size).toBeGreaterThan(150); // the scan found the builders
    expect([...literals].filter((c) => !classified(c))).toEqual([]);
  });

  it('a new unlisted category is caught by the guard', () => {
    expect(classified('caller_memory_category_never_listed')).toBe(false);
  });

  it('no category is listed as both carrying stored memory and carrying none', () => {
    expect([...NO_CALLER_MEMORY].filter((c) => carriesCallerMemory(c))).toEqual([]);
  });

  it('recalled memory, stored data and persona briefings carry memory; safety and live state do not', () => {
    for (const c of ['memory', 'memory_intelligence', 'revived_intelligence', 'emotional_memory']) {
      expect(carriesCallerMemory(c)).toBe(true);
    }
    expect(carriesCallerMemory('persona_ferni')).toBe(true);
    for (const c of ['crisis_follow_up', 'safety', 'crisis_response', 'pacing', 'tool_hint']) {
      expect(carriesCallerMemory(c)).toBe(false);
    }
  });
});
