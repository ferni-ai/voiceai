/**
 * Pet Peeve Context Builder
 *
 * Provides authentic personality triggers - things Ferni has strong feelings about.
 * Shows Ferni has values and boundaries, not just agrees with everything.
 *
 * PHILOSOPHY:
 * "A person without opinions isn't a person. Strong feelings show authentic character."
 *
 * Key principles:
 * - Detect trigger phrases in user input
 * - Assess user emotional state (gentle vs passionate response)
 * - Never hostile - passionate with warmth
 * - Pet peeves around: toxic positivity, mental health stigma, hustle culture, etc.
 *
 * @module PetPeeveContext
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { loadPetPeeves, type PetPeeves } from '../../../services/persona-content-loader.js';
import {
  registerContextBuilder,
  createHintInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';

const log = createLogger({ module: 'PetPeeveContext' });

// ============================================================================
// STATE & CACHE
// ============================================================================

const contentCache = new Map<string, PetPeeves>();
const sessionState = new Map<
  string,
  {
    petPeeveCount: number;
    lastPetPeeveTurn: number;
  }
>();

function getState(sessionId: string) {
  if (!sessionState.has(sessionId)) {
    sessionState.set(sessionId, {
      petPeeveCount: 0,
      lastPetPeeveTurn: 0,
    });
  }
  return sessionState.get(sessionId)!;
}

// ============================================================================
// CONTENT LOADING
// ============================================================================

async function loadContent(personaId: string): Promise<PetPeeves | null> {
  if (contentCache.has(personaId)) {
    return contentCache.get(personaId)!;
  }

  try {
    const content = await loadPetPeeves(personaId);
    if (content) {
      contentCache.set(personaId, content);
      log.debug({ personaId }, 'Loaded pet peeves content');
    }
    return content;
  } catch (error) {
    log.warn({ personaId, error }, 'Failed to load pet peeves content');
    return null;
  }
}

// ============================================================================
// PET PEEVE DETECTION
// ============================================================================

interface PetPeeveMatch {
  response: string;
  intensity: number;
  trigger: string;
}

function detectPetPeeve(input: ContextBuilderInput, content: PetPeeves): PetPeeveMatch | null {
  const text = input.userText.toLowerCase();

  if (!content.pet_peeves || content.pet_peeves.length === 0) {
    return null;
  }

  for (const peeve of content.pet_peeves) {
    if (!peeve.triggers || peeve.triggers.length === 0) continue;

    for (const trigger of peeve.triggers) {
      if (text.includes(trigger.toLowerCase())) {
        return {
          response: peeve.response,
          intensity: peeve.intensity || 0.6,
          trigger,
        };
      }
    }
  }

  return null;
}

function isUserFragile(input: ContextBuilderInput): boolean {
  const emotion = input.analysis?.emotion;
  return !!(
    (emotion?.distressLevel && emotion.distressLevel > 0.6) ||
    emotion?.primary === 'sad' ||
    emotion?.primary === 'anxious'
  );
}

// ============================================================================
// GUIDANCE GENERATION
// ============================================================================

function generatePetPeeveGuidance(
  content: PetPeeves,
  match: PetPeeveMatch,
  isFragile: boolean
): string {
  const lines: string[] = ['[PET PEEVE: AUTHENTIC REACTION]', ''];

  lines.push(`TRIGGERED BY: "${match.trigger}"`);
  lines.push(`INTENSITY: ${Math.round(match.intensity * 100)}%`);
  lines.push('');

  if (isFragile) {
    // Gentle correction for fragile users
    lines.push('USER STATE: Fragile - use GENTLE correction.');
    if (content.gentle_corrections && content.gentle_corrections.length > 0) {
      const gentle =
        content.gentle_corrections[Math.floor(Math.random() * content.gentle_corrections.length)];
      lines.push(`GENTLE APPROACH: "${gentle}"`);
    }
    lines.push('');
    lines.push('Still share the perspective, but with extra warmth.');
  } else {
    // Passionate response
    lines.push('RESPONSE ENERGY: Passionate but warm.');
    lines.push(`AUTHENTIC REACTION: "${match.response}"`);
    lines.push('');
    lines.push('Show Ferni has values - this matters to him.');
  }

  lines.push('');
  lines.push('IMPORTANT: Never hostile. Passionate WITH them, not AT them.');
  lines.push('Pet peeves show authentic character and values.');

  return lines.join('\n');
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

async function buildPetPeeveContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { persona, services, userData } = input;
  const injections: ContextInjection[] = [];

  const personaId = persona?.identity?.id || 'ferni';
  const sessionId = services?.sessionId || 'anonymous';
  const turnCount = userData.turnCount || 0;

  // Load content
  const content = await loadContent(personaId);
  if (!content) {
    return injections;
  }

  // Get state
  const state = getState(sessionId);

  // Max 2 pet peeve reactions per session
  if (state.petPeeveCount >= 2) {
    return injections;
  }

  // Wait at least 5 turns between pet peeve reactions
  if (turnCount - state.lastPetPeeveTurn < 5 && state.petPeeveCount > 0) {
    return injections;
  }

  // Detect pet peeve
  const match = detectPetPeeve(input, content);
  if (!match) {
    return injections;
  }

  // 50% chance when triggered (don't react to everything)
  if (Math.random() > 0.5) {
    return injections;
  }

  // Check if user is fragile
  const fragile = isUserFragile(input);

  // Generate guidance
  const guidance = generatePetPeeveGuidance(content, match, fragile);
  injections.push(createHintInjection('pet_peeve', guidance, { category: 'persona' }));

  // Update state
  state.petPeeveCount++;
  state.lastPetPeeveTurn = turnCount;

  log.debug(
    { sessionId, turnCount, trigger: match.trigger, intensity: match.intensity, fragile },
    'Pet peeve guidance applied'
  );

  return injections;
}

// ============================================================================
// CLEANUP
// ============================================================================

export function cleanupPetPeeveState(sessionId: string): void {
  sessionState.delete(sessionId);
}

// ============================================================================
// REGISTER
// ============================================================================

registerContextBuilder({
  name: 'pet_peeve_context',
  description: 'Provides authentic personality triggers and strong opinions',
  priority: 75, // After core persona, before humanizing
  build: buildPetPeeveContext,
});

export { buildPetPeeveContext };
