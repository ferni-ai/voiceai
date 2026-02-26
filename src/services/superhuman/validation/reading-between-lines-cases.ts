/**
 * Reading Between Lines - Adversarial Test Cases
 *
 * Test cases for detecting unsaid signals, deflection, masking,
 * permission-seeking, and other between-the-lines patterns.
 *
 * @module services/superhuman/validation/reading-between-lines-cases
 */

import type { AdversarialTestCase } from '../../better-than-human-validation/types.js';

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
