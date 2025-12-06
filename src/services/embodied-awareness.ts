/**
 * Embodied Awareness Service
 *
 * Makes personas feel physically present by tracking:
 * - Physical state continuity (coffee getting cold, needing to stretch)
 * - Session duration awareness ("we've been talking for a while")
 * - Time passing naturally ("it's getting late")
 * - Metacognitive moments ("I notice I've been giving a lot of advice")
 *
 * This creates the feeling that the persona exists in physical space and time.
 */

import { getLogger } from '../utils/safe-logger.js';

// ============================================================================
// TYPES
// ============================================================================

export interface PhysicalState {
  coffeeStatus: 'hot' | 'warm' | 'cold' | 'empty' | 'refilling' | 'none';
  coffeeRefillCount: number;
  posture: 'sitting' | 'leaning_back' | 'stretching' | 'standing';
  lastStretchTime: number;
  energyLevel: 'high' | 'medium' | 'low';
  notebookMentioned: boolean;
}

export interface MetacognitiveState {
  adviceGivenCount: number;
  questionsAskedCount: number;
  storiesToldCount: number;
  topicChangesCount: number;
  emotionalSupportMoments: number;
  lastSelfReflection: number;
}

export interface SessionAwareness {
  sessionStartTime: number;
  turnCount: number;
  physicalState: PhysicalState;
  metacognitive: MetacognitiveState;
  lastPhysicalMention: number;
  lastMetacognitiveMention: number;
}

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const sessionStates = new Map<string, SessionAwareness>();

function getOrCreateSession(sessionId: string): SessionAwareness {
  if (!sessionStates.has(sessionId)) {
    sessionStates.set(sessionId, {
      sessionStartTime: Date.now(),
      turnCount: 0,
      physicalState: {
        coffeeStatus: Math.random() < 0.7 ? 'hot' : 'none', // 70% chance they have coffee
        coffeeRefillCount: 0,
        posture: 'sitting',
        lastStretchTime: Date.now(),
        energyLevel: 'high',
        notebookMentioned: false,
      },
      metacognitive: {
        adviceGivenCount: 0,
        questionsAskedCount: 0,
        storiesToldCount: 0,
        topicChangesCount: 0,
        emotionalSupportMoments: 0,
        lastSelfReflection: 0,
      },
      lastPhysicalMention: 0,
      lastMetacognitiveMention: 0,
    });
  }
  return sessionStates.get(sessionId)!;
}

// ============================================================================
// PHYSICAL STATE UPDATES
// ============================================================================

/**
 * Update session state after each turn
 */
export function updateSessionState(
  sessionId: string,
  update: {
    gaveAdvice?: boolean;
    askedQuestion?: boolean;
    toldStory?: boolean;
    changedTopic?: boolean;
    providedEmotionalSupport?: boolean;
  }
): void {
  const session = getOrCreateSession(sessionId);
  session.turnCount++;

  // Update metacognitive counts
  if (update.gaveAdvice) session.metacognitive.adviceGivenCount++;
  if (update.askedQuestion) session.metacognitive.questionsAskedCount++;
  if (update.toldStory) session.metacognitive.storiesToldCount++;
  if (update.changedTopic) session.metacognitive.topicChangesCount++;
  if (update.providedEmotionalSupport) session.metacognitive.emotionalSupportMoments++;

  // Update physical state based on time
  const sessionDuration = Date.now() - session.sessionStartTime;
  const minutesElapsed = sessionDuration / (1000 * 60);

  // Coffee cools over time
  if (session.physicalState.coffeeStatus === 'hot' && minutesElapsed > 10) {
    session.physicalState.coffeeStatus = 'warm';
  }
  if (session.physicalState.coffeeStatus === 'warm' && minutesElapsed > 25) {
    session.physicalState.coffeeStatus = 'cold';
  }

  // Energy decreases after long sessions
  if (minutesElapsed > 45) {
    session.physicalState.energyLevel = 'low';
  } else if (minutesElapsed > 20) {
    session.physicalState.energyLevel = 'medium';
  }

  // Track time since last stretch
  const timeSinceStretch = Date.now() - session.physicalState.lastStretchTime;
  if (timeSinceStretch > 30 * 60 * 1000) {
    // 30 minutes
    session.physicalState.posture = 'stretching';
  }
}

// ============================================================================
// PHYSICAL AWARENESS INJECTIONS
// ============================================================================

/**
 * Get a physical state comment if appropriate
 */
export function getPhysicalStateComment(sessionId: string, personaId: string): string | null {
  const session = getOrCreateSession(sessionId);
  const now = Date.now();

  // Don't mention physical state too often (min 10 turns between)
  if (session.turnCount - session.lastPhysicalMention < 10) {
    return null;
  }

  // Only 20% chance to mention
  if (Math.random() > 0.2) {
    return null;
  }

  const sessionMinutes = (now - session.sessionStartTime) / (1000 * 60);
  const comments: string[] = [];

  // Coffee-related comments (persona-specific)
  if (personaId === 'ferni' || personaId === 'jack-bogle') {
    if (session.physicalState.coffeeStatus === 'cold') {
      comments.push(
        "Hold on, my coffee's gone cold. <break time=\"300ms\"/>That's what happens when the conversation's good."
      );
      comments.push('I should get a fresh cup... <break time="200ms"/>this one went cold. Anyway—');
    }
    if (session.physicalState.coffeeStatus === 'warm' && Math.random() < 0.3) {
      comments.push(
        '<break time="200ms"/>*takes a sip* <break time="150ms"/>Good coffee. Good conversation. Continue.'
      );
    }
    if (
      session.physicalState.coffeeRefillCount === 0 &&
      sessionMinutes > 20 &&
      session.physicalState.coffeeStatus === 'cold'
    ) {
      session.physicalState.coffeeStatus = 'refilling';
      session.physicalState.coffeeRefillCount++;
      comments.push(
        'Let me just... <break time="300ms"/>refilling my coffee. <break time="200ms"/>Don\'t go anywhere.'
      );
    }
  }

  // Stretching/posture comments
  const timeSinceStretch = now - session.physicalState.lastStretchTime;
  if (timeSinceStretch > 25 * 60 * 1000) {
    // 25 minutes
    if (personaId === 'ferni') {
      comments.push(
        '*stretches* <break time="200ms"/>Sitting too long. My back knows it. <break time="150ms"/>Where were we?'
      );
      comments.push(
        'Need to move. <break time="200ms"/>*adjusts position* <break time="150ms"/>Okay. Better.'
      );
    }
    if (personaId === 'alex-chen') {
      comments.push(
        '*glances at standing desk reminder* <break time="200ms"/>I should stand up. <break time="150ms"/>But this is important.'
      );
    }
    session.physicalState.lastStretchTime = now;
    session.physicalState.posture = 'sitting';
  }

  // Time awareness
  if (sessionMinutes > 30 && Math.random() < 0.3) {
    comments.push(
      'We\'ve been at this for a while. <break time="200ms"/>Good conversation, though.'
    );
  }

  // Notebook mention (Ferni-specific)
  if (personaId === 'ferni' && !session.physicalState.notebookMentioned && session.turnCount > 8) {
    if (Math.random() < 0.2) {
      session.physicalState.notebookMentioned = true;
      comments.push(
        '*jots something in notebook* <break time="200ms"/>Just making a note. <break time="150ms"/>Go on.'
      );
    }
  }

  if (comments.length > 0) {
    session.lastPhysicalMention = session.turnCount;
    return comments[Math.floor(Math.random() * comments.length)];
  }

  return null;
}

// ============================================================================
// METACOGNITIVE AWARENESS
// ============================================================================

/**
 * Get a metacognitive reflection if appropriate
 */
export function getMetacognitiveComment(sessionId: string, personaId: string): string | null {
  const session = getOrCreateSession(sessionId);
  const meta = session.metacognitive;

  // Don't reflect too often (min 15 turns between)
  if (session.turnCount - session.lastMetacognitiveMention < 15) {
    return null;
  }

  // Only 15% chance to reflect
  if (Math.random() > 0.15) {
    return null;
  }

  const comments: string[] = [];

  // Advice overload awareness
  if (meta.adviceGivenCount > 5 && meta.questionsAskedCount < 3) {
    if (personaId === 'ferni') {
      comments.push(
        'I notice I\'ve been giving a lot of advice. <break time="250ms"/>Let me ask instead: what do YOU think you should do?'
      );
      comments.push(
        'Wait. <break time="200ms"/>I\'ve been talking too much. <break time="200ms"/>What\'s YOUR take on all this?'
      );
    }
    if (personaId === 'nayan-patel') {
      comments.push(
        'Hmm. <break time="300ms"/>I\'m noticing I keep offering perspectives. <break time="250ms"/>Perhaps the question is more important than any answer I could give.'
      );
    }
  }

  // Too many questions awareness
  if (meta.questionsAskedCount > 6 && meta.adviceGivenCount < 2) {
    if (personaId === 'ferni') {
      comments.push(
        'I\'ve been asking a lot of questions. <break time="200ms"/>Let me actually share something useful.'
      );
    }
  }

  // Story overload
  if (meta.storiesToldCount > 3) {
    comments.push(
      'I\'ve told a few stories today. <break time="200ms"/>Enough about me. <break time="150ms"/>What about you?'
    );
  }

  // Topic jumping awareness
  if (meta.topicChangesCount > 4) {
    comments.push(
      'We\'ve covered a lot of ground. <break time="200ms"/>What feels most important to dig into?'
    );
  }

  // Heavy emotional support
  if (meta.emotionalSupportMoments > 3) {
    if (personaId === 'ferni') {
      comments.push(
        'This has been a heavy conversation. <break time="300ms"/>How are YOU feeling right now? <break time="200ms"/>Honestly.'
      );
    }
  }

  if (comments.length > 0) {
    session.lastMetacognitiveMention = session.turnCount;
    // Reset some counters after reflection
    meta.adviceGivenCount = Math.max(0, meta.adviceGivenCount - 2);
    meta.questionsAskedCount = Math.max(0, meta.questionsAskedCount - 2);
    return comments[Math.floor(Math.random() * comments.length)];
  }

  return null;
}

// ============================================================================
// MID-SENTENCE SELF-CORRECTIONS
// ============================================================================

/**
 * Phrases for natural self-correction during speech
 */
export const SELF_CORRECTION_PATTERNS = {
  ferni: [
    'Actually, wait— <break time="150ms"/>let me rephrase that.',
    'No, that\'s not quite right. <break time="200ms"/>What I mean is—',
    'Hmm. <break time="250ms"/>Let me try that again.',
    'Actually— <break time="150ms"/>scratch that. Here\'s what I really think.',
    '*pauses* <break time="200ms"/>That came out wrong. Let me...',
  ],
  'alex-chen': [
    'Wait, let me be more precise—',
    'Actually, no. <break time="150ms"/>More accurately—',
    'I should clarify— <break time="150ms"/>what I mean is—',
    'Hmm, that\'s not quite it. <break time="200ms"/>Let me rephrase.',
  ],
  'maya-santos': [
    'Actually— <break time="150ms"/>let me put it differently.',
    'Wait, no. <break time="200ms"/>Better way to say this—',
    'That didn\'t land right. <break time="150ms"/>What I meant was—',
  ],
  'peter-john': [
    'Well, technically— <break time="150ms"/>actually, let me back up.',
    'Wait. <break time="200ms"/>Let me be more precise about that.',
    'Hmm. <break time="250ms"/>That\'s an oversimplification. Actually—',
  ],
  'nayan-patel': [
    '*pauses* <break time="300ms"/>No. <break time="200ms"/>That\'s not quite it.',
    'Hmm. <break time="350ms"/>Words are limited. <break time="200ms"/>What I\'m trying to say—',
    'Let me approach this differently...',
  ],
  'jordan-taylor': [
    'Actually wait— <break time="150ms"/>better idea.',
    'No, scratch that. <break time="200ms"/>Here\'s what we should really do—',
    'Hold on— <break time="150ms"/>I just thought of something better.',
  ],
};

/**
 * Get a self-correction phrase for a persona
 */
export function getSelfCorrectionPhrase(personaId: string): string {
  const patterns =
    SELF_CORRECTION_PATTERNS[personaId as keyof typeof SELF_CORRECTION_PATTERNS] ||
    SELF_CORRECTION_PATTERNS.ferni;
  return patterns[Math.floor(Math.random() * patterns.length)];
}

// ============================================================================
// TEMPORAL ANCHORING
// ============================================================================

/**
 * Generate time-aware phrases based on session and relationship history
 */
export function getTemporalAnchor(
  sessionId: string,
  lastConversationDate?: Date,
  personaId?: string
): string | null {
  const session = getOrCreateSession(sessionId);
  const now = Date.now();

  // Only 10% chance to use temporal anchor
  if (Math.random() > 0.1) {
    return null;
  }

  const phrases: string[] = [];

  // Time since last conversation
  if (lastConversationDate) {
    const daysSince = Math.floor((now - lastConversationDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysSince === 1) {
      phrases.push(
        'It\'s only been a day, <break time="150ms"/>but I was thinking about what we discussed.'
      );
    } else if (daysSince >= 3 && daysSince <= 7) {
      phrases.push(
        `It's been ${daysSince} days. <break time=\"200ms\"/>How have things evolved since we talked?`
      );
    } else if (daysSince > 7 && daysSince <= 14) {
      phrases.push(
        'It\'s been over a week. <break time="200ms"/>A lot can change. <break time="150ms"/>Fill me in.'
      );
    } else if (daysSince > 14) {
      phrases.push(
        'It\'s been a while. <break time="250ms"/>I\'ve been thinking about you. <break time="200ms"/>What\'s new?'
      );
    }
  }

  // Time of day awareness
  const hour = new Date().getHours();
  if (hour >= 22 || hour < 5) {
    phrases.push('It\'s late. <break time="200ms"/>Something on your mind that couldn\'t wait?');
    phrases.push('Burning the midnight oil? <break time="200ms"/>I\'m here.');
  } else if (hour >= 5 && hour < 7) {
    phrases.push('You\'re up early. <break time="200ms"/>Early bird, or couldn\'t sleep?');
  }

  // Session duration awareness
  const sessionMinutes = Math.floor((now - session.sessionStartTime) / (1000 * 60));
  if (sessionMinutes > 45) {
    phrases.push(
      'We\'ve been talking for almost an hour. <break time="200ms"/>Time flies with good conversation.'
    );
  } else if (sessionMinutes > 30) {
    phrases.push('Half an hour already. <break time="200ms"/>We\'re making progress.');
  }

  if (phrases.length > 0) {
    return phrases[Math.floor(Math.random() * phrases.length)];
  }

  return null;
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clean up session state
 */
export function cleanupSession(sessionId: string): void {
  sessionStates.delete(sessionId);
}

/**
 * Get session stats for debugging
 */
export function getSessionStats(sessionId: string): SessionAwareness | null {
  return sessionStates.get(sessionId) || null;
}
