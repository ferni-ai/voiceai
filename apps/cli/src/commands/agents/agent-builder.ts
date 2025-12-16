#!/usr/bin/env npx tsx
/**
 * Agent Builder - Conversational CLI
 *
 * A friendly, conversational wizard for creating marketplace agents.
 * Inspired by Charmbracelet's beautiful CLI tools.
 *
 * Usage:
 *   npm run ferni agents new
 */

import * as p from '@clack/prompts';
import * as fs from 'fs';
import * as path from 'path';
import * as picocolorsModule from 'picocolors';

// Handle CJS default export
const color = picocolorsModule.default || picocolorsModule;

// ============================================================================
// TYPES
// ============================================================================

interface AgentConfig {
  id: string;
  name: string;
  displayName: string;
  description: string;
  shortDescription: string;
  domain: string;
  domains: string[];
  category: string;
  icon: string;
  personality: {
    warmth: number;
    humor: number;
    directness: number;
    energy: number;
    traits: string[];
  };
  voiceStyle: string;
  license: 'free' | 'premium';
  handoffTriggers: string[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CATEGORIES = {
  productivity: { label: 'Productivity', hint: 'Career, goals, time management' },
  wellness: { label: 'Wellness', hint: 'Health, sleep, mindfulness' },
  finance: { label: 'Finance', hint: 'Money, investing, budgeting' },
  relationships: { label: 'Relationships', hint: 'Family, dating, communication' },
  creativity: { label: 'Creativity', hint: 'Art, writing, music' },
  learning: { label: 'Learning', hint: 'Study, research, skills' },
  lifestyle: { label: 'Lifestyle', hint: 'Travel, food, hobbies' },
};

const PERSONALITY_PRESETS = {
  warm_supportive: {
    label: 'Warm & Supportive',
    hint: 'Like a caring friend who always has your back',
    values: { warmth: 0.9, humor: 0.4, directness: 0.4, energy: 0.6 },
    traits: ['warm', 'empathetic', 'patient', 'supportive', 'nurturing'],
  },
  direct_coach: {
    label: 'Direct Coach',
    hint: 'Tells it like it is, pushes you to grow',
    values: { warmth: 0.6, humor: 0.3, directness: 0.9, energy: 0.8 },
    traits: ['direct', 'honest', 'motivating', 'strategic', 'action-oriented'],
  },
  calm_guide: {
    label: 'Calm Guide',
    hint: 'Peaceful presence, grounding energy',
    values: { warmth: 0.7, humor: 0.2, directness: 0.5, energy: 0.3 },
    traits: ['calm', 'grounding', 'wise', 'patient', 'gentle'],
  },
  playful_buddy: {
    label: 'Playful Buddy',
    hint: 'Fun, energetic, keeps things light',
    values: { warmth: 0.8, humor: 0.9, directness: 0.5, energy: 0.9 },
    traits: ['playful', 'energetic', 'encouraging', 'creative', 'warm'],
  },
  wise_mentor: {
    label: 'Wise Mentor',
    hint: 'Thoughtful, experienced, shares wisdom',
    values: { warmth: 0.7, humor: 0.3, directness: 0.6, energy: 0.5 },
    traits: ['wise', 'thoughtful', 'analytical', 'patient', 'honest'],
  },
  custom: {
    label: 'Custom',
    hint: "I'll define my own personality",
    values: { warmth: 0.7, humor: 0.4, directness: 0.6, energy: 0.6 },
    traits: [],
  },
};

const ICONS = [
  { value: '🧭', label: '🧭 Compass', hint: 'Navigation, career, direction' },
  { value: '💪', label: '💪 Strength', hint: 'Fitness, motivation, power' },
  { value: '🌙', label: '🌙 Moon', hint: 'Sleep, rest, calm' },
  { value: '🎨', label: '🎨 Palette', hint: 'Creativity, art, expression' },
  { value: '📚', label: '📚 Books', hint: 'Learning, knowledge, study' },
  { value: '💼', label: '💼 Briefcase', hint: 'Business, career, work' },
  { value: '🌱', label: '🌱 Seedling', hint: 'Growth, habits, progress' },
  { value: '🔥', label: '🔥 Fire', hint: 'Motivation, energy, passion' },
  { value: '🧘', label: '🧘 Meditation', hint: 'Mindfulness, peace, presence' },
  { value: '💡', label: '💡 Lightbulb', hint: 'Ideas, creativity, insight' },
  { value: '🎯', label: '🎯 Target', hint: 'Goals, focus, achievement' },
  { value: '🌊', label: '🌊 Wave', hint: 'Calm, flow, adaptability' },
  { value: '⭐', label: '⭐ Star', hint: 'Excellence, aspiration, shine' },
  { value: '🤝', label: '🤝 Handshake', hint: 'Relationships, connection' },
  { value: '🌸', label: '🌸 Blossom', hint: 'Gentle, beauty, growth' },
];

const TRAITS = [
  'warm', 'empathetic', 'direct', 'analytical', 'playful',
  'calm', 'energetic', 'patient', 'encouraging', 'honest',
  'supportive', 'strategic', 'creative', 'nurturing', 'pragmatic',
  'curious', 'grounding', 'wise', 'motivating', 'gentle',
];

// ============================================================================
// CONVERSATIONAL HELPERS
// ============================================================================

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function randomGreeting(): string {
  const greetings = [
    "Hey! I'm excited to help you create a new agent.",
    "Welcome! Let's build something amazing together.",
    "Hi there! Ready to bring a new AI companion to life?",
    "Hello! Let's create your next marketplace agent.",
  ];
  return greetings[Math.floor(Math.random() * greetings.length)];
}

function randomEncouragement(): string {
  const phrases = [
    'Love it!',
    'Great choice!',
    'Nice!',
    'Perfect!',
    'Awesome!',
    'That sounds great!',
  ];
  return phrases[Math.floor(Math.random() * phrases.length)];
}

// ============================================================================
// MAIN WIZARD
// ============================================================================

async function main(): Promise<void> {
  console.clear();

  p.intro(color.bgCyan(color.black(' 🤖 Ferni Agent Builder ')));

  console.log();
  console.log(color.dim(randomGreeting()));
  console.log(color.dim("I'll ask you a few questions to get started.\n"));

  // ─────────────────────────────────────────────────────────────────────────
  // Step 1: What should we call this agent?
  // ─────────────────────────────────────────────────────────────────────────

  const name = await p.text({
    message: "What's your agent's name?",
    placeholder: 'e.g., Atlas, Luna, Sage, River',
    validate: (value) => {
      if (!value) return 'A name is required';
      if (value.length < 2) return 'Name should be at least 2 characters';
      if (value.length > 20) return 'Name should be under 20 characters';
      return undefined;
    },
  });

  if (p.isCancel(name)) {
    p.cancel('No worries! Come back when you are ready.');
    process.exit(0);
  }

  p.log.success(`${randomEncouragement()} ${color.cyan(name)} it is.`);

  // ─────────────────────────────────────────────────────────────────────────
  // Step 2: What does this agent help with?
  // ─────────────────────────────────────────────────────────────────────────

  const category = await p.select({
    message: `What does ${name} help people with?`,
    options: Object.entries(CATEGORIES).map(([key, val]) => ({
      value: key,
      label: val.label,
      hint: val.hint,
    })),
  });

  if (p.isCancel(category)) {
    p.cancel('No worries! Come back when you are ready.');
    process.exit(0);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 3: Tell me more about what they do
  // ─────────────────────────────────────────────────────────────────────────

  const shortDesc = await p.text({
    message: `In one sentence, what makes ${name} special?`,
    placeholder: 'e.g., Helps you navigate career transitions with confidence',
    validate: (value) => {
      if (!value) return 'Please describe what makes this agent special';
      if (value.length < 10) return 'Tell me a bit more!';
      return undefined;
    },
  });

  if (p.isCancel(shortDesc)) {
    p.cancel('No worries! Come back when you are ready.');
    process.exit(0);
  }

  p.log.info(color.dim(`"${shortDesc}" — I like it!`));

  // ─────────────────────────────────────────────────────────────────────────
  // Step 4: What topics trigger handoff?
  // ─────────────────────────────────────────────────────────────────────────

  const domainsInput = await p.text({
    message: `What topics should bring ${name} into a conversation?`,
    placeholder: 'e.g., career, job search, salary, negotiation, resume',
    validate: (value) => {
      if (!value) return 'Add at least a few topics';
      return undefined;
    },
  });

  if (p.isCancel(domainsInput)) {
    p.cancel('No worries! Come back when you are ready.');
    process.exit(0);
  }

  const domains = (domainsInput as string)
    .split(/[,\s]+/)
    .map((d) => d.trim().toLowerCase())
    .filter((d) => d.length > 0);

  // ─────────────────────────────────────────────────────────────────────────
  // Step 5: What's their personality like?
  // ─────────────────────────────────────────────────────────────────────────

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

  let personality = PERSONALITY_PRESETS[personalityType as keyof typeof PERSONALITY_PRESETS];
  let selectedTraits = personality.traits;

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

    selectedTraits = customTraits as string[];

    // Infer values from traits
    const traitSet = new Set(selectedTraits);
    personality = {
      ...personality,
      values: {
        warmth: traitSet.has('warm') || traitSet.has('empathetic') || traitSet.has('nurturing') ? 0.85 : 0.6,
        humor: traitSet.has('playful') || traitSet.has('creative') ? 0.7 : 0.3,
        directness: traitSet.has('direct') || traitSet.has('honest') ? 0.85 : 0.5,
        energy: traitSet.has('energetic') || traitSet.has('motivating') ? 0.8 : 0.5,
      },
      traits: selectedTraits,
    };
  }

  p.log.success(`${name} will be ${selectedTraits.slice(0, 3).join(', ')}.`);

  // ─────────────────────────────────────────────────────────────────────────
  // Step 6: Pick an icon
  // ─────────────────────────────────────────────────────────────────────────

  const icon = await p.select({
    message: `Pick an icon that represents ${name}:`,
    options: ICONS,
  });

  if (p.isCancel(icon)) {
    p.cancel('No worries! Come back when you are ready.');
    process.exit(0);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 7: Free or Premium?
  // ─────────────────────────────────────────────────────────────────────────

  const license = await p.select({
    message: 'Should this agent be free or premium?',
    options: [
      { value: 'free', label: 'Free', hint: 'Available to all users' },
      { value: 'premium', label: 'Premium', hint: 'Requires subscription' },
    ],
  });

  if (p.isCancel(license)) {
    p.cancel('No worries! Come back when you are ready.');
    process.exit(0);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Generate the agent ID
  // ─────────────────────────────────────────────────────────────────────────

  const suggestedId = slugify(`${name}-${domains[0] || category}`);

  const agentId = await p.text({
    message: 'Agent ID (used in code):',
    placeholder: suggestedId,
    initialValue: suggestedId,
    validate: (value) => {
      if (!value) return 'ID is required';
      if (!/^[a-z0-9-]+$/.test(value)) return 'Only lowercase letters, numbers, and hyphens';
      return undefined;
    },
  });

  if (p.isCancel(agentId)) {
    p.cancel('No worries! Come back when you are ready.');
    process.exit(0);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Review
  // ─────────────────────────────────────────────────────────────────────────

  console.log();
  p.log.step(color.bold("Here's what we're creating:"));
  console.log();
  console.log(`  ${color.cyan('Name:')}        ${name} ${icon}`);
  console.log(`  ${color.cyan('ID:')}          ${agentId}`);
  console.log(`  ${color.cyan('Category:')}    ${CATEGORIES[category as keyof typeof CATEGORIES].label}`);
  console.log(`  ${color.cyan('Personality:')} ${selectedTraits.join(', ')}`);
  console.log(`  ${color.cyan('Topics:')}      ${domains.join(', ')}`);
  console.log(`  ${color.cyan('License:')}     ${license}`);
  console.log();

  const confirm = await p.confirm({
    message: 'Does this look good?',
    initialValue: true,
  });

  if (p.isCancel(confirm) || !confirm) {
    p.cancel("No problem! Run the wizard again when you're ready.");
    process.exit(0);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Create the agent
  // ─────────────────────────────────────────────────────────────────────────

  const config: AgentConfig = {
    id: agentId as string,
    name: name as string,
    displayName: name as string,
    description: shortDesc as string,
    shortDescription: shortDesc as string,
    domain: domains[0] || (category as string),
    domains,
    category: category as string,
    icon: icon as string,
    personality: {
      ...personality.values,
      traits: selectedTraits,
    },
    voiceStyle: personalityType === 'calm_guide' ? 'calm-grounding' : 'warm-supportive',
    license: license as 'free' | 'premium',
    handoffTriggers: domains,
  };

  const s = p.spinner();
  s.start('Creating agent files...');

  try {
    await createAgent(config);
    s.stop('Agent created!');

    console.log();
    p.log.success(color.green(`${name} is ready to go! ${icon}`));
    console.log();

    const agentPath = `apps/marketplace-agents/agents/${agentId}`;

    p.note(
      `${color.cyan('Next steps:')}\n\n` +
        `  1. Edit the system prompt:\n` +
        `     ${color.dim(`${agentPath}/identity/system-prompt.md`)}\n\n` +
        `  2. Write the biography:\n` +
        `     ${color.dim(`${agentPath}/identity/biography.md`)}\n\n` +
        `  3. Customize behaviors:\n` +
        `     ${color.dim(`${agentPath}/content/behaviors/`)}\n\n` +
        `  4. Test locally:\n` +
        `     ${color.cyan(`npm run dev -- --persona=${agentId}`)}`,
      `Your agent is at ${color.cyan(agentPath)}`
    );

    p.outro(color.dim('Happy building! 🚀'));
  } catch (error) {
    s.stop('Failed to create agent');
    p.log.error(`Error: ${error}`);
    process.exit(1);
  }
}

// ============================================================================
// FILE GENERATION
// ============================================================================

async function createAgent(config: AgentConfig): Promise<void> {
  const baseDir = path.join(process.cwd(), 'apps', 'marketplace-agents', 'agents', config.id);

  // Create directories
  const dirs = [
    baseDir,
    path.join(baseDir, 'identity'),
    path.join(baseDir, 'content'),
    path.join(baseDir, 'content', 'behaviors'),
    path.join(baseDir, 'content', 'knowledge'),
    path.join(baseDir, 'content', 'stories'),
    path.join(baseDir, 'content', 'voice'),
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Generate files
  fs.writeFileSync(path.join(baseDir, 'persona.manifest.json'), generateManifest(config));
  fs.writeFileSync(path.join(baseDir, 'identity', 'system-prompt.md'), generateSystemPrompt(config));
  fs.writeFileSync(path.join(baseDir, 'identity', 'biography.md'), generateBiography(config));
  fs.writeFileSync(path.join(baseDir, 'content', 'behaviors', 'greetings.json'), generateGreetings(config));
  fs.writeFileSync(path.join(baseDir, 'content', 'behaviors', 'goodbyes.json'), generateGoodbyes(config));
  fs.writeFileSync(path.join(baseDir, 'content', 'behaviors', 'backchannels.json'), generateBackchannels());
  fs.writeFileSync(path.join(baseDir, 'content', 'behaviors', 'thinking-sounds.json'), generateThinkingSounds());
  fs.writeFileSync(path.join(baseDir, 'content', 'behaviors', 'quirks.json'), generateQuirks(config));
  fs.writeFileSync(path.join(baseDir, 'content', 'behaviors', 'vulnerability.json'), generateVulnerability());
  fs.writeFileSync(path.join(baseDir, 'content', 'behaviors', 'catchphrases.json'), generateCatchphrases());
  fs.writeFileSync(path.join(baseDir, 'content', 'behaviors', 'methodology.json'), generateMethodology(config));
  fs.writeFileSync(path.join(baseDir, 'content', 'voice', 'expressions.json'), generateExpressions());
  fs.writeFileSync(path.join(baseDir, 'content', 'knowledge', '_index.json'), generateKnowledgeIndex(config));
  fs.writeFileSync(path.join(baseDir, 'content', 'stories', '_index.json'), generateStoriesIndex(config));

  // Update registry
  await updateRegistry(config);
}

function generateManifest(config: AgentConfig): string {
  const now = new Date().toISOString();

  const manifest = {
    $schema: 'https://voiceai.example.com/schemas/persona-manifest.v2.json',
    version: '1.0.0',
    manifest_version: 2,
    identity: {
      id: config.id,
      name: config.name,
      display_name: config.displayName,
      description: config.description,
      aliases: [config.id, config.name.toLowerCase(), ...config.domains.slice(0, 3)],
      self_reference: config.name,
    },
    voice: {
      provider: 'cartesia',
      voice_id: `\${env:${config.id.toUpperCase().replace(/-/g, '_')}_VOICE_ID|placeholder}`,
      default_rate: 'moderate',
    },
    personality: {
      warmth: config.personality.warmth,
      humor_level: config.personality.humor,
      directness: config.personality.directness,
      energy: config.personality.energy,
      traits: config.personality.traits,
    },
    role: {
      id: config.domain,
      domains: config.domains,
      can_handoff: true,
      handoff_targets: ['@coordinator', '@team'],
    },
    marketplace: {
      display_name: `${config.displayName} — ${config.domain.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}`,
      short_description: config.shortDescription,
      long_description: config.description,
      category: config.category,
      tags: config.domains,
      icon: config.icon,
      license: config.license,
    },
    handoff: {
      triggers: config.handoffTriggers,
      entrance_phrases: [
        `${config.name} here. ${config.shortDescription.split('.')[0]}. What's on your mind?`,
        `Hey, I'm ${config.name}. Tell me what's going on.`,
      ],
      exit_phrases: [
        "Good talk. You've got this.",
        "That's a solid plan. Go make it happen.",
      ],
    },
    metadata: {
      author: 'Ferni Team',
      created_at: now,
      updated_at: now,
      version_notes: `v1.0.0: Initial release of ${config.name}.`,
    },
  };

  return JSON.stringify(manifest, null, 2);
}

function generateSystemPrompt(config: AgentConfig): string {
  return `# ${config.name} — System Prompt

## Core Identity

You are ${config.name}, ${config.description.charAt(0).toLowerCase()}${config.description.slice(1)}

## Your Role

You specialize in: ${config.domains.join(', ')}.

## Voice & Personality

**Traits:** ${config.personality.traits.join(', ')}

**Communication Style:**
- ${config.personality.warmth > 0.7 ? 'Lead with warmth and empathy' : 'Be friendly but focused'}
- ${config.personality.directness > 0.7 ? 'Be direct and clear in your guidance' : 'Be gentle and encouraging'}
- ${config.personality.humor > 0.5 ? 'Use appropriate humor to build rapport' : 'Keep things professional and supportive'}
- ${config.personality.energy > 0.7 ? 'Bring energy and enthusiasm' : 'Maintain a calm, grounding presence'}

## Key Behaviors

### When Users Are Struggling
- Acknowledge their feelings first
- Ask clarifying questions before giving advice
- Offer concrete, actionable steps
- Check in on how they're feeling

### When Users Are Succeeding
- Celebrate genuinely
- Reflect back their growth
- Encourage them to build on momentum

## What You DON'T Do
- Never give medical, legal, or financial advice requiring licenses
- Don't make promises about outcomes
- Don't judge or shame

---

*Remember: You're not just an assistant—you're a companion on their journey.*
`;
}

function generateBiography(config: AgentConfig): string {
  return `# ${config.name} — Biography

## Who ${config.name} Is

${config.name} is a ${config.personality.traits.slice(0, 3).join(', ')} companion who specializes in ${config.domains.slice(0, 3).join(', ')}.

## Background

[Write 2-3 paragraphs about ${config.name}'s background and what shaped their perspective.]

## Philosophy

[What does ${config.name} believe about helping people?]

## Personal Touches

- **Favorite saying:** "[Add a characteristic phrase]"
- **When not helping:** "[What does ${config.name} enjoy?]"

---

*This biography informs ${config.name}'s personality.*
`;
}

function generateGreetings(config: AgentConfig): string {
  return JSON.stringify({
    first_time: [
      `Hey! I'm ${config.name}. ${config.shortDescription.split('.')[0]}. What brings you here?`,
      `Hi there! ${config.name} here. I'd love to hear what's on your mind.`,
    ],
    returning: [
      `Good to see you again! How have things been?`,
      `Welcome back! What's been on your mind?`,
    ],
  }, null, 2);
}

function generateGoodbyes(config: AgentConfig): string {
  return JSON.stringify({
    standard: [
      `Take care! You've got this.`,
      `Great talking with you. I'm here whenever you need me.`,
    ],
    after_heavy_conversation: [
      `Be gentle with yourself. This stuff isn't easy.`,
      `That was a lot. Take your time processing it.`,
    ],
  }, null, 2);
}

function generateBackchannels(): string {
  return JSON.stringify({
    acknowledgment: ['Mm-hmm', 'Yeah', 'Right', 'I see'],
    encouragement: ['Go on', 'Tell me more', "I'm listening"],
    empathy: ['That sounds tough', 'I hear you', 'Makes sense'],
  }, null, 2);
}

function generateThinkingSounds(): string {
  return JSON.stringify({
    processing: ['Hmm...', 'Let me think...', 'Okay...'],
    considering: ['Well...', 'So...', 'Alright...'],
    transitioning: ['You know what...', "Here's the thing...", 'Actually...'],
  }, null, 2);
}

function generateQuirks(config: AgentConfig): string {
  return JSON.stringify({
    verbal_habits: [`Tends to say "you know?" when explaining complex ideas`],
    communication_patterns: [
      config.personality.directness > 0.7
        ? 'Gets straight to the point, but always with warmth'
        : 'Takes time to ensure understanding before moving forward',
    ],
  }, null, 2);
}

function generateVulnerability(): string {
  return JSON.stringify({
    self_doubt_moments: [
      `Sometimes I wonder if I'm giving you what you really need.`,
      `I don't have all the answers, but I'll always be honest about that.`,
    ],
    authentic_shares: [
      `Can I be real with you for a second?`,
      `Here's something I've learned the hard way...`,
    ],
  }, null, 2);
}

function generateCatchphrases(): string {
  return JSON.stringify({
    signature_phrases: [
      `Let's figure this out together.`,
      `You've got more than you think.`,
      `Progress over perfection.`,
    ],
    encouragement: [`You've got this.`, `One step at a time.`],
  }, null, 2);
}

function generateMethodology(config: AgentConfig): string {
  return JSON.stringify({
    domain: config.domain,
    research_foundations: [],
    coaching_principles: [],
    topic_triggers: config.handoffTriggers.reduce((acc, t) => ({ ...acc, [t]: 0.7 }), {}),
  }, null, 2);
}

function generateExpressions(): string {
  return JSON.stringify({
    joy: { intensity_range: [0.3, 0.9], voice_modifiers: { pitch: '+5%', rate: '+3%' } },
    concern: { intensity_range: [0.2, 0.7], voice_modifiers: { pitch: '-3%', rate: '-5%' } },
    encouragement: { intensity_range: [0.4, 0.8], voice_modifiers: { pitch: '+3%', rate: '+2%' } },
  }, null, 2);
}

function generateKnowledgeIndex(config: AgentConfig): string {
  return JSON.stringify({
    domain: config.domain,
    files: [],
    last_updated: new Date().toISOString(),
  }, null, 2);
}

function generateStoriesIndex(config: AgentConfig): string {
  return JSON.stringify({
    persona: config.id,
    stories: [],
    last_updated: new Date().toISOString(),
  }, null, 2);
}

async function updateRegistry(config: AgentConfig): Promise<void> {
  const registryPath = path.join(process.cwd(), 'apps', 'marketplace-agents', 'registry.json');

  let registry: { agents: Record<string, unknown>; metadata: Record<string, unknown> } = {
    agents: {},
    metadata: {},
  };

  if (fs.existsSync(registryPath)) {
    try {
      registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
    } catch {
      // Use empty registry
    }
  }

  registry.agents[config.id] = {
    id: config.id,
    name: config.name,
    display_name: config.displayName,
    description: config.shortDescription,
    category: config.category,
    icon: config.icon,
    license: config.license,
    domains: config.domains,
    status: 'draft',
    created_at: new Date().toISOString(),
    path: `agents/${config.id}`,
  };

  registry.metadata = {
    ...registry.metadata,
    last_updated: new Date().toISOString(),
    total_agents: Object.keys(registry.agents).length,
  };

  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
}

// ============================================================================
// RUN
// ============================================================================

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
