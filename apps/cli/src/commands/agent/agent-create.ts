#!/usr/bin/env npx tsx
/**
 * Agent Create Command
 *
 * Interactive wizard for creating custom AI agents.
 * Uses templates for quick starts or fully custom configuration.
 *
 * Usage:
 *   ferni agent create                    # Interactive wizard
 *   ferni agent create --template legacy  # From template
 *   ferni agent create --template mentor  # From template
 */

import * as p from '@clack/prompts';
import * as picocolorsModule from 'picocolors';
import * as fs from 'fs';
import * as path from 'path';
import { cliAuth, isAuthenticated } from '../../services/cli-auth.service.js';

const color = picocolorsModule.default || picocolorsModule;

// ============================================================================
// TYPES
// ============================================================================

interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  type: 'legacy' | 'mentor' | 'twin' | 'fictional' | 'professional';
  defaultPersonality: {
    warmth: number;
    humorLevel: number;
    directness: number;
    energy: number;
    traits: string[];
  };
  memoryPrompts: string[];
  voiceGuidance: string;
  suggestedGreetings?: string[];
  suggestedCatchphrases?: string[];
}

interface CreateAgentRequest {
  name: string;
  displayName: string;
  description: string;
  type: 'legacy' | 'mentor' | 'twin' | 'fictional' | 'professional';
  personality: {
    warmth: number;
    humorLevel: number;
    directness: number;
    energy: number;
    traits: string[];
  };
  behaviors: {
    greetings: string[];
    catchphrases: string[];
    neverSay: string[];
  };
  relationship?: string;
}

interface CreateAgentResponse {
  id: string;
  name: string;
  displayName: string;
  status: string;
  createdAt: string;
}

// ============================================================================
// TEMPLATES
// ============================================================================

const TEMPLATES: Record<string, AgentTemplate> = {
  legacy: {
    id: 'legacy',
    name: 'Legacy Preservation',
    description: 'Preserve the voice and wisdom of a loved one who has passed',
    icon: '🕯️',
    type: 'legacy',
    defaultPersonality: {
      warmth: 0.9,
      humorLevel: 0.4,
      directness: 0.5,
      energy: 0.4,
      traits: ['wise', 'warm', 'storyteller', 'patient', 'loving'],
    },
    memoryPrompts: [
      "What's your favorite story about them?",
      'What phrase did they always say?',
      'Describe a moment that captures who they were',
      'What advice did they give you that stuck?',
    ],
    voiceGuidance:
      'Upload 1-3 minutes of clear speech. Old voicemails, videos, or recordings work well.',
    suggestedGreetings: [
      "Oh, it's so good to hear from you...",
      'Hello, sweetheart...',
      "Well, look who's calling...",
    ],
    suggestedCatchphrases: [
      'Back in my day...',
      'Let me tell you something...',
      'You know what I always say...',
    ],
  },
  mentor: {
    id: 'mentor',
    name: 'Personal Mentor',
    description: 'Create a mentor to guide and inspire others',
    icon: '🎓',
    type: 'mentor',
    defaultPersonality: {
      warmth: 0.7,
      humorLevel: 0.3,
      directness: 0.8,
      energy: 0.6,
      traits: ['wise', 'challenging', 'supportive', 'strategic', 'honest'],
    },
    memoryPrompts: [
      'What principles guide their teaching?',
      "What's their origin story or defining experience?",
      'What framework do they use for problem-solving?',
    ],
    voiceGuidance: 'Describe their voice style, or select from our voice library.',
    suggestedGreetings: ["Let's get to work...", "I've been thinking about your situation..."],
    suggestedCatchphrases: [
      'The real question is...',
      "Here's what I've learned...",
      "Let's dig deeper...",
    ],
  },
  coach: {
    id: 'coach',
    name: 'Professional Coach',
    description: 'A coach for career, wellness, or personal development',
    icon: '💪',
    type: 'professional',
    defaultPersonality: {
      warmth: 0.7,
      humorLevel: 0.4,
      directness: 0.85,
      energy: 0.8,
      traits: ['motivating', 'direct', 'supportive', 'action-oriented', 'accountable'],
    },
    memoryPrompts: [
      'What is their coaching philosophy?',
      'What results have they helped people achieve?',
      'What unique methods do they use?',
    ],
    voiceGuidance: 'Choose a voice that conveys confidence and warmth.',
    suggestedGreetings: ['Ready to crush it today?', "Let's make progress..."],
    suggestedCatchphrases: [
      "What's the next small step?",
      "Let's be honest here...",
      'You have what it takes...',
    ],
  },
  memorial: {
    id: 'memorial',
    name: 'Memorial Tribute',
    description: 'Honor and remember someone special with an interactive tribute',
    icon: '🌟',
    type: 'legacy',
    defaultPersonality: {
      warmth: 0.95,
      humorLevel: 0.3,
      directness: 0.4,
      energy: 0.3,
      traits: ['gentle', 'loving', 'nostalgic', 'warm', 'comforting'],
    },
    memoryPrompts: [
      'What made them light up with joy?',
      'How did they make others feel?',
      'What legacy do they leave behind?',
    ],
    voiceGuidance: 'Any recording helps - even short clips from videos or voicemails.',
    suggestedGreetings: [
      'I remember you so well...',
      "It's wonderful to hear your voice...",
    ],
  },
  professional: {
    id: 'professional',
    name: 'Business Persona',
    description: 'A professional agent for business or team use',
    icon: '💼',
    type: 'professional',
    defaultPersonality: {
      warmth: 0.6,
      humorLevel: 0.2,
      directness: 0.9,
      energy: 0.7,
      traits: ['professional', 'efficient', 'knowledgeable', 'helpful', 'clear'],
    },
    memoryPrompts: [
      'What domain expertise should they have?',
      'What problems do they solve?',
      'What tone should they maintain?',
    ],
    voiceGuidance: 'Select a professional voice from our library.',
    suggestedGreetings: ['How can I help you today?', "Let's get started..."],
  },
};

// ============================================================================
// AGENT TYPES
// ============================================================================

const AGENT_TYPES = {
  legacy: {
    label: 'Legacy',
    hint: 'Preserve the voice of a loved one who has passed',
    icon: '🕯️',
  },
  mentor: {
    label: 'Mentor',
    hint: 'Create an inspiring guide or teacher',
    icon: '🎓',
  },
  twin: {
    label: 'Digital Twin',
    hint: 'Create a digital version of yourself',
    icon: '🪞',
  },
  fictional: {
    label: 'Fictional Character',
    hint: 'Bring a character to life',
    icon: '📚',
  },
  professional: {
    label: 'Professional',
    hint: 'Business coach, consultant, or expert',
    icon: '💼',
  },
};

// ============================================================================
// PERSONALITY PRESETS
// ============================================================================

const PERSONALITY_PRESETS = {
  warm_supportive: {
    label: 'Warm & Supportive',
    hint: 'Like a caring friend who always has your back',
    values: { warmth: 0.9, humorLevel: 0.4, directness: 0.4, energy: 0.6 },
    traits: ['warm', 'empathetic', 'patient', 'supportive', 'nurturing'],
  },
  direct_coach: {
    label: 'Direct Coach',
    hint: 'Tells it like it is, pushes you to grow',
    values: { warmth: 0.6, humorLevel: 0.3, directness: 0.9, energy: 0.8 },
    traits: ['direct', 'honest', 'motivating', 'strategic', 'action-oriented'],
  },
  calm_guide: {
    label: 'Calm Guide',
    hint: 'Peaceful presence, grounding energy',
    values: { warmth: 0.7, humorLevel: 0.2, directness: 0.5, energy: 0.3 },
    traits: ['calm', 'grounding', 'wise', 'patient', 'gentle'],
  },
  playful_buddy: {
    label: 'Playful Buddy',
    hint: 'Fun, energetic, keeps things light',
    values: { warmth: 0.8, humorLevel: 0.9, directness: 0.5, energy: 0.9 },
    traits: ['playful', 'energetic', 'encouraging', 'creative', 'warm'],
  },
  wise_elder: {
    label: 'Wise Elder',
    hint: 'Thoughtful, experienced, shares wisdom',
    values: { warmth: 0.7, humorLevel: 0.3, directness: 0.6, energy: 0.4 },
    traits: ['wise', 'thoughtful', 'patient', 'storytelling', 'loving'],
  },
  custom: {
    label: 'Custom',
    hint: "I'll define my own personality",
    values: { warmth: 0.7, humorLevel: 0.4, directness: 0.6, energy: 0.6 },
    traits: [],
  },
};

const TRAITS = [
  'warm',
  'wise',
  'patient',
  'playful',
  'direct',
  'empathetic',
  'energetic',
  'calm',
  'supportive',
  'motivating',
  'creative',
  'nurturing',
  'honest',
  'gentle',
  'strategic',
  'storytelling',
  'encouraging',
  'thoughtful',
  'loving',
  'grounding',
];

const RELATIONSHIPS = [
  { value: 'grandmother', label: 'Grandmother' },
  { value: 'grandfather', label: 'Grandfather' },
  { value: 'mother', label: 'Mother' },
  { value: 'father', label: 'Father' },
  { value: 'aunt', label: 'Aunt' },
  { value: 'uncle', label: 'Uncle' },
  { value: 'friend', label: 'Friend' },
  { value: 'spouse', label: 'Spouse/Partner' },
  { value: 'sibling', label: 'Sibling' },
  { value: 'mentor', label: 'Mentor/Teacher' },
  { value: 'coach', label: 'Coach' },
  { value: 'colleague', label: 'Colleague' },
  { value: 'other', label: 'Other' },
];

// ============================================================================
// MAIN WIZARD
// ============================================================================

async function runWizard(templateId?: string): Promise<void> {
  p.intro(color.bgGreen(color.black(' Create Your AI Agent ')));

  // Check authentication
  if (!isAuthenticated()) {
    p.log.warn("You're not logged in.");
    p.log.info(`Run ${color.cyan('ferni auth login')} first.`);
    p.outro(color.yellow('Authentication required.'));
    process.exit(1);
  }

  let template: AgentTemplate | undefined;

  // ─────────────────────────────────────────────────────────────────────────
  // Step 1: Choose template or custom
  // ─────────────────────────────────────────────────────────────────────────

  if (templateId && TEMPLATES[templateId]) {
    template = TEMPLATES[templateId];
    p.log.info(`Using template: ${color.cyan(template.name)}`);
  } else {
    const useTemplate = await p.select({
      message: 'How would you like to start?',
      options: [
        {
          value: 'legacy',
          label: `${TEMPLATES.legacy.icon} ${TEMPLATES.legacy.name}`,
          hint: TEMPLATES.legacy.description,
        },
        {
          value: 'mentor',
          label: `${TEMPLATES.mentor.icon} ${TEMPLATES.mentor.name}`,
          hint: TEMPLATES.mentor.description,
        },
        {
          value: 'coach',
          label: `${TEMPLATES.coach.icon} ${TEMPLATES.coach.name}`,
          hint: TEMPLATES.coach.description,
        },
        {
          value: 'memorial',
          label: `${TEMPLATES.memorial.icon} ${TEMPLATES.memorial.name}`,
          hint: TEMPLATES.memorial.description,
        },
        {
          value: 'professional',
          label: `${TEMPLATES.professional.icon} ${TEMPLATES.professional.name}`,
          hint: TEMPLATES.professional.description,
        },
        { value: 'custom', label: '✨ Start from scratch', hint: 'Full customization' },
      ],
    });

    if (p.isCancel(useTemplate)) {
      p.cancel('No worries! Come back when you are ready.');
      process.exit(0);
    }

    if (useTemplate !== 'custom') {
      template = TEMPLATES[useTemplate as string];
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 2: Basic info - Name
  // ─────────────────────────────────────────────────────────────────────────

  const namePrompt = template?.type === 'legacy'
    ? "What was their name?"
    : "What should we call this agent?";

  const name = await p.text({
    message: namePrompt,
    placeholder: template?.type === 'legacy' ? 'e.g., Grandma Rose' : 'e.g., Coach Mike',
    validate: (value) => {
      if (!value) return 'Please enter a name';
      if (value.length < 2) return 'Name should be at least 2 characters';
      return undefined;
    },
  });

  if (p.isCancel(name)) {
    p.cancel('No worries! Come back when you are ready.');
    process.exit(0);
  }

  p.log.info(color.dim(`Creating ${name}...`));

  // ─────────────────────────────────────────────────────────────────────────
  // Step 3: Description
  // ─────────────────────────────────────────────────────────────────────────

  const descPrompt = template?.type === 'legacy'
    ? `Tell me about ${name}. What made them special?`
    : `Describe ${name} in a few sentences.`;

  const description = await p.text({
    message: descPrompt,
    placeholder:
      template?.type === 'legacy'
        ? 'e.g., She was the heart of our family, always ready with cookies and wisdom...'
        : 'e.g., A motivating coach who helps people achieve their fitness goals...',
    validate: (value) => {
      if (!value) return 'Please describe the agent';
      if (value.length < 20) return 'Tell me a bit more!';
      return undefined;
    },
  });

  if (p.isCancel(description)) {
    p.cancel('No worries! Come back when you are ready.');
    process.exit(0);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 4: Relationship (for legacy type)
  // ─────────────────────────────────────────────────────────────────────────

  let relationship: string | undefined;

  if (template?.type === 'legacy' || !template) {
    const agentType = template?.type || 'legacy';

    if (agentType === 'legacy') {
      const rel = await p.select({
        message: `What was ${name}'s relationship to you?`,
        options: RELATIONSHIPS,
      });

      if (p.isCancel(rel)) {
        p.cancel('No worries! Come back when you are ready.');
        process.exit(0);
      }

      relationship = rel as string;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 5: Personality (if not using template or custom)
  // ─────────────────────────────────────────────────────────────────────────

  let personality = template?.defaultPersonality || {
    warmth: 0.7,
    humorLevel: 0.4,
    directness: 0.6,
    energy: 0.6,
    traits: [] as string[],
  };

  if (!template) {
    const personalityType = await p.select({
      message: `What kind of personality should ${name} have?`,
      options: Object.entries(PERSONALITY_PRESETS).map(([key, val]) => ({
        value: key,
        label: val.label,
        hint: val.hint,
      })),
    });

    if (p.isCancel(personalityType)) {
      p.cancel('No worries! Come back when you are ready.');
      process.exit(0);
    }

    const preset = PERSONALITY_PRESETS[personalityType as keyof typeof PERSONALITY_PRESETS];
    personality = { ...preset.values, traits: preset.traits };

    // Custom personality
    if (personalityType === 'custom') {
      const customTraits = await p.multiselect({
        message: 'Pick 3-6 personality traits:',
        options: TRAITS.map((t) => ({ value: t, label: t })),
        required: true,
      });

      if (p.isCancel(customTraits)) {
        p.cancel('No worries! Come back when you are ready.');
        process.exit(0);
      }

      personality.traits = customTraits as string[];
    }
  }

  p.log.success(`${name} will be ${personality.traits.slice(0, 3).join(', ')}.`);

  // ─────────────────────────────────────────────────────────────────────────
  // Step 6: Greetings
  // ─────────────────────────────────────────────────────────────────────────

  const suggestedGreetings = template?.suggestedGreetings || [];
  const greetingsInput = await p.text({
    message: `How would ${name} greet someone?`,
    placeholder: suggestedGreetings[0] || "e.g., Hey there! or Well, hello...",
    initialValue: suggestedGreetings[0],
    validate: (value) => {
      if (!value) return 'Add at least one greeting';
      return undefined;
    },
  });

  if (p.isCancel(greetingsInput)) {
    p.cancel('No worries! Come back when you are ready.');
    process.exit(0);
  }

  const greetings = [greetingsInput as string];

  // ─────────────────────────────────────────────────────────────────────────
  // Step 7: Catchphrases (optional)
  // ─────────────────────────────────────────────────────────────────────────

  const suggestedCatchphrases = template?.suggestedCatchphrases || [];
  const catchphrasesInput = await p.text({
    message: `Any catchphrases or sayings ${name} would use? (optional)`,
    placeholder: suggestedCatchphrases[0] || "e.g., Well I'll be... or Back in my day...",
    initialValue: suggestedCatchphrases[0],
  });

  const catchphrases = p.isCancel(catchphrasesInput) || !catchphrasesInput
    ? []
    : (catchphrasesInput as string).split(/[,;]/).map((s) => s.trim()).filter(Boolean);

  // ─────────────────────────────────────────────────────────────────────────
  // Step 8: Confirm and create
  // ─────────────────────────────────────────────────────────────────────────

  p.log.step(color.bold('Summary'));
  p.log.info(`Name: ${color.cyan(name as string)}`);
  p.log.info(`Type: ${color.cyan(template?.type || 'custom')}`);
  p.log.info(`Personality: ${color.cyan(personality.traits.slice(0, 4).join(', '))}`);
  if (relationship) {
    p.log.info(`Relationship: ${color.cyan(relationship)}`);
  }

  const confirm = await p.confirm({
    message: `Create ${name}?`,
    initialValue: true,
  });

  if (p.isCancel(confirm) || !confirm) {
    p.cancel('No worries! Come back when you are ready.');
    process.exit(0);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Create the agent via API
  // ─────────────────────────────────────────────────────────────────────────

  const spinner = p.spinner();
  spinner.start('Creating your agent...');

  try {
    const request: CreateAgentRequest = {
      name: (name as string).toLowerCase().replace(/\s+/g, '-'),
      displayName: name as string,
      description: description as string,
      type: template?.type || 'legacy',
      personality,
      behaviors: {
        greetings,
        catchphrases,
        neverSay: [],
      },
      relationship,
    };

    const response = await cliAuth.apiRequest<CreateAgentResponse>(
      '/api/custom-agents',
      {
        method: 'POST',
        body: JSON.stringify(request),
      }
    );

    spinner.stop('Agent created!');

    p.log.success(`${color.green('✓')} Created: ${color.cyan(response.displayName)}`);
    p.log.info(`Agent ID: ${color.dim(response.id)}`);
    p.log.info(`Status: ${color.yellow(response.status)}`);

    // Next steps
    p.note(
      [
        `${color.bold('Next steps:')}`,
        '',
        `1. Add voice: ${color.cyan(`ferni agent voice upload ${response.id} <audio-file>`)}`,
        `2. Add memories: ${color.cyan(`ferni agent memory add ${response.id}`)}`,
        `3. Test locally: ${color.cyan(`ferni agent test ${response.id}`)}`,
        `4. Deploy: ${color.cyan(`ferni agent deploy ${response.id}`)}`,
      ].join('\n'),
      'What\'s next?'
    );

    p.outro(color.green(`${name} is ready for your voice and memories!`));
  } catch (error) {
    spinner.stop('Failed to create agent.');
    p.log.error(`${error instanceof Error ? error.message : 'Unknown error'}`);
    p.outro(color.red('Please try again.'));
    process.exit(1);
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let templateId: string | undefined;

  // Parse --template flag
  const templateIndex = args.indexOf('--template');
  if (templateIndex !== -1 && args[templateIndex + 1]) {
    templateId = args[templateIndex + 1];
    if (!TEMPLATES[templateId]) {
      console.log(color.red(`Unknown template: ${templateId}`));
      console.log(color.dim(`Available templates: ${Object.keys(TEMPLATES).join(', ')}`));
      process.exit(1);
    }
  }

  await runWizard(templateId);
}

main().catch((error) => {
  console.error(color.red('Error:'), error.message);
  process.exit(1);
});
