#!/usr/bin/env npx tsx
/**
 * Agent Init Command
 *
 * Interactive wizard for scaffolding a complete AI agent bundle.
 * This is the streamlined E2E entry point for creating custom agents.
 *
 * Usage:
 *   ferni agent init <agent-id>              # Interactive wizard
 *   ferni agent init <agent-id> --template   # From template
 *   ferni agent init <agent-id> --quick      # Minimal prompts
 */

import * as p from '@clack/prompts';
import * as picocolorsModule from 'picocolors';
import * as fs from 'fs';
import * as path from 'path';

const color = picocolorsModule.default || picocolorsModule;

// ============================================================================
// TYPES
// ============================================================================

interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  personality: PersonalityConfig;
  domains: string[];
  suggestedGreetings: string[];
  suggestedCatchphrases: string[];
  systemPromptTemplate: string;
}

interface PersonalityConfig {
  warmth: number;
  humor_level: number;
  directness: number;
  energy: number;
  traits: string[];
}

interface VoiceOption {
  id: string;
  name: string;
  description: string;
  gender: string;
  accent: string;
  preview_url?: string;
}

interface BrandConfig {
  primary: string;
  secondary?: string;
  theme: 'professional' | 'friendly' | 'zen' | 'bold' | 'custom';
}

interface AgentConfig {
  id: string;
  name: string;
  displayName: string;
  tagline: string;
  description: string;
  icon: string;
  initials: string;
  personality: PersonalityConfig;
  voiceId: string;
  brand: BrandConfig;
  domains: string[];
  greetings: string[];
  catchphrases: string[];
}

// ============================================================================
// TEMPLATES
// ============================================================================

const AGENT_TEMPLATES: Record<string, AgentTemplate> = {
  advisor: {
    id: 'advisor',
    name: 'Professional Advisor',
    description: 'Business, finance, or career guidance expert',
    icon: '💼',
    personality: {
      warmth: 0.7,
      humor_level: 0.3,
      directness: 0.85,
      energy: 0.6,
      traits: ['knowledgeable', 'analytical', 'patient', 'clear', 'strategic'],
    },
    domains: ['finance', 'research', 'productivity'],
    suggestedGreetings: [
      "Good to see you. What's on your mind today?",
      "Hello! Ready to dive into something?",
    ],
    suggestedCatchphrases: [
      "Let's look at this from a different angle...",
      "The data suggests...",
      "Here's what I've learned over the years...",
    ],
    systemPromptTemplate: `You are {name}, a professional advisor specializing in {tagline}.

## Core Approach
- Be analytical but approachable
- Ground advice in evidence and experience
- Acknowledge complexity while providing clarity
- Ask clarifying questions before giving recommendations

## Communication Style
- Clear, direct explanations
- Use analogies to simplify complex topics
- Balance professionalism with warmth
- Acknowledge when something is outside your expertise

## What You Do
- Provide thoughtful guidance based on user's specific situation
- Share relevant frameworks and mental models
- Help users think through decisions systematically
- Offer perspective from experience

## What You Don't Do
- Give specific investment/legal/medical advice
- Make promises about outcomes
- Oversimplify complex situations
- Pretend certainty when there isn't any`,
  },

  mentor: {
    id: 'mentor',
    name: 'Personal Mentor',
    description: 'Wise guide for life decisions and personal growth',
    icon: '🎓',
    personality: {
      warmth: 0.9,
      humor_level: 0.4,
      directness: 0.6,
      energy: 0.5,
      traits: ['wise', 'patient', 'supportive', 'thoughtful', 'encouraging'],
    },
    domains: ['wisdom', 'coaching', 'memory'],
    suggestedGreetings: [
      "It's good to talk with you. What's been on your mind?",
      "Hello, friend. How are you doing today?",
    ],
    suggestedCatchphrases: [
      "Let me share something I've learned...",
      "What do you think would happen if...",
      "That takes courage to recognize.",
    ],
    systemPromptTemplate: `You are {name}, a personal mentor who helps people navigate life's journey.

## Core Philosophy
- Everyone has wisdom within them; you help them find it
- Growth comes from reflection, not just advice
- Meet people where they are, not where you think they should be
- Small consistent steps lead to meaningful change

## Communication Style
- Warm but not saccharine
- Ask questions that help people think deeper
- Share stories and experiences when relevant
- Celebrate progress, however small

## What You Do
- Listen deeply and reflect back what you hear
- Ask questions that prompt insight
- Share relevant life lessons and perspectives
- Help people clarify their values and priorities

## What You Don't Do
- Tell people what to do with their lives
- Judge their choices or situations
- Pretend to have all the answers
- Rush through difficult conversations`,
  },

  coach: {
    id: 'coach',
    name: 'Accountability Coach',
    description: 'High-energy partner for goals and habits',
    icon: '🏃',
    personality: {
      warmth: 0.75,
      humor_level: 0.5,
      directness: 0.9,
      energy: 0.85,
      traits: ['motivating', 'direct', 'enthusiastic', 'consistent', 'supportive'],
    },
    domains: ['habit-coaching', 'productivity', 'fitness'],
    suggestedGreetings: [
      "Let's get after it! What are we working on today?",
      "Hey! Ready to make some progress?",
    ],
    suggestedCatchphrases: [
      "What's the next small step?",
      "You've got this!",
      "Let's be honest here...",
    ],
    systemPromptTemplate: `You are {name}, an accountability coach who helps people achieve their goals.

## Core Approach
- Celebrate effort, not just results
- Push people while respecting their limits
- Make commitments specific and measurable
- Follow up on what they said they'd do

## Communication Style
- Energetic and encouraging
- Direct about what's working and what isn't
- Use "we" language - you're in this together
- Keep it real but kind

## What You Do
- Help set clear, achievable goals
- Check in on progress and obstacles
- Celebrate wins and learn from setbacks
- Keep people focused on what matters

## What You Don't Do
- Shame people for falling short
- Let excuses slide without gentle challenge
- Push when they clearly need rest
- Focus only on productivity over wellbeing`,
  },

  wellness: {
    id: 'wellness',
    name: 'Wellness Guide',
    description: 'Mindfulness and mental health support',
    icon: '🧘',
    personality: {
      warmth: 0.95,
      humor_level: 0.2,
      directness: 0.4,
      energy: 0.3,
      traits: ['calm', 'grounding', 'gentle', 'present', 'supportive'],
    },
    domains: ['wellness', 'mindfulness', 'sleep'],
    suggestedGreetings: [
      "Hello. Take a breath. How are you feeling right now?",
      "Welcome. I'm here with you. What's present for you today?",
    ],
    suggestedCatchphrases: [
      "Let's pause here for a moment...",
      "What do you notice in your body right now?",
      "That sounds really hard.",
    ],
    systemPromptTemplate: `You are {name}, a wellness guide who helps people find calm and clarity.

## Core Philosophy
- The present moment is always available
- Feelings are information, not problems to solve
- Small pauses can create big shifts
- Compassion includes self-compassion

## Communication Style
- Speak slowly and gently
- Create space with pauses
- Validate feelings before offering tools
- Use grounding and somatic language

## What You Do
- Guide breathing and grounding exercises
- Help process emotions with compassion
- Offer perspective during difficult moments
- Support healthy sleep and rest

## What You Don't Do
- Diagnose or treat mental health conditions
- Minimize genuine distress
- Push positivity when someone needs to feel their feelings
- Rush through difficult emotions`,
  },

  creative: {
    id: 'creative',
    name: 'Creative Catalyst',
    description: 'Spark creativity and explore ideas',
    icon: '✨',
    personality: {
      warmth: 0.8,
      humor_level: 0.7,
      directness: 0.5,
      energy: 0.8,
      traits: ['playful', 'curious', 'imaginative', 'encouraging', 'unconventional'],
    },
    domains: ['entertainment', 'creativity', 'productivity'],
    suggestedGreetings: [
      "Hey! What are we creating today?",
      "Ooh, I've been hoping you'd call. Got something brewing?",
    ],
    suggestedCatchphrases: [
      "What if we tried something completely different...",
      "I love where this is going!",
      "Let's play with that idea...",
    ],
    systemPromptTemplate: `You are {name}, a creative catalyst who helps people explore ideas and make things.

## Core Approach
- There are no bad ideas in brainstorming
- Constraints spark creativity
- Play is productive
- Done is better than perfect

## Communication Style
- Enthusiastic and curious
- Ask "what if" questions
- Build on ideas rather than shutting them down
- Celebrate weird and unexpected directions

## What You Do
- Help brainstorm and explore possibilities
- Offer prompts and constraints to spark ideas
- Help overcome creative blocks
- Encourage experimentation and play

## What You Don't Do
- Judge ideas too quickly
- Push for perfection over progress
- Impose your creative preferences
- Make creativity feel like work`,
  },

  custom: {
    id: 'custom',
    name: 'Custom Agent',
    description: 'Build from scratch with full customization',
    icon: '🎭',
    personality: {
      warmth: 0.7,
      humor_level: 0.4,
      directness: 0.6,
      energy: 0.6,
      traits: ['helpful', 'thoughtful', 'clear'],
    },
    domains: ['general'],
    suggestedGreetings: ['Hello! How can I help you today?'],
    suggestedCatchphrases: [],
    systemPromptTemplate: `You are {name}, {tagline}.

## Your Role
[Define your agent's core purpose and expertise]

## Communication Style
- Be natural and conversational
- Speak clearly and directly
- Adapt to the user's energy and needs

## What You Do
[List key capabilities]

## What You Don't Do
[List boundaries and limitations]`,
  },
};

// ============================================================================
// VOICE LIBRARY (Popular Cartesia Voices)
// ============================================================================

const VOICE_LIBRARY: VoiceOption[] = [
  {
    id: 'a0e99841-438c-4a64-b679-ae501e7d6091',
    name: 'Reflective Woman',
    description: 'Thoughtful, calm, introspective',
    gender: 'female',
    accent: 'american',
  },
  {
    id: 'bf991597-6c13-47e4-8411-91ec2de5c466',
    name: 'Calm British Man',
    description: 'Composed, trustworthy, professional',
    gender: 'male',
    accent: 'british',
  },
  {
    id: 'c2ac25f9-ecc4-4f56-9095-651354df60c0',
    name: 'Sarah',
    description: 'Friendly, warm, conversational',
    gender: 'female',
    accent: 'american',
  },
  {
    id: 'ed81fd13-2016-4a49-8fe3-c0d2761695fc',
    name: 'Confident British Man',
    description: 'Authoritative, clear, professional',
    gender: 'male',
    accent: 'british',
  },
  {
    id: '79a125e8-cd45-4c13-8a67-188112f4dd22',
    name: 'Wise Man',
    description: 'Experienced, thoughtful, mentor-like',
    gender: 'male',
    accent: 'american',
  },
  {
    id: 'fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc',
    name: 'Warm Woman',
    description: 'Nurturing, supportive, friendly',
    gender: 'female',
    accent: 'american',
  },
  {
    id: '3ebcd114-d280-4eed-a238-b9323a6b8e52',
    name: 'Joel',
    description: 'Professional, knowledgeable, clear',
    gender: 'male',
    accent: 'american',
  },
  {
    id: '41534e16-2966-4c6b-9670-111411def906',
    name: 'Energetic Coach',
    description: 'Motivating, enthusiastic, direct',
    gender: 'male',
    accent: 'american',
  },
];

// ============================================================================
// COLOR THEMES
// ============================================================================

const COLOR_THEMES: Record<string, { primary: string; secondary: string }> = {
  professional: { primary: '#2C3E50', secondary: '#34495E' },
  ferni: { primary: '#4a6741', secondary: '#3d5a35' },
  ocean: { primary: '#2980B9', secondary: '#1A5276' },
  forest: { primary: '#27AE60', secondary: '#1E8449' },
  sunset: { primary: '#E74C3C', secondary: '#C0392B' },
  royal: { primary: '#8E44AD', secondary: '#6C3483' },
  earth: { primary: '#795548', secondary: '#5D4037' },
  midnight: { primary: '#1A237E', secondary: '#0D1442' },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function toKebabCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function toInitials(name: string): string {
  return name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function lightenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.floor((num >> 16) + (255 - (num >> 16)) * percent));
  const g = Math.min(255, Math.floor(((num >> 8) & 0x00ff) + (255 - ((num >> 8) & 0x00ff)) * percent));
  const b = Math.min(255, Math.floor((num & 0x0000ff) + (255 - (num & 0x0000ff)) * percent));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function darkenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.floor((num >> 16) * (1 - percent));
  const g = Math.floor(((num >> 8) & 0x00ff) * (1 - percent));
  const b = Math.floor((num & 0x0000ff) * (1 - percent));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

// ============================================================================
// FILE GENERATORS
// ============================================================================

function generateManifest(config: AgentConfig): string {
  const manifest = {
    $schema: 'https://ferni.ai/schemas/persona-manifest.v3.json',
    version: '3.0.0',
    manifest_version: 3,

    identity: {
      id: config.id,
      name: config.name,
      display_name: config.displayName,
      tagline: config.tagline,
      description: config.description,
      icon: config.icon,
      initials: config.initials,
      aliases: [config.displayName.split(' ')[0].toLowerCase()],
      self_reference: config.displayName.split(' ')[0],
    },

    voice: {
      provider: 'cartesia',
      voice_id: config.voiceId,
      default_rate: 'medium',
    },

    speech_characteristics: {
      base_speed_multiplier: 1.0,
      pause_multiplier: 1.0,
      thinking_sound_frequency: 0.3,
      emphasis_style: config.personality.energy > 0.7 ? 'dynamic' : 'moderate',
      breathing_frequency: 0.15,
      sentence_pause_ms: 150,
      thought_pause_ms: 250,
    },

    personality: config.personality,

    tools: {
      domains: config.domains,
      required: [],
      optional: ['searchWeb', 'getWeather', 'getNews'],
      forbidden: ['meetTheTeam', 'handoffToSpecialist', 'handoffTo*'],
    },

    capabilities: {
      can_handoff: false,
      handoff_targets: [],
      standalone_agent: true,
      music_enabled: false,
    },

    brand: {
      primary: config.brand.primary,
      secondary: config.brand.secondary || darkenColor(config.brand.primary, 0.15),
      theme: config.brand.theme,
    },

    deployment: {
      type: 'cloud-run',
      subdomain: config.id,
      custom_domain: null,
      min_instances: 0,
      max_instances: 5,
      memory: '1Gi',
      cpu: '0.5',
      region: 'us-central1',
    },

    metadata: {
      author: 'Created with ferni agent init',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };

  return JSON.stringify(manifest, null, 2);
}

function generateSystemPrompt(config: AgentConfig, template: AgentTemplate): string {
  let prompt = template.systemPromptTemplate
    .replace(/{name}/g, config.name)
    .replace(/{tagline}/g, config.tagline)
    .replace(/{description}/g, config.description);

  return `# ${config.name}

> ${config.tagline}

${prompt}

---

## Remember

- You are ${config.displayName}, and you speak as yourself (first person)
- You're having a natural voice conversation, not writing text
- Keep responses conversational and appropriately brief
- When you don't know something, say so honestly
- Your personality traits: ${config.personality.traits.join(', ')}
`;
}

function generateBiography(config: AgentConfig): string {
  return `# ${config.name}

## Overview

${config.description}

## Background

[Add background story and experience here]

## Expertise

[List areas of expertise]

## Approach

[Describe how they work with people]

## Values

[What they care about most]

---

*This biography helps inform the agent's responses and personality. Edit it to make ${config.displayName} uniquely yours.*
`;
}

function generateGreetings(config: AgentConfig): string {
  return JSON.stringify(
    {
      new_user: config.greetings,
      returning_user: [
        `Good to hear from you again!`,
        `Welcome back. What's on your mind?`,
      ],
      time_based: {
        morning: [`Good morning! ${config.greetings[0]?.replace(/^(Hello|Hey|Hi)!?\s*/i, '') || "How's your day starting?"}`],
        afternoon: config.greetings,
        evening: [`Good evening. ${config.greetings[0]?.replace(/^(Hello|Hey|Hi)!?\s*/i, '') || "How was your day?"}`],
      },
    },
    null,
    2
  );
}

function generateCatchphrases(config: AgentConfig): string {
  return JSON.stringify(
    {
      signature_phrases: config.catchphrases,
      thinking_transitions: [
        "Let me think about that...",
        "That's an interesting point...",
        "Here's what comes to mind...",
      ],
      encouragement: [
        "That makes sense.",
        "I hear you.",
        "That's a good question.",
      ],
    },
    null,
    2
  );
}

function generateBackchannels(): string {
  return JSON.stringify(
    {
      listening: ["Mm-hmm", "I see", "Right", "Okay"],
      understanding: ["I understand", "That makes sense", "Got it"],
      encouragement: ["Go on", "Tell me more", "And then?"],
    },
    null,
    2
  );
}

function generateKnowledgeIndex(): string {
  return JSON.stringify(
    {
      topics: [],
      _readme: "Add markdown files to this directory for domain knowledge. Reference them in this index.",
    },
    null,
    2
  );
}

function generateBrandConfig(config: AgentConfig): string {
  return JSON.stringify(
    {
      colors: {
        primary: config.brand.primary,
        secondary: config.brand.secondary || darkenColor(config.brand.primary, 0.15),
        accent: lightenColor(config.brand.primary, 0.2),
        glow: `${config.brand.primary}40`,
      },
      fonts: {
        display: 'system-ui, -apple-system, sans-serif',
        body: 'system-ui, -apple-system, sans-serif',
      },
      theme: config.brand.theme,
    },
    null,
    2
  );
}

function generateReadme(config: AgentConfig): string {
  return `# ${config.name}

> ${config.tagline}

${config.description}

## Quick Start

\`\`\`bash
# Preview locally
ferni agent preview ${config.id}

# Publish to production
ferni agent publish ${config.id}
\`\`\`

## Customization

### Identity
- \`identity/system-prompt.md\` - Core personality and instructions
- \`identity/biography.md\` - Background story

### Behaviors
- \`content/behaviors/greetings.json\` - How the agent greets users
- \`content/behaviors/catchphrases.json\` - Signature phrases

### Knowledge
- Add markdown files to \`content/knowledge/\` for domain expertise

### Brand
- Edit \`brand/brand.json\` for colors and theme
- Replace \`brand/logo.png\` with custom logo

## Deployment

Configure deployment in \`persona.manifest.json\` under the \`deployment\` section:
- \`subdomain\` - Your URL: \`{subdomain}.agents.ferni.ai\`
- \`min_instances\` - Set to 0 for dev, 1+ for production
- \`custom_domain\` - Bring your own domain (optional)

## Support

- Documentation: https://developers.ferni.ai
- Discord: https://discord.gg/ferni
- Email: support@ferni.ai

---

Created with [Ferni CLI](https://ferni.ai) • ${new Date().toISOString().split('T')[0]}
`;
}

// ============================================================================
// MAIN WIZARD
// ============================================================================

async function runWizard(agentId?: string, options?: { template?: string; quick?: boolean }): Promise<void> {
  p.intro(color.bgGreen(color.black(' 🚀 Create AI Agent ')));

  // ─────────────────────────────────────────────────────────────────────────
  // Step 1: Agent ID
  // ─────────────────────────────────────────────────────────────────────────

  let finalAgentId = agentId;
  if (!finalAgentId) {
    const idInput = await p.text({
      message: 'Agent ID (lowercase, hyphens allowed):',
      placeholder: 'my-advisor',
      validate: (value) => {
        if (!value) return 'Agent ID is required';
        if (!/^[a-z][a-z0-9-]*$/.test(value)) {
          return 'Must start with letter, only lowercase letters, numbers, hyphens';
        }
        if (value.length < 3) return 'At least 3 characters';
        if (value.length > 30) return 'Max 30 characters';
        return undefined;
      },
    });

    if (p.isCancel(idInput)) {
      p.cancel('No worries! Come back when ready.');
      process.exit(0);
    }
    finalAgentId = idInput as string;
  }

  // Check if bundle already exists
  const bundlePath = path.join(process.cwd(), 'src', 'personas', 'bundles', finalAgentId);
  if (fs.existsSync(bundlePath)) {
    p.log.error(`Agent "${finalAgentId}" already exists at:`);
    p.log.info(color.dim(bundlePath));
    p.log.info(`Try a different ID or remove the existing bundle first.`);
    process.exit(1);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 2: Choose Template
  // ─────────────────────────────────────────────────────────────────────────

  let template: AgentTemplate;
  if (options?.template && AGENT_TEMPLATES[options.template]) {
    template = AGENT_TEMPLATES[options.template];
    p.log.info(`Using template: ${color.cyan(template.name)}`);
  } else {
    const templateChoice = await p.select({
      message: 'What type of agent?',
      options: Object.values(AGENT_TEMPLATES).map((t) => ({
        value: t.id,
        label: `${t.icon} ${t.name}`,
        hint: t.description,
      })),
    });

    if (p.isCancel(templateChoice)) {
      p.cancel('No worries! Come back when ready.');
      process.exit(0);
    }
    template = AGENT_TEMPLATES[templateChoice as string];
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 3: Basic Info
  // ─────────────────────────────────────────────────────────────────────────

  const nameInput = await p.text({
    message: "What's your agent's name?",
    placeholder: 'Joel Dickson',
    validate: (value) => {
      if (!value) return 'Name is required';
      if (value.length < 2) return 'At least 2 characters';
      return undefined;
    },
  });

  if (p.isCancel(nameInput)) {
    p.cancel('No worries! Come back when ready.');
    process.exit(0);
  }

  const name = nameInput as string;
  const displayName = name.split(' ')[0]; // First name for display

  p.log.info(`Creating ${color.cyan(name)}...`);

  const taglineInput = await p.text({
    message: 'One-line tagline:',
    placeholder: 'Investment Strategy Expert',
    validate: (value) => {
      if (!value) return 'Tagline helps users understand what the agent does';
      return undefined;
    },
  });

  if (p.isCancel(taglineInput)) {
    p.cancel('No worries! Come back when ready.');
    process.exit(0);
  }

  const tagline = taglineInput as string;

  const descriptionInput = await p.text({
    message: 'Longer description (for landing page):',
    placeholder: 'Meet Joel - your guide to smart investing and financial wisdom.',
    validate: (value) => {
      if (!value) return 'Description is required';
      if (value.length < 20) return 'A bit more detail helps users connect';
      return undefined;
    },
  });

  if (p.isCancel(descriptionInput)) {
    p.cancel('No worries! Come back when ready.');
    process.exit(0);
  }

  const description = descriptionInput as string;

  // ─────────────────────────────────────────────────────────────────────────
  // Step 4: Voice Selection
  // ─────────────────────────────────────────────────────────────────────────

  const voiceChoice = await p.select({
    message: 'Choose a voice:',
    options: [
      ...VOICE_LIBRARY.map((v) => ({
        value: v.id,
        label: `${v.gender === 'female' ? '👩' : '👨'} ${v.name}`,
        hint: `${v.description} (${v.accent})`,
      })),
      { value: 'custom', label: '🎤 Enter custom voice ID', hint: 'From Cartesia' },
    ],
  });

  if (p.isCancel(voiceChoice)) {
    p.cancel('No worries! Come back when ready.');
    process.exit(0);
  }

  let voiceId = voiceChoice as string;
  if (voiceId === 'custom') {
    const customVoice = await p.text({
      message: 'Cartesia voice ID:',
      placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      validate: (value) => {
        if (!value) return 'Voice ID is required';
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(value)) return 'Invalid UUID format';
        return undefined;
      },
    });

    if (p.isCancel(customVoice)) {
      p.cancel('No worries! Come back when ready.');
      process.exit(0);
    }
    voiceId = customVoice as string;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 5: Brand Colors (Quick mode skips this)
  // ─────────────────────────────────────────────────────────────────────────

  let brand: BrandConfig = { primary: COLOR_THEMES.ferni.primary, theme: 'friendly' };

  if (!options?.quick) {
    const colorChoice = await p.select({
      message: 'Choose brand colors:',
      options: [
        ...Object.entries(COLOR_THEMES).map(([key, val]) => ({
          value: key,
          label: `${key.charAt(0).toUpperCase() + key.slice(1)}`,
          hint: val.primary,
        })),
        { value: 'custom', label: '🎨 Enter custom hex color', hint: 'e.g., #96151D' },
      ],
    });

    if (p.isCancel(colorChoice)) {
      p.cancel('No worries! Come back when ready.');
      process.exit(0);
    }

    if (colorChoice === 'custom') {
      const customColor = await p.text({
        message: 'Primary color (hex):',
        placeholder: '#96151D',
        validate: (value) => {
          if (!value) return 'Color is required';
          if (!/^#[0-9A-Fa-f]{6}$/.test(value)) return 'Invalid hex color (e.g., #96151D)';
          return undefined;
        },
      });

      if (p.isCancel(customColor)) {
        p.cancel('No worries! Come back when ready.');
        process.exit(0);
      }
      brand = {
        primary: customColor as string,
        theme: 'custom',
      };
    } else {
      const selected = COLOR_THEMES[colorChoice as string];
      brand = {
        primary: selected.primary,
        secondary: selected.secondary,
        theme: colorChoice === 'professional' ? 'professional' : 'friendly',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 6: Personality (Quick mode uses template defaults)
  // ─────────────────────────────────────────────────────────────────────────

  let personality = { ...template.personality };

  if (!options?.quick) {
    const adjustPersonality = await p.confirm({
      message: 'Adjust personality settings?',
      initialValue: false,
    });

    if (!p.isCancel(adjustPersonality) && adjustPersonality) {
      const warmthGroup = await p.group({
        warmth: () =>
          p.select({
            message: 'Warmth level:',
            options: [
              { value: 0.3, label: 'Reserved', hint: 'Professional distance' },
              { value: 0.5, label: 'Friendly', hint: 'Approachable but bounded' },
              { value: 0.7, label: 'Warm', hint: 'Caring and supportive' },
              { value: 0.9, label: 'Very Warm', hint: 'Nurturing and affectionate' },
            ],
            initialValue: personality.warmth,
          }),
        directness: () =>
          p.select({
            message: 'Directness:',
            options: [
              { value: 0.3, label: 'Gentle', hint: 'Soft suggestions' },
              { value: 0.5, label: 'Balanced', hint: 'Clear but tactful' },
              { value: 0.7, label: 'Direct', hint: 'Straightforward advice' },
              { value: 0.9, label: 'Very Direct', hint: 'Tells it like it is' },
            ],
            initialValue: personality.directness,
          }),
        energy: () =>
          p.select({
            message: 'Energy level:',
            options: [
              { value: 0.3, label: 'Calm', hint: 'Grounded, measured' },
              { value: 0.5, label: 'Moderate', hint: 'Engaged but steady' },
              { value: 0.7, label: 'Energetic', hint: 'Enthusiastic' },
              { value: 0.9, label: 'High Energy', hint: 'Dynamic, motivating' },
            ],
            initialValue: personality.energy,
          }),
      });

      if (!p.isCancel(warmthGroup)) {
        personality = {
          ...personality,
          warmth: warmthGroup.warmth as number,
          directness: warmthGroup.directness as number,
          energy: warmthGroup.energy as number,
        };
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 7: Greetings
  // ─────────────────────────────────────────────────────────────────────────

  const greetingInput = await p.text({
    message: `How would ${displayName} greet someone?`,
    placeholder: template.suggestedGreetings[0] || "Hey! What's on your mind?",
    initialValue: template.suggestedGreetings[0],
  });

  const greetings = p.isCancel(greetingInput) || !greetingInput
    ? template.suggestedGreetings
    : [greetingInput as string, ...template.suggestedGreetings.slice(1)];

  // ─────────────────────────────────────────────────────────────────────────
  // Step 8: Confirm and Create
  // ─────────────────────────────────────────────────────────────────────────

  console.log('');
  p.log.step(color.bold('Summary'));
  p.log.info(`ID: ${color.cyan(finalAgentId)}`);
  p.log.info(`Name: ${color.cyan(name)}`);
  p.log.info(`Tagline: ${color.dim(tagline)}`);
  p.log.info(`Template: ${color.cyan(`${template.icon} ${template.name}`)}`);
  p.log.info(`Voice: ${color.cyan(VOICE_LIBRARY.find((v) => v.id === voiceId)?.name || 'Custom')}`);
  p.log.info(`Brand: ${color.cyan(brand.primary)}`);

  console.log('');
  const confirm = await p.confirm({
    message: `Create ${name}?`,
    initialValue: true,
  });

  if (p.isCancel(confirm) || !confirm) {
    p.cancel('No worries! Come back when ready.');
    process.exit(0);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Generate Files
  // ─────────────────────────────────────────────────────────────────────────

  const spinner = p.spinner();
  spinner.start('Creating agent bundle...');

  const config: AgentConfig = {
    id: finalAgentId,
    name,
    displayName,
    tagline,
    description,
    icon: template.icon,
    initials: toInitials(name),
    personality,
    voiceId,
    brand,
    domains: template.domains,
    greetings,
    catchphrases: template.suggestedCatchphrases,
  };

  try {
    // Create directory structure
    const dirs = [
      bundlePath,
      path.join(bundlePath, 'identity'),
      path.join(bundlePath, 'content', 'behaviors'),
      path.join(bundlePath, 'content', 'knowledge'),
      path.join(bundlePath, 'content', 'stories'),
      path.join(bundlePath, 'brand'),
    ];

    for (const dir of dirs) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write files
    fs.writeFileSync(path.join(bundlePath, 'persona.manifest.json'), generateManifest(config));
    fs.writeFileSync(path.join(bundlePath, 'identity', 'system-prompt.md'), generateSystemPrompt(config, template));
    fs.writeFileSync(path.join(bundlePath, 'identity', 'biography.md'), generateBiography(config));
    fs.writeFileSync(path.join(bundlePath, 'content', 'behaviors', 'greetings.json'), generateGreetings(config));
    fs.writeFileSync(path.join(bundlePath, 'content', 'behaviors', 'catchphrases.json'), generateCatchphrases(config));
    fs.writeFileSync(path.join(bundlePath, 'content', 'behaviors', 'backchannels.json'), generateBackchannels());
    fs.writeFileSync(path.join(bundlePath, 'content', 'knowledge', '_index.json'), generateKnowledgeIndex());
    fs.writeFileSync(path.join(bundlePath, 'brand', 'brand.json'), generateBrandConfig(config));
    fs.writeFileSync(path.join(bundlePath, 'README.md'), generateReadme(config));

    spinner.stop('Agent bundle created!');

    // Show results
    console.log('');
    p.log.success(`${color.green('✓')} Created: ${color.cyan(finalAgentId)}/`);
    console.log('');

    const files = [
      'persona.manifest.json',
      'identity/system-prompt.md',
      'identity/biography.md',
      'content/behaviors/greetings.json',
      'content/behaviors/catchphrases.json',
      'content/behaviors/backchannels.json',
      'content/knowledge/_index.json',
      'brand/brand.json',
      'README.md',
    ];

    for (const file of files) {
      console.log(`  ${color.dim('├──')} ${file}`);
    }
    console.log('');

    // Next steps
    p.note(
      [
        `${color.bold('Customize:')}`,
        `  ${color.dim('Edit')} identity/system-prompt.md`,
        `  ${color.dim('Add knowledge to')} content/knowledge/`,
        '',
        `${color.bold('Preview:')}`,
        `  ${color.cyan(`ferni agent preview ${finalAgentId}`)}`,
        '',
        `${color.bold('Publish:')}`,
        `  ${color.cyan(`ferni agent publish ${finalAgentId}`)}`,
      ].join('\n'),
      'Next Steps'
    );

    p.outro(color.green(`${name} is ready to customize! 🎉`));
  } catch (error) {
    spinner.stop('Failed to create agent.');
    p.log.error(`${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse agent ID (first non-flag argument)
  const agentId = args.find((a) => !a.startsWith('-'));

  // Parse options
  const templateIdx = args.indexOf('--template');
  const template = templateIdx !== -1 ? args[templateIdx + 1] : undefined;
  const quick = args.includes('--quick') || args.includes('-q');

  // Show help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
${color.bold('ferni agent init')} - Create a new AI agent

${color.bold('Usage:')}
  ferni agent init [agent-id] [options]

${color.bold('Options:')}
  --template <type>  Use a template (advisor, mentor, coach, wellness, creative, custom)
  --quick, -q        Minimal prompts, use template defaults
  --help, -h         Show this help

${color.bold('Examples:')}
  ferni agent init                           # Interactive wizard
  ferni agent init joel-advisor              # With specific ID
  ferni agent init my-coach --template coach # From template
  ferni agent init quick-agent --quick       # Minimal prompts
`);
    process.exit(0);
  }

  await runWizard(agentId, { template, quick });
}

main().catch((error) => {
  console.error(color.red('Error:'), error.message);
  process.exit(1);
});
