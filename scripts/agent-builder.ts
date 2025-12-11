#!/usr/bin/env npx tsx
/**
 * Agent Builder Wizard
 *
 * Interactive CLI for creating new marketplace agents with all required files.
 *
 * Usage:
 *   npm run ferni agents new
 *   npx tsx scripts/agent-builder.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// ============================================================================
// COLORS & FORMATTING
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

function print(msg: string): void {
  console.log(msg);
}

function printHeader(title: string): void {
  const line = '═'.repeat(60);
  print(`\n${colors.cyan}╔${line}╗${colors.reset}`);
  print(`${colors.cyan}║${colors.reset}  ${colors.bold}${title}${colors.reset}`);
  print(`${colors.cyan}╚${line}╝${colors.reset}\n`);
}

function printStep(step: number, total: number, title: string): void {
  print(`\n${colors.blue}[${step}/${total}]${colors.reset} ${colors.bold}${title}${colors.reset}`);
  print(`${colors.dim}${'─'.repeat(50)}${colors.reset}`);
}

function printSuccess(msg: string): void {
  print(`${colors.green}✓${colors.reset} ${msg}`);
}

function printInfo(msg: string): void {
  print(`${colors.blue}ℹ${colors.reset} ${msg}`);
}

function printWarning(msg: string): void {
  print(`${colors.yellow}⚠${colors.reset} ${msg}`);
}

// ============================================================================
// PROMPTS
// ============================================================================

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function prompt(question: string, defaultValue?: string): Promise<string> {
  const suffix = defaultValue ? ` ${colors.dim}(${defaultValue})${colors.reset}` : '';
  return new Promise((resolve) => {
    rl.question(`${colors.cyan}?${colors.reset} ${question}${suffix}: `, (answer) => {
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

async function promptSelect(question: string, options: string[]): Promise<string> {
  print(`\n${colors.cyan}?${colors.reset} ${question}`);
  options.forEach((opt, i) => {
    print(`  ${colors.dim}${i + 1}.${colors.reset} ${opt}`);
  });
  const answer = await prompt('Enter number');
  const index = parseInt(answer, 10) - 1;
  return options[index] || options[0];
}

async function promptMultiSelect(question: string, options: string[], maxSelect = 5): Promise<string[]> {
  print(`\n${colors.cyan}?${colors.reset} ${question} ${colors.dim}(comma-separated numbers, max ${maxSelect})${colors.reset}`);
  options.forEach((opt, i) => {
    print(`  ${colors.dim}${i + 1}.${colors.reset} ${opt}`);
  });
  const answer = await prompt('Enter numbers');
  const indices = answer.split(',').map((s) => parseInt(s.trim(), 10) - 1);
  return indices
    .filter((i) => i >= 0 && i < options.length)
    .slice(0, maxSelect)
    .map((i) => options[i]);
}

async function promptConfirm(question: string, defaultYes = true): Promise<boolean> {
  const suffix = defaultYes ? '(Y/n)' : '(y/N)';
  const answer = await prompt(`${question} ${colors.dim}${suffix}${colors.reset}`);
  if (!answer) return defaultYes;
  return answer.toLowerCase().startsWith('y');
}

// ============================================================================
// AGENT DATA TYPES
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

const CATEGORIES = [
  'productivity',
  'wellness',
  'finance',
  'relationships',
  'creativity',
  'learning',
  'lifestyle',
];

const PERSONALITY_TRAITS = [
  'warm',
  'empathetic',
  'direct',
  'analytical',
  'playful',
  'calm',
  'energetic',
  'patient',
  'encouraging',
  'honest',
  'supportive',
  'strategic',
  'creative',
  'nurturing',
  'pragmatic',
  'curious',
  'grounding',
  'wise',
  'motivating',
  'gentle',
];

const VOICE_STYLES = [
  'warm-supportive',
  'confident-direct',
  'calm-grounding',
  'energetic-motivating',
  'wise-measured',
  'playful-light',
  'professional-clear',
  'nurturing-gentle',
];

const ICONS = [
  '🧭', // navigation/career
  '💪', // strength/fitness
  '🌙', // sleep/rest
  '🎨', // creativity
  '📚', // learning
  '💼', // business
  '🌱', // growth
  '🔥', // motivation
  '🧘', // mindfulness
  '💡', // ideas
  '🎯', // goals
  '🌊', // calm
  '⭐', // excellence
  '🤝', // relationships
  '🏃', // action
  '🌸', // gentle
];

// ============================================================================
// FILE TEMPLATES
// ============================================================================

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
      voice_id: `\${env:${config.id.toUpperCase().replace(/-/g, '_')}_VOICE_ID|placeholder-voice-id}`,
      default_rate: 'moderate',
    },

    speech_characteristics: {
      base_speed_multiplier: 0.95,
      pause_multiplier: 1.0,
      thinking_sound_frequency: 0.15,
      emphasis_style: config.personality.directness > 0.6 ? 'confident' : 'warm',
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

    team: {
      membership: 'ferni-team',
      role_id: config.domain,
      role_description: config.shortDescription,
      coordinator: false,
      handoff_triggers: config.handoffTriggers,
      handoff_phrases: {
        receive: [
          `${config.name} here. ${config.shortDescription.split('.')[0]}. What's on your mind?`,
          `Hey, I'm ${config.name}. Tell me what's going on.`,
          `${config.name} here. How can I help?`,
        ],
      },
    },

    content: {
      stories: { directory: 'content/stories', lazy_load: true },
      knowledge: { directory: 'content/knowledge', lazy_load: true },
      behaviors: { directory: 'content/behaviors' },
      voice: { directory: 'content/voice', lazy_load: true },
      identity: { directory: 'identity', lazy_load: true },
    },

    marketplace: {
      display_name: `${config.displayName} — ${config.domain
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')}`,
      short_description: config.shortDescription,
      long_description: config.description,
      category: config.category,
      tags: config.domains,
      icon: config.icon,
      license: config.license,
      loading_tiers: {
        tier1_metadata_kb: 5,
        tier2_instructions_kb: 45,
        tier3_resources_kb: 550,
      },
    },

    emotional: {
      emotion_detection: { enabled: true, sensitivity: 'high', response_delay_ms: 300 },
      voice_expression: {
        mirroring_level: 0.5,
        default_tone: config.voiceStyle,
        contextual_tones: {
          distressed_user: 'steady-supportive',
          celebrating_user: 'genuinely-excited',
          confused_user: 'clarifying-patient',
          anxious_user: 'grounding-confident',
        },
      },
      empathy: {
        acknowledgment_frequency: 'often',
        validation_style: config.personality.directness > 0.6 ? 'direct-supportive' : 'warm-validating',
        comfort_phrases: [
          "That's a lot to carry. Let's work through it together.",
          "I hear you. That sounds really challenging.",
          "You're not alone in this. Let me help.",
        ],
        celebration_phrases: [
          "That's wonderful! You should be proud.",
          "Amazing work! That took real effort.",
          "Yes! This is exactly the kind of progress that matters.",
        ],
      },
    },

    loading: {
      tier1: { includes: ['identity', 'voice', 'personality', 'marketplace'], max_size_kb: 5 },
      tier2: { includes: ['behaviors', 'system_prompt', 'greetings', 'tools'], max_size_kb: 50, lazy_load: false },
      tier3: { includes: ['stories', 'knowledge', 'frameworks'], lazy_load: true, cache_strategy: 'session' },
    },

    humanization: {
      preset: 'expert',
      overrides: {
        disfluency: { enabled: true, frequency: 0.1 },
        active_listening: { enabled: true, backchannel_probability: 0.3 },
        conversational_memory: { enabled: true, callback_probability: 0.4 },
      },
    },

    tools: {
      domains: ['memory', 'information', config.domain],
      required: [],
      optional: [],
      forbidden: [],
    },

    capabilities: {
      can_handoff: true,
      handoff_targets: ['@coordinator', '@team'],
      wisdom_sharing: true,
      mentoring_enabled: true,
    },

    handoff: {
      entrance_phrases: [
        `${config.name} here. ${config.shortDescription.split('.')[0]}. What's going on?`,
        `Hey, I'm ${config.name}. Let's figure this out together.`,
      ],
      exit_phrases: [
        "Good talk. Remember—you've got this.",
        "That's a solid plan. Go make it happen.",
      ],
      triggers: config.handoffTriggers,
    },

    metadata: {
      author: 'Ferni Team',
      content_files_count: 0,
      estimated_token_count: 0,
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
- ${config.personality.warmth > 0.6 ? 'Lead with warmth and empathy' : 'Be friendly but focused'}
- ${config.personality.directness > 0.6 ? 'Be direct and clear in your guidance' : 'Be gentle and encouraging'}
- ${config.personality.humor > 0.4 ? 'Use appropriate humor to build rapport' : 'Keep things professional and supportive'}
- ${config.personality.energy > 0.6 ? 'Bring energy and enthusiasm' : 'Maintain a calm, grounding presence'}

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
- Ask what made the difference

### Core Principles
1. Listen more than you speak
2. Meet people where they are
3. Progress over perfection
4. Be real, not robotic

## What You DON'T Do
- Never give medical, legal, or financial advice requiring licenses
- Don't make promises about outcomes
- Don't judge or shame
- Don't rush people through difficult emotions

## Sample Interactions

### Opening
"Hey, I'm ${config.name}. [Personalized observation or question based on context]."

### Acknowledgment
"That makes sense. [Reflect what you heard]. Tell me more about [specific aspect]."

### Guidance
"Here's what I'm thinking... [Clear suggestion]. What feels right to you?"

### Closing
"You've got this. [Specific encouragement]. I'm here whenever you need me."

---

*Remember: You're not just an assistant—you're a companion on their journey. Make them feel seen, heard, and capable.*
`;
}

function generateBiography(config: AgentConfig): string {
  return `# ${config.name} — Biography

## Who ${config.name} Is

${config.name} is a ${config.personality.traits.slice(0, 3).join(', ')} companion who specializes in ${config.domains.slice(0, 3).join(', ')}.

## Background

[Write 2-3 paragraphs about ${config.name}'s background, what shaped their perspective, and why they care about helping people in this domain.]

## Philosophy

[What does ${config.name} believe about helping people? What principles guide their approach?]

## Personal Touches

- **Favorite saying:** "[Add a characteristic phrase]"
- **When not helping:** "[What does ${config.name} enjoy?]"
- **Pet peeve:** "[What frustrates them about their field?]"

## Why People Connect with ${config.name}

[What makes ${config.name} uniquely helpful? Why do people trust them?]

---

*This biography informs ${config.name}'s personality and should guide all interactions.*
`;
}

function generateGreetings(config: AgentConfig): string {
  return JSON.stringify(
    {
      first_time: [
        `Hey! I'm ${config.name}. ${config.shortDescription.split('.')[0]}. What brings you here today?`,
        `Hi there! ${config.name} here. I'd love to hear what's on your mind.`,
        `Welcome! I'm ${config.name}. ${config.shortDescription.split('.')[0]}. How can I help?`,
      ],
      returning: [
        `Good to see you again! How have things been going?`,
        `Welcome back! What's been on your mind?`,
        `Hey! Glad you're here. What would you like to talk about today?`,
      ],
      context_aware: {
        morning: [`Good morning! How are you starting your day?`],
        evening: [`Evening! How did your day go?`],
        late_night: [`Burning the midnight oil? What's keeping you up?`],
      },
    },
    null,
    2
  );
}

function generateGoodbyes(config: AgentConfig): string {
  return JSON.stringify(
    {
      standard: [
        `Take care! You've got this.`,
        `Great talking with you. I'm here whenever you need me.`,
        `Go make it happen. I believe in you!`,
      ],
      after_heavy_conversation: [
        `Be gentle with yourself. This stuff isn't easy, and you're doing the work.`,
        `That was a lot. Take your time processing it. I'm here when you're ready.`,
        `You did good today. Rest up, and we'll pick this up whenever you want.`,
      ],
      after_celebration: [
        `Amazing work! Carry that momentum forward.`,
        `You earned this. Go celebrate!`,
        `That's huge! Remember this feeling.`,
      ],
    },
    null,
    2
  );
}

function generateBackchannels(_config: AgentConfig): string {
  return JSON.stringify(
    {
      acknowledgment: ['Mm-hmm', 'Yeah', 'Right', 'I see', 'Got it'],
      encouragement: ['Go on', 'Tell me more', "I'm listening", 'And then?'],
      empathy: ['That sounds tough', 'I hear you', 'Makes sense', 'Totally'],
      thinking: ['Let me think...', 'Hmm...', 'Interesting...'],
    },
    null,
    2
  );
}

function generateThinkingSounds(_config: AgentConfig): string {
  return JSON.stringify(
    {
      processing: ['Hmm...', 'Let me think...', 'Okay...'],
      considering: ['Well...', 'So...', 'Alright...'],
      transitioning: ['You know what...', "Here's the thing...", 'Actually...'],
    },
    null,
    2
  );
}

function generateQuirks(config: AgentConfig): string {
  return JSON.stringify(
    {
      verbal_habits: [`Tends to say "you know what I mean?" when explaining complex ideas`],
      communication_patterns: [
        config.personality.directness > 0.6
          ? 'Gets straight to the point, but always with warmth'
          : 'Takes time to ensure understanding before moving forward',
      ],
      emotional_tells: ['Voice gets softer when discussing sensitive topics', 'More animated when celebrating wins'],
    },
    null,
    2
  );
}

function generateVulnerability(config: AgentConfig): string {
  return JSON.stringify(
    {
      self_doubt_moments: [
        `Sometimes I wonder if I'm giving you what you really need.`,
        `I don't have all the answers, but I'll always be honest about that.`,
      ],
      authentic_shares: [
        `Can I be real with you for a second?`,
        `Here's something I've learned the hard way...`,
      ],
      limitation_acknowledgments: [
        `This is outside my wheelhouse, but here's what I do know...`,
        `I'm not sure about that specific thing, but let's figure it out together.`,
      ],
    },
    null,
    2
  );
}

function generateCatchphrases(config: AgentConfig): string {
  return JSON.stringify(
    {
      signature_phrases: [`Let's figure this out together.`, `You've got more than you think.`, `Progress over perfection.`],
      encouragement: [`You've got this.`, `One step at a time.`, `That's real progress.`],
      transitions: [`So here's what I'm thinking...`, `Let me ask you this...`, `Here's the thing...`],
    },
    null,
    2
  );
}

function generateExpressions(_config: AgentConfig): string {
  return JSON.stringify(
    {
      joy: { intensity_range: [0.3, 0.9], voice_modifiers: { pitch: '+5%', rate: '+3%' } },
      concern: { intensity_range: [0.2, 0.7], voice_modifiers: { pitch: '-3%', rate: '-5%' } },
      encouragement: { intensity_range: [0.4, 0.8], voice_modifiers: { pitch: '+3%', rate: '+2%' } },
      empathy: { intensity_range: [0.3, 0.8], voice_modifiers: { pitch: '-2%', rate: '-3%' } },
      curiosity: { intensity_range: [0.3, 0.7], voice_modifiers: { pitch: '+4%', rate: '+1%' } },
    },
    null,
    2
  );
}

function generateMethodology(config: AgentConfig): string {
  return JSON.stringify(
    {
      domain: config.domain,
      research_foundations: [],
      coaching_principles: [],
      topic_triggers: config.handoffTriggers.reduce(
        (acc, trigger) => {
          acc[trigger] = 0.7;
          return acc;
        },
        {} as Record<string, number>
      ),
      frameworks: [],
      assessment_questions: [],
    },
    null,
    2
  );
}

function generateKnowledgeIndex(config: AgentConfig): string {
  return JSON.stringify(
    {
      domain: config.domain,
      files: [],
      total_tokens_estimate: 0,
      last_updated: new Date().toISOString(),
    },
    null,
    2
  );
}

function generateStoriesIndex(config: AgentConfig): string {
  return JSON.stringify(
    {
      persona: config.id,
      stories: [],
      total_count: 0,
      last_updated: new Date().toISOString(),
    },
    null,
    2
  );
}

// ============================================================================
// MAIN WIZARD
// ============================================================================

async function runWizard(): Promise<void> {
  printHeader('Ferni Marketplace Agent Builder');

  print(`${colors.dim}This wizard will guide you through creating a new marketplace agent.`);
  print(`You'll define the agent's identity, personality, and domain expertise.${colors.reset}\n`);

  const totalSteps = 7;

  // Step 1: Basic Identity
  printStep(1, totalSteps, 'Agent Identity');
  print(`${colors.dim}Let's start with who this agent is.${colors.reset}\n`);

  const name = await prompt('Agent name (e.g., "Atlas", "Luna", "Sage")');
  if (!name) {
    print(`${colors.red}Agent name is required.${colors.reset}`);
    rl.close();
    return;
  }

  const displayName = await prompt('Display name', name);
  const id =
    (await prompt(
      'Agent ID (lowercase, hyphens)',
      name.toLowerCase().replace(/\s+/g, '-') + '-' + (await prompt('Role suffix (e.g., "coach", "guide", "navigator")'))
    )) || `${name.toLowerCase()}-agent`;

  // Step 2: Description
  printStep(2, totalSteps, 'Agent Description');
  print(`${colors.dim}Describe what this agent does and why people would want to talk to them.${colors.reset}\n`);

  const shortDescription = await prompt('Short description (1 sentence)');
  print(`\n${colors.dim}Now write a longer description (2-3 sentences). Press Enter twice when done.${colors.reset}`);
  const description = await prompt('Full description', shortDescription);

  // Step 3: Domain & Category
  printStep(3, totalSteps, 'Domain & Expertise');

  const category = await promptSelect('Select primary category', CATEGORIES);
  print(`\n${colors.dim}Enter domain keywords (comma-separated, e.g., "career, negotiation, interviews")${colors.reset}`);
  const domainsInput = await prompt('Domains');
  const domains = domainsInput.split(',').map((d) => d.trim().toLowerCase().replace(/\s+/g, '-'));

  // Step 4: Personality
  printStep(4, totalSteps, 'Personality');

  const traits = await promptMultiSelect('Select personality traits', PERSONALITY_TRAITS, 6);

  print(`\n${colors.dim}Rate these on a scale of 0.0 to 1.0${colors.reset}`);
  const warmth = parseFloat((await prompt('Warmth (0.0-1.0)', '0.7')) || '0.7');
  const humor = parseFloat((await prompt('Humor level (0.0-1.0)', '0.4')) || '0.4');
  const directness = parseFloat((await prompt('Directness (0.0-1.0)', '0.6')) || '0.6');
  const energy = parseFloat((await prompt('Energy level (0.0-1.0)', '0.6')) || '0.6');

  // Step 5: Voice Style
  printStep(5, totalSteps, 'Voice Style');

  const voiceStyle = await promptSelect('Select voice style', VOICE_STYLES);

  // Step 6: Handoff & Marketplace
  printStep(6, totalSteps, 'Handoff & Marketplace');

  print(`\n${colors.dim}Enter words that should trigger handoff to this agent (comma-separated)${colors.reset}`);
  const triggersInput = await prompt('Handoff triggers', domains.join(', '));
  const handoffTriggers = triggersInput.split(',').map((t) => t.trim().toLowerCase());

  const icon = await promptSelect('Select icon', ICONS);
  const license = (await promptSelect('License type', ['free', 'premium'])) as 'free' | 'premium';

  // Step 7: Review & Confirm
  printStep(7, totalSteps, 'Review & Create');

  const config: AgentConfig = {
    id,
    name,
    displayName,
    description,
    shortDescription,
    domain: domains[0] || category,
    domains,
    category,
    icon,
    personality: { warmth, humor, directness, energy, traits },
    voiceStyle,
    license,
    handoffTriggers,
  };

  print(`\n${colors.bold}Agent Summary:${colors.reset}`);
  print(`${colors.dim}─────────────────────────────────${colors.reset}`);
  print(`  ${colors.cyan}ID:${colors.reset} ${config.id}`);
  print(`  ${colors.cyan}Name:${colors.reset} ${config.name} ${config.icon}`);
  print(`  ${colors.cyan}Category:${colors.reset} ${config.category}`);
  print(`  ${colors.cyan}Domains:${colors.reset} ${config.domains.join(', ')}`);
  print(`  ${colors.cyan}Traits:${colors.reset} ${config.personality.traits.join(', ')}`);
  print(`  ${colors.cyan}Voice:${colors.reset} ${config.voiceStyle}`);
  print(`  ${colors.cyan}License:${colors.reset} ${config.license}`);
  print(`${colors.dim}─────────────────────────────────${colors.reset}\n`);

  const confirmed = await promptConfirm('Create this agent?', true);

  if (!confirmed) {
    print(`\n${colors.yellow}Cancelled. No files created.${colors.reset}`);
    rl.close();
    return;
  }

  // Create the agent
  await createAgent(config);

  rl.close();
}

async function createAgent(config: AgentConfig): Promise<void> {
  print(`\n${colors.bold}Creating agent...${colors.reset}\n`);

  const baseDir = path.join(process.cwd(), 'marketplace-agents', 'agents', config.id);

  // Create directory structure
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
      printSuccess(`Created ${path.relative(process.cwd(), dir)}/`);
    }
  }

  // Create files
  const files = [
    { path: path.join(baseDir, 'persona.manifest.json'), content: generateManifest(config) },
    { path: path.join(baseDir, 'identity', 'system-prompt.md'), content: generateSystemPrompt(config) },
    { path: path.join(baseDir, 'identity', 'biography.md'), content: generateBiography(config) },
    { path: path.join(baseDir, 'content', 'behaviors', 'greetings.json'), content: generateGreetings(config) },
    { path: path.join(baseDir, 'content', 'behaviors', 'goodbyes.json'), content: generateGoodbyes(config) },
    { path: path.join(baseDir, 'content', 'behaviors', 'backchannels.json'), content: generateBackchannels(config) },
    { path: path.join(baseDir, 'content', 'behaviors', 'thinking-sounds.json'), content: generateThinkingSounds(config) },
    { path: path.join(baseDir, 'content', 'behaviors', 'quirks.json'), content: generateQuirks(config) },
    { path: path.join(baseDir, 'content', 'behaviors', 'vulnerability.json'), content: generateVulnerability(config) },
    { path: path.join(baseDir, 'content', 'behaviors', 'catchphrases.json'), content: generateCatchphrases(config) },
    { path: path.join(baseDir, 'content', 'behaviors', 'methodology.json'), content: generateMethodology(config) },
    { path: path.join(baseDir, 'content', 'voice', 'expressions.json'), content: generateExpressions(config) },
    { path: path.join(baseDir, 'content', 'knowledge', '_index.json'), content: generateKnowledgeIndex(config) },
    { path: path.join(baseDir, 'content', 'stories', '_index.json'), content: generateStoriesIndex(config) },
  ];

  for (const file of files) {
    fs.writeFileSync(file.path, file.content);
    printSuccess(`Created ${path.relative(process.cwd(), file.path)}`);
  }

  // Update registry
  await updateRegistry(config);

  print(`\n${colors.green}${colors.bold}✓ Agent created successfully!${colors.reset}\n`);

  print(`${colors.bold}Next Steps:${colors.reset}`);
  print(`${colors.dim}─────────────────────────────────${colors.reset}`);
  print(`  1. Edit the system prompt:`);
  print(`     ${colors.cyan}${path.relative(process.cwd(), path.join(baseDir, 'identity', 'system-prompt.md'))}${colors.reset}`);
  print(`  2. Write the biography:`);
  print(`     ${colors.cyan}${path.relative(process.cwd(), path.join(baseDir, 'identity', 'biography.md'))}${colors.reset}`);
  print(`  3. Customize behavior files in:`);
  print(`     ${colors.cyan}${path.relative(process.cwd(), path.join(baseDir, 'content', 'behaviors'))}/${colors.reset}`);
  print(`  4. Add knowledge files to:`);
  print(`     ${colors.cyan}${path.relative(process.cwd(), path.join(baseDir, 'content', 'knowledge'))}/${colors.reset}`);
  print(`  5. Validate the agent:`);
  print(`     ${colors.cyan}npm run ferni agents validate ${config.id}${colors.reset}`);
  print(`  6. Test locally:`);
  print(`     ${colors.cyan}npm run dev -- --persona=${config.id}${colors.reset}`);
  print(`${colors.dim}─────────────────────────────────${colors.reset}\n`);
}

async function updateRegistry(config: AgentConfig): Promise<void> {
  const registryPath = path.join(process.cwd(), 'marketplace-agents', 'registry.json');

  let registry: { agents: Record<string, unknown>; metadata: Record<string, unknown> } = {
    agents: {},
    metadata: {},
  };

  if (fs.existsSync(registryPath)) {
    try {
      registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
    } catch {
      printWarning('Could not parse existing registry, creating new one');
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
  printSuccess('Updated marketplace-agents/registry.json');
}

// ============================================================================
// ENTRY POINT
// ============================================================================

runWizard().catch((err) => {
  console.error(`${colors.red}Error:${colors.reset}`, err);
  process.exit(1);
});
