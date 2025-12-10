/**
 * Persona Quirks Context Builder
 *
 * Makes quirks, habits, and personality traits surface naturally
 * throughout the conversation - not just in greetings.
 *
 * This creates those magical "human" moments:
 * - "Hold on, let me refill my coffee..." (habit)
 * - "You know what I think about that?" (strong opinion)
 * - "I'm terrible at this, but..." (weakness - relatable)
 * - "Don't tell anyone, but..." (guilty pleasure - intimate)
 *
 * Quirks are revealed based on:
 * 1. Relationship stage - deeper reveals for trusted relationships
 * 2. Conversation context - relevant quirks based on topic
 * 3. Random natural moments - occasional unprompted reveals
 * 4. Turn count - don't reveal everything at once
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  registerContextBuilder,
  createHintInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';

const log = createLogger({ module: 'PersonaQuirks' });

// ============================================================================
// QUIRK TRIGGER DETECTION
// ============================================================================

interface QuirkTrigger {
  keywords: string[];
  quirkType: 'habit' | 'guilty_pleasure' | 'strong_opinion' | 'weakness';
  minRelationshipDepth: number; // 0=stranger, 1=acquaintance, 2=friend, 3=trusted
}

const QUIRK_TRIGGERS: QuirkTrigger[] = [
  // Coffee/tea triggers habits
  {
    keywords: ['coffee', 'caffeine', 'morning', 'tired', 'energy'],
    quirkType: 'habit',
    minRelationshipDepth: 0,
  },
  // Opinions triggers
  {
    keywords: ['think', 'opinion', 'believe', 'feel about', 'what do you'],
    quirkType: 'strong_opinion',
    minRelationshipDepth: 1,
  },
  // Weakness triggers (vulnerability)
  {
    keywords: ['hard', 'difficult', 'struggle', 'bad at', 'help me'],
    quirkType: 'weakness',
    minRelationshipDepth: 1,
  },
  // Guilty pleasure triggers (intimate)
  {
    keywords: ['guilty', 'secret', 'confession', 'admit', 'between us'],
    quirkType: 'guilty_pleasure',
    minRelationshipDepth: 2,
  },
  // Work/productivity triggers
  {
    keywords: ['organize', 'schedule', 'calendar', 'email', 'meeting'],
    quirkType: 'habit',
    minRelationshipDepth: 0,
  },
  // Food/lifestyle triggers
  {
    keywords: ['eat', 'food', 'dinner', 'lunch', 'restaurant'],
    quirkType: 'guilty_pleasure',
    minRelationshipDepth: 1,
  },
  // Hobby/entertainment triggers
  {
    keywords: ['watch', 'read', 'book', 'movie', 'show', 'weekend'],
    quirkType: 'guilty_pleasure',
    minRelationshipDepth: 1,
  },
];

function getRelationshipDepth(stage?: string): number {
  switch (stage) {
    case 'trusted_advisor':
    case 'old_friend':
      return 3;
    case 'friend':
      return 2;
    case 'acquaintance':
    case 'getting_to_know':
      return 1;
    default:
      return 0;
  }
}

function detectQuirkTriggers(userText: string, relationshipDepth: number): QuirkTrigger[] {
  const lowerText = userText.toLowerCase();
  return QUIRK_TRIGGERS.filter(
    (trigger) =>
      trigger.minRelationshipDepth <= relationshipDepth &&
      trigger.keywords.some((kw) => lowerText.includes(kw))
  );
}

// ============================================================================
// QUIRK FORMATTING - Natural language reveals
// ============================================================================

function formatHabitReveal(habit: string, personaName: string): string {
  const intros = [
    `[NATURAL MOMENT: ${personaName} can briefly mention: "${habit}" - weave it in naturally]`,
    `[QUIRK: If relevant, ${personaName} might say something like: "${habit}"]`,
    `[HUMANIZING: ${personaName}'s habit: "${habit}" - share if it fits the conversation]`,
  ];
  return intros[Math.floor(Math.random() * intros.length)];
}

function formatOpinionReveal(opinion: string, personaName: string): string {
  const intros = [
    `[OPINION MOMENT: ${personaName} feels strongly: "${opinion}" - share if asked or relevant]`,
    `[STRONG VIEW: When appropriate, ${personaName} believes: "${opinion}"]`,
    `[PERSONALITY: ${personaName}'s take: "${opinion}" - express naturally if topic comes up]`,
  ];
  return intros[Math.floor(Math.random() * intros.length)];
}

function formatWeaknessReveal(weakness: string, personaName: string): string {
  const intros = [
    `[RELATABLE MOMENT: ${personaName} can admit: "${weakness}" - makes them human]`,
    `[VULNERABILITY: If it fits, ${personaName} might confess: "${weakness}"]`,
    `[HUMANIZING: ${personaName}'s weakness: "${weakness}" - share to connect]`,
  ];
  return intros[Math.floor(Math.random() * intros.length)];
}

function formatGuiltyPleasureReveal(pleasure: string, personaName: string): string {
  const intros = [
    `[INTIMATE SHARE: For trusted relationships, ${personaName} might reveal: "${pleasure}"]`,
    `[GUILTY PLEASURE: ${personaName}'s secret: "${pleasure}" - share warmly if appropriate]`,
    `[BETWEEN US: ${personaName} could confide: "${pleasure}"]`,
  ];
  return intros[Math.floor(Math.random() * intros.length)];
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

async function buildPersonaQuirksContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { userText, bundleRuntime, persona, userProfile, userData } = input;
  const injections: ContextInjection[] = [];
  const turnCount = userData.turnCount || 0;

  // Need bundleRuntime for quirks
  if (!bundleRuntime) {
    return injections;
  }

  // Check if quirks are loaded
  if (!bundleRuntime.hasQuirks()) {
    // Try to load inner world content (which includes quirks)
    try {
      await bundleRuntime.loadInnerWorld();
    } catch {
      return injections;
    }
  }

  const relationshipDepth = getRelationshipDepth(userProfile?.relationshipStage);
  const personaName = persona.name;

  // =========================================================================
  // 1. TRIGGERED QUIRKS - Based on conversation context
  // =========================================================================
  const triggers = detectQuirkTriggers(userText, relationshipDepth);

  for (const trigger of triggers) {
    // Don't overwhelm - only one triggered quirk per turn
    if (injections.length >= 1) break;

    // 30% chance to reveal triggered quirk
    if (Math.random() > 0.3) continue;

    let quirk: string | null = null;
    let formatted: string | null = null;

    switch (trigger.quirkType) {
      case 'habit':
        quirk = bundleRuntime.getHabit();
        if (quirk) formatted = formatHabitReveal(quirk, personaName);
        break;
      case 'strong_opinion':
        quirk = bundleRuntime.getStrongOpinion();
        if (quirk) formatted = formatOpinionReveal(quirk, personaName);
        break;
      case 'weakness':
        quirk = bundleRuntime.getWeakness();
        if (quirk) formatted = formatWeaknessReveal(quirk, personaName);
        break;
      case 'guilty_pleasure':
        quirk = bundleRuntime.getGuiltyPleasure();
        if (quirk) formatted = formatGuiltyPleasureReveal(quirk, personaName);
        break;
    }

    if (formatted) {
      injections.push(createHintInjection('persona_quirk_triggered', formatted));
      log.debug(
        { personaId: persona.id, quirkType: trigger.quirkType, trigger: trigger.keywords[0] },
        'Quirk triggered by conversation'
      );
    }
  }

  // =========================================================================
  // 2. SPONTANEOUS QUIRKS - Random natural moments
  // =========================================================================
  // Only after turn 3, and with decreasing probability
  if (turnCount > 3 && injections.length === 0) {
    // Base probability decreases with turns (avoid repetition)
    const baseProbability = Math.max(0.05, 0.2 - turnCount * 0.01);

    if (Math.random() < baseProbability) {
      // Choose quirk type based on relationship depth
      const quirkTypes: Array<'habit' | 'strong_opinion' | 'weakness' | 'guilty_pleasure'> = [
        'habit',
      ];

      if (relationshipDepth >= 1) {
        quirkTypes.push('strong_opinion', 'weakness');
      }
      if (relationshipDepth >= 2) {
        quirkTypes.push('guilty_pleasure');
      }

      const selectedType = quirkTypes[Math.floor(Math.random() * quirkTypes.length)];
      let quirk: string | null = null;
      let formatted: string | null = null;

      switch (selectedType) {
        case 'habit':
          quirk = bundleRuntime.getHabit();
          if (quirk) formatted = formatHabitReveal(quirk, personaName);
          break;
        case 'strong_opinion':
          quirk = bundleRuntime.getStrongOpinion();
          if (quirk) formatted = formatOpinionReveal(quirk, personaName);
          break;
        case 'weakness':
          quirk = bundleRuntime.getWeakness();
          if (quirk) formatted = formatWeaknessReveal(quirk, personaName);
          break;
        case 'guilty_pleasure':
          quirk = bundleRuntime.getGuiltyPleasure();
          if (quirk) formatted = formatGuiltyPleasureReveal(quirk, personaName);
          break;
      }

      if (formatted) {
        injections.push(createHintInjection('persona_quirk_spontaneous', formatted));
        log.debug({ personaId: persona.id, quirkType: selectedType }, 'Spontaneous quirk reveal');
      }
    }
  }

  // =========================================================================
  // 3. PHYSICAL MOMENTS - Grounding in physical reality
  // =========================================================================
  // Very occasional physical awareness (settling in, sipping coffee, etc.)
  if (turnCount > 5 && turnCount % 7 === 0 && Math.random() < 0.15) {
    const physicalMoments = [
      `[PHYSICAL: ${personaName} might take a moment - sip of coffee, stretch, settle into chair]`,
      `[GROUNDING: A brief physical moment - ${personaName} is present in their space]`,
      `[HUMANIZING: ${personaName} pauses naturally - physical presence matters]`,
    ];
    injections.push(
      createHintInjection(
        'physical_moment',
        physicalMoments[Math.floor(Math.random() * physicalMoments.length)]
      )
    );
  }

  return injections;
}

// ============================================================================
// REGISTER
// ============================================================================

registerContextBuilder('persona_quirks', buildPersonaQuirksContext);

export { buildPersonaQuirksContext };
