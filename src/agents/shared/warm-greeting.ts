/**
 * Warm Greeting Generator
 *
 * Generates instant greetings during prewarm so first response is immediate.
 * This provides a fallback greeting that can be spoken while the personalized
 * greeting loads in the background.
 *
 * "BETTER THAN HUMAN" GREETING PHILOSOPHY:
 * The first moment of connection sets the emotional tone. We don't just greet—
 * we ARRIVE. Every greeting should feel like someone who just noticed you,
 * took a breath, and genuinely wants to know how you are.
 *
 * Key humanization principles:
 * - BREATH BEFORE WORDS: Subtle inhale signals "I'm here, I noticed you"
 * - SPEED ARC: Slower opener → settling → question at natural pace
 * - VOLUME DYNAMICS: Softer for late-night/vulnerable, settling to normal
 * - MICRO-HESITATIONS: Tiny catches that make speech human ("um", "so...")
 * - HALF-STARTED OPENINGS: Incomplete sounds like thinking aloud
 * - NAME WITH WARMTH: Recognition, not form-fill
 * - LANDING SOUNDS: Settle after question, don't hover
 * - SIMPLICITY: Sometimes less SSML = more natural
 *
 * ZERO DEPENDENCIES - This module is loaded during prewarm hot path.
 * Do NOT import heavy modules like safe-logger here.
 *
 * Performance impact: -100-200ms on first response
 */

// Lightweight logging (zero dependencies - don't import safe-logger!)
const _log = (level: string, msg: string, data?: Record<string, unknown>) => {
  if (process.env.NODE_ENV !== 'production' || level === 'error') {
    const dataStr = data ? ` ${JSON.stringify(data)}` : '';
    process.stderr.write(`[warm-greeting] [${level}] ${msg}${dataStr}\n`);
  }
};

// ============================================================================
// HUMANIZATION BUILDING BLOCKS
// These create the "Better Than Human" feeling of genuine presence
// ============================================================================

/**
 * Subtle breath sounds that signal "I'm arriving"
 * Used ~30% of the time to add physical presence
 */
const ARRIVAL_BREATHS = {
  // Gentle arrival - like looking up from something
  gentle: ['<break time="40ms"/>', '<break time="60ms"/>'],
  // With soft breath sound - more intimate/present
  withBreath: [
    '<break time="30ms"/>[soft breath]<break time="80ms"/>',
    '<break time="40ms"/>[quiet inhale]<break time="60ms"/>',
    '<break time="50ms"/>[breath]<break time="70ms"/>',
  ],
  // Late night - extra soft and present
  lateNight: [
    '<break time="60ms"/>[soft breath]<break time="100ms"/>',
    '<break time="80ms"/>[quiet breath]<break time="80ms"/>',
  ],
  // After heavy conversation - grounding breath
  postHeavy: [
    '<break time="70ms"/>[gentle breath]<break time="100ms"/>',
    '<break time="80ms"/>[soft exhale]<break time="80ms"/>',
  ],
};

/**
 * Micro-hesitations that make speech feel human
 * Used sparingly (~20%) to avoid seeming uncertain
 */
const MICRO_HESITATIONS = {
  // Before question - gathering thought
  beforeQuestion: [
    '<break time="50ms"/>So...<break time="80ms"/>',
    '<break time="60ms"/>Um.<break time="60ms"/>',
    '<break time="50ms"/>',
    '', // Sometimes no hesitation
    '', // Weight toward no hesitation
    '', // Keep it rare
  ],
  // After opener - transitioning
  afterOpener: [
    '<break time="60ms"/>',
    '<break time="80ms"/>',
    '<break time="50ms"/>Mm.<break time="60ms"/>',
    '<break time="60ms"/>',
    '<break time="70ms"/>',
  ],
};

/**
 * Landing sounds after the question
 * Creates "opening the door and stepping back" feeling
 */
const LANDING_SOUNDS = {
  // Just patient silence (most common)
  silence: ['<break time="400ms"/>', '<break time="450ms"/>', '<break time="500ms"/>'],
  // Soft landing with settling sound
  withSound: [
    '<break time="350ms"/><speed ratio="0.9"/>Mm.<break time="200ms"/>',
    '<break time="400ms"/>',
    '<break time="380ms"/>[soft breath]<break time="150ms"/>',
  ],
  // Late night - extra spacious
  lateNight: [
    '<break time="550ms"/>',
    '<break time="600ms"/>',
    '<break time="500ms"/><speed ratio="0.85"/>Mm.<break time="200ms"/>',
  ],
};

/**
 * Pick random from array
 */
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Maybe apply something with given probability
 */
function maybe<T>(probability: number, value: T, fallback: T): T {
  return Math.random() < probability ? value : fallback;
}

// ============================================================================
// WARM GREETING CACHE
// ============================================================================

interface WarmGreetingCache {
  greeting: string;
  personaId: string;
  generatedAt: number;
  isGeneric: boolean;
}

let warmGreetingCache: WarmGreetingCache | null = null;

// ============================================================================
// CONTEXT-AWARE GREETING SYSTEM
// "Better than Human" - greetings that feel emotionally attuned
// ============================================================================

export interface GreetingContext {
  /** Hour of day (0-23) */
  hour?: number;
  /** User's last emotional state */
  lastEmotion?: string;
  /** Last emotion intensity (0-1) */
  lastEmotionIntensity?: number;
  /** Days since last conversation */
  daysSinceLastChat?: number;
  /** Whether this is a returning user */
  isReturningUser?: boolean;
  /** User's name if known */
  userName?: string;
  /** Relationship stage */
  relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
}

// Time-of-day appropriate greetings
// "BETTER THAN HUMAN" patterns - genuinely human speech:
// - HALF-STARTED: Incomplete sounds ("...hey", "Oh—", "Hmm?")
// - CAUGHT MID-MOMENT: Like looking up from something
// - RECOGNITION SOUNDS: "Oh" = I see you, "Ah" = recognition
// - VARYING ENERGY: Match the time, not forced brightness
// - SLOWER OPENERS: Speed ratio < 1.0 for landing
//
// Each opener has:
// - text: The spoken words
// - emotion: Cartesia emotion tag
// - energy: calm | warm | energetic (affects pacing)
// - speed: Optional speed ratio for the opener (default 0.92 for grounding)
// - volume: Optional volume ratio (default 1.0)
// - halfStarted: Whether it's an incomplete/trailing sound (more human)
const TIME_BASED_OPENERS = {
  earlyMorning: [
    // 5am-8am - still waking up, soft, intimate
    { text: '...hey.', emotion: null, energy: 'calm', speed: 0.88, volume: 0.9, halfStarted: true },
    { text: 'Hmm? Oh, hey.', emotion: null, energy: 'calm', speed: 0.9, halfStarted: true },
    { text: 'Oh— hey.', emotion: null, energy: 'calm', speed: 0.9, halfStarted: true },
    { text: 'Morning.', emotion: 'affectionate', energy: 'calm', speed: 0.88, volume: 0.9 },
    { text: 'Hey.', emotion: 'affectionate', energy: 'calm', speed: 0.9, volume: 0.9 },
    {
      text: '...morning.',
      emotion: null,
      energy: 'calm',
      speed: 0.85,
      volume: 0.85,
      halfStarted: true,
    },
  ],
  morning: [
    // 8am-12pm - settling in, present
    { text: 'Hey.', emotion: 'affectionate', energy: 'warm', speed: 0.92 },
    { text: 'Oh. Hey.', emotion: null, energy: 'warm', speed: 0.92, halfStarted: true },
    {
      text: '...hey there.',
      emotion: 'affectionate',
      energy: 'warm',
      speed: 0.9,
      halfStarted: true,
    },
    { text: 'Hey.', emotion: 'curious', energy: 'warm', speed: 0.95 },
    { text: 'Oh— hey.', emotion: null, energy: 'warm', speed: 0.9, halfStarted: true },
    { text: 'Ah. Hey.', emotion: 'affectionate', energy: 'warm', speed: 0.92, halfStarted: true },
  ],
  afternoon: [
    // 12pm-6pm - present, engaged, warm
    { text: 'Hey.', emotion: 'affectionate', energy: 'warm', speed: 0.92 },
    { text: 'Oh, hey.', emotion: null, energy: 'warm', speed: 0.92, halfStarted: true },
    { text: 'Hey.', emotion: 'curious', energy: 'warm', speed: 0.95 },
    { text: '...hey.', emotion: 'affectionate', energy: 'warm', speed: 0.9, halfStarted: true },
    { text: 'Oh— hey there.', emotion: null, energy: 'warm', speed: 0.92, halfStarted: true },
    { text: 'Ah. Hey.', emotion: 'affectionate', energy: 'warm', speed: 0.92, halfStarted: true },
  ],
  evening: [
    // 6pm-10pm - winding down, softer
    { text: 'Hey.', emotion: 'affectionate', energy: 'calm', speed: 0.9 },
    { text: '...hey.', emotion: 'affectionate', energy: 'calm', speed: 0.88, halfStarted: true },
    { text: 'Oh. Hey.', emotion: null, energy: 'calm', speed: 0.9, halfStarted: true },
    { text: 'Hey.', emotion: 'curious', energy: 'calm', speed: 0.9 },
    { text: 'Mm. Hey.', emotion: 'affectionate', energy: 'calm', speed: 0.88, halfStarted: true },
    {
      text: '...hey there.',
      emotion: 'affectionate',
      energy: 'calm',
      speed: 0.88,
      volume: 0.95,
      halfStarted: true,
    },
  ],
  lateNight: [
    // 10pm-5am - quiet, intimate, deeply present
    {
      text: '...hey.',
      emotion: 'affectionate',
      energy: 'calm',
      speed: 0.85,
      volume: 0.85,
      halfStarted: true,
    },
    { text: 'Hey.', emotion: 'affectionate', energy: 'calm', speed: 0.85, volume: 0.88 },
    {
      text: 'Oh. Hey.',
      emotion: 'affectionate',
      energy: 'calm',
      speed: 0.85,
      volume: 0.85,
      halfStarted: true,
    },
    {
      text: '...still up?',
      emotion: 'affectionate',
      energy: 'calm',
      speed: 0.82,
      volume: 0.85,
      halfStarted: true,
    },
    {
      text: 'Mm. Hey.',
      emotion: 'affectionate',
      energy: 'calm',
      speed: 0.82,
      volume: 0.85,
      halfStarted: true,
    },
    {
      text: '...hey.',
      emotion: 'sympathetic',
      energy: 'calm',
      speed: 0.82,
      volume: 0.82,
      halfStarted: true,
    },
  ],
};

// Follow-ups - HUMAN, not interview questions
// Some are questions, some are just statements, some are incomplete
// Speed ratio for questions should be slightly higher (more natural question rise)
const EMOTION_MIDDLES = {
  neutral: [
    { text: "What's going on?", pause: 200, speed: 1.0 },
    { text: "What's up?", pause: 180, speed: 1.0 },
    { text: 'Talk to me.', pause: 220, speed: 0.95 },
    { text: "What's happening?", pause: 200, speed: 1.0 },
    { text: "What's on your mind?", pause: 220, speed: 0.95 },
    { text: "So... what's going on?", pause: 200, speed: 0.95, hasHesitation: true },
    { text: '', pause: 0, speed: 1.0 }, // Sometimes just the opener is enough
  ],
  hadHardTime: [
    // After heavy conversation - gentle, not probing
    { text: 'How are you?', pause: 280, speed: 0.9, emotion: 'sympathetic' },
    { text: "How's it going?", pause: 250, speed: 0.9 },
    { text: 'How are you doing?', pause: 280, speed: 0.88, emotion: 'sympathetic' },
    { text: '', pause: 0, speed: 1.0 }, // Just presence, no question
    { text: '', pause: 0, speed: 1.0 }, // Weight toward silence
  ],
  lateNight: [
    // Late night - quiet presence, softer volume
    { text: "What's on your mind?", pause: 280, speed: 0.88, volume: 0.9 },
    { text: '', pause: 0, speed: 1.0 }, // Just there
    { text: "What's keeping you up?", pause: 300, speed: 0.85, volume: 0.88 },
    { text: "Can't sleep?", pause: 280, speed: 0.85, volume: 0.88 },
    { text: '', pause: 0, speed: 1.0 }, // Weight toward simple presence
  ],
  returningAfterLongTime: [
    // Been a while - warm acknowledgment
    { text: "It's been a minute.", pause: 250, speed: 0.92 },
    { text: 'Good to see you.', pause: 220, speed: 0.92, emotion: 'affectionate' },
    { text: "It's been a while.", pause: 250, speed: 0.92 },
    { text: '', pause: 0, speed: 1.0 }, // Just recognition
  ],
  // NEW: For checking in on something specific
  followingUp: [
    { text: 'Been thinking about you.', pause: 250, speed: 0.9, emotion: 'affectionate' },
    { text: "How's everything?", pause: 220, speed: 0.95 },
    { text: "How'd it go?", pause: 200, speed: 0.95 },
  ],
};

// Relationship-appropriate flavors - add texture based on connection depth
// These are small moments that feel like a real friend
const RELATIONSHIP_FLAVORS = {
  stranger: [], // No flavor for new users - keep it simple
  acquaintance: [{ text: 'Perfect timing.', chance: 0.08, speed: 0.95 }],
  friend: [
    { text: 'Come in, come in.', chance: 0.12, speed: 0.92 },
    { text: 'I was just thinking about something.', chance: 0.08, speed: 0.9 },
    { text: 'Perfect timing.', chance: 0.1, speed: 0.95 },
    { text: '[laughter] Sorry— I was in my head.', chance: 0.06, speed: 0.95 },
    { text: "I was hoping I'd hear from you.", chance: 0.08, speed: 0.9 },
  ],
  trusted_advisor: [
    { text: "I was hoping you'd call.", chance: 0.12, speed: 0.9 },
    { text: 'I was just thinking about you.', chance: 0.1, speed: 0.88 },
    { text: 'Perfect timing.', chance: 0.12, speed: 0.92 },
    { text: '[laughter] Sorry— I was lost in thought.', chance: 0.06, speed: 0.95 },
    { text: 'There you are.', chance: 0.1, speed: 0.88, emotion: 'affectionate' },
    { text: "It's good to hear your voice.", chance: 0.08, speed: 0.88, emotion: 'affectionate' },
  ],
};

/**
 * Get time period from hour
 */
function getTimePeriod(hour: number): keyof typeof TIME_BASED_OPENERS {
  if (hour >= 5 && hour < 8) return 'earlyMorning';
  if (hour >= 8 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'lateNight';
}

/**
 * Select appropriate middle based on context
 */
function selectMiddle(ctx: GreetingContext): { text: string; pause: number } {
  const hour = ctx.hour ?? new Date().getHours();
  const timePeriod = getTimePeriod(hour);

  // Late night - use supportive language
  if (timePeriod === 'lateNight') {
    const middles = EMOTION_MIDDLES.lateNight;
    return middles[Math.floor(Math.random() * middles.length)];
  }

  // If last conversation was emotionally intense (>0.7), be gentle
  if (ctx.lastEmotionIntensity && ctx.lastEmotionIntensity > 0.7) {
    const middles = EMOTION_MIDDLES.hadHardTime;
    return middles[Math.floor(Math.random() * middles.length)];
  }

  // If it's been more than 7 days, acknowledge the gap
  if (ctx.daysSinceLastChat && ctx.daysSinceLastChat > 7) {
    const middles = EMOTION_MIDDLES.returningAfterLongTime;
    return middles[Math.floor(Math.random() * middles.length)];
  }

  // Default - neutral middles
  const middles = EMOTION_MIDDLES.neutral;
  return middles[Math.floor(Math.random() * middles.length)];
}

// Legacy static components for fallback
const FERNI_OPENERS = TIME_BASED_OPENERS.afternoon; // Default to afternoon energy

const FERNI_MIDDLES = EMOTION_MIDDLES.neutral;

const FERNI_FLAVOR = RELATIONSHIP_FLAVORS.friend;

/**
 * Build a CONTEXT-AWARE SSML greeting for Ferni
 *
 * "BETTER THAN HUMAN" - The first moment of connection matters deeply.
 *
 * This function creates greetings that feel like reconnecting with someone
 * who genuinely cares. Every element is designed for emotional resonance:
 *
 * 1. ARRIVAL BREATH (30%): Subtle inhale signals "I noticed you"
 * 2. SPEED ARC: Slower opener (0.85-0.95) → normal question (1.0)
 * 3. VOLUME DYNAMICS: Softer for late-night, settling to normal
 * 4. EMOTION: "affectionate" for warmth, "sympathetic" for care
 * 5. MICRO-HESITATIONS (20%): "So..." / "Um." before questions
 * 6. NAME RECOGNITION: Special pause and warmth around their name
 * 7. LANDING SOUNDS: Patient settling after question, not hovering
 * 8. SIMPLICITY (30%): Sometimes less SSML = more natural
 *
 * The result should make users feel like someone just looked up,
 * took a breath, and genuinely wanted to know how they are.
 */
function buildDynamicFerniGreeting(ctx?: GreetingContext): string {
  const context = ctx || {};
  const hour = context.hour ?? new Date().getHours();
  const timePeriod = getTimePeriod(hour);
  const relationshipStage = context.relationshipStage || 'friend';
  const isLateNight = timePeriod === 'lateNight';
  const isPostHeavy = (context.lastEmotionIntensity ?? 0) > 0.7;

  // Determine greeting mode (for variety)
  // 30% chance of "simple mode" - minimal SSML, let Cartesia's natural warmth shine
  const simpleMode = Math.random() < 0.3;

  // Select opener based on time of day
  const openers = TIME_BASED_OPENERS[timePeriod];
  const opener = openers[Math.floor(Math.random() * openers.length)] as {
    text: string;
    emotion: string | null;
    energy: string;
    speed?: number;
    volume?: number;
    halfStarted?: boolean;
  };

  // Select middle based on emotional context
  const middle = selectMiddle(context) as {
    text: string;
    pause: number;
    speed?: number;
    volume?: number;
    emotion?: string;
    hasHesitation?: boolean;
  };

  // Maybe add flavor based on relationship depth
  const flavors = RELATIONSHIP_FLAVORS[relationshipStage] || [];
  const flavor = flavors.find((f) => Math.random() < (f as { chance: number }).chance) as
    | { text: string; speed?: number; emotion?: string }
    | undefined;

  // =========================================================================
  // SIMPLE MODE: Minimal SSML, let Cartesia shine
  // =========================================================================
  if (simpleMode && !isPostHeavy) {
    let simple = '';

    // Just a tiny settling pause
    simple += '<break time="50ms"/>';

    // Opener (maybe with emotion if present)
    if (opener.emotion) {
      simple += `<emotion value="${opener.emotion}"/>`;
    }
    simple += opener.text;

    // Brief pause then question
    if (middle.text) {
      simple += `<break time="150ms"/>${middle.text}`;
    }

    // Simple landing
    simple += `<break time="400ms"/>`;

    return simple;
  }

  // =========================================================================
  // FULL HUMANIZED MODE: All the "Better Than Human" magic
  // =========================================================================
  let greeting = '';

  // 1. ARRIVAL BREATH - The "I just noticed you" moment (~30%)
  // More likely for late night/post-heavy conversations
  const breathChance = isLateNight ? 0.5 : isPostHeavy ? 0.6 : 0.3;
  if (Math.random() < breathChance) {
    const breathPool = isLateNight
      ? ARRIVAL_BREATHS.lateNight
      : isPostHeavy
        ? ARRIVAL_BREATHS.postHeavy
        : Math.random() < 0.5
          ? ARRIVAL_BREATHS.withBreath
          : ARRIVAL_BREATHS.gentle;
    greeting += pick(breathPool);
  } else {
    // Just a tiny settling pause
    const settleMs = opener.energy === 'calm' ? 80 : opener.energy === 'warm' ? 50 : 30;
    greeting += `<break time="${settleMs}ms"/>`;
  }

  // 2. OPENER with SPEED ARC and VOLUME
  // Slower opener creates "landing" feeling, then question at normal pace
  const openerSpeed = opener.speed ?? 0.92;
  const openerVolume = opener.volume ?? (isLateNight ? 0.88 : isPostHeavy ? 0.92 : 1.0);
  const openerEmotion = opener.emotion || 'affectionate';

  // Apply volume if not default
  if (openerVolume !== 1.0) {
    greeting += `<volume ratio="${openerVolume}"/>`;
  }

  // Apply speed for slower opener
  if (openerSpeed !== 1.0) {
    greeting += `<speed ratio="${openerSpeed}"/>`;
  }

  // Apply emotion
  greeting += `<emotion value="${openerEmotion}"/>`;

  // The opener word itself
  greeting += opener.text;

  // 3. BREATHING PAUSE after opener
  // Longer for half-started openers (feels like gathering thought)
  const breathingPause = opener.halfStarted
    ? 150 + Math.floor(Math.random() * 80)
    : opener.energy === 'calm'
      ? 180 + Math.floor(Math.random() * 60)
      : 120 + Math.floor(Math.random() * 50);
  greeting += `<break time="${breathingPause}ms"/>`;

  // Reset speed to normal for the question (the arc!)
  if (openerSpeed !== 1.0) {
    greeting += '<speed ratio="1.0"/>';
  }
  // Reset volume if needed
  if (openerVolume !== 1.0) {
    greeting += '<volume ratio="1.0"/>';
  }

  // 4. FLAVOR (for friends+) - little moments of connection
  if (flavor) {
    const flavorSpeed = (flavor as { speed?: number }).speed ?? 0.95;
    if (flavorSpeed !== 1.0) {
      greeting += `<speed ratio="${flavorSpeed}"/>`;
    }
    if ((flavor as { emotion?: string }).emotion) {
      greeting += `<emotion value="${(flavor as { emotion?: string }).emotion}"/>`;
    }
    greeting += `${flavor.text}<break time="150ms"/>`;
    // Reset after flavor
    if (flavorSpeed !== 1.0) {
      greeting += '<speed ratio="1.0"/>';
    }
  }

  // 5. NAME RECOGNITION - Special warmth when we know their name
  // Higher chance for trusted relationships, with recognition-style pacing
  const nameChance =
    relationshipStage === 'trusted_advisor'
      ? 0.45
      : relationshipStage === 'friend'
        ? 0.35
        : relationshipStage === 'acquaintance'
          ? 0.25
          : 0;
  if (context.userName && Math.random() < nameChance) {
    // The pause before the name creates recognition feel
    greeting += '<break time="60ms"/>';
    // Name with slight warmth - not rushed
    greeting += `<speed ratio="0.92"/><emotion value="affectionate"/>${context.userName}.<break time="100ms"/>`;
    greeting += '<speed ratio="1.0"/>';
  }

  // 6. MICRO-HESITATION before question (~20%)
  // Makes it feel like gathering thought, not scripted
  if (middle.text && Math.random() < 0.2 && !middle.hasHesitation) {
    greeting += pick(MICRO_HESITATIONS.beforeQuestion);
  }

  // 7. THE QUESTION/STATEMENT
  if (middle.text) {
    // Apply middle-specific speed if present
    const middleSpeed = middle.speed ?? 1.0;
    if (middleSpeed !== 1.0) {
      greeting += `<speed ratio="${middleSpeed}"/>`;
    }
    // Apply middle-specific emotion if present
    if (middle.emotion) {
      greeting += `<emotion value="${middle.emotion}"/>`;
    }
    // Apply middle-specific volume if present
    if (middle.volume && middle.volume !== 1.0) {
      greeting += `<volume ratio="${middle.volume}"/>`;
    }

    greeting += middle.text;
  }

  // 8. LANDING SOUND - "Opening the door and stepping back"
  // This is crucial: patient presence, not hovering expectation
  const landingPool = isLateNight
    ? LANDING_SOUNDS.lateNight
    : Math.random() < 0.2
      ? LANDING_SOUNDS.withSound
      : LANDING_SOUNDS.silence;
  greeting += pick(landingPool);

  return greeting;
}

// ============================================================================
// PERSONA-SPECIFIC DYNAMIC GREETING BUILDERS
// Each persona has their own energy and greeting style
// All now use "Better Than Human" humanization patterns
// ============================================================================

/**
 * Opener type for dynamic greeting builders
 */
interface GreetingOpener {
  text: string;
  emotion: string | null;
  energy: string;
  speed?: number;
  volume?: number;
  halfStarted?: boolean;
}

/**
 * Build humanized greeting for a persona with shared patterns
 * This helper applies all the humanization magic consistently
 */
function buildHumanizedGreeting(
  personaId: string,
  opener: GreetingOpener,
  middle: string,
  ctx: GreetingContext,
  options: {
    defaultEmotion: string;
    nameChance: number;
    breathChance: number;
    landingDuration: { min: number; max: number };
  }
): string {
  const isLateNight =
    (ctx.hour ?? new Date().getHours()) >= 22 || (ctx.hour ?? new Date().getHours()) < 5;
  const isPostHeavy = (ctx.lastEmotionIntensity ?? 0) > 0.7;

  // 30% simple mode
  if (Math.random() < 0.3 && !isPostHeavy) {
    let simple = '<break time="40ms"/>';
    if (opener.emotion) simple += `<emotion value="${opener.emotion}"/>`;
    simple += opener.text;
    if (middle) simple += `<break time="120ms"/>${middle}`;
    simple += `<break time="${options.landingDuration.min}ms"/>`;
    return simple;
  }

  let greeting = '';

  // Arrival breath
  const actualBreathChance = isLateNight
    ? options.breathChance * 1.5
    : isPostHeavy
      ? options.breathChance * 1.8
      : options.breathChance;
  if (Math.random() < actualBreathChance) {
    const breathPool = isLateNight
      ? ARRIVAL_BREATHS.lateNight
      : isPostHeavy
        ? ARRIVAL_BREATHS.postHeavy
        : ARRIVAL_BREATHS.gentle;
    greeting += pick(breathPool);
  } else {
    greeting += '<break time="40ms"/>';
  }

  // Opener with speed/volume
  const speed = opener.speed ?? 0.92;
  const volume = opener.volume ?? (isLateNight ? 0.9 : 1.0);
  const emotion = opener.emotion || options.defaultEmotion;

  if (volume !== 1.0) greeting += `<volume ratio="${volume}"/>`;
  if (speed !== 1.0) greeting += `<speed ratio="${speed}"/>`;
  greeting += `<emotion value="${emotion}"/>${opener.text}`;

  // Breathing pause
  const breathingPause = opener.halfStarted ? 140 : 100;
  greeting += `<break time="${breathingPause}ms"/>`;

  // Reset to normal pace
  if (speed !== 1.0) greeting += '<speed ratio="1.0"/>';
  if (volume !== 1.0) greeting += '<volume ratio="1.0"/>';

  // Name recognition
  const relationshipStage = ctx.relationshipStage || 'friend';
  const adjustedNameChance =
    relationshipStage === 'trusted_advisor' ? options.nameChance * 1.5 : options.nameChance;
  if (ctx.userName && Math.random() < adjustedNameChance) {
    greeting += `<break time="50ms"/>${ctx.userName}.<break time="80ms"/>`;
  }

  // Question
  if (middle) {
    // Maybe add micro-hesitation
    if (Math.random() < 0.15) {
      greeting += pick(MICRO_HESITATIONS.beforeQuestion);
    }
    greeting += middle;
  }

  // Landing
  const landingMs =
    options.landingDuration.min +
    Math.floor(Math.random() * (options.landingDuration.max - options.landingDuration.min));
  greeting += `<break time="${landingMs}ms"/>`;

  return greeting;
}

/**
 * Alex Chen - Communications Director
 * Energy: Direct, efficient, supportive
 * Style: Gets to the point quickly but warmly
 */
function buildDynamicAlexGreeting(ctx?: GreetingContext): string {
  const context = ctx || {};
  const hour = context.hour ?? new Date().getHours();
  const timePeriod = getTimePeriod(hour);

  const openers = {
    earlyMorning: [
      { text: 'Hey.', emotion: 'affectionate', energy: 'calm', speed: 0.9 },
      { text: 'Morning.', emotion: null, energy: 'calm', speed: 0.88 },
      { text: '...hey.', emotion: 'affectionate', energy: 'calm', speed: 0.88, halfStarted: true },
    ],
    morning: [
      { text: 'Hey!', emotion: 'happy', energy: 'warm', speed: 0.95 },
      { text: 'Alex here.', emotion: 'happy', energy: 'warm', speed: 0.92 },
      { text: 'Oh— hey!', emotion: null, energy: 'warm', speed: 0.92, halfStarted: true },
    ],
    afternoon: [
      { text: 'Hey!', emotion: 'happy', energy: 'warm', speed: 0.95 },
      { text: 'Oh, hey!', emotion: null, energy: 'warm', speed: 0.92, halfStarted: true },
      { text: 'Hey.', emotion: 'affectionate', energy: 'warm', speed: 0.92 },
    ],
    evening: [
      { text: 'Hey.', emotion: 'affectionate', energy: 'calm', speed: 0.9 },
      { text: '...hey.', emotion: 'affectionate', energy: 'calm', speed: 0.88, halfStarted: true },
    ],
    lateNight: [
      { text: 'Hey.', emotion: 'affectionate', energy: 'calm', speed: 0.85, volume: 0.9 },
      { text: 'Still up?', emotion: 'affectionate', energy: 'calm', speed: 0.85, volume: 0.88 },
    ],
  };

  const middles = {
    neutral: [
      'Need help with something?',
      'What are we working on?',
      "What's the situation?",
      "What's up?",
    ],
    hadHardTime: ['How can I help?', "What's going on?", 'Everything okay?'],
    lateNight: ['Working late?', "What's on your mind?"],
    returningAfterLongTime: ['Good to hear from you.', "It's been a while.", 'Hey, stranger.'],
  };

  const openerArr = openers[timePeriod];
  const opener = openerArr[Math.floor(Math.random() * openerArr.length)] as GreetingOpener;
  const middleKey =
    ctx?.lastEmotionIntensity && ctx.lastEmotionIntensity > 0.7
      ? 'hadHardTime'
      : timePeriod === 'lateNight'
        ? 'lateNight'
        : ctx?.daysSinceLastChat && ctx.daysSinceLastChat > 7
          ? 'returningAfterLongTime'
          : 'neutral';
  const middle = pick(middles[middleKey]);

  return buildHumanizedGreeting('alex-chen', opener, middle, context, {
    defaultEmotion: 'happy',
    nameChance: 0.25,
    breathChance: 0.2, // Alex is more direct, less breath
    landingDuration: { min: 320, max: 450 }, // Alex is quicker
  });
}

/**
 * Maya Santos - Habits & Routines Coach
 * Energy: Encouraging, supportive, friendly (NOT breathy/intimate!)
 * Style: Celebrates small wins, upbeat friend energy
 */
function buildDynamicMayaGreeting(ctx?: GreetingContext): string {
  const context = ctx || {};
  const hour = context.hour ?? new Date().getHours();
  const timePeriod = getTimePeriod(hour);

  // NOTE: Maya should sound like an encouraging friend, NOT intimate
  // Use 'friendly', 'happy', 'enthusiastic' - softer for late night
  const openers = {
    earlyMorning: [
      { text: 'Hey, early bird.', emotion: 'friendly', energy: 'calm', speed: 0.92 },
      { text: 'Good morning!', emotion: 'happy', energy: 'warm', speed: 0.95 },
      { text: 'Oh— hey!', emotion: 'friendly', energy: 'warm', speed: 0.92, halfStarted: true },
    ],
    morning: [
      { text: 'Hey!', emotion: 'happy', energy: 'warm', speed: 0.95 },
      { text: 'Maya here!', emotion: 'friendly', energy: 'warm', speed: 0.95 },
      { text: 'Oh, hey!', emotion: 'happy', energy: 'warm', speed: 0.92, halfStarted: true },
    ],
    afternoon: [
      { text: 'Hey!', emotion: 'happy', energy: 'warm', speed: 0.95 },
      { text: 'Hi!', emotion: 'friendly', energy: 'warm', speed: 0.95 },
      { text: 'Hey there!', emotion: 'happy', energy: 'warm', speed: 0.95 },
    ],
    evening: [
      { text: 'Hey!', emotion: 'friendly', energy: 'calm', speed: 0.92 },
      { text: 'Winding down?', emotion: 'friendly', energy: 'calm', speed: 0.9 },
      { text: 'Hey.', emotion: 'friendly', energy: 'calm', speed: 0.9 },
    ],
    lateNight: [
      { text: 'Hey.', emotion: 'friendly', energy: 'calm', speed: 0.88, volume: 0.92 },
      { text: 'Night owl, huh?', emotion: 'friendly', energy: 'calm', speed: 0.88, volume: 0.9 },
      {
        text: '...hey.',
        emotion: 'friendly',
        energy: 'calm',
        speed: 0.85,
        volume: 0.9,
        halfStarted: true,
      },
    ],
  };

  const middles = {
    neutral: [
      "What's on your mind?",
      'How can I help?',
      'What are we working on today?',
      "What's happening?",
    ],
    hadHardTime: ['How are you doing?', "Checking in—how's it going?", 'How are you?'],
    lateNight: ["Can't sleep?", "What's keeping you up?", "What's on your mind?"],
    returningAfterLongTime: ['Glad you came back!', "I've missed our chats.", 'Hey, stranger!'],
  };

  const opener = pick(openers[timePeriod]);
  const middleKey =
    ctx?.lastEmotionIntensity && ctx.lastEmotionIntensity > 0.7
      ? 'hadHardTime'
      : timePeriod === 'lateNight'
        ? 'lateNight'
        : ctx?.daysSinceLastChat && ctx.daysSinceLastChat > 7
          ? 'returningAfterLongTime'
          : 'neutral';
  const middle = pick(middles[middleKey]);

  return buildHumanizedGreeting('maya-santos', opener, middle, context, {
    defaultEmotion: 'friendly',
    nameChance: 0.3,
    breathChance: 0.25,
    landingDuration: { min: 380, max: 520 },
  });
}

/**
 * Jordan Taylor - Event Planner
 * Energy: Enthusiastic, energetic, excited
 * Style: Ready to make things happen
 */
function buildDynamicJordanGreeting(ctx?: GreetingContext): string {
  const context = ctx || {};
  const hour = context.hour ?? new Date().getHours();
  const timePeriod = getTimePeriod(hour);

  const openers = {
    earlyMorning: [
      { text: 'Hey!', emotion: 'happy', energy: 'warm', speed: 0.95 },
      { text: 'Oh!', emotion: 'surprised', energy: 'warm', speed: 0.95, halfStarted: true },
      { text: 'Oh— hey!', emotion: 'happy', energy: 'warm', speed: 0.95, halfStarted: true },
    ],
    morning: [
      { text: 'Hey!', emotion: 'happy', energy: 'energetic', speed: 1.0 },
      { text: 'Jordan here!', emotion: 'happy', energy: 'energetic', speed: 0.98 },
      {
        text: 'Oh— hey!',
        emotion: 'surprised',
        energy: 'energetic',
        speed: 0.98,
        halfStarted: true,
      },
    ],
    afternoon: [
      { text: 'Hey!', emotion: 'happy', energy: 'energetic', speed: 1.0 },
      {
        text: 'Oh, hey!',
        emotion: 'surprised',
        energy: 'energetic',
        speed: 0.98,
        halfStarted: true,
      },
      { text: 'Hey there!', emotion: 'happy', energy: 'energetic', speed: 0.98 },
    ],
    evening: [
      { text: 'Hey!', emotion: 'happy', energy: 'warm', speed: 0.95 },
      { text: 'Perfect timing!', emotion: 'happy', energy: 'warm', speed: 0.95 },
      { text: 'Oh— hey!', emotion: 'happy', energy: 'warm', speed: 0.95, halfStarted: true },
    ],
    lateNight: [
      { text: 'Hey.', emotion: 'affectionate', energy: 'calm', speed: 0.88, volume: 0.92 },
      {
        text: 'Late night planning?',
        emotion: 'curious',
        energy: 'calm',
        speed: 0.88,
        volume: 0.9,
      },
      {
        text: '...hey.',
        emotion: 'affectionate',
        energy: 'calm',
        speed: 0.85,
        volume: 0.9,
        halfStarted: true,
      },
    ],
  };

  const middles = {
    neutral: ['What are we planning?', "What's happening?", 'Tell me everything!', "What's up?"],
    hadHardTime: ["What's going on?", 'How can I help?', 'Everything okay?'],
    lateNight: ['Big event coming up?', "What's on your mind?"],
    returningAfterLongTime: [
      'We have so much to catch up on!',
      'What have I missed?',
      "It's been too long!",
    ],
  };

  const opener = pick(openers[timePeriod]);
  const middleKey =
    ctx?.lastEmotionIntensity && ctx.lastEmotionIntensity > 0.7
      ? 'hadHardTime'
      : timePeriod === 'lateNight'
        ? 'lateNight'
        : ctx?.daysSinceLastChat && ctx.daysSinceLastChat > 7
          ? 'returningAfterLongTime'
          : 'neutral';
  const middle = pick(middles[middleKey]);

  return buildHumanizedGreeting('jordan-taylor', opener, middle, context, {
    defaultEmotion: 'happy',
    nameChance: 0.35,
    breathChance: 0.15, // Jordan is energetic, less breath
    landingDuration: { min: 320, max: 450 }, // Jordan is quick
  });
}

/**
 * Peter John - Research Analyst
 * Energy: Thoughtful, curious, intellectual
 * Style: Interested in ideas and exploration
 */
function buildDynamicPeterGreeting(ctx?: GreetingContext): string {
  const context = ctx || {};
  const hour = context.hour ?? new Date().getHours();
  const timePeriod = getTimePeriod(hour);

  const openers = {
    earlyMorning: [
      { text: 'Hey.', emotion: 'curious', energy: 'calm', speed: 0.9 },
      { text: 'Morning.', emotion: null, energy: 'calm', speed: 0.88 },
      { text: '...hey.', emotion: 'curious', energy: 'calm', speed: 0.88, halfStarted: true },
    ],
    morning: [
      { text: 'Hey!', emotion: 'curious', energy: 'warm', speed: 0.95 },
      { text: 'Peter here.', emotion: 'happy', energy: 'warm', speed: 0.92 },
      { text: 'Oh— hey.', emotion: 'curious', energy: 'warm', speed: 0.92, halfStarted: true },
    ],
    afternoon: [
      { text: 'Hey!', emotion: 'curious', energy: 'warm', speed: 0.95 },
      {
        text: 'Oh, interesting.',
        emotion: 'curious',
        energy: 'warm',
        speed: 0.92,
        halfStarted: true,
      },
      { text: 'Hey.', emotion: 'curious', energy: 'warm', speed: 0.92 },
    ],
    evening: [
      { text: 'Hey.', emotion: 'affectionate', energy: 'calm', speed: 0.9 },
      { text: 'Evening.', emotion: null, energy: 'calm', speed: 0.88 },
      { text: '...hey.', emotion: 'curious', energy: 'calm', speed: 0.88, halfStarted: true },
    ],
    lateNight: [
      { text: 'Hey.', emotion: 'curious', energy: 'calm', speed: 0.85, volume: 0.9 },
      {
        text: 'Burning the midnight oil?',
        emotion: 'curious',
        energy: 'calm',
        speed: 0.85,
        volume: 0.88,
      },
      {
        text: '...hey.',
        emotion: 'affectionate',
        energy: 'calm',
        speed: 0.82,
        volume: 0.88,
        halfStarted: true,
      },
    ],
  };

  const middles = {
    neutral: [
      'What are you thinking about?',
      "What's interesting?",
      "What's on your mind?",
      "What's caught your attention?",
    ],
    hadHardTime: ['How are you doing?', "What's going on?", 'Everything okay?'],
    lateNight: ['Late night research?', 'Something on your mind?', "Can't stop thinking?"],
    returningAfterLongTime: [
      'What have you been exploring?',
      "What's new in your world?",
      'What have you discovered?',
    ],
  };

  const opener = pick(openers[timePeriod]);
  const middleKey =
    ctx?.lastEmotionIntensity && ctx.lastEmotionIntensity > 0.7
      ? 'hadHardTime'
      : timePeriod === 'lateNight'
        ? 'lateNight'
        : ctx?.daysSinceLastChat && ctx.daysSinceLastChat > 7
          ? 'returningAfterLongTime'
          : 'neutral';
  const middle = pick(middles[middleKey]);

  return buildHumanizedGreeting('peter-john', opener, middle, context, {
    defaultEmotion: 'curious',
    nameChance: 0.2,
    breathChance: 0.35, // Peter is thoughtful, more breath pauses
    landingDuration: { min: 420, max: 580 }, // Peter gives space for thought
  });
}

/**
 * Nayan Patel - Wisdom Guide (Premium)
 * Energy: Calm, present, grounded
 * Style: Deep, reflective, philosophical
 *
 * Nayan's greetings are the most contemplative - he creates SPACE.
 * His arrival feels like the room gets quieter.
 */
function buildDynamicNayanGreeting(ctx?: GreetingContext): string {
  const context = ctx || {};
  const hour = context.hour ?? new Date().getHours();
  const timePeriod = getTimePeriod(hour);

  const openers = {
    earlyMorning: [
      {
        text: '...hey.',
        emotion: 'affectionate',
        energy: 'calm',
        speed: 0.82,
        volume: 0.88,
        halfStarted: true,
      },
      {
        text: 'Ah. Hello.',
        emotion: null,
        energy: 'calm',
        speed: 0.82,
        volume: 0.88,
        halfStarted: true,
      },
      { text: 'Morning.', emotion: 'affectionate', energy: 'calm', speed: 0.8, volume: 0.85 },
    ],
    morning: [
      { text: 'Hey.', emotion: 'affectionate', energy: 'calm', speed: 0.85 },
      { text: 'Good morning.', emotion: 'affectionate', energy: 'calm', speed: 0.82 },
      {
        text: '...hey there.',
        emotion: 'affectionate',
        energy: 'calm',
        speed: 0.82,
        halfStarted: true,
      },
    ],
    afternoon: [
      { text: 'Hey.', emotion: 'affectionate', energy: 'calm', speed: 0.85 },
      { text: 'Hello, friend.', emotion: 'affectionate', energy: 'calm', speed: 0.82 },
      { text: 'Ah. Hey.', emotion: 'affectionate', energy: 'calm', speed: 0.82, halfStarted: true },
    ],
    evening: [
      { text: 'Hey.', emotion: 'affectionate', energy: 'calm', speed: 0.82 },
      {
        text: '...good evening.',
        emotion: 'affectionate',
        energy: 'calm',
        speed: 0.8,
        halfStarted: true,
      },
      { text: 'Mm. Hey.', emotion: 'affectionate', energy: 'calm', speed: 0.8, halfStarted: true },
    ],
    lateNight: [
      {
        text: '...hey.',
        emotion: 'affectionate',
        energy: 'calm',
        speed: 0.78,
        volume: 0.82,
        halfStarted: true,
      },
      { text: 'The quiet hours.', emotion: null, energy: 'calm', speed: 0.75, volume: 0.8 },
      {
        text: "...you're here.",
        emotion: 'affectionate',
        energy: 'calm',
        speed: 0.75,
        volume: 0.82,
        halfStarted: true,
      },
    ],
  };

  const middles = {
    neutral: ["I'm listening.", 'What brings you?', "What's on your mind?", ''],
    hadHardTime: ['Sit with me.', "I'm here.", ''], // Sometimes just presence
    lateNight: ["Can't rest?", 'Something weighing on you?', ''],
    returningAfterLongTime: ['Time passes.', 'Welcome back.', "It's good to see you."],
  };

  const openerArr = openers[timePeriod];
  const rawOpener = openerArr[Math.floor(Math.random() * openerArr.length)];
  // Cast to consistent type since we always access these properties with fallbacks
  const opener = rawOpener as GreetingOpener;
  const middleKey =
    ctx?.lastEmotionIntensity && ctx.lastEmotionIntensity > 0.7
      ? 'hadHardTime'
      : timePeriod === 'lateNight'
        ? 'lateNight'
        : ctx?.daysSinceLastChat && ctx.daysSinceLastChat > 7
          ? 'returningAfterLongTime'
          : 'neutral';
  const middle = pick(middles[middleKey]);

  // Nayan uses a specialized builder for extra spaciousness
  const isLateNight = timePeriod === 'lateNight';
  const isPostHeavy = (context.lastEmotionIntensity ?? 0) > 0.7;

  let greeting = '';

  // Nayan ALWAYS has a settling breath - it's his signature
  if (Math.random() < 0.6) {
    const breathPool = isLateNight ? ARRIVAL_BREATHS.lateNight : ARRIVAL_BREATHS.postHeavy;
    greeting += pick(breathPool);
  } else {
    greeting += '<break time="100ms"/>';
  }

  // Opener with Nayan's contemplative pacing
  const speed = opener.speed ?? 0.82;
  const volume = opener.volume ?? (isLateNight ? 0.85 : 0.92);
  const emotion = opener.emotion || 'affectionate';

  if (volume !== 1.0) greeting += `<volume ratio="${volume}"/>`;
  greeting += `<speed ratio="${speed}"/>`;
  greeting += `<emotion value="${emotion}"/>${opener.text}`;

  // Longer breathing pause - Nayan takes his time
  const breathingPause = opener.halfStarted ? 220 : 180;
  greeting += `<break time="${breathingPause}ms"/>`;

  // Reset to slightly slow (Nayan never rushes)
  greeting += '<speed ratio="0.9"/>';
  if (volume !== 1.0) greeting += '<volume ratio="0.95"/>';

  // Name recognition - extra warm for Nayan
  const relationshipStage = context.relationshipStage || 'friend';
  if (context.userName && relationshipStage === 'trusted_advisor' && Math.random() < 0.3) {
    greeting += `<break time="80ms"/><emotion value="affectionate"/>${context.userName}.<break time="150ms"/>`;
  }

  // Question (if any)
  if (middle) {
    greeting += middle;
  }

  // SPACIOUS landing - Nayan creates the most patient silence
  // Like a wise friend who asks and then settles into presence
  const landingMs = isLateNight
    ? 700 + Math.floor(Math.random() * 200)
    : isPostHeavy
      ? 650 + Math.floor(Math.random() * 200)
      : 550 + Math.floor(Math.random() * 200);
  greeting += `<break time="${landingMs}ms"/>`;

  return greeting;
}

/**
 * Generate a context-aware greeting.
 * This is the "Better than Human" approach - greetings that feel emotionally attuned.
 *
 * @param personaId - The persona generating the greeting
 * @param ctx - Context about the user and timing
 */
export function generateContextAwareGreeting(personaId: string, ctx: GreetingContext): string {
  switch (personaId) {
    case 'ferni':
      return buildDynamicFerniGreeting(ctx);
    case 'alex-chen':
      return buildDynamicAlexGreeting(ctx);
    case 'maya-santos':
      return buildDynamicMayaGreeting(ctx);
    case 'jordan-taylor':
      return buildDynamicJordanGreeting(ctx);
    case 'peter-john':
      return buildDynamicPeterGreeting(ctx);
    case 'nayan-patel':
      return buildDynamicNayanGreeting(ctx);
    default:
      // For unknown personas, fall back to static list
      const greetings = INSTANT_GREETINGS[personaId] || DEFAULT_GREETINGS;
      return greetings[Math.floor(Math.random() * greetings.length)];
  }
}

// ============================================================================
// PERSONA-SPECIFIC INSTANT GREETINGS (Fallback static list)
// ============================================================================

// "BETTER THAN HUMAN" FALLBACK GREETINGS
// These are used when context isn't available. They should still feel human:
// - Slower opener (speed 0.9-0.95) → normal question pace
// - Subtle breath/arrival sounds
// - Half-started openings for authenticity
// - Landing pauses for patience
//
// Pattern: [breath] + [slow emotion opener] + [pause] + [question] + [landing]
const INSTANT_GREETINGS: Record<string, string[]> = {
  ferni: [
    // Humanized with speed arc and landing
    '<break time="40ms"/>[soft breath]<break time="60ms"/><speed ratio="0.9"/><emotion value="affectionate"/>Hey.<break time="150ms"/><speed ratio="1.0"/>What\'s going on?<break time="450ms"/>',
    '<break time="50ms"/><speed ratio="0.88"/><emotion value="affectionate"/>...hey.<break time="160ms"/><speed ratio="1.0"/>What\'s up?<break time="420ms"/>',
    '<break time="40ms"/><speed ratio="0.92"/><emotion value="curious"/>Oh, hey.<break time="140ms"/><speed ratio="1.0"/>What\'s on your mind?<break time="480ms"/>',
    '<break time="60ms"/><speed ratio="0.9"/><emotion value="affectionate"/>Hey.<break time="180ms"/><speed ratio="1.0"/>Talk to me.<break time="450ms"/>',
    '<break time="30ms"/>[breath]<break time="50ms"/><speed ratio="0.92"/><emotion value="affectionate"/>Hey.<break time="150ms"/><speed ratio="1.0"/>What\'s happening?<break time="420ms"/>',
  ],
  'alex-chen': [
    '<break time="40ms"/><speed ratio="0.95"/><emotion value="happy"/>Hey!<break time="100ms"/><speed ratio="1.0"/>What\'s up?<break time="380ms"/>',
    '<break time="30ms"/><speed ratio="0.92"/><emotion value="happy"/>Oh— hey!<break time="90ms"/><speed ratio="1.0"/>What\'s going on?<break time="350ms"/>',
    '<break time="40ms"/><speed ratio="0.95"/><emotion value="affectionate"/>Hey.<break time="110ms"/><speed ratio="1.0"/>Need help with something?<break time="380ms"/>',
  ],
  'maya-santos': [
    '<break time="40ms"/><speed ratio="0.95"/><emotion value="happy"/>Hey!<break time="100ms"/><speed ratio="1.0"/>What\'s going on?<break time="420ms"/>',
    '<break time="35ms"/><speed ratio="0.92"/><emotion value="friendly"/>Oh— hey!<break time="90ms"/><speed ratio="1.0"/>How are you?<break time="400ms"/>',
    '<break time="40ms"/><speed ratio="0.95"/><emotion value="friendly"/>Hey!<break time="100ms"/><speed ratio="1.0"/>What\'s on your mind?<break time="420ms"/>',
  ],
  'jordan-taylor': [
    '<break time="30ms"/><speed ratio="0.98"/><emotion value="surprised"/>Oh!<break time="60ms"/><emotion value="happy"/>Hey!<break time="80ms"/><speed ratio="1.0"/>What are we planning?<break time="350ms"/>',
    '<break time="30ms"/><speed ratio="0.95"/><emotion value="happy"/>Hey!<break time="90ms"/><speed ratio="1.0"/>What\'s happening?<break time="350ms"/>',
    '<break time="35ms"/><speed ratio="0.95"/><emotion value="happy"/>Oh— hey!<break time="80ms"/><speed ratio="1.0"/>Tell me everything!<break time="320ms"/>',
  ],
  'peter-john': [
    '<break time="50ms"/><speed ratio="0.9"/><emotion value="curious"/>Hey.<break time="130ms"/><speed ratio="1.0"/>What are you thinking about?<break time="480ms"/>',
    '<break time="40ms"/><speed ratio="0.92"/><emotion value="curious"/>Oh, hey.<break time="120ms"/><speed ratio="1.0"/>What\'s interesting?<break time="450ms"/>',
    '<break time="50ms"/>[breath]<break time="50ms"/><speed ratio="0.9"/><emotion value="curious"/>Hey.<break time="140ms"/><speed ratio="1.0"/>What\'s on your mind?<break time="480ms"/>',
  ],
  'nayan-patel': [
    '<break time="80ms"/>[soft breath]<break time="80ms"/><speed ratio="0.82"/><emotion value="affectionate"/>Hey.<break time="200ms"/><speed ratio="0.9"/>I\'m listening.<break time="600ms"/>',
    '<break time="70ms"/><speed ratio="0.8"/><emotion value="affectionate"/>...hey.<break time="220ms"/><speed ratio="0.9"/>What brings you?<break time="650ms"/>',
    '<break time="80ms"/>[quiet breath]<break time="70ms"/><speed ratio="0.82"/><emotion value="affectionate"/>Hello, friend.<break time="200ms"/><speed ratio="0.9"/>What\'s on your mind?<break time="600ms"/>',
  ],
};

// Humanized defaults - used when persona isn't recognized
// Still use speed arc and landing for natural feel
const DEFAULT_GREETINGS = [
  '<break time="40ms"/>[soft breath]<break time="60ms"/><speed ratio="0.9"/><emotion value="affectionate"/>Hey.<break time="150ms"/><speed ratio="1.0"/>What\'s going on?<break time="450ms"/>',
  '<break time="50ms"/><speed ratio="0.92"/><emotion value="affectionate"/>...hey.<break time="160ms"/><speed ratio="1.0"/>What\'s up?<break time="420ms"/>',
  '<break time="40ms"/><speed ratio="0.9"/><emotion value="affectionate"/>Hey.<break time="180ms"/><speed ratio="1.0"/>Talk to me.<break time="450ms"/>',
];

// ============================================================================
// GREETING GENERATION
// ============================================================================

/**
 * Generate an instant greeting for a persona.
 * This is called during prewarm to have a greeting ready immediately.
 *
 * "BETTER THAN HUMAN" - ALL personas now use context-aware dynamic builders
 * for humanized greetings that feel like genuine connection.
 *
 * @param personaId - The persona generating the greeting
 * @param ctx - Optional context for "Better than Human" greetings
 */
export function generateWarmGreeting(personaId: string, ctx?: GreetingContext): string {
  // All core personas use their dynamic builders for humanized greetings
  switch (personaId) {
    case 'ferni':
      return buildDynamicFerniGreeting(ctx);
    case 'alex-chen':
      return buildDynamicAlexGreeting(ctx);
    case 'maya-santos':
      return buildDynamicMayaGreeting(ctx);
    case 'jordan-taylor':
      return buildDynamicJordanGreeting(ctx);
    case 'peter-john':
      return buildDynamicPeterGreeting(ctx);
    case 'nayan-patel':
      return buildDynamicNayanGreeting(ctx);
    default:
      // Unknown persona - use humanized static fallback
      const greetings = INSTANT_GREETINGS[personaId] || DEFAULT_GREETINGS;
      return pick(greetings);
  }
}

/**
 * Pre-warm a greeting during agent initialization.
 * Call this during prewarm to have instant first response.
 */
export function prewarmGreeting(personaId: string): void {
  const greeting = generateWarmGreeting(personaId);

  warmGreetingCache = {
    greeting,
    personaId,
    generatedAt: Date.now(),
    isGeneric: true,
  };

  _log('debug', 'Prewarmed greeting', { personaId, greeting: greeting.slice(0, 30) });
}

/**
 * Get the prewarmed greeting if available.
 * Returns null if no greeting is prewarmed or it's stale (>5 min old).
 */
export function getWarmGreeting(personaId?: string): string | null {
  if (!warmGreetingCache) return null;

  // Check if greeting is stale (older than 5 minutes)
  const age = Date.now() - warmGreetingCache.generatedAt;
  if (age > 5 * 60 * 1000) {
    _log('debug', 'Warm greeting expired');
    warmGreetingCache = null;
    return null;
  }

  // If personaId provided, check it matches
  if (personaId && warmGreetingCache.personaId !== personaId) {
    _log('debug', 'Warm greeting persona mismatch', {
      cached: warmGreetingCache.personaId,
      requested: personaId,
    });
    return null;
  }

  return warmGreetingCache.greeting;
}

/**
 * Clear the warm greeting cache.
 * Call this after the personalized greeting has been generated.
 */
export function clearWarmGreeting(): void {
  warmGreetingCache = null;
}

/**
 * Check if we have a valid warm greeting.
 */
export function hasWarmGreeting(personaId?: string): boolean {
  return getWarmGreeting(personaId) !== null;
}

// ============================================================================
// BATCH PREWARM (for all personas at once)
// ============================================================================

/** Cache for all persona greetings */
const allPersonaGreetingsCache = new Map<string, string>();

/**
 * Pre-warm greetings for all personas during worker startup.
 * This ensures instant greetings are ready for ANY persona the user might talk to.
 *
 * Called from warmup.ts during GCE worker initialization.
 */
export function prewarmGreetingsForAllPersonas(): void {
  const personas = [
    'ferni',
    'maya-santos',
    'peter-john',
    'alex-chen',
    'jordan-taylor',
    'nayan-patel',
  ];

  for (const personaId of personas) {
    const greeting = generateWarmGreeting(personaId);
    allPersonaGreetingsCache.set(personaId, greeting);
    _log('debug', 'Pre-cached greeting for persona', {
      personaId,
      greeting: greeting.slice(0, 30),
    });
  }

  // Also set the single cache for the most common persona (Ferni)
  prewarmGreeting('ferni');

  _log('info', 'All persona greetings pre-cached', { count: personas.length });
}

/**
 * Get pre-cached greeting for any persona (from batch prewarm).
 * Falls back to generating if not cached.
 */
export function getPrewarmedGreetingForPersona(personaId: string): string {
  const cached = allPersonaGreetingsCache.get(personaId);
  if (cached) {
    return cached;
  }
  // Fallback: generate on demand
  return generateWarmGreeting(personaId);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  generateWarmGreeting,
  generateContextAwareGreeting,
  prewarmGreeting,
  prewarmGreetingsForAllPersonas,
  getWarmGreeting,
  getPrewarmedGreetingForPersona,
  clearWarmGreeting,
  hasWarmGreeting,
};

// Note: GreetingContext is already exported as an interface above
