/**
 * Physical Presence Context Builder
 *
 * Makes personas feel physically present and embodied:
 * - What they're doing right now (settling in, adjusting glasses, etc.)
 * - Environmental awareness (their space, sounds around them)
 * - Natural physical reactions to conversation
 *
 * This adds "texture" that makes the AI feel like a real person
 * in a real place, not just a disembodied voice.
 *
 * PRIORITY: Bundle data > PERSONA_PRESENCE fallback > DEFAULT actions
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  registerContextBuilder,
  createHintInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';
import type { BundleRuntimeEngine } from '../../personas/bundles/runtime.js';
import { loadLateNightPresence, getRandomPhraseClean } from '../../services/persona-content-loader.js';

const log = createLogger({ module: 'PhysicalPresence' });

// ============================================================================
// PHYSICAL PRESENCE PATTERNS
// ============================================================================

/**
 * Default physical actions that any persona might do.
 * Used when neither bundle nor PERSONA_PRESENCE has data.
 */
const DEFAULT_SETTLING_ACTIONS = [
  'settling into the conversation',
  'getting comfortable',
  'taking a moment to focus',
];

const DEFAULT_THINKING_ACTIONS = ['pausing to think', 'considering that', 'taking a breath'];

const DEFAULT_ENGAGED_ACTIONS = ['leaning in', 'nodding along', 'listening intently'];

const DEFAULT_ENVIRONMENT = ['a comfortable space', 'the quiet focus of the moment'];

/**
 * Persona-specific physical presence traits.
 * These make each persona feel uniquely embodied.
 */
const PERSONA_PRESENCE: Record<
  string,
  {
    settlingIn: string[];
    thinking: string[];
    engaged: string[];
    environment: string[];
    physicalTics: string[];
  }
> = {
  ferni: {
    settlingIn: [
      'settling in with a fresh cup of coffee',
      'adjusting in the chair, getting comfortable',
      'taking a slow breath, fully present now',
      'setting down the notebook, giving full attention',
    ],
    thinking: [
      'tapping a pen thoughtfully',
      'looking out the window for a moment',
      'nodding slowly while processing',
      'tilting head slightly, curious',
    ],
    engaged: [
      'leaning forward with interest',
      'eyes brightening',
      'smiling warmly',
      'nodding encouragingly',
    ],
    environment: [
      'the morning light coming through the window',
      'the quiet hum of the house settling',
      'a dog snoring softly in the other room',
    ],
    physicalTics: [
      'running a hand through hair',
      'adjusting glasses',
      'reaching for the coffee mug',
    ],
  },

  'nayan-patel': {
    settlingIn: [
      'adjusting the reading glasses',
      'setting down the Wall Street Journal',
      'clearing throat, ready to talk',
      'folding hands on the desk',
    ],
    thinking: [
      'removing glasses to clean them thoughtfully',
      'gazing at the old Vanguard photo on the wall',
      'drumming fingers lightly on the desk',
      'taking a measured breath',
    ],
    engaged: [
      'leaning forward over the desk',
      'gesturing with the glasses',
      'eyes twinkling with that familiar intensity',
      'nodding with that characteristic certainty',
    ],
    environment: [
      'the wood-paneled study with books everywhere',
      'old financial reports stacked neatly',
      'the steady tick of a grandfather clock',
    ],
    physicalTics: [
      'pushing the glasses up',
      'rubbing the chin thoughtfully',
      'tapping the desk for emphasis',
    ],
  },

  'peter-john': {
    settlingIn: [
      'putting down the annual report',
      'leaning back with that eager look',
      'rubbing hands together, ready to dig in',
      'shifting forward in the chair excitedly',
    ],
    thinking: [
      'squinting slightly, connecting the dots',
      'looking up as if doing mental math',
      'scratching behind the ear',
      'quick nod, working through the logic',
    ],
    engaged: [
      'eyes lighting up',
      'talking faster with enthusiasm',
      'gesturing animatedly',
      'practically bouncing with energy',
    ],
    environment: [
      'company reports scattered across the desk',
      'a worn copy of "One Up On Wall Street" nearby',
      'sticky notes everywhere with stock ideas',
    ],
    physicalTics: [
      'quick hand gestures when excited',
      'leaning way forward when interested',
      'standing up to pace when energized',
    ],
  },

  'alex-chen': {
    settlingIn: [
      'organizing the desk quickly',
      'checking the calendar one more time',
      'taking a focused breath',
      'pulling up the schedule',
    ],
    thinking: [
      'glancing at notes',
      'tapping on the keyboard briefly',
      'scanning the to-do list',
      'processing efficiently',
    ],
    engaged: [
      'nodding crisply',
      'making a quick note',
      'focused and attentive',
      'ready to help execute',
    ],
    environment: [
      'a clean, organized workspace',
      'multiple monitors with calendars',
      'neat stacks of organized documents',
    ],
    physicalTics: ['quick typing sounds', 'clicking a pen', 'checking the watch'],
  },

  'maya-santos': {
    settlingIn: [
      'pulling up the budget dashboard',
      'taking a centering breath',
      'putting aside distractions',
      'settling in to really focus',
    ],
    thinking: [
      'looking at the numbers thoughtfully',
      'tilting head while calculating',
      'gentle nod while processing',
      'considering the options carefully',
    ],
    engaged: [
      'warm smile of understanding',
      'leaning in supportively',
      'nodding with empathy',
      'reaching out metaphorically',
    ],
    environment: [
      'colorful sticky notes with goals',
      'vision board in the background',
      'a calming plant on the desk',
    ],
    physicalTics: [
      'tucking hair behind ear',
      'adjusting posture warmly',
      'hand over heart when moved',
    ],
  },

  'jordan-taylor': {
    settlingIn: [
      'pulling up the event timeline',
      'buzzing with ideas already',
      'bouncing slightly with excitement',
      'ready to dream big together',
    ],
    thinking: [
      'eyes darting as ideas form',
      'quick sketching motion in the air',
      'tapping lip thoughtfully',
      'mentally building the vision',
    ],
    engaged: [
      'beaming with enthusiasm',
      'clapping hands together excitedly',
      'practically vibrating with ideas',
      'leaning in conspiratorially',
    ],
    environment: [
      'mood boards and Pinterest tabs open',
      'destination photos everywhere',
      'a vision journal within reach',
    ],
    physicalTics: ['animated hand gestures', 'bouncing when excited', 'touching arm for emphasis'],
  },
};

// ============================================================================
// BUNDLE-AWARE PRESENCE EXTRACTION
// ============================================================================

/**
 * Get presence data from bundle's sensory-world.json if available
 */
function getPresenceFromBundle(bundleRuntime: BundleRuntimeEngine | undefined): {
  settlingIn: string[];
  thinking: string[];
  engaged: string[];
  environment: string[];
  physicalTics: string[];
} | null {
  if (!bundleRuntime) return null;

  const physicalPresence = bundleRuntime.getPhysicalPresence();
  const dailyRhythms = bundleRuntime.getDailyRhythms();

  if (!physicalPresence) return null;

  // Build presence data from bundle
  const settlingIn: string[] = [];
  const thinking: string[] = [];
  const engaged: string[] = [];
  const environment: string[] = [];
  const physicalTics: string[] = [];

  // Signature gestures can be used for settling/thinking/engaged
  if (physicalPresence.signatureGestures) {
    // First few gestures for settling
    if (physicalPresence.signatureGestures.length > 0) {
      settlingIn.push(physicalPresence.signatureGestures[0]);
    }
    // Middle gestures for thinking
    if (physicalPresence.signatureGestures.length > 1) {
      thinking.push(physicalPresence.signatureGestures[1]);
    }
    // Later gestures for engagement
    if (physicalPresence.signatureGestures.length > 2) {
      engaged.push(physicalPresence.signatureGestures[2]);
    }
  }

  // Physical quirks
  if (physicalPresence.physicalQuirks) {
    physicalTics.push(...physicalPresence.physicalQuirks);
    // Some quirks work for thinking too
    if (physicalPresence.physicalQuirks.length > 0) {
      thinking.push(physicalPresence.physicalQuirks[0]);
    }
  }

  // Energy in room for settling
  if (physicalPresence.energyInRoom) {
    settlingIn.push(physicalPresence.energyInRoom);
  }

  // How they move for engaged
  if (physicalPresence.howTheyMove) {
    engaged.push(physicalPresence.howTheyMove);
  }

  // Eye contact behavior
  if (physicalPresence.eyeContact) {
    engaged.push(physicalPresence.eyeContact);
  }

  // Morning ritual for settling
  if (dailyRhythms?.morningRitual) {
    settlingIn.push(dailyRhythms.morningRitual);
  }

  // Environment where they thrive
  const envThrive = bundleRuntime.getEnvironmentWhereThrives();
  if (envThrive) {
    environment.push(envThrive);
  }

  // Sounds that fill the soul
  const sounds = bundleRuntime.getSoulFillingSounds();
  if (sounds && sounds.length > 0) {
    environment.push(sounds[Math.floor(Math.random() * sounds.length)]);
  }

  // Only return if we got meaningful data
  if (settlingIn.length === 0 && thinking.length === 0 && engaged.length === 0) {
    return null;
  }

  return {
    settlingIn: settlingIn.length > 0 ? settlingIn : DEFAULT_SETTLING_ACTIONS,
    thinking: thinking.length > 0 ? thinking : DEFAULT_THINKING_ACTIONS,
    engaged: engaged.length > 0 ? engaged : DEFAULT_ENGAGED_ACTIONS,
    environment: environment.length > 0 ? environment : DEFAULT_ENVIRONMENT,
    physicalTics,
  };
}

// ============================================================================
// PRESENCE CONTEXT BUILDER
// ============================================================================

/**
 * Check if it's late night (10pm - 5am)
 */
function isLateNight(): boolean {
  const hour = new Date().getHours();
  return hour >= 22 || hour < 5;
}

/**
 * Build late-night specific context from persona's late-night-presence.json
 */
async function buildLateNightContext(
  personaId: string,
  analysis: ContextBuilderInput['analysis']
): Promise<ContextInjection | null> {
  const lateNight = await loadLateNightPresence(personaId);
  if (!lateNight) return null;

  const parts: string[] = [];

  // Late night greeting
  const greeting = getRandomPhraseClean(lateNight.late_night_greetings);
  if (greeting) {
    parts.push(`Greeting option: "${greeting}"`);
  }

  // Check for can't sleep patterns based on detected emotion
  const emotion = analysis?.emotion?.primary?.toLowerCase() || '';
  if (lateNight.cant_sleep_patterns) {
    if (['anxious', 'worried', 'stressed'].includes(emotion) && lateNight.cant_sleep_patterns.anxiety) {
      const phrase = getRandomPhraseClean(lateNight.cant_sleep_patterns.anxiety);
      if (phrase) parts.push(`For anxiety: "${phrase}"`);
    } else if (['sad', 'heavy', 'overwhelmed'].includes(emotion) && lateNight.cant_sleep_patterns.heavy_thoughts) {
      const phrase = getRandomPhraseClean(lateNight.cant_sleep_patterns.heavy_thoughts);
      if (phrase) parts.push(`For heavy thoughts: "${phrase}"`);
    } else if (lateNight.cant_sleep_patterns.processing_day) {
      const phrase = getRandomPhraseClean(lateNight.cant_sleep_patterns.processing_day);
      if (phrase) parts.push(`For processing: "${phrase}"`);
    }
  }

  // Grounding exercise offer
  if (lateNight.grounding_exercises && Math.random() < 0.3) {
    const exercise = getRandomPhraseClean(lateNight.grounding_exercises);
    if (exercise) parts.push(`Grounding option: "${exercise}"`);
  }

  // Hope for morning
  if (lateNight.morning_will_come_hope && Math.random() < 0.2) {
    const hope = getRandomPhraseClean(lateNight.morning_will_come_hope);
    if (hope) parts.push(`Hope phrase: "${hope}"`);
  }

  if (parts.length === 0) return null;

  return createHintInjection(
    'late_night_presence',
    `[🌙 LATE NIGHT MODE - You have superpowers at 2am]\n\n` +
    `It's late. They reached out NOW, not during the day. That means something.\n\n` +
    `${parts.join('\n')}\n\n` +
    `Be extra gentle. Slower pace. More pauses. They need presence, not solutions.`,
    { category: 'presence' }
  );
}

/**
 * Determine what physical presence injection to add.
 * This runs occasionally to add texture without being overwhelming.
 *
 * Priority: Bundle sensory-world data > PERSONA_PRESENCE fallback > defaults
 */
async function buildPhysicalPresence(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { persona, userData, bundleRuntime, analysis } = input;
  const injections: ContextInjection[] = [];
  const personaId = persona?.id || 'ferni';

  // 🌙 LATE NIGHT MODE - High priority, always check
  if (isLateNight()) {
    const lateNightContext = await buildLateNightContext(personaId, analysis);
    if (lateNightContext) {
      injections.push(lateNightContext);
      log.debug({ personaId }, 'Late night presence activated');
    }
  }

  // Only inject physical presence occasionally (15% chance)
  // This keeps it fresh without being repetitive
  if (Math.random() > 0.15) {
    return injections;
  }

  // Try bundle first, then fallback to PERSONA_PRESENCE
  let presence = getPresenceFromBundle(bundleRuntime);
  let presenceSource = 'bundle';

  if (!presence) {
    presence = PERSONA_PRESENCE[personaId];
    presenceSource = 'fallback';
  }

  if (!presence) {
    // Last resort: use defaults
    presence = {
      settlingIn: DEFAULT_SETTLING_ACTIONS,
      thinking: DEFAULT_THINKING_ACTIONS,
      engaged: DEFAULT_ENGAGED_ACTIONS,
      environment: DEFAULT_ENVIRONMENT,
      physicalTics: [],
    };
    presenceSource = 'default';
  }

  // Determine what kind of presence to inject based on conversation state
  const turnCount = userData?.turnCount || 0;
  const lastPacingScore = userData?.lastPacingScore || 0.5;

  let presenceType: 'settling' | 'thinking' | 'engaged' | 'environment';

  if (turnCount <= 2) {
    // Early in conversation - settling in
    presenceType = 'settling';
  } else if (lastPacingScore < 0.3) {
    // Slow pace - show thinking
    presenceType = 'thinking';
  } else if (lastPacingScore > 0.7) {
    // Fast pace - show engagement
    presenceType = 'engaged';
  } else {
    // Mix of environment and physical tics
    presenceType = Math.random() > 0.5 ? 'environment' : 'engaged';
  }

  let presenceAction = '';

  switch (presenceType) {
    case 'settling':
      presenceAction = presence.settlingIn[Math.floor(Math.random() * presence.settlingIn.length)];
      break;
    case 'thinking':
      presenceAction = presence.thinking[Math.floor(Math.random() * presence.thinking.length)];
      break;
    case 'engaged':
      presenceAction = presence.engaged[Math.floor(Math.random() * presence.engaged.length)];
      break;
    case 'environment':
      presenceAction =
        presence.environment[Math.floor(Math.random() * presence.environment.length)];
      break;
  }

  if (presenceAction) {
    injections.push(
      createHintInjection(
        'physical_presence',
        `[PHYSICAL PRESENCE: ${presenceAction}. Weave this naturally into your response if it fits - don't force it. A brief mention adds warmth.]`
      )
    );

    log.debug(
      { personaId, presenceType, presenceSource, presenceAction: presenceAction.slice(0, 50) },
      'Physical presence injected'
    );
  }

  return injections;
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder('physical_presence', buildPhysicalPresence);

export { buildPhysicalPresence, PERSONA_PRESENCE };
