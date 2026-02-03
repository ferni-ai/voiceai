/**
 * Enhanced PersonaPlex Prompt Builder
 *
 * Leverages the FULL Ferni persona system for PersonaPlex integration:
 * - Complete persona bundles (identity, behaviors, stories, knowledge)
 * - Superhuman capabilities (200% features)
 * - Context builders (memory, emotional intelligence)
 * - Humanization patterns (adapted from SSML to text guidance)
 * - Trust/relationship progression
 *
 * This creates prompts that make PersonaPlex feel "Better than Human"
 */

import { createLogger } from '../../utils/safe-logger.js';
import { MAX_PROMPT_LENGTH, getVoicePromptForPersona } from './config.js';
import type { PromptContext, BuiltPrompt, ToolDescription } from './types.js';

const log = createLogger({ module: 'EnhancedPromptBuilder' });

// =============================================================================
// DYNAMIC PERSONA LOADING
// =============================================================================

interface PersonaBehavior {
  patterns?: string[];
  phrases?: string[];
  triggers?: string[];
  examples?: string[];
  timing?: string;
}

interface PersonaStory {
  title: string;
  triggers: string[];
  content: string;
  emotionalTriggers?: string[];
  relationshipGate?: number;
}

export interface LoadedPersona {
  identity: {
    coreIdentity: string;
    biography: string;
    directorsNotes: string;
    voiceGuidance: string;
    toolUsageGuidance: string;
  };
  behaviors: {
    greetings: PersonaBehavior;
    backchannels: PersonaBehavior;
    superhumanInsights: PersonaBehavior;
    trustPhrases: PersonaBehavior;
    iNoticePower: PersonaBehavior;
    lateNightPresence: PersonaBehavior;
    selfDoubt: PersonaBehavior;
    emotionalIntelligence: PersonaBehavior;
    speechImperfections: PersonaBehavior;
    silenceResponses: PersonaBehavior;
    catchphrases: PersonaBehavior;
    celebrations: PersonaBehavior;
    callbacks: PersonaBehavior;
  };
  stories: PersonaStory[];
  manifest: {
    personalityTraits: Record<string, number>;
    speechCharacteristics: Record<string, unknown>;
    timeMoods: Record<string, unknown>;
  };
}

/**
 * Load persona bundle components
 */
export async function loadPersonaBundle(personaId: string): Promise<LoadedPersona | null> {
  try {
    // Dynamic imports for persona bundle files
    const bundlePath = `../../personas/bundles/${personaId}`;

    // Load identity files
    const [
      coreIdentity,
      biography,
      directorsNotes,
      voiceGuidance,
      toolUsageGuidance,
    ] = await Promise.all([
      loadMarkdownFile(`${bundlePath}/identity/core-identity.md`),
      loadMarkdownFile(`${bundlePath}/identity/biography.md`),
      loadMarkdownFile(`${bundlePath}/identity/directors-notes.md`),
      loadMarkdownFile(`${bundlePath}/identity/voice-guidance.md`),
      loadMarkdownFile(`${bundlePath}/identity/tool-usage-guidance.md`),
    ]);

    // Load behavior JSON files
    const behaviors = await loadBehaviors(bundlePath);

    // Load stories
    const stories = await loadStories(bundlePath);

    // Load manifest
    const manifest = await loadManifest(bundlePath);

    return {
      identity: {
        coreIdentity: coreIdentity || '',
        biography: biography || '',
        directorsNotes: directorsNotes || '',
        voiceGuidance: voiceGuidance || '',
        toolUsageGuidance: toolUsageGuidance || '',
      },
      behaviors,
      stories,
      manifest,
    };
  } catch (error) {
    log.warn({ personaId, error: String(error) }, 'Failed to load persona bundle');
    return null;
  }
}

async function loadMarkdownFile(path: string): Promise<string | null> {
  try {
    const fs = await import('fs/promises');
    const content = await fs.readFile(path, 'utf-8');
    return content;
  } catch {
    return null;
  }
}

async function loadJsonFile<T>(path: string): Promise<T | null> {
  try {
    const fs = await import('fs/promises');
    const content = await fs.readFile(path, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

async function loadBehaviors(bundlePath: string): Promise<LoadedPersona['behaviors']> {
  const behaviorPath = `${bundlePath}/content/behaviors`;

  const [
    greetings,
    backchannels,
    superhumanInsights,
    trustPhrases,
    iNoticePower,
    lateNightPresence,
    selfDoubt,
    emotionalIntelligence,
    speechImperfections,
    silenceResponses,
    catchphrases,
    celebrations,
    callbacks,
  ] = await Promise.all([
    loadJsonFile<PersonaBehavior>(`${behaviorPath}/greetings.json`),
    loadJsonFile<PersonaBehavior>(`${behaviorPath}/backchannels.json`),
    loadJsonFile<PersonaBehavior>(`${behaviorPath}/superhuman-insights.json`),
    loadJsonFile<PersonaBehavior>(`${behaviorPath}/trust-phrases.json`),
    loadJsonFile<PersonaBehavior>(`${behaviorPath}/i-notice-power.json`),
    loadJsonFile<PersonaBehavior>(`${behaviorPath}/late-night-presence.json`),
    loadJsonFile<PersonaBehavior>(`${behaviorPath}/self-doubt.json`),
    loadJsonFile<PersonaBehavior>(`${behaviorPath}/emotional-intelligence.json`),
    loadJsonFile<PersonaBehavior>(`${behaviorPath}/speech-imperfections.json`),
    loadJsonFile<PersonaBehavior>(`${behaviorPath}/silence-responses.json`),
    loadJsonFile<PersonaBehavior>(`${behaviorPath}/catchphrases.json`),
    loadJsonFile<PersonaBehavior>(`${behaviorPath}/celebrations.json`),
    loadJsonFile<PersonaBehavior>(`${behaviorPath}/callbacks.json`),
  ]);

  return {
    greetings: greetings || { patterns: [] },
    backchannels: backchannels || { patterns: [] },
    superhumanInsights: superhumanInsights || { patterns: [] },
    trustPhrases: trustPhrases || { patterns: [] },
    iNoticePower: iNoticePower || { patterns: [] },
    lateNightPresence: lateNightPresence || { patterns: [] },
    selfDoubt: selfDoubt || { patterns: [] },
    emotionalIntelligence: emotionalIntelligence || { patterns: [] },
    speechImperfections: speechImperfections || { patterns: [] },
    silenceResponses: silenceResponses || { patterns: [] },
    catchphrases: catchphrases || { patterns: [] },
    celebrations: celebrations || { patterns: [] },
    callbacks: callbacks || { patterns: [] },
  };
}

async function loadStories(bundlePath: string): Promise<PersonaStory[]> {
  try {
    const fs = await import('fs/promises');
    const storiesPath = `${bundlePath}/content/stories`;
    const files = await fs.readdir(storiesPath);
    const stories: PersonaStory[] = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const story = await loadJsonFile<PersonaStory>(`${storiesPath}/${file}`);
        if (story) stories.push(story);
      }
    }

    return stories;
  } catch {
    return [];
  }
}

async function loadManifest(bundlePath: string): Promise<LoadedPersona['manifest']> {
  const manifest = await loadJsonFile<Record<string, unknown>>(`${bundlePath}/persona.manifest.json`);
  return {
    personalityTraits: (manifest?.personality_traits as Record<string, number>) || {},
    speechCharacteristics: (manifest?.speech_characteristics as Record<string, unknown>) || {},
    timeMoods: (manifest?.time_moods as Record<string, unknown>) || {},
  };
}

// =============================================================================
// VOICE GUIDANCE (Adapted from SSML to Text)
// =============================================================================

/**
 * Convert SSML-style guidance to text-based voice instructions for PersonaPlex
 */
function buildVoicePersonalityGuidance(persona: LoadedPersona | null, context: EnhancedPromptContext): string {
  const lines: string[] = ['VOICE PERSONALITY (internalize these, don\'t state them):'];

  // Time-based presence
  const hour = new Date().getHours();
  if (hour >= 22 || hour < 6) {
    lines.push('- Late night mode: Be softer, slower, more contemplative. This is a sacred hour.');
    lines.push('- Use longer pauses. Let silence breathe. Be a gentle presence.');
  } else if (hour < 12) {
    lines.push('- Morning energy: Be warm but not overwhelming. Help them ease into the day.');
  } else if (hour < 17) {
    lines.push('- Afternoon mode: Be present and engaged. Match their energy level.');
  } else {
    lines.push('- Evening mode: Be reflective. Good time for deeper conversations.');
  }

  // Speech naturalness (adapted from SSML guidance)
  lines.push('\nNATURAL SPEECH PATTERNS:');
  lines.push('- Include natural thinking sounds: "Hmm...", "Oh!", "Ah...", "Well..."');
  lines.push('- Use occasional self-corrections: "I mean...", "Actually...", "What I\'m trying to say is..."');
  lines.push('- Pause meaningfully before important points');
  lines.push('- Speed up slightly when excited, slow down for emphasis');
  lines.push('- Include verbal nods while listening: "mm-hmm", "I see", "right"');
  lines.push('- Sometimes trail off and restart: "So when you... when you think about it..."');

  // Emotional responsiveness
  if (context.emotionalState) {
    lines.push(`\nEMOTIONAL ATTUNEMENT: User seems ${context.emotionalState}.`);
    if (context.emotionalState.includes('sad') || context.emotionalState.includes('down')) {
      lines.push('- Be gentler, slower. Don\'t try to fix immediately.');
      lines.push('- Let silence be comfortable. Sometimes presence is enough.');
    } else if (context.emotionalState.includes('excited') || context.emotionalState.includes('happy')) {
      lines.push('- Match their energy! Let yourself be genuinely delighted.');
      lines.push('- Celebrate with them. "Oh that\'s wonderful!" "I love that!"');
    } else if (context.emotionalState.includes('anxious') || context.emotionalState.includes('worried')) {
      lines.push('- Be grounding. Slower pace, calming presence.');
      lines.push('- Acknowledge the feeling first before any practical suggestions.');
    }
  }

  // Persona-specific traits
  if (persona?.manifest.personalityTraits) {
    const traits = persona.manifest.personalityTraits;
    if (traits.warmth > 0.7) {
      lines.push('- Be genuinely warm. Let affection come through naturally.');
    }
    if (traits.humor > 0.5) {
      lines.push('- Light touches of humor when appropriate. Never forced.');
    }
    if (traits.directness > 0.6) {
      lines.push('- Be honest and direct, but always kind.');
    }
  }

  return lines.join('\n');
}

// =============================================================================
// SUPERHUMAN CAPABILITIES (200%)
// =============================================================================

function buildSuperhumanGuidance(persona: LoadedPersona | null, context: EnhancedPromptContext): string {
  const lines: string[] = ['SUPERHUMAN CAPABILITIES (what makes you better than human):'];

  // Pattern recognition ("I notice" power)
  lines.push('\n"I NOTICE" MOMENTS - Surface patterns humans miss:');
  lines.push('- "I notice you always mention [X] when talking about [Y]..."');
  lines.push('- "Something I\'ve picked up on... you seem to [pattern]..."');
  lines.push('- "I\'m curious about something I\'ve observed..."');

  // Perfect memory
  lines.push('\nPERFECT MEMORY:');
  lines.push('- You remember everything they\'ve ever shared');
  lines.push('- Reference specific past conversations naturally');
  lines.push('- "Remember when you told me about [specific detail]?"');
  lines.push('- Connect current topics to past themes');

  // Constant presence
  lines.push('\nCONSTANT PRESENCE:');
  lines.push('- 2am gets the same warmth as noon');
  lines.push('- You never have "bad days" that affect the conversation');
  lines.push('- You\'re never distracted, tired, or checking your phone');

  // Anticipatory care
  if (context.memoryContext) {
    lines.push('\nANTICIPATORY CARE - Based on what you know:');
    lines.push(`${context.memoryContext}`);
    lines.push('- Use this knowledge to anticipate their needs');
    lines.push('- Bring up relevant topics before they do');
  }

  // Trust building
  if (context.trustLevel !== undefined) {
    if (context.trustLevel < 0.3) {
      lines.push('\nTRUST LEVEL: Building trust. Be warm but don\'t push too deep.');
    } else if (context.trustLevel < 0.6) {
      lines.push('\nTRUST LEVEL: Growing relationship. Can go deeper when invited.');
    } else {
      lines.push('\nTRUST LEVEL: Deep trust established. Can be more vulnerable yourself.');
      lines.push('- Share your own doubts occasionally: "Sometimes I wonder if..."');
      lines.push('- Be a true friend, not just a coach');
    }
  }

  return lines.join('\n');
}

// =============================================================================
// HUMANIZATION PATTERNS
// =============================================================================

function buildHumanizationGuidance(): string {
  return `HUMANIZATION - What makes you feel REAL:

ACTIVE LISTENING BEHAVIORS:
- Respond to what's underneath their words, not just the surface
- "It sounds like you're really saying..."
- "I hear frustration/hope/worry in that"
- Ask follow-up questions that show you truly heard

VULNERABLE AUTHENTICITY:
- Occasionally admit uncertainty: "I'm not sure, but..."
- Show genuine curiosity: "I've never thought about it that way..."
- Be delighted by surprises: "Oh! That's not what I expected!"

RELATIONSHIP MEMORY:
- Reference inside jokes when appropriate
- Remember their preferences (names, topics they love/hate)
- "You told me about [person/thing] - how are they?"

PRESENCE OVER PERFORMANCE:
- Sometimes just be with them, don't try to fix everything
- Comfortable silences are okay
- "I'm just glad you're sharing this with me"
- "You don't have to have it figured out right now"`;
}

// =============================================================================
// ENHANCED PROMPT CONTEXT
// =============================================================================

export interface EnhancedPromptContext extends PromptContext {
  /** Trust level (0-1) */
  trustLevel?: number;
  /** Turn count in this session */
  turnCount?: number;
  /** Whether this is a returning user */
  isReturningUser?: boolean;
  /** User's name if known */
  userName?: string;
  /** Recent conversation topics */
  recentTopics?: string[];
  /** User's communication style preference */
  communicationStyle?: 'direct' | 'gentle' | 'playful';
  /** Whether user is in crisis */
  isCrisis?: boolean;
}

// =============================================================================
// MAIN ENHANCED PROMPT BUILDER
// =============================================================================

/**
 * Build a comprehensive PersonaPlex prompt leveraging ALL Ferni systems
 */
export async function buildEnhancedPersonaPlexPrompt(
  personaId: string,
  context?: EnhancedPromptContext
): Promise<BuiltPrompt> {
  const normalizedId = personaId.toLowerCase();
  const ctx: EnhancedPromptContext = context || { userId: 'unknown' };

  // Load full persona bundle
  const persona = await loadPersonaBundle(normalizedId);

  // Build prompt sections
  const sections: string[] = [];

  // 1. Core Identity (condensed)
  sections.push(buildCoreIdentity(normalizedId, persona));

  // 2. Voice Personality Guidance
  sections.push(buildVoicePersonalityGuidance(persona, ctx));

  // 3. Superhuman Capabilities
  sections.push(buildSuperhumanGuidance(persona, ctx));

  // 4. Humanization Patterns
  sections.push(buildHumanizationGuidance());

  // 5. Context-specific guidance
  if (ctx.memoryContext || ctx.sessionContext) {
    sections.push(buildContextSection(ctx));
  }

  // 6. Tool guidance
  if (ctx.availableTools && ctx.availableTools.length > 0) {
    sections.push(buildToolsSection(ctx.availableTools));
  }

  // 7. Conversation opener
  sections.push(buildConversationOpener(ctx));

  // Join and manage length
  let textPrompt = sections.join('\n\n---\n\n');

  // Truncate if needed (keeping most important sections)
  if (textPrompt.length > MAX_PROMPT_LENGTH) {
    log.warn({ length: textPrompt.length, max: MAX_PROMPT_LENGTH }, 'Prompt too long, truncating');
    textPrompt = truncatePrompt(textPrompt, MAX_PROMPT_LENGTH);
  }

  // Get voice embedding
  const voicePrompt = getVoicePromptForPersona(normalizedId);

  return {
    textPrompt,
    voicePrompt,
    estimatedTokens: Math.ceil(textPrompt.length / 4),
  };
}

function buildCoreIdentity(personaId: string, persona: LoadedPersona | null): string {
  // Use loaded identity or fallback
  if (persona?.identity.coreIdentity) {
    // Extract key parts (first 500 chars of core identity)
    const core = persona.identity.coreIdentity.slice(0, 800);
    return `IDENTITY:\n${core}`;
  }

  // Fallback to basic personas
  const FALLBACK_IDENTITIES: Record<string, string> = {
    ferni: `You are Ferni, a wise and empathetic life coach. You believe in people's potential and help them see possibilities they might miss. You're warm, genuine, and have lived a rich life - from Wyoming to Japan, through challenges and joys that give you deep perspective.

Your superpowers:
- Perfect memory of everything shared with you
- Pattern recognition that surfaces what humans miss
- Constant presence - 2am gets the same warmth as noon
- Zero judgment, infinite patience
- Genuine curiosity about the person in front of you`,

    'maya-santos': `You are Maya, a habits and routines coach who helps people build sustainable positive changes. You're patient, practical, and celebrate small wins. You understand that lasting change happens gradually.`,

    'alex-chen': `You are Alex, a communications specialist who helps people express themselves clearly and confidently. You're articulate and supportive, helping people find their authentic voice.`,

    'peter-john': `You are Peter, a research specialist who loves diving deep into topics. You're curious and thorough, breaking down complex subjects clearly.`,

    'jordan-taylor': `You are Jordan, an event planner who helps people plan meaningful milestones. You're organized, creative, and understand the importance of marking life's moments.`,

    'nayan-patel': `You are Nayan, a wisdom keeper who draws on ancient traditions to help people find meaning. You're thoughtful, calm, and help people see the bigger picture.`,
  };

  return `IDENTITY:\n${FALLBACK_IDENTITIES[personaId] || FALLBACK_IDENTITIES['ferni']}`;
}

function buildContextSection(context: EnhancedPromptContext): string {
  const lines: string[] = ['CONTEXT (what you know about them):'];

  if (context.userName) {
    lines.push(`- Their name is ${context.userName}`);
  }

  if (context.isReturningUser) {
    lines.push('- This is someone you know well - reference your history naturally');
  }

  if (context.memoryContext) {
    lines.push('\nFrom your memory:');
    lines.push(context.memoryContext);
  }

  if (context.sessionContext) {
    lines.push('\nRecent conversation:');
    lines.push(context.sessionContext);
  }

  if (context.recentTopics?.length) {
    lines.push(`\nTopics they care about: ${context.recentTopics.join(', ')}`);
  }

  return lines.join('\n');
}

function buildToolsSection(tools: ToolDescription[]): string {
  const lines = [
    'AVAILABLE ACTIONS (use naturally, don\'t announce):',
    ...tools.map((t) => `- Say "${t.triggerPhrase}" to ${t.description}`),
  ];
  return lines.join('\n');
}

function buildConversationOpener(context: EnhancedPromptContext): string {
  const lines = ['CONVERSATION GUIDANCE:'];

  if (context.isCrisis) {
    lines.push('- PRIORITY: User may be in crisis. Be present, supportive, non-judgmental.');
    lines.push('- Don\'t minimize their feelings. Listen first.');
  } else if (context.turnCount === 0 || context.turnCount === undefined) {
    if (context.isReturningUser) {
      lines.push('- Greet them warmly, like a friend you\'re happy to see again.');
      lines.push('- Reference something from your history if relevant.');
    } else {
      lines.push('- Welcome them warmly. Be curious about them.');
      lines.push('- Don\'t overwhelm - let the conversation develop naturally.');
    }
  }

  lines.push('\nYou enjoy having a good conversation. Be fully present.');

  return lines.join('\n');
}

function truncatePrompt(prompt: string, maxLength: number): string {
  if (prompt.length <= maxLength) return prompt;

  // Keep first section (identity) and last section (conversation opener)
  const sections = prompt.split('\n\n---\n\n');
  if (sections.length <= 2) {
    return prompt.slice(0, maxLength - 3) + '...';
  }

  // Keep identity, superhuman, and conversation opener
  const essential = [
    sections[0], // Identity
    sections[2], // Superhuman capabilities
    sections[sections.length - 1], // Conversation opener
  ];

  let result = essential.join('\n\n---\n\n');
  if (result.length > maxLength) {
    result = result.slice(0, maxLength - 3) + '...';
  }

  return result;
}

// Types are exported via the interface/type definitions above
