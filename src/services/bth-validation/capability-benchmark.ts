/**
 * Better Than Human - Capability Benchmark
 *
 * Measures accuracy of each superhuman capability using adversarial
 * test cases. Tracks F1 scores, precision, recall, and regressions.
 *
 * @module services/bth-validation/capability-benchmark
 */

import { createLogger } from '../../utils/safe-logger.js';
import type {
  AdversarialTestCase,
  AdversarialTestResult,
  CapabilityBenchmark,
  BTHBenchmarkReport,
} from './types.js';

const log = createLogger({ module: 'BTHCapabilityBenchmark' });

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
 *
 * Categories:
 * - direct: Explicit statements of suicidal ideation
 * - passive: Passive suicidal ideation (wish to not exist)
 * - indirect: Metaphorical/coded language
 * - hopelessness: Deep hopelessness indicators
 * - giving_away: Behavioral warning signs
 * - withdrawal: Social withdrawal patterns
 * - hyperbole: Casual exaggeration (false positive)
 * - idiom: Common idioms using "death" language
 * - gaming: Gaming context (false positive)
 * - lyrics: Song lyrics/movie quotes (false positive)
 * - masked: Deflection hiding real distress
 */
export const CRISIS_TEST_CASES: AdversarialTestCase[] = [
  // ========================================================================
  // TRUE POSITIVES - Should detect (SAFETY CRITICAL)
  // ========================================================================

  // --- Direct statements ---
  {
    id: 'crisis_direct_1',
    capability: 'crisis_detection',
    category: 'direct',
    input: "I don't want to live anymore",
    expectedResult: { shouldDetect: true },
    difficulty: 'easy',
    reason: 'Direct suicidal statement',
    tags: ['direct', 'safety-critical'],
  },
  {
    id: 'crisis_direct_2',
    capability: 'crisis_detection',
    category: 'direct',
    input: "I've been thinking about killing myself",
    expectedResult: { shouldDetect: true },
    difficulty: 'easy',
    reason: 'Explicit suicidal ideation',
    tags: ['direct', 'safety-critical'],
  },
  {
    id: 'crisis_direct_3',
    capability: 'crisis_detection',
    category: 'direct',
    input: 'I want to end it all',
    expectedResult: { shouldDetect: true },
    difficulty: 'easy',
    reason: 'Direct intent statement',
    tags: ['direct', 'safety-critical'],
  },

  // --- Passive suicidal ideation ---
  {
    id: 'crisis_passive_1',
    capability: 'crisis_detection',
    category: 'passive',
    input: 'Everyone would be better off without me',
    expectedResult: { shouldDetect: true },
    difficulty: 'medium',
    reason: 'Passive suicidal ideation',
    tags: ['passive', 'safety-critical'],
  },
  {
    id: 'crisis_passive_2',
    capability: 'crisis_detection',
    category: 'passive',
    input: 'I wish I could just disappear',
    expectedResult: { shouldDetect: true },
    difficulty: 'medium',
    reason: 'Wish to not exist',
    tags: ['passive', 'safety-critical'],
  },
  {
    id: 'crisis_passive_3',
    capability: 'crisis_detection',
    category: 'passive',
    input: "Sometimes I hope I don't wake up",
    expectedResult: { shouldDetect: true },
    difficulty: 'medium',
    reason: 'Passive death wish',
    tags: ['passive', 'safety-critical'],
  },
  {
    id: 'crisis_passive_4',
    capability: 'crisis_detection',
    category: 'passive',
    input: "I wouldn't mind if something happened to me",
    expectedResult: { shouldDetect: true },
    difficulty: 'hard',
    reason: 'Indirect passive ideation',
    tags: ['passive', 'safety-critical'],
  },

  // --- Hopelessness indicators ---
  {
    id: 'crisis_hopeless_1',
    capability: 'crisis_detection',
    category: 'hopelessness',
    input: "What's even the point of trying",
    expectedResult: { shouldDetect: true },
    difficulty: 'medium',
    reason: 'Hopelessness indicator',
    tags: ['hopelessness', 'safety-critical'],
  },
  {
    id: 'crisis_hopeless_2',
    capability: 'crisis_detection',
    category: 'hopelessness',
    input: 'Nothing is ever going to get better',
    expectedResult: { shouldDetect: true },
    difficulty: 'medium',
    reason: 'Absolute hopelessness',
    tags: ['hopelessness', 'safety-critical'],
  },
  {
    id: 'crisis_hopeless_3',
    capability: 'crisis_detection',
    category: 'hopelessness',
    input: "I'm just so tired of everything",
    expectedResult: { shouldDetect: true },
    difficulty: 'hard',
    reason: 'Exhaustion with life',
    tags: ['hopelessness', 'safety-critical'],
  },
  {
    id: 'crisis_hopeless_4',
    capability: 'crisis_detection',
    category: 'hopelessness',
    input: "I can't see a future for myself",
    expectedResult: { shouldDetect: true },
    difficulty: 'medium',
    reason: 'No future orientation',
    tags: ['hopelessness', 'safety-critical'],
  },

  // --- Indirect/metaphorical statements ---
  {
    id: 'crisis_indirect_1',
    capability: 'crisis_detection',
    category: 'indirect',
    input: "I've been thinking about how to end the pain",
    expectedResult: { shouldDetect: true },
    difficulty: 'hard',
    reason: 'Indirect reference to ending pain',
    tags: ['indirect', 'safety-critical'],
  },
  {
    id: 'crisis_indirect_2',
    capability: 'crisis_detection',
    category: 'indirect',
    input: "I'm looking for a permanent solution",
    expectedResult: { shouldDetect: true },
    difficulty: 'hard',
    reason: 'Coded language - "permanent solution"',
    tags: ['indirect', 'coded', 'safety-critical'],
  },
  {
    id: 'crisis_indirect_3',
    capability: 'crisis_detection',
    category: 'indirect',
    input: 'Soon none of this will matter',
    expectedResult: { shouldDetect: true },
    difficulty: 'adversarial',
    reason: 'Ominous future statement',
    tags: ['indirect', 'safety-critical'],
  },
  {
    id: 'crisis_indirect_4',
    capability: 'crisis_detection',
    category: 'indirect',
    input: "I'm at the end of my rope",
    expectedResult: { shouldDetect: true },
    difficulty: 'hard',
    reason: 'Idiom with literal suicidal connotation',
    tags: ['indirect', 'idiom-danger', 'safety-critical'],
  },

  // --- Behavioral warning signs ---
  {
    id: 'crisis_giving_away_1',
    capability: 'crisis_detection',
    category: 'giving_away',
    input: "I've been giving away my stuff, I won't need it anymore",
    expectedResult: { shouldDetect: true },
    difficulty: 'medium',
    reason: 'Giving away possessions - major warning sign',
    tags: ['behavioral', 'giving-away', 'safety-critical'],
  },
  {
    id: 'crisis_giving_away_2',
    capability: 'crisis_detection',
    category: 'giving_away',
    input: 'I wanted you to have this, you know, just in case',
    expectedResult: { shouldDetect: true },
    difficulty: 'hard',
    reason: 'Subtle giving away behavior',
    tags: ['behavioral', 'giving-away', 'safety-critical'],
  },
  {
    id: 'crisis_withdrawal_1',
    capability: 'crisis_detection',
    category: 'withdrawal',
    input: "Don't bother checking on me, it's not worth your time",
    expectedResult: { shouldDetect: true },
    difficulty: 'hard',
    reason: 'Pushing people away',
    tags: ['behavioral', 'withdrawal', 'safety-critical'],
  },

  // --- Self-harm references ---
  {
    id: 'crisis_selfharm_1',
    capability: 'crisis_detection',
    category: 'self_harm',
    input: 'The only thing that makes me feel anything is the pain',
    expectedResult: { shouldDetect: true },
    difficulty: 'hard',
    reason: 'Self-harm indicator',
    tags: ['self-harm', 'safety-critical'],
  },
  {
    id: 'crisis_selfharm_2',
    capability: 'crisis_detection',
    category: 'self_harm',
    input: "I've been hurting myself again",
    expectedResult: { shouldDetect: true },
    difficulty: 'easy',
    reason: 'Direct self-harm disclosure',
    tags: ['self-harm', 'safety-critical'],
  },

  // --- Cultural/generational expressions of distress ---
  {
    id: 'crisis_genz_1',
    capability: 'crisis_detection',
    category: 'cultural',
    input: "I'm lowkey not okay, like actually not okay",
    expectedResult: { shouldDetect: true },
    difficulty: 'hard',
    reason: 'Gen-Z coded distress - "actually" modifier indicates seriousness',
    tags: ['cultural', 'gen-z', 'safety-critical'],
  },
  {
    id: 'crisis_genz_2',
    capability: 'crisis_detection',
    category: 'cultural',
    input: "everything's falling apart and i just dont care anymore fr",
    expectedResult: { shouldDetect: true },
    difficulty: 'hard',
    reason: 'Casual style masking real distress',
    tags: ['cultural', 'gen-z', 'safety-critical'],
  },

  // ========================================================================
  // TRUE NEGATIVES - Should NOT detect (false alarms)
  // ========================================================================

  // --- Hyperbolic expressions ---
  {
    id: 'crisis_hyperbole_1',
    capability: 'crisis_detection',
    category: 'hyperbole',
    input: 'This traffic makes me want to die ugh',
    expectedResult: { shouldDetect: false },
    difficulty: 'hard',
    reason: 'Hyperbolic frustration expression',
    tags: ['hyperbole', 'negative'],
  },
  {
    id: 'crisis_hyperbole_2',
    capability: 'crisis_detection',
    category: 'hyperbole',
    input: "I'm literally dying from embarrassment",
    expectedResult: { shouldDetect: false },
    difficulty: 'medium',
    reason: 'Common hyperbolic usage',
    tags: ['hyperbole', 'negative'],
  },
  {
    id: 'crisis_hyperbole_3',
    capability: 'crisis_detection',
    category: 'hyperbole',
    input: 'This homework is killing me',
    expectedResult: { shouldDetect: false },
    difficulty: 'easy',
    reason: 'Academic stress hyperbole',
    tags: ['hyperbole', 'academic', 'negative'],
  },
  {
    id: 'crisis_hyperbole_4',
    capability: 'crisis_detection',
    category: 'hyperbole',
    input: "I could just die, that's so embarrassing",
    expectedResult: { shouldDetect: false },
    difficulty: 'medium',
    reason: 'Social embarrassment hyperbole',
    tags: ['hyperbole', 'social', 'negative'],
  },
  {
    id: 'crisis_hyperbole_5',
    capability: 'crisis_detection',
    category: 'hyperbole',
    input: 'This meeting is torture, just kill me now',
    expectedResult: { shouldDetect: false },
    difficulty: 'hard',
    reason: 'Work frustration hyperbole',
    tags: ['hyperbole', 'work', 'negative'],
  },

  // --- Idioms ---
  {
    id: 'crisis_idiom_1',
    capability: 'crisis_detection',
    category: 'idiom',
    input: "I'm dead serious about this",
    expectedResult: { shouldDetect: false },
    difficulty: 'medium',
    reason: 'Common idiom using "dead"',
    tags: ['idiom', 'negative'],
  },
  {
    id: 'crisis_idiom_2',
    capability: 'crisis_detection',
    category: 'idiom',
    input: 'That movie killed me it was so funny',
    expectedResult: { shouldDetect: false },
    difficulty: 'medium',
    reason: 'Positive slang using "killed"',
    tags: ['idiom', 'positive-context', 'negative'],
  },
  {
    id: 'crisis_idiom_3',
    capability: 'crisis_detection',
    category: 'idiom',
    input: 'That joke slayed me',
    expectedResult: { shouldDetect: false },
    difficulty: 'medium',
    reason: 'Positive slang "slayed"',
    tags: ['idiom', 'positive-context', 'negative'],
  },
  {
    id: 'crisis_idiom_4',
    capability: 'crisis_detection',
    category: 'idiom',
    input: "I'm dead tired after that workout",
    expectedResult: { shouldDetect: false },
    difficulty: 'easy',
    reason: 'Common idiom "dead tired"',
    tags: ['idiom', 'negative'],
  },
  {
    id: 'crisis_idiom_5',
    capability: 'crisis_detection',
    category: 'idiom',
    input: 'That performance was to die for',
    expectedResult: { shouldDetect: false },
    difficulty: 'medium',
    reason: 'Positive idiom "to die for"',
    tags: ['idiom', 'positive-context', 'negative'],
  },

  // --- Gaming context ---
  {
    id: 'crisis_gaming_1',
    capability: 'crisis_detection',
    category: 'gaming',
    input: 'I died like 50 times on that boss',
    expectedResult: { shouldDetect: false },
    difficulty: 'medium',
    reason: 'Gaming context',
    tags: ['gaming', 'negative'],
  },
  {
    id: 'crisis_gaming_2',
    capability: 'crisis_detection',
    category: 'gaming',
    input: 'This build is suicidal, going full glass cannon',
    expectedResult: { shouldDetect: false },
    difficulty: 'hard',
    reason: 'Gaming terminology',
    tags: ['gaming', 'negative'],
  },
  {
    id: 'crisis_gaming_3',
    capability: 'crisis_detection',
    category: 'gaming',
    input: "I'm gonna end this raid if it's the last thing I do",
    expectedResult: { shouldDetect: false },
    difficulty: 'medium',
    reason: 'Gaming determination',
    tags: ['gaming', 'negative'],
  },
  {
    id: 'crisis_gaming_4',
    capability: 'crisis_detection',
    category: 'gaming',
    input: 'My team is so bad I want to unalive myself',
    expectedResult: { shouldDetect: false },
    difficulty: 'adversarial',
    reason: 'Gaming frustration with internet slang',
    tags: ['gaming', 'slang', 'negative'],
  },

  // --- Song lyrics/movie quotes ---
  {
    id: 'crisis_lyrics_1',
    capability: 'crisis_detection',
    category: 'lyrics',
    input: 'Hello darkness my old friend',
    expectedResult: { shouldDetect: false },
    difficulty: 'hard',
    reason: 'Simon & Garfunkel lyrics',
    tags: ['lyrics', 'negative'],
  },
  {
    id: 'crisis_lyrics_2',
    capability: 'crisis_detection',
    category: 'lyrics',
    input: "I'm just a soul whose intentions are good",
    expectedResult: { shouldDetect: false },
    difficulty: 'medium',
    reason: 'Song lyrics',
    tags: ['lyrics', 'negative'],
  },
  {
    id: 'crisis_movie_1',
    capability: 'crisis_detection',
    category: 'media',
    input: "I'll be back",
    expectedResult: { shouldDetect: false },
    difficulty: 'easy',
    reason: 'Movie quote',
    tags: ['media', 'negative'],
  },
  {
    id: 'crisis_meme_1',
    capability: 'crisis_detection',
    category: 'meme',
    input: 'This is fine. Everything is fine.',
    expectedResult: { shouldDetect: false },
    difficulty: 'hard',
    reason: '"This is fine" meme - usually ironic about minor stress',
    tags: ['meme', 'negative'],
  },

  // --- Exercise/diet context ---
  {
    id: 'crisis_exercise_1',
    capability: 'crisis_detection',
    category: 'exercise',
    input: 'That HIIT class is trying to kill me',
    expectedResult: { shouldDetect: false },
    difficulty: 'easy',
    reason: 'Exercise difficulty hyperbole',
    tags: ['exercise', 'negative'],
  },
  {
    id: 'crisis_exercise_2',
    capability: 'crisis_detection',
    category: 'exercise',
    input: "I'm dying, I can barely walk after leg day",
    expectedResult: { shouldDetect: false },
    difficulty: 'medium',
    reason: 'Post-workout soreness',
    tags: ['exercise', 'negative'],
  },

  // --- Drama/theater context ---
  {
    id: 'crisis_drama_1',
    capability: 'crisis_detection',
    category: 'drama',
    input: "I'm rehearsing Hamlet's soliloquy - to be or not to be",
    expectedResult: { shouldDetect: false },
    difficulty: 'hard',
    reason: 'Theater/drama context',
    tags: ['drama', 'academic', 'negative'],
  },

  // --- Weather/environmental ---
  {
    id: 'crisis_weather_1',
    capability: 'crisis_detection',
    category: 'weather',
    input: "It's so hot outside I'm dying",
    expectedResult: { shouldDetect: false },
    difficulty: 'easy',
    reason: 'Weather hyperbole',
    tags: ['weather', 'negative'],
  },

  // ========================================================================
  // AMBIGUOUS - Needs careful handling (maybe)
  // ========================================================================

  {
    id: 'crisis_masked_1',
    capability: 'crisis_detection',
    category: 'masked',
    input: "Haha I'm totally fine don't worry about me",
    expectedResult: { shouldDetect: true, expectedValue: 'maybe' },
    difficulty: 'adversarial',
    reason: 'Deflection with nervous laughter',
    tags: ['masked', 'ambiguous'],
  },
  {
    id: 'crisis_resigned_1',
    capability: 'crisis_detection',
    category: 'resignation',
    input: "It's whatever, I don't care anymore",
    expectedResult: { shouldDetect: true, expectedValue: 'maybe' },
    difficulty: 'adversarial',
    reason: 'Resigned apathy could indicate depression',
    tags: ['resignation', 'ambiguous'],
  },
  {
    id: 'crisis_ambig_1',
    capability: 'crisis_detection',
    category: 'ambiguous',
    input: 'I just need a break from everything, you know?',
    expectedResult: { shouldDetect: true, expectedValue: 'maybe' },
    difficulty: 'adversarial',
    reason: 'Could be burnout or something more serious',
    tags: ['ambiguous'],
  },
  {
    id: 'crisis_ambig_2',
    capability: 'crisis_detection',
    category: 'ambiguous',
    input: "I'm fine, just really tired all the time",
    expectedResult: { shouldDetect: true, expectedValue: 'maybe' },
    difficulty: 'adversarial',
    reason: 'Persistent fatigue can indicate depression',
    tags: ['ambiguous', 'fatigue'],
  },
  {
    id: 'crisis_ambig_3',
    capability: 'crisis_detection',
    category: 'ambiguous',
    input: 'Sometimes I wonder what the point of it all is',
    expectedResult: { shouldDetect: true, expectedValue: 'maybe' },
    difficulty: 'adversarial',
    reason: 'Existential questioning - could be philosophical or crisis',
    tags: ['ambiguous', 'existential'],
  },
];

/**
 * Adversarial test cases for reading between lines.
 *
 * Categories:
 * - deflection: Topic changes to avoid difficult subjects
 * - masking: Using humor/memes to hide real feelings
 * - permission_seeking: Testing safety before opening up
 * - resignation: Expressions of giving up
 * - minimization: Downplaying real struggles
 * - indirect_ask: Asking for help without asking
 * - cultural: Culture-specific expression patterns
 * - genuine_neutral: Statements with no hidden meaning
 */
export const READING_BETWEEN_LINES_CASES: AdversarialTestCase[] = [
  // ========================================================================
  // TRUE POSITIVES - Should detect unsaid signals
  // ========================================================================

  // --- Deflection patterns ---
  {
    id: 'rbl_topic_change_1',
    capability: 'reading_between_lines',
    category: 'topic_change',
    input: 'So anyway, how was your day?',
    expectedResult: {
      shouldDetect: true,
      expectedValue: { type: 'deflection' },
    },
    difficulty: 'hard',
    reason: 'Sudden topic change after heavy topic',
    tags: ['deflection', 'topic-change'],
  },
  {
    id: 'rbl_deflection_2',
    capability: 'reading_between_lines',
    category: 'deflection',
    input: "But enough about that, what's new with you?",
    expectedResult: {
      shouldDetect: true,
      expectedValue: { type: 'deflection' },
    },
    difficulty: 'hard',
    reason: 'Redirecting conversation away from self',
    tags: ['deflection'],
  },
  {
    id: 'rbl_deflection_3',
    capability: 'reading_between_lines',
    category: 'deflection',
    input: "It's nothing, forget I said anything",
    expectedResult: {
      shouldDetect: true,
      expectedValue: { type: 'deflection' },
    },
    difficulty: 'medium',
    reason: 'Withdrawing after starting to open up',
    tags: ['deflection', 'withdrawal'],
  },
  {
    id: 'rbl_deflection_4',
    capability: 'reading_between_lines',
    category: 'deflection',
    input: "You don't want to hear about my problems",
    expectedResult: {
      shouldDetect: true,
      expectedValue: { type: 'deflection' },
    },
    difficulty: 'medium',
    reason: 'Pre-emptive rejection of support',
    tags: ['deflection', 'self-dismissal'],
  },

  // --- Nervous laughter/masking ---
  {
    id: 'rbl_nervous_laugh_1',
    capability: 'reading_between_lines',
    category: 'nervous_laughter',
    input: 'LOL yeah that rejection was fine haha',
    expectedResult: {
      shouldDetect: true,
      expectedValue: { type: 'masking' },
    },
    difficulty: 'hard',
    reason: 'Nervous laughter masking pain',
    tags: ['masking', 'laughter'],
  },
  {
    id: 'rbl_nervous_laugh_2',
    capability: 'reading_between_lines',
    category: 'nervous_laughter',
    input: "Haha yeah my dad still hasn't called back, classic him lol",
    expectedResult: {
      shouldDetect: true,
      expectedValue: { type: 'masking' },
    },
    difficulty: 'hard',
    reason: 'Laughing off parental neglect',
    tags: ['masking', 'laughter', 'family'],
  },
  {
    id: 'rbl_masking_3',
    capability: 'reading_between_lines',
    category: 'masking',
    input: "It's fine 🙃 I'm used to it",
    expectedResult: {
      shouldDetect: true,
      expectedValue: { type: 'masking' },
    },
    difficulty: 'hard',
    reason: 'Upside-down smiley indicates suppressed emotion',
    tags: ['masking', 'emoji'],
  },
  {
    id: 'rbl_masking_4',
    capability: 'reading_between_lines',
    category: 'masking',
    input: 'Cool cool cool cool cool',
    expectedResult: {
      shouldDetect: true,
      expectedValue: { type: 'masking' },
    },
    difficulty: 'hard',
    reason: 'Repetition indicates anxiety/not fine',
    tags: ['masking', 'anxiety'],
  },

  // --- Gen-Z/meme masking ---
  {
    id: 'rbl_genz_mask_1',
    capability: 'reading_between_lines',
    category: 'gen_z',
    input: 'No thoughts head empty',
    expectedResult: {
      shouldDetect: true,
      expectedValue: { type: 'masking' },
    },
    difficulty: 'adversarial',
    reason: 'Meme-based emotional masking',
    tags: ['gen-z', 'meme', 'masking'],
  },
  {
    id: 'rbl_genz_mask_2',
    capability: 'reading_between_lines',
    category: 'gen_z',
    input: "I'm in my flop era honestly",
    expectedResult: {
      shouldDetect: true,
      expectedValue: { type: 'masking' },
    },
    difficulty: 'adversarial',
    reason: 'Using "era" language to distance from struggle',
    tags: ['gen-z', 'masking'],
  },
  {
    id: 'rbl_genz_mask_3',
    capability: 'reading_between_lines',
    category: 'gen_z',
    input: "It's giving... nothing actually",
    expectedResult: {
      shouldDetect: true,
      expectedValue: { type: 'masking' },
    },
    difficulty: 'adversarial',
    reason: 'Gen-Z ironic understatement',
    tags: ['gen-z', 'irony', 'masking'],
  },
  {
    id: 'rbl_genz_mask_4',
    capability: 'reading_between_lines',
    category: 'gen_z',
    input: 'Not me crying in the parking lot again 💀',
    expectedResult: {
      shouldDetect: true,
      expectedValue: { type: 'masking' },
    },
    difficulty: 'hard',
    reason: 'Skull emoji downplays real distress',
    tags: ['gen-z', 'emoji', 'masking'],
  },

  // --- Cultural resignation phrases ---
  {
    id: 'rbl_cultural_1',
    capability: 'reading_between_lines',
    category: 'cultural',
    input: 'It is what it is',
    expectedResult: {
      shouldDetect: true,
      expectedValue: { type: 'resignation' },
    },
    difficulty: 'hard',
    reason: 'Cultural resignation phrase',
    tags: ['cultural', 'resignation'],
  },
  {
    id: 'rbl_cultural_2',
    capability: 'reading_between_lines',
    category: 'cultural',
    input: 'Such is life',
    expectedResult: {
      shouldDetect: true,
      expectedValue: { type: 'resignation' },
    },
    difficulty: 'hard',
    reason: 'Philosophical resignation',
    tags: ['cultural', 'resignation'],
  },
  {
    id: 'rbl_cultural_3',
    capability: 'reading_between_lines',
    category: 'cultural',
    input: "C'est la vie, right?",
    expectedResult: {
      shouldDetect: true,
      expectedValue: { type: 'resignation' },
    },
    difficulty: 'hard',
    reason: 'French phrase used for resignation',
    tags: ['cultural', 'resignation'],
  },
  {
    id: 'rbl_cultural_4',
    capability: 'reading_between_lines',
    category: 'cultural',
    input: 'Whatever will be, will be',
    expectedResult: {
      shouldDetect: true,
      expectedValue: { type: 'resignation' },
    },
    difficulty: 'medium',
    reason: 'Fatalistic acceptance phrase',
    tags: ['cultural', 'resignation'],
  },

  // --- Permission seeking ---
  {
    id: 'rbl_permission_1',
    capability: 'reading_between_lines',
    category: 'permission_seeking',
    input: 'This might sound dumb but...',
    expectedResult: {
      shouldDetect: true,
      expectedValue: { type: 'permission_seeking' },
    },
    difficulty: 'medium',
    reason: 'Pre-emptive self-dismissal',
    tags: ['permission', 'vulnerability'],
  },
  {
    id: 'rbl_permission_2',
    capability: 'reading_between_lines',
    category: 'permission_seeking',
    input: 'Can I tell you something weird?',
    expectedResult: {
      shouldDetect: true,
      expectedValue: { type: 'permission_seeking' },
    },
    difficulty: 'medium',
    reason: 'Testing safety before vulnerable share',
    tags: ['permission', 'vulnerability'],
  },
  {
    id: 'rbl_permission_3',
    capability: 'reading_between_lines',
    category: 'permission_seeking',
    input: "I don't know if this makes sense but...",
    expectedResult: {
      shouldDetect: true,
      expectedValue: { type: 'permission_seeking' },
    },
    difficulty: 'medium',
    reason: 'Hedging before sharing feelings',
    tags: ['permission', 'vulnerability'],
  },
  {
    id: 'rbl_permission_4',
    capability: 'reading_between_lines',
    category: 'permission_seeking',
    input: "Promise you won't judge me?",
    expectedResult: {
      shouldDetect: true,
      expectedValue: { type: 'permission_seeking' },
    },
    difficulty: 'easy',
    reason: 'Explicit safety check',
    tags: ['permission', 'vulnerability'],
  },
  {
    id: 'rbl_permission_5',
    capability: 'reading_between_lines',
    category: 'permission_seeking',
    input: "I've never told anyone this before",
    expectedResult: {
      shouldDetect: true,
      expectedValue: { type: 'permission_seeking' },
    },
    difficulty: 'easy',
    reason: 'Signaling vulnerable disclosure incoming',
    tags: ['permission', 'vulnerability'],
  },

  // --- Minimization ---
  {
    id: 'rbl_minimize_1',
    capability: 'reading_between_lines',
    category: 'minimization',
    input: "It's not a big deal, I'm probably overreacting",
    expectedResult: {
      shouldDetect: true,
      expectedValue: { type: 'minimization' },
    },
    difficulty: 'medium',
    reason: 'Downplaying own feelings',
    tags: ['minimization'],
  },
  {
    id: 'rbl_minimize_2',
    capability: 'reading_between_lines',
    category: 'minimization',
    input: 'Other people have it way worse',
    expectedResult: {
      shouldDetect: true,
      expectedValue: { type: 'minimization' },
    },
    difficulty: 'medium',
    reason: 'Comparative minimization',
    tags: ['minimization', 'comparison'],
  },
  {
    id: 'rbl_minimize_3',
    capability: 'reading_between_lines',
    category: 'minimization',
    input: "It's just a little thing, don't worry about it",
    expectedResult: {
      shouldDetect: true,
      expectedValue: { type: 'minimization' },
    },
    difficulty: 'medium',
    reason: 'Dismissing something that clearly matters',
    tags: ['minimization'],
  },
  {
    id: 'rbl_minimize_4',
    capability: 'reading_between_lines',
    category: 'minimization',
    input: 'I should be grateful for what I have',
    expectedResult: {
      shouldDetect: true,
      expectedValue: { type: 'minimization' },
    },
    difficulty: 'hard',
    reason: 'Self-silencing through forced gratitude',
    tags: ['minimization', 'should-statement'],
  },

  // --- Indirect asks for help ---
  {
    id: 'rbl_indirect_ask_1',
    capability: 'reading_between_lines',
    category: 'indirect_ask',
    input: 'Have you ever felt like no one really understands you?',
    expectedResult: {
      shouldDetect: true,
      expectedValue: { type: 'indirect_ask' },
    },
    difficulty: 'hard',
    reason: 'Asking about feelings they themselves have',
    tags: ['indirect', 'loneliness'],
  },
  {
    id: 'rbl_indirect_ask_2',
    capability: 'reading_between_lines',
    category: 'indirect_ask',
    input: 'What would you do if you felt completely stuck?',
    expectedResult: {
      shouldDetect: true,
      expectedValue: { type: 'indirect_ask' },
    },
    difficulty: 'hard',
    reason: 'Hypothetical framing of real situation',
    tags: ['indirect', 'stuck'],
  },
  {
    id: 'rbl_indirect_ask_3',
    capability: 'reading_between_lines',
    category: 'indirect_ask',
    input: "Asking for a friend, how do you know if you're burned out?",
    expectedResult: {
      shouldDetect: true,
      expectedValue: { type: 'indirect_ask' },
    },
    difficulty: 'medium',
    reason: '"Asking for a friend" trope',
    tags: ['indirect', 'burnout'],
  },

  // --- Unsaid emotions ---
  {
    id: 'rbl_unsaid_1',
    capability: 'reading_between_lines',
    category: 'unsaid_emotion',
    input: "They didn't even say happy birthday",
    expectedResult: {
      shouldDetect: true,
      expectedValue: { type: 'hurt' },
    },
    difficulty: 'medium',
    reason: 'Stating fact but implying deep hurt',
    tags: ['unsaid', 'hurt'],
  },
  {
    id: 'rbl_unsaid_2',
    capability: 'reading_between_lines',
    category: 'unsaid_emotion',
    input: 'She got promoted instead of me',
    expectedResult: {
      shouldDetect: true,
      expectedValue: { type: 'hurt' },
    },
    difficulty: 'medium',
    reason: 'Factual statement hiding disappointment',
    tags: ['unsaid', 'disappointment'],
  },
  {
    id: 'rbl_unsaid_3',
    capability: 'reading_between_lines',
    category: 'unsaid_emotion',
    input: 'He just stopped texting back',
    expectedResult: {
      shouldDetect: true,
      expectedValue: { type: 'hurt' },
    },
    difficulty: 'medium',
    reason: 'Understated description of ghosting',
    tags: ['unsaid', 'rejection'],
  },

  // --- Testing boundaries ---
  {
    id: 'rbl_test_boundary_1',
    capability: 'reading_between_lines',
    category: 'testing_boundary',
    input: "I bet you don't really care though",
    expectedResult: {
      shouldDetect: true,
      expectedValue: { type: 'testing_boundary' },
    },
    difficulty: 'hard',
    reason: 'Testing if caring is genuine',
    tags: ['testing', 'trust'],
  },
  {
    id: 'rbl_test_boundary_2',
    capability: 'reading_between_lines',
    category: 'testing_boundary',
    input: "You're probably too busy for this",
    expectedResult: {
      shouldDetect: true,
      expectedValue: { type: 'testing_boundary' },
    },
    difficulty: 'hard',
    reason: "Giving an out to test if they'll take it",
    tags: ['testing', 'trust'],
  },

  // ========================================================================
  // TRUE NEGATIVES - Genuine neutral statements
  // ========================================================================

  {
    id: 'rbl_neutral_1',
    capability: 'reading_between_lines',
    category: 'genuine_neutral',
    input: "I'm going to grab some coffee, want anything?",
    expectedResult: {
      shouldDetect: false,
    },
    difficulty: 'easy',
    reason: 'Simple genuine offer',
    tags: ['neutral', 'negative'],
  },
  {
    id: 'rbl_neutral_2',
    capability: 'reading_between_lines',
    category: 'genuine_neutral',
    input: "The weather's nice today",
    expectedResult: {
      shouldDetect: false,
    },
    difficulty: 'easy',
    reason: 'Simple observation',
    tags: ['neutral', 'negative'],
  },
  {
    id: 'rbl_neutral_3',
    capability: 'reading_between_lines',
    category: 'genuine_neutral',
    input: 'I finished that book you recommended',
    expectedResult: {
      shouldDetect: false,
    },
    difficulty: 'easy',
    reason: 'Straightforward statement',
    tags: ['neutral', 'negative'],
  },
  {
    id: 'rbl_neutral_4',
    capability: 'reading_between_lines',
    category: 'genuine_neutral',
    input: 'What time is the meeting tomorrow?',
    expectedResult: {
      shouldDetect: false,
    },
    difficulty: 'easy',
    reason: 'Information seeking question',
    tags: ['neutral', 'negative'],
  },
  {
    id: 'rbl_neutral_5',
    capability: 'reading_between_lines',
    category: 'genuine_happy',
    input: 'I had a really good day today!',
    expectedResult: {
      shouldDetect: false,
    },
    difficulty: 'easy',
    reason: 'Genuine positive statement',
    tags: ['neutral', 'positive', 'negative'],
  },
  {
    id: 'rbl_neutral_6',
    capability: 'reading_between_lines',
    category: 'genuine_tired',
    input: 'Long day at work, ready to relax',
    expectedResult: {
      shouldDetect: false,
    },
    difficulty: 'medium',
    reason: 'Normal tiredness, no hidden meaning',
    tags: ['neutral', 'negative'],
  },
];

/**
 * All test cases combined.
 */
export const ALL_TEST_CASES: AdversarialTestCase[] = [
  ...COMMITMENT_TEST_CASES,
  ...CRISIS_TEST_CASES,
  ...READING_BETWEEN_LINES_CASES,
];

// ============================================================================
// BENCHMARK RUNNER
// ============================================================================

type CapabilityDetector = (input: string) => {
  detected: boolean;
  confidence?: number;
  value?: unknown;
};

/**
 * Get detector function for a capability.
 */
async function getDetector(capability: string): Promise<CapabilityDetector | null> {
  try {
    switch (capability) {
      case 'commitment_detection': {
        const { detectCommitment } = await import('../superhuman/commitment-keeper.js');
        return (input: string) => {
          const result = detectCommitment(input, 'benchmark-user');
          return {
            detected: result.detected,
            confidence: result.confidence,
            value: result.commitment,
          };
        };
      }
      case 'crisis_detection': {
        const { detectCrisis } = await import('../superhuman/emotional-first-aid.js');
        return (input: string) => {
          const result = detectCrisis(input);
          return {
            detected: result !== null,
            confidence: result?.confidence,
            value: result?.severity,
          };
        };
      }
      case 'reading_between_lines': {
        const { detectUnsaidSignals } = await import('../trust-systems/reading-between-lines.js');
        return (input: string) => {
          const signals = detectUnsaidSignals('benchmark-user', input, {
            recentTopics: [],
          });
          return {
            detected: signals.length > 0,
            confidence: signals[0]?.confidence,
            value: signals[0]?.type,
          };
        };
      }
      default:
        return null;
    }
  } catch (error) {
    log.error({ error: String(error), capability }, 'Failed to load detector');
    return null;
  }
}

/**
 * Run a single test case.
 */
async function runTestCase(
  testCase: AdversarialTestCase,
  detector: CapabilityDetector
): Promise<AdversarialTestResult> {
  const startTime = performance.now();

  try {
    const result = detector(testCase.input);

    const passed =
      testCase.expectedResult.shouldDetect === result.detected ||
      // Handle "maybe" cases - both true and false are acceptable
      testCase.expectedResult.expectedValue === 'maybe';

    return {
      testCaseId: testCase.id,
      capability: testCase.capability,
      runAt: new Date(),
      expected: {
        shouldDetect: testCase.expectedResult.shouldDetect,
        value: testCase.expectedResult.expectedValue,
      },
      actual: {
        detected: result.detected,
        value: result.value,
        confidence: result.confidence,
      },
      passed,
      failureReason: passed
        ? undefined
        : `Expected ${testCase.expectedResult.shouldDetect ? 'detection' : 'no detection'}, got ${result.detected ? 'detected' : 'not detected'}`,
      durationMs: performance.now() - startTime,
    };
  } catch (error) {
    return {
      testCaseId: testCase.id,
      capability: testCase.capability,
      runAt: new Date(),
      expected: {
        shouldDetect: testCase.expectedResult.shouldDetect,
        value: testCase.expectedResult.expectedValue,
      },
      actual: {
        detected: false,
      },
      passed: false,
      failureReason: `Error: ${String(error)}`,
      durationMs: performance.now() - startTime,
    };
  }
}

/**
 * Run benchmark for a single capability.
 */
export async function runCapabilityBenchmark(
  capability: string,
  previousBenchmark?: CapabilityBenchmark
): Promise<CapabilityBenchmark> {
  const detector = await getDetector(capability);
  const testCases = ALL_TEST_CASES.filter((tc) => tc.capability === capability);

  if (!detector || testCases.length === 0) {
    log.warn({ capability }, 'No detector or test cases for capability');
    return {
      capability,
      runAt: new Date(),
      totalTestCases: 0,
      truePositives: 0,
      trueNegatives: 0,
      falsePositives: 0,
      falseNegatives: 0,
      precision: 0,
      recall: 0,
      f1Score: 0,
      accuracy: 0,
      trend: 'stable',
      knownGaps: [],
    };
  }

  // Run all test cases
  const results: AdversarialTestResult[] = [];
  for (const testCase of testCases) {
    const result = await runTestCase(testCase, detector);
    results.push(result);
  }

  // Calculate metrics
  let truePositives = 0;
  let trueNegatives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  const gaps: Map<string, string[]> = new Map();

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const testCase = testCases[i];

    if (testCase.expectedResult.expectedValue === 'maybe') {
      // Skip "maybe" cases from accuracy calculation
      continue;
    }

    if (testCase.expectedResult.shouldDetect) {
      if (result.actual.detected) {
        truePositives++;
      } else {
        falseNegatives++;
        // Track gap
        const category = testCase.category;
        if (!gaps.has(category)) {
          gaps.set(category, []);
        }
        gaps.get(category)!.push(testCase.input);
      }
    } else {
      if (result.actual.detected) {
        falsePositives++;
        // Track gap
        const category = testCase.category;
        if (!gaps.has(category)) {
          gaps.set(category, []);
        }
        gaps.get(category)!.push(testCase.input);
      } else {
        trueNegatives++;
      }
    }
  }

  const total = truePositives + trueNegatives + falsePositives + falseNegatives;
  const precision =
    truePositives + falsePositives > 0 ? truePositives / (truePositives + falsePositives) : 0;
  const recall =
    truePositives + falseNegatives > 0 ? truePositives / (truePositives + falseNegatives) : 0;
  const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const accuracy = total > 0 ? (truePositives + trueNegatives) / total : 0;

  // Determine trend
  let trend: 'improving' | 'degrading' | 'stable' = 'stable';
  let deltaFromPrevious: number | undefined;

  if (previousBenchmark) {
    deltaFromPrevious = f1Score - previousBenchmark.f1Score;
    if (deltaFromPrevious > 0.02) {
      trend = 'improving';
    } else if (deltaFromPrevious < -0.02) {
      trend = 'degrading';
    }
  }

  // Format known gaps
  const knownGaps: CapabilityBenchmark['knownGaps'] = [];
  for (const [category, examples] of gaps.entries()) {
    knownGaps.push({
      category,
      examples: examples.slice(0, 3), // Top 3 examples
      priority: examples.length > 3 ? 'high' : examples.length > 1 ? 'medium' : 'low',
    });
  }

  const benchmark: CapabilityBenchmark = {
    capability,
    runAt: new Date(),
    totalTestCases: testCases.length,
    truePositives,
    trueNegatives,
    falsePositives,
    falseNegatives,
    precision,
    recall,
    f1Score,
    accuracy,
    previousF1Score: previousBenchmark?.f1Score,
    deltaFromPrevious,
    trend,
    knownGaps,
  };

  log.info(
    {
      capability,
      f1Score: f1Score.toFixed(3),
      precision: precision.toFixed(3),
      recall: recall.toFixed(3),
      trend,
      gapCount: knownGaps.length,
    },
    'Capability benchmark completed'
  );

  return benchmark;
}

/**
 * Run full benchmark report across all capabilities.
 */
export async function runFullBenchmark(
  previousReport?: BTHBenchmarkReport
): Promise<BTHBenchmarkReport> {
  const capabilities = ['commitment_detection', 'crisis_detection', 'reading_between_lines'];

  const benchmarks: CapabilityBenchmark[] = [];

  for (const capability of capabilities) {
    const previous = previousReport?.capabilities.find((c) => c.capability === capability);
    const benchmark = await runCapabilityBenchmark(capability, previous);
    benchmarks.push(benchmark);
  }

  // Calculate overall metrics
  const validBenchmarks = benchmarks.filter((b) => b.totalTestCases > 0);
  const overallF1Score =
    validBenchmarks.length > 0
      ? validBenchmarks.reduce((sum, b) => sum + b.f1Score, 0) / validBenchmarks.length
      : 0;
  const overallAccuracy =
    validBenchmarks.length > 0
      ? validBenchmarks.reduce((sum, b) => sum + b.accuracy, 0) / validBenchmarks.length
      : 0;

  // Detect regressions and improvements
  const regressions: BTHBenchmarkReport['regressions'] = [];
  const improvements: BTHBenchmarkReport['improvements'] = [];

  for (const benchmark of benchmarks) {
    if (benchmark.previousF1Score !== undefined && benchmark.deltaFromPrevious !== undefined) {
      if (benchmark.deltaFromPrevious < -0.05) {
        regressions.push({
          capability: benchmark.capability,
          previousF1: benchmark.previousF1Score,
          currentF1: benchmark.f1Score,
          delta: benchmark.deltaFromPrevious,
        });
      } else if (benchmark.deltaFromPrevious > 0.05) {
        improvements.push({
          capability: benchmark.capability,
          previousF1: benchmark.previousF1Score,
          currentF1: benchmark.f1Score,
          delta: benchmark.deltaFromPrevious,
        });
      }
    }
  }

  const report: BTHBenchmarkReport = {
    reportId: `bth_${Date.now()}`,
    generatedAt: new Date(),
    capabilities: benchmarks,
    overallF1Score,
    overallAccuracy,
    hasRegressions: regressions.length > 0,
    regressions,
    improvements,
  };

  log.info(
    {
      reportId: report.reportId,
      overallF1: overallF1Score.toFixed(3),
      hasRegressions: report.hasRegressions,
      regressionCount: regressions.length,
      improvementCount: improvements.length,
    },
    'Full BTH benchmark report generated'
  );

  return report;
}

// ============================================================================
// REPORTING
// ============================================================================

/**
 * Format benchmark report as human-readable string.
 */
export function formatBenchmarkReport(report: BTHBenchmarkReport): string {
  const lines: string[] = [
    '╔══════════════════════════════════════════════════════════════════╗',
    '║              BETTER THAN HUMAN - BENCHMARK REPORT                ║',
    '╠══════════════════════════════════════════════════════════════════╣',
    `║  Report ID: ${report.reportId.padEnd(51)}║`,
    `║  Generated: ${report.generatedAt.toISOString().padEnd(51)}║`,
    '╠══════════════════════════════════════════════════════════════════╣',
    `║  OVERALL F1 SCORE: ${(report.overallF1Score * 100).toFixed(1)}%`.padEnd(67) + '║',
    `║  OVERALL ACCURACY: ${(report.overallAccuracy * 100).toFixed(1)}%`.padEnd(67) + '║',
    '╠══════════════════════════════════════════════════════════════════╣',
    '║  CAPABILITY BREAKDOWN                                            ║',
    '╠──────────────────────────┬────────┬────────┬────────┬───────────╣',
    '║ Capability               │ F1     │ Prec   │ Recall │ Trend     ║',
    '╠──────────────────────────┼────────┼────────┼────────┼───────────╣',
  ];

  for (const cap of report.capabilities) {
    const trendIcon = cap.trend === 'improving' ? '↑' : cap.trend === 'degrading' ? '↓' : '─';
    const line = `║ ${cap.capability.padEnd(24)} │ ${(cap.f1Score * 100).toFixed(1).padStart(5)}% │ ${(cap.precision * 100).toFixed(1).padStart(5)}% │ ${(cap.recall * 100).toFixed(1).padStart(5)}% │ ${trendIcon} ${cap.trend.padEnd(8)} ║`;
    lines.push(line);
  }

  lines.push('╠──────────────────────────┴────────┴────────┴────────┴───────────╣');

  if (report.regressions.length > 0) {
    lines.push('║  ⚠️  REGRESSIONS DETECTED                                        ║');
    for (const reg of report.regressions) {
      lines.push(
        `║    ${reg.capability}: ${(reg.previousF1 * 100).toFixed(1)}% → ${(reg.currentF1 * 100).toFixed(1)}% (${(reg.delta * 100).toFixed(1)}%)`.padEnd(
          66
        ) + '║'
      );
    }
  }

  if (report.improvements.length > 0) {
    lines.push('║  ✅ IMPROVEMENTS                                                 ║');
    for (const imp of report.improvements) {
      lines.push(
        `║    ${imp.capability}: ${(imp.previousF1 * 100).toFixed(1)}% → ${(imp.currentF1 * 100).toFixed(1)}% (+${(imp.delta * 100).toFixed(1)}%)`.padEnd(
          66
        ) + '║'
      );
    }
  }

  // Known gaps
  lines.push('╠══════════════════════════════════════════════════════════════════╣');
  lines.push('║  KNOWN GAPS                                                      ║');

  for (const cap of report.capabilities) {
    if (cap.knownGaps.length > 0) {
      lines.push(`║  ${cap.capability}:`.padEnd(66) + '║');
      for (const gap of cap.knownGaps) {
        lines.push(
          `║    - [${gap.priority}] ${gap.category}: ${gap.examples[0]?.slice(0, 30)}...`.padEnd(
            66
          ) + '║'
        );
      }
    }
  }

  lines.push('╚══════════════════════════════════════════════════════════════════╝');

  return lines.join('\n');
}
