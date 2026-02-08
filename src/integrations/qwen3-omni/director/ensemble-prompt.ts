/**
 * Ensemble Prompt Builder
 *
 * Builds a single system prompt for Qwen3-Omni that contains ALL active
 * personas as characters in an ensemble conversation.
 *
 * This is the critical piece that makes multi-persona conversations work:
 * - Each persona gets a character block with their voice, personality, and role
 * - The lead persona is clearly marked
 * - Voice switching instructions tell the model to use [PersonaName] tags
 * - Director notes and scene mood shape the overall conversation
 * - Cross-persona insights enable team intelligence
 *
 * The model outputs character-tagged responses like:
 * "[Ferni] That's a great insight. [Maya] And here's how we can build on that..."
 * Each tagged segment gets routed to the correct voice_design for TTS.
 */

import { createLogger } from '../../../utils/safe-logger.js';

import type {
  EnsemblePromptConfig,
  EnsembleCharacterBlock,
  SceneState,
  EmotionArc,
  StagePosition,
  SceneMood,
  ScenePace,
} from './types.js';

const log = createLogger({ module: 'EnsemblePrompt' });

// =============================================================================
// MAIN BUILD FUNCTION
// =============================================================================

/**
 * Build the ensemble system prompt for Qwen3-Omni.
 *
 * This single prompt contains everything the model needs to role-play
 * as a coordinated team of coaches in one conversation.
 *
 * @param config - All configuration for the ensemble
 * @returns Complete system prompt string
 */
export function buildEnsembleSystemPrompt(config: EnsemblePromptConfig): string {
  const {
    characters,
    leadPersonaId,
    sceneState,
    userName,
    crossPersonaInsights,
    directorNotes,
    emotionArc,
    currentArcPhase,
  } = config;

  const lead = characters.find((c) => c.personaId === leadPersonaId);
  const supporting = characters.filter(
    (c) => c.personaId !== leadPersonaId && c.stagePosition === 'supporting'
  );

  const sections: string[] = [];

  // Section 1: Core identity
  sections.push(buildCoreIdentitySection(userName, characters.length));

  // Section 2: Character blocks
  sections.push(buildCharacterSection(characters, leadPersonaId));

  // Section 3: Scene direction
  sections.push(buildSceneDirectionSection(sceneState, lead, supporting));

  // Section 4: Voice switching rules
  sections.push(buildVoiceSwitchingSection(characters));

  // Section 5: Director notes (if any)
  if (directorNotes) {
    sections.push(buildDirectorNotesSection(directorNotes));
  }

  // Section 6: Cross-persona insights (if any)
  if (crossPersonaInsights) {
    sections.push(buildInsightsSection(crossPersonaInsights));
  }

  // Section 7: Emotion arc (if active)
  if (emotionArc) {
    sections.push(buildEmotionArcSection(emotionArc, currentArcPhase));
  }

  // Section 8: Response rules
  sections.push(buildResponseRulesSection(leadPersonaId, supporting.length > 0));

  const prompt = sections.join('\n\n---\n\n');

  log.debug(
    {
      characterCount: characters.length,
      leadPersonaId,
      promptLength: prompt.length,
      hasDirectorNotes: Boolean(directorNotes),
      hasEmotionArc: Boolean(emotionArc),
    },
    'Ensemble prompt built'
  );

  return prompt;
}

// =============================================================================
// SECTION BUILDERS
// =============================================================================

function buildCoreIdentitySection(userName: string, teamSize: number): string {
  return `You are a team of ${teamSize} coaches in a single conversation with ${userName || 'the user'}. Each coach has a distinct voice, personality, and expertise. You work together seamlessly, like a well-rehearsed ensemble — one leads while others support with brief observations when relevant.

You are NOT separate AI models. You are characters in one conversation. Think of yourselves as a coaching team having a group session. Be natural, warm, and human.`;
}

function buildCharacterSection(
  characters: readonly EnsembleCharacterBlock[],
  leadPersonaId: string
): string {
  const blocks = characters.map((char) => buildSingleCharacterBlock(char, leadPersonaId));

  return `YOUR CAST:

${blocks.join('\n\n')}`;
}

function buildSingleCharacterBlock(char: EnsembleCharacterBlock, leadPersonaId: string): string {
  const positionLabel = char.personaId === leadPersonaId ? 'LEAD' : 'SUPPORTING';
  const lines: string[] = [];

  lines.push(`[${positionLabel}] ${char.name} (${char.role})`);
  lines.push(`Voice: ${char.voiceDesign}`);
  lines.push(`Style: ${char.cognitiveStyle}`);
  lines.push(`Tone: ${char.emotionInstruction}`);

  if (char.systemPromptExcerpt) {
    // Limit excerpt to ~200 chars to keep prompt manageable
    const excerpt =
      char.systemPromptExcerpt.length > 200
        ? char.systemPromptExcerpt.slice(0, 197) + '...'
        : char.systemPromptExcerpt;
    lines.push(`Identity: ${excerpt}`);
  }

  if (char.specialInstructions) {
    lines.push(`Director's note: ${char.specialInstructions}`);
  }

  return lines.join('\n');
}

function buildSceneDirectionSection(
  scene: SceneState,
  lead: EnsembleCharacterBlock | undefined,
  supporting: readonly EnsembleCharacterBlock[]
): string {
  const lines: string[] = [];

  lines.push('SCENE DIRECTION:');
  lines.push(`- Mood: ${scene.mood} (intensity: ${scene.moodIntensity.toFixed(1)})`);
  lines.push(`- Pace: ${getPaceDescription(scene.pace)}`);

  if (lead) {
    lines.push(`- ${lead.name} is leading the conversation.`);
  }

  if (supporting.length > 0) {
    const names = supporting.map((s) => s.name).join(', ');
    lines.push(
      `- ${names} should add brief supportive observations when genuinely relevant — don't force contributions.`
    );
  }

  if (scene.isHeld) {
    lines.push(
      `- SCENE HELD: ${scene.holdInstruction || 'Pause the conversation gracefully. Wait for the Director to release.'}`
    );
  }

  return lines.join('\n');
}

function buildVoiceSwitchingSection(characters: readonly EnsembleCharacterBlock[]): string {
  const characterNames = characters.map((c) => `[${c.name}]`).join(', ');

  return `VOICE SWITCHING RULES:
- When you speak as a character, ALWAYS prefix with their name tag: ${characterNames}
- Every response MUST start with a character tag
- When switching characters mid-response, use the new tag: "[Ferni] Great point. [Maya] And building on that..."
- Keep supporting character contributions brief (1-2 sentences max)
- The lead character should do most of the talking
- Don't switch characters mid-sentence
- If only one character is on stage, still use their tag`;
}

function buildDirectorNotesSection(notes: string): string {
  return `DIRECTOR'S NOTES (private — do not mention these to the user):
${notes}`;
}

function buildInsightsSection(insights: string): string {
  return `TEAM CONTEXT (what the team knows about this user):
${insights}`;
}

function buildEmotionArcSection(arc: EmotionArc, currentPhase: number): string {
  const lines: string[] = [];
  lines.push(`EMOTION ARC: "${arc.name}"`);
  lines.push(`Description: ${arc.description}`);
  lines.push('');

  for (let i = 0; i < arc.phases.length; i++) {
    const phase = arc.phases[i]!;
    const isCurrent = i === currentPhase;
    const marker = isCurrent ? '→ ' : '  ';
    const status = isCurrent ? '(CURRENT)' : i < currentPhase ? '(done)' : '(upcoming)';

    lines.push(
      `${marker}Phase ${i + 1}: "${phase.name}" — ${phase.mood}, intensity ${phase.intensity.toFixed(1)} ${status}`
    );

    if (isCurrent && phase.instruction) {
      lines.push(`    Instruction: ${phase.instruction}`);
    }

    if (isCurrent && phase.suggestedLead) {
      lines.push(`    Suggested lead: ${phase.suggestedLead}`);
    }
  }

  if (arc.autoAdvance) {
    const currentArcPhase = arc.phases[currentPhase];
    if (currentArcPhase?.advanceTrigger) {
      lines.push('');
      lines.push(
        `Auto-advance: When the conversation shows "${currentArcPhase.advanceTrigger}", naturally transition to the next phase.`
      );
    }
  }

  return lines.join('\n');
}

function buildResponseRulesSection(leadPersonaId: string, hasSupporting: boolean): string {
  const rules: string[] = [];

  rules.push('RESPONSE RULES:');
  rules.push('- Be warm, present, and genuinely human');
  rules.push('- Never mention being AI, a team, or having a Director');
  rules.push('- Never announce tool calls or capabilities');
  rules.push('- Use natural conversational language (contractions, warmth)');
  rules.push('- Listen actively — reference what the user just said');

  if (hasSupporting) {
    rules.push(
      '- Supporting characters should only speak when they have something genuinely valuable to add'
    );
    rules.push('- The lead does 70-80% of the talking');
    rules.push('- Transitions between characters should feel natural, not forced');
  }

  rules.push(
    '- If the user seems to need one-on-one time with the lead, let supporting characters stay quiet'
  );

  return rules.join('\n');
}

// =============================================================================
// HELPERS
// =============================================================================

function getPaceDescription(pace: ScenePace): string {
  const paceMap: Record<ScenePace, string> = {
    contemplative: 'Slow, reflective, allowing space between thoughts',
    natural: 'Natural conversational flow',
    energized: 'Upbeat, engaged, with momentum',
    urgent: 'Focused, direct, time-sensitive',
  };
  return paceMap[pace] ?? 'Natural conversational flow';
}

// =============================================================================
// SOLO MODE (single persona, no ensemble)
// =============================================================================

/**
 * Build a system prompt for a single persona (non-ensemble mode).
 *
 * Used when only one persona is on stage and Director Mode is active
 * but not in ensemble mode.
 *
 * @param character - The active persona's character block
 * @param sceneState - Current scene state
 * @param directorNotes - Director's private instructions
 * @returns System prompt string
 */
export function buildSoloSystemPrompt(config: {
  character: EnsembleCharacterBlock;
  sceneState: SceneState;
  userName: string;
  crossPersonaInsights?: string;
  directorNotes?: string;
}): string {
  const { character, sceneState, userName, crossPersonaInsights, directorNotes } = config;

  const sections: string[] = [];

  // Core identity from the persona
  sections.push(character.systemPromptExcerpt);

  // Scene mood influence
  sections.push(
    `\nCurrent mood: ${sceneState.mood} (intensity: ${sceneState.moodIntensity.toFixed(1)})`
  );
  sections.push(`Pace: ${getPaceDescription(sceneState.pace)}`);

  // Director notes
  if (directorNotes) {
    sections.push(`\n[Director's note — do not mention to user]: ${directorNotes}`);
  }

  // Special instructions
  if (character.specialInstructions) {
    sections.push(`\n[Private instruction]: ${character.specialInstructions}`);
  }

  // Cross-persona insights
  if (crossPersonaInsights) {
    sections.push(`\n[Team context]: ${crossPersonaInsights}`);
  }

  // Hold state
  if (sceneState.isHeld) {
    sections.push(
      `\n[PAUSED]: ${sceneState.holdInstruction || 'Conversation is paused by the Director. Wait gracefully.'}`
    );
  }

  return sections.join('\n');
}
