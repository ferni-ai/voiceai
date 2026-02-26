/**
 * Intent Detector
 *
 * Detects emotional signals, deflection patterns, and unspoken intent
 * in user messages. Contains the pattern constants and individual
 * detection functions used by the reading-between-lines orchestrator.
 *
 * @module trust/IntentDetector
 */

import type { UnsaidSignal, UserUnsaidProfile, ConversationPattern } from './reading-between-lines.js';

// ============================================================================
// DETECTION PATTERNS
// ============================================================================

/** Phrases that often mask real feelings */
export const FINE_MASKS = [
  "i'm fine", "i'm okay", "it's fine", "it's okay", "i'm good",
  "it's whatever", "it doesn't matter", "it's not a big deal",
  "i'm over it", "i don't care anymore", 'it is what it is',
  "i've moved on", 'it was fine', 'it was okay', 'was fine',
  'pretty standard', 'not that bad', 'could be worse', 'nothing major',
  "it's nothing", 'no big deal',
  // Enhanced masking patterns
  'all good', "i'll be okay", "i'll be fine", 'doing okay', 'doing fine',
  'handling it', 'dealing with it', 'getting through', 'managing',
  "i'm alright", "it's alright", "it's all good", "everything's fine",
  'all fine', 'no worries', "i guess i'm okay", "yeah i'm fine",
  'totally fine', 'completely fine', 'perfectly fine', "i'm coping", 'just dealing',
  // Positive masks (excessive positivity about difficult situations)
  'actually relieved', 'actually great', 'actually a good thing',
  'best thing that happened', 'blessing in disguise', 'for the best',
  'meant to be', "i'm happy about it", 'glad it happened', 'weight off my shoulders',
  // Gen-Z / Casual deflection masks
  'literally fine', 'literally okay', "i'm literally fine", "i'm literally okay",
  'lowkey fine', "i'm lowkey fine", 'whatever honestly', 'honestly whatever',
  "vibes are off but i'm fine", "it's giving fine", 'not stressed',
  'we good', "i'm chillin", "i'm chilling",
  'literally fine bestie', "i'm literally fine bestie", 'fine bestie',
  "i'm fine bestie", 'all good bestie',
];

/** Phrases that indicate wanting permission to share */
export const PERMISSION_SEEKERS = [
  'can i tell you something', 'is it okay if',
  "i don't know if i should say this", 'this might sound',
  "you'll probably think", "i've never told anyone", "promise you won't",
  "i don't want to burden you", 'i know this is silly but',
  'this is going to sound stupid',
  // Reluctance/carrying patterns
  "i've been carrying", 'been holding onto', "something i haven't",
  "don't want to dump", "don't want to put this on you",
  "if i'm being honest", "honestly i've been", 'hard to say this',
  'this is hard but', 'need to get something off',
];

/** Deflection patterns */
export const DEFLECTION_PATTERNS = [
  /anyway,? (what about|how about|let's talk about)/i,
  /but enough about (me|that)/i, /it's not important/i,
  /forget i said/i, /never ?mind/i, /let's move on/i,
  /i don't (want to|wanna) talk about/i, /can we (change|talk about something)/i,
  /let's talk about something else/i, /sorry,? (i|that)/i,
  /let's not dwell/i, /what did you/i,
  // Enhanced deflection patterns
  /anyway\b/i, /so,? (what about|how (about|are)|did you)/i,
  /speaking of which/i, /on another note/i, /changing (the subject|topics)/i,
  /back to what we were/i, /that's (not|besides) the point/i,
  /whatever,? (anyway|it doesn't matter)/i, /\.\.\. (anyway|but|so)/i,
  /i('d|'ll| just)? rather (not|talk about)/i,
  /we (don't need to|shouldn't) (talk|get into)/i,
  /it('s| is)? not (a big deal|worth|that important)/i,
  /just (wanted to|thought i'd) mention/i, /that aside/i,
  /different topic/i, /moving on/i, /drop it/i,
  /leave it (at that|alone)/i, /enough (about|of) (this|that)/i,
  /what about you/i, /so,? what's new/i, /but hey\b/i,
  // Gen-Z / Meme-based deflection
  /no thoughts head empty/i, /we don't talk about that/i,
  /that's not giving/i, /moving forward/i, /let's not go there/i,
  /it's giving avoidance/i, /not today satan/i, /touch grass/i,
  /rent free/i, /slay (anyway|though)/i, /bestie,? (anyway|let's)/i,
];

/** Heavy topics that "I'm fine" often masks */
export const HEAVY_TOPIC_INDICATORS = [
  'divorce', 'death', 'cancer', 'diagnosis', 'fired', 'laid off',
  'breakup', 'cheated', 'affair', 'abuse', 'addiction', 'relapse',
  'suicide', 'miscarriage', 'infertility', 'bankruptcy', 'foreclosure',
  'accident', 'hospital', 'funeral', 'died', 'passed away', 'lost my',
  // Enhanced heavy topic detection
  'separated', 'split up', 'broke up', 'anxiety', 'depression', 'depressed',
  'therapy', 'therapist', 'panic attack', 'mental health', 'laid me off',
  'let me go', 'terminal', 'surgery', 'operation', 'chemo', 'radiation',
  'treatment', 'sick', 'illness', 'disease', 'dementia', 'alzheimer',
  'stroke', 'heart attack', 'emergency', 'icu', 'overdose', 'rehab',
  'detox', 'sober', 'drinking', 'gambling', 'debt', 'eviction',
  'homeless', 'custody', 'restraining order', 'assault', 'attacked',
  'violation', 'trauma', 'ptsd', 'flashback', 'self-harm', 'suicidal',
  'ended it', 'took their life', 'loss', 'grief', 'mourning',
  'gravely', 'worst news', 'bad news',
];

/** Minimizing language */
export const MINIMIZING_PATTERNS = [
  /it's (just|only) a/i, /i (just|only) (feel|think|am)/i,
  /it's (not that|no) big (deal|thing)/i, /i shouldn't complain/i,
  /other people have it worse/i, /i know i'm being/i, /i'm probably (just|being)/i,
  // Guilt/self-invalidation patterns
  /i shouldn't (be|feel) (upset|sad|angry|hurt)/i,
  /i have no right to (feel|be|complain)/i, /first world problem/i,
  /i know (it's|this is) (stupid|silly|dumb)/i,
  /compared to (what|others|other people)/i, /at least (i|it|things)/i,
];

/** Gen-Z dismissive patterns that always warrant a gentle probe */
export const GEN_Z_DISMISSIVE_PATTERNS = [
  /\bi('m| am) literally (fine|okay|good) bestie\b/i,
  /\bliterally fine bestie\b/i, /\bno thoughts head empty\b/i,
  /\bit('s| is) giving (fine|nothing|whatever)\b/i,
  /\bwe don't talk about that\b/i, /\bi('m| am) literally (so )?okay\b/i,
  /\b(fine|okay|good|great) bestie\b/i,
];

// ============================================================================
// DETECTION FUNCTIONS
// ============================================================================

/**
 * Detect when stated emotion doesn't match context
 */
export function detectEmotionalMismatch(
  lower: string,
  context: {
    detectedEmotion?: string;
    emotionIntensity?: number;
    recentTopics?: string[];
  },
  profile: UserUnsaidProfile
): UnsaidSignal | null {
  const usesFine = FINE_MASKS.some((mask) => lower.includes(mask));
  if (!usesFine) return null;

  const hasHeavyTopic = HEAVY_TOPIC_INDICATORS.some(
    (topic) =>
      lower.includes(topic) || context.recentTopics?.some((t) => t.toLowerCase().includes(topic))
  );

  const emotionMismatch =
    context.detectedEmotion &&
    ['sad', 'anxious', 'angry', 'hurt', 'scared', 'frustrated', 'distressed', 'overwhelmed']
      .includes(context.detectedEmotion);

  const hasBut = /\b(but|though|although|however)\b/i.test(lower);
  const hasContradiction = usesFine && hasBut;
  const hasMinimizing = MINIMIZING_PATTERNS.some((pattern) => pattern.test(lower));
  const minimizingWithFine = usesFine && hasMinimizing;

  if (hasHeavyTopic || emotionMismatch || hasContradiction || minimizingWithFine) {
    profile.falseFines.push({
      timestamp: new Date(),
      context: lower.slice(0, 100),
      actualEmotion: context.detectedEmotion,
    });

    const phrases = [
      "You said you're fine, but... I'm not sure that's the whole story. You don't have to talk about it, but I'm here.",
      "I hear you saying it's okay, but something tells me there might be more to it. No pressure.",
      "That's a lot to be 'fine' about. I'm here if you want to say more.",
      "You don't have to be fine with me. What's really going on?",
    ];

    let confidence = 0.65;
    if (hasHeavyTopic) confidence += 0.15;
    if (emotionMismatch) confidence += 0.1;
    if (hasContradiction) confidence += 0.05;
    if (minimizingWithFine) confidence += 0.05;
    confidence = Math.min(confidence, 0.95);

    return {
      type: 'emotional_mismatch',
      observation: "Said they're fine but context suggests otherwise",
      underlying: context.detectedEmotion || 'suppressed emotion',
      confidence,
      approach: 'create_space',
      phrase: phrases[Math.floor(Math.random() * phrases.length)],
      context: {
        userMessage: lower,
        statedEmotion: 'fine',
        detectedEmotion: context.detectedEmotion,
        recentTopics: context.recentTopics,
      },
    };
  }

  return null;
}

/**
 * Detect consistent avoidance of a topic
 */
export function detectTopicAvoidance(
  lower: string,
  context: { topicBeforeThis?: string; recentTopics?: string[] },
  profile: UserUnsaidProfile
): UnsaidSignal | null {
  if (!context.topicBeforeThis) return null;

  const avoidancePhrases = [
    "i don't want to talk about", "let's not", 'can we change',
    "i'd rather not", 'not right now', 'maybe later', 'some other time',
  ];

  const isAvoiding = avoidancePhrases.some((phrase) => lower.includes(phrase));
  if (!isAvoiding) return null;

  const existingPattern = profile.avoidedTopics.find(
    (t) => t.topic.toLowerCase() === context.topicBeforeThis?.toLowerCase()
  );

  if (existingPattern) {
    existingPattern.avoidanceCount++;
    existingPattern.lastAvoided = new Date();
    existingPattern.deflectionPhrases.push(lower.slice(0, 50));
  } else {
    profile.avoidedTopics.push({
      topic: context.topicBeforeThis,
      avoidanceCount: 1,
      lastAvoided: new Date(),
      deflectionPhrases: [lower.slice(0, 50)],
    });
  }

  const avoidanceCount = existingPattern?.avoidanceCount || 1;
  if (avoidanceCount >= 2) {
    return {
      type: 'topic_avoidance',
      observation: `Has avoided "${context.topicBeforeThis}" ${avoidanceCount} times`,
      underlying: context.topicBeforeThis,
      confidence: Math.min(0.5 + avoidanceCount * 0.1, 0.9),
      approach: 'acknowledge_silently',
      context: { userMessage: lower, recentTopics: context.recentTopics },
    };
  }

  return null;
}

/**
 * Detect deflection behaviors
 */
export function detectDeflection(
  lower: string,
  context: { topicBeforeThis?: string }
): UnsaidSignal | null {
  const matchedPattern = DEFLECTION_PATTERNS.find((pattern) => pattern.test(lower));
  if (!matchedPattern) return null;

  const phrases = [
    'I noticed you changed the subject. We can talk about that if you want, or not. Either way.',
    "We can move on, but if you want to come back to that later, I'm here.",
    "I'll follow your lead. Just know that topic is safe with me if you ever want to revisit it.",
  ];

  return {
    type: 'deflection',
    observation: 'Actively changed subject from previous topic',
    underlying: context.topicBeforeThis || 'previous topic',
    confidence: 0.75,
    approach: 'create_space',
    phrase: phrases[Math.floor(Math.random() * phrases.length)],
    context: { userMessage: lower },
  };
}

/**
 * Detect when someone is seeking permission to share
 */
export function detectPermissionSeeking(lower: string, original: string): UnsaidSignal | null {
  const isSeekingPermission = PERMISSION_SEEKERS.some((phrase) => lower.includes(phrase));
  if (!isSeekingPermission) return null;

  const phrases = [
    "Of course you can tell me. I'm listening.",
    'You can tell me anything. No judgment here.',
    "I'm here. Take your time.",
    'Whatever it is, I want to hear it.',
    "You don't need permission with me. Go ahead.",
  ];

  return {
    type: 'permission_seeking',
    observation: 'Seeking permission to share something vulnerable',
    underlying: 'something they want to share but feel uncertain about',
    confidence: 0.85,
    approach: 'gentle_probe',
    phrase: phrases[Math.floor(Math.random() * phrases.length)],
    context: { userMessage: original },
  };
}

/**
 * Detect unfinished thoughts
 */
export function detectUnfinishedThought(
  message: string,
  context: { previousMessages?: string[] }
): UnsaidSignal | null {
  const unfinishedIndicators = [
    /never ?mind/i, /forget (it|i said)/i, /\.{3,}$/, /—$/,
    /i (was going to|wanted to) say/i, /actually,? (no|nothing)/i,
    /it's (nothing|stupid)/i,
    // Enhanced unfinished thought patterns
    /well,?\s*(anyway|nevermind|forget it)/i, /i mean,?\s*—?$/i,
    /i just\s*—?$/i, /but\s*—?$/i,
    /you know what,?\s*(never ?mind|forget)/i, /i thought—/i,
    /it doesn't matter/i, /it's (fine|whatever|not important)/i,
    /\bugh\b/i, /\bsigh\b/i,
  ];

  const isUnfinished = unfinishedIndicators.some((pattern) => pattern.test(message));
  if (!isUnfinished) return null;

  const phrases = [
    "You started to say something. I'd like to hear it, if you want to share.",
    'I caught that. What were you going to say?',
    "It's not nothing. What's on your mind?",
    "I'm curious what you were about to say. No pressure though.",
  ];

  return {
    type: 'unfinished_thought',
    observation: 'Started to say something but stopped',
    underlying: 'a thought they pulled back from sharing',
    confidence: 0.7,
    approach: 'gentle_probe',
    phrase: phrases[Math.floor(Math.random() * phrases.length)],
    context: { userMessage: message },
  };
}

/**
 * Detect Gen-Z dismissive patterns WITHOUT needing heavy context
 */
export function detectGenZDismissive(lower: string): UnsaidSignal | null {
  const isGenZDismissive = GEN_Z_DISMISSIVE_PATTERNS.some((pattern) => pattern.test(lower));
  if (!isGenZDismissive) return null;

  const phrases = [
    'Bestie... how are you *really* doing?',
    "That's a vibe, but what's actually going on?",
    "I hear you. And... what's underneath that?",
  ];

  return {
    type: 'emotional_mismatch',
    observation: 'Using Gen-Z dismissive language that often masks real feelings',
    underlying: 'feelings beneath the casual facade',
    confidence: 0.65,
    approach: 'name_gently',
    phrase: phrases[Math.floor(Math.random() * phrases.length)],
    context: { userMessage: lower },
  };
}
