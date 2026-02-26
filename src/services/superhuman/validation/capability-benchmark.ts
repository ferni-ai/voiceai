/**
 * Capability Benchmark - Test Case Definitions
 *
 * Adversarial test cases for measuring superhuman capability accuracy.
 * Contains test data arrays for commitment detection, crisis detection,
 * and reading-between-lines detection.
 *
 * @module services/superhuman/validation/capability-benchmark
 */

import type { AdversarialTestCase } from '../../better-than-human-validation/types.js';

// ============================================================================
// ADVERSARIAL TEST CASES
// ============================================================================

/**
 * Adversarial test cases for commitment detection.
 *
 * Categories:
 * - explicit: Clear commitment language
 * - slang: Gen-Z/millennial slang patterns
 * - esl: Non-native English patterns
 * - conditional: If/when conditional commitments
 * - cultural: AAVE, British English, regional variations
 * - hedged: Weak/uncertain language
 * - sarcasm: Sarcastic "commitments" that aren't real
 * - past: Past tense (not new commitments)
 * - external: External pressure, not self-driven
 * - hypothetical: "Would" statements, not actual commitments
 */
export const COMMITMENT_TEST_CASES: AdversarialTestCase[] = [
  // ========================================================================
  // TRUE POSITIVES - Should detect
  // ========================================================================

  // --- Explicit commitments ---
  {
    id: 'commit_explicit_1',
    capability: 'commitment_detection',
    category: 'explicit',
    input: "I promise I'll call my mom this weekend",
    expectedResult: { shouldDetect: true },
    difficulty: 'easy',
    reason: 'Explicit promise with "I promise"',
    tags: ['explicit', 'family'],
  },
  {
    id: 'commit_explicit_2',
    capability: 'commitment_detection',
    category: 'explicit',
    input: "I swear I'm going to finish this project by Friday",
    expectedResult: { shouldDetect: true },
    difficulty: 'easy',
    reason: 'Emphatic "I swear" commitment',
    tags: ['explicit', 'work'],
  },
  {
    id: 'commit_explicit_3',
    capability: 'commitment_detection',
    category: 'explicit',
    input: 'You have my word, I will be there',
    expectedResult: { shouldDetect: true },
    difficulty: 'easy',
    reason: 'Formal commitment phrase',
    tags: ['explicit', 'formal'],
  },

  // --- Slang/casual commitments ---
  {
    id: 'commit_slang_1',
    capability: 'commitment_detection',
    category: 'slang',
    input: 'Gonna hit the gym tomorrow fr fr',
    expectedResult: { shouldDetect: true },
    difficulty: 'hard',
    reason: 'Gen-Z slang "fr fr" (for real for real)',
    tags: ['slang', 'gen-z', 'health'],
  },
  {
    id: 'commit_slang_2',
    capability: 'commitment_detection',
    category: 'slang',
    input: 'Lowkey need to start meditating',
    expectedResult: { shouldDetect: true },
    difficulty: 'hard',
    reason: 'Casual "lowkey" indicating intention',
    tags: ['slang', 'wellness'],
  },
  {
    id: 'commit_slang_3',
    capability: 'commitment_detection',
    category: 'slang',
    input: "I'm deadass gonna learn Spanish this year",
    expectedResult: { shouldDetect: true },
    difficulty: 'hard',
    reason: 'Emphatic slang "deadass"',
    tags: ['slang', 'learning'],
  },
  {
    id: 'commit_slang_4',
    capability: 'commitment_detection',
    category: 'slang',
    input: 'No cap im finna start saving money',
    expectedResult: { shouldDetect: true },
    difficulty: 'adversarial',
    reason: 'Multiple slang markers - "no cap" and "finna"',
    tags: ['slang', 'gen-z', 'financial'],
  },
  {
    id: 'commit_slang_5',
    capability: 'commitment_detection',
    category: 'slang',
    input: 'bet, ill text her tonight',
    expectedResult: { shouldDetect: true },
    difficulty: 'hard',
    reason: 'Lowercase "bet" as agreement/commitment',
    tags: ['slang', 'social'],
  },
  {
    id: 'commit_slang_6',
    capability: 'commitment_detection',
    category: 'slang',
    input: 'say less, im on it',
    expectedResult: { shouldDetect: true },
    difficulty: 'adversarial',
    reason: '"Say less" idiom meaning "I\'ll do it"',
    tags: ['slang', 'gen-z'],
  },

  // --- ESL patterns ---
  {
    id: 'commit_esl_1',
    capability: 'commitment_detection',
    category: 'esl',
    input: 'Tomorrow I make start the diet',
    expectedResult: { shouldDetect: true },
    difficulty: 'adversarial',
    reason: 'ESL phrasing - non-standard grammar',
    tags: ['esl', 'health'],
  },
  {
    id: 'commit_esl_2',
    capability: 'commitment_detection',
    category: 'esl',
    input: 'I must to do the exercise more',
    expectedResult: { shouldDetect: true },
    difficulty: 'adversarial',
    reason: 'ESL modal verb pattern',
    tags: ['esl', 'health'],
  },
  {
    id: 'commit_esl_3',
    capability: 'commitment_detection',
    category: 'esl',
    input: 'I am going for to call my brother',
    expectedResult: { shouldDetect: true },
    difficulty: 'adversarial',
    reason: 'Spanish L1 infinitive interference',
    tags: ['esl', 'spanish-l1', 'family'],
  },
  {
    id: 'commit_esl_4',
    capability: 'commitment_detection',
    category: 'esl',
    input: 'Next week I am joining the yoga class definitely',
    expectedResult: { shouldDetect: true },
    difficulty: 'medium',
    reason: 'ESL adverb placement',
    tags: ['esl', 'health'],
  },

  // --- Conditional commitments ---
  {
    id: 'commit_conditional_1',
    capability: 'commitment_detection',
    category: 'conditional',
    input: "If I get the promotion, I'll buy a house",
    expectedResult: { shouldDetect: true },
    difficulty: 'medium',
    reason: 'Conditional future commitment',
    tags: ['conditional', 'financial'],
  },
  {
    id: 'commit_conditional_2',
    capability: 'commitment_detection',
    category: 'conditional',
    input: "When things calm down, I'll start writing again",
    expectedResult: { shouldDetect: true },
    difficulty: 'medium',
    reason: 'Conditional timing commitment',
    tags: ['conditional', 'creative'],
  },
  {
    id: 'commit_conditional_3',
    capability: 'commitment_detection',
    category: 'conditional',
    input: "Once I finish this deadline, I'm taking a real vacation",
    expectedResult: { shouldDetect: true },
    difficulty: 'medium',
    reason: 'Deferred commitment with "once"',
    tags: ['conditional', 'work-life'],
  },

  // --- Cultural variations (AAVE) ---
  {
    id: 'commit_aave_1',
    capability: 'commitment_detection',
    category: 'cultural',
    input: "I'mma clean up my act starting Monday",
    expectedResult: { shouldDetect: true },
    difficulty: 'hard',
    reason: 'AAVE "I\'mma" (I am going to)',
    tags: ['aave', 'cultural'],
  },
  {
    id: 'commit_aave_2',
    capability: 'commitment_detection',
    category: 'cultural',
    input: 'I been meaning to call her, ima do it today',
    expectedResult: { shouldDetect: true },
    difficulty: 'hard',
    reason: 'AAVE "ima" with been + present intention',
    tags: ['aave', 'cultural', 'social'],
  },
  {
    id: 'commit_aave_3',
    capability: 'commitment_detection',
    category: 'cultural',
    input: "Finna get my life together this semester, that's on everything",
    expectedResult: { shouldDetect: true },
    difficulty: 'adversarial',
    reason: 'AAVE emphatic commitment "on everything"',
    tags: ['aave', 'cultural', 'emphatic'],
  },

  // --- British English ---
  {
    id: 'commit_british_1',
    capability: 'commitment_detection',
    category: 'cultural',
    input: 'I shall ring her tomorrow, I reckon',
    expectedResult: { shouldDetect: true },
    difficulty: 'medium',
    reason: 'British "shall" commitment',
    tags: ['british', 'cultural'],
  },
  {
    id: 'commit_british_2',
    capability: 'commitment_detection',
    category: 'cultural',
    input: "I'll sort out my finances straightaway, proper this time",
    expectedResult: { shouldDetect: true },
    difficulty: 'medium',
    reason: 'British "sort out" with emphatic "proper"',
    tags: ['british', 'cultural', 'financial'],
  },

  // --- Soft/hedged but still commitments ---
  {
    id: 'commit_hedged_1',
    capability: 'commitment_detection',
    category: 'hedged',
    input: "I really should call my sister more, and I'm going to start this week",
    expectedResult: { shouldDetect: true },
    difficulty: 'medium',
    reason: 'Hedged with "should" but confirmed with action',
    tags: ['hedged', 'family'],
  },
  {
    id: 'commit_hedged_2',
    capability: 'commitment_detection',
    category: 'hedged',
    input: "I think I'm finally ready to quit smoking",
    expectedResult: { shouldDetect: true },
    difficulty: 'hard',
    reason: 'Hedged with "think" but indicates readiness',
    tags: ['hedged', 'health'],
  },

  // --- Social media style ---
  {
    id: 'commit_social_1',
    capability: 'commitment_detection',
    category: 'social_media',
    input: 'Starting my fitness journey 💪 NO EXCUSES',
    expectedResult: { shouldDetect: true },
    difficulty: 'medium',
    reason: 'Social media commitment with emoji emphasis',
    tags: ['social-media', 'health'],
  },
  {
    id: 'commit_social_2',
    capability: 'commitment_detection',
    category: 'social_media',
    input: 'THIS IS THE YEAR i finally write my book',
    expectedResult: { shouldDetect: true },
    difficulty: 'medium',
    reason: 'Mixed caps emphasis indicating commitment',
    tags: ['social-media', 'creative'],
  },

  // ========================================================================
  // TRUE NEGATIVES - Should NOT detect
  // ========================================================================

  // --- Sarcasm patterns ---
  {
    id: 'commit_sarcasm_1',
    capability: 'commitment_detection',
    category: 'sarcasm',
    input: "Yeah sure, I'll definitely start exercising (not)",
    expectedResult: { shouldDetect: false },
    difficulty: 'hard',
    reason: 'Sarcastic with explicit (not)',
    tags: ['sarcasm', 'negative'],
  },
  {
    id: 'commit_sarcasm_2',
    capability: 'commitment_detection',
    category: 'sarcasm',
    input: "I'm totally going to wake up at 5am... as if",
    expectedResult: { shouldDetect: false },
    difficulty: 'hard',
    reason: 'Sarcastic with "as if"',
    tags: ['sarcasm', 'negative'],
  },
  {
    id: 'commit_sarcasm_3',
    capability: 'commitment_detection',
    category: 'sarcasm',
    input: "Oh I'll DEFINITELY remember to call her back 🙄",
    expectedResult: { shouldDetect: false },
    difficulty: 'adversarial',
    reason: 'Eye-roll emoji indicates sarcasm',
    tags: ['sarcasm', 'emoji', 'negative'],
  },
  {
    id: 'commit_sarcasm_4',
    capability: 'commitment_detection',
    category: 'sarcasm',
    input: 'Yeah right, like I\'m going to "start journaling"',
    expectedResult: { shouldDetect: false },
    difficulty: 'adversarial',
    reason: 'Scare quotes around commitment',
    tags: ['sarcasm', 'negative'],
  },
  {
    id: 'commit_sarcasm_5',
    capability: 'commitment_detection',
    category: 'sarcasm',
    input: "Sure Jan, I'll totally go to the gym every day",
    expectedResult: { shouldDetect: false },
    difficulty: 'adversarial',
    reason: 'Meme reference "Sure Jan" = sarcasm',
    tags: ['sarcasm', 'meme', 'negative'],
  },
  {
    id: 'commit_sarcasm_6',
    capability: 'commitment_detection',
    category: 'sarcasm',
    input: 'me? wake up early? hahahaha ok sure',
    expectedResult: { shouldDetect: false },
    difficulty: 'hard',
    reason: 'Self-referential disbelief pattern',
    tags: ['sarcasm', 'negative'],
  },

  // --- Past tense (not new commitments) ---
  {
    id: 'commit_past_1',
    capability: 'commitment_detection',
    category: 'past',
    input: 'I was going to call her but forgot',
    expectedResult: { shouldDetect: false },
    difficulty: 'medium',
    reason: 'Past tense - not a new commitment',
    tags: ['past', 'negative'],
  },
  {
    id: 'commit_past_2',
    capability: 'commitment_detection',
    category: 'past',
    input: 'I used to want to be a teacher',
    expectedResult: { shouldDetect: false },
    difficulty: 'medium',
    reason: 'Past aspiration, not commitment',
    tags: ['past', 'negative'],
  },
  {
    id: 'commit_past_3',
    capability: 'commitment_detection',
    category: 'past',
    input: 'I almost signed up for that class last month',
    expectedResult: { shouldDetect: false },
    difficulty: 'medium',
    reason: 'Past near-action, not current commitment',
    tags: ['past', 'negative'],
  },
  {
    id: 'commit_past_4',
    capability: 'commitment_detection',
    category: 'past',
    input: 'I had planned to quit but then things got crazy',
    expectedResult: { shouldDetect: false },
    difficulty: 'medium',
    reason: 'Past plan that was abandoned',
    tags: ['past', 'negative'],
  },

  // --- External pressure (not self-commitment) ---
  {
    id: 'commit_external_1',
    capability: 'commitment_detection',
    category: 'external',
    input: 'Everyone says I should call my dad more',
    expectedResult: { shouldDetect: false },
    difficulty: 'medium',
    reason: 'External pressure, not self-commitment',
    tags: ['external', 'negative'],
  },
  {
    id: 'commit_external_2',
    capability: 'commitment_detection',
    category: 'external',
    input: 'My therapist wants me to start exercising',
    expectedResult: { shouldDetect: false },
    difficulty: 'medium',
    reason: 'Third party wants, not self-commitment',
    tags: ['external', 'negative'],
  },
  {
    id: 'commit_external_3',
    capability: 'commitment_detection',
    category: 'external',
    input: 'My mom keeps telling me I should save more money',
    expectedResult: { shouldDetect: false },
    difficulty: 'medium',
    reason: 'External nagging, no self-commitment',
    tags: ['external', 'negative'],
  },

  // --- Hypothetical/wishful (not commitments) ---
  {
    id: 'commit_hypothetical_1',
    capability: 'commitment_detection',
    category: 'hypothetical',
    input: 'I wish I could travel more',
    expectedResult: { shouldDetect: false },
    difficulty: 'easy',
    reason: 'Wish, not commitment',
    tags: ['hypothetical', 'negative'],
  },
  {
    id: 'commit_hypothetical_2',
    capability: 'commitment_detection',
    category: 'hypothetical',
    input: 'It would be nice to learn guitar someday',
    expectedResult: { shouldDetect: false },
    difficulty: 'easy',
    reason: 'Vague hypothetical, no commitment',
    tags: ['hypothetical', 'negative'],
  },
  {
    id: 'commit_hypothetical_3',
    capability: 'commitment_detection',
    category: 'hypothetical',
    input: "I'd love to start a business if I had the money",
    expectedResult: { shouldDetect: false },
    difficulty: 'medium',
    reason: 'Blocked hypothetical with prerequisite',
    tags: ['hypothetical', 'conditional', 'negative'],
  },
  {
    id: 'commit_hypothetical_4',
    capability: 'commitment_detection',
    category: 'hypothetical',
    input: 'Maybe in another life I could be more organized',
    expectedResult: { shouldDetect: false },
    difficulty: 'easy',
    reason: 'Dismissive hypothetical',
    tags: ['hypothetical', 'negative'],
  },

  // --- Questions (not commitments) ---
  {
    id: 'commit_question_1',
    capability: 'commitment_detection',
    category: 'question',
    input: 'Should I start going to therapy?',
    expectedResult: { shouldDetect: false },
    difficulty: 'easy',
    reason: 'Question seeking input, not commitment',
    tags: ['question', 'negative'],
  },
  {
    id: 'commit_question_2',
    capability: 'commitment_detection',
    category: 'question',
    input: 'Do you think I should call her?',
    expectedResult: { shouldDetect: false },
    difficulty: 'easy',
    reason: 'Asking for advice, not committing',
    tags: ['question', 'negative'],
  },

  // --- Third person (someone else's commitment) ---
  {
    id: 'commit_third_person_1',
    capability: 'commitment_detection',
    category: 'third_person',
    input: 'She promised to call me back',
    expectedResult: { shouldDetect: false },
    difficulty: 'easy',
    reason: "Someone else's commitment",
    tags: ['third-person', 'negative'],
  },
  {
    id: 'commit_third_person_2',
    capability: 'commitment_detection',
    category: 'third_person',
    input: 'My brother said he will quit smoking',
    expectedResult: { shouldDetect: false },
    difficulty: 'easy',
    reason: "Reporting someone else's commitment",
    tags: ['third-person', 'negative'],
  },

  // --- Deflection/avoidance ---
  {
    id: 'commit_deflection_1',
    capability: 'commitment_detection',
    category: 'deflection',
    input: "I'll think about maybe starting to exercise",
    expectedResult: { shouldDetect: false },
    difficulty: 'hard',
    reason: 'Multiple hedges = avoidance not commitment',
    tags: ['deflection', 'hedged', 'negative'],
  },
  {
    id: 'commit_deflection_2',
    capability: 'commitment_detection',
    category: 'deflection',
    input: 'We should get together sometime',
    expectedResult: { shouldDetect: false },
    difficulty: 'medium',
    reason: 'Polite deflection phrase, not real plan',
    tags: ['deflection', 'social', 'negative'],
  },
];

/**
 * Adversarial test cases for crisis detection.
 */
export { CRISIS_TEST_CASES } from './crisis-test-cases.js';

/**
 * Adversarial test cases for reading between lines.
 */
export { READING_BETWEEN_LINES_CASES } from './reading-between-lines-cases.js';
