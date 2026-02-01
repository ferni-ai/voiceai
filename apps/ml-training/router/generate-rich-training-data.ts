/**
 * Rich Training Data Generator for ONNX Router
 *
 * Generates natural, conversational training data using:
 * 1. Semantic tool definitions (examples, phrases, patterns)
 * 2. Sophisticated template-based augmentation
 * 3. Contextual variations (time of day, emotional state, etc.)
 *
 * Target: 100+ examples per tool
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// TYPES
// ============================================================================

interface TrainingExample {
  id: string;
  query: string;
  selected_tools: string[];
  is_open_intent: boolean;
  source: string;
}

// ============================================================================
// NATURAL LANGUAGE PATTERNS
// ============================================================================

const CONVERSATIONAL_FRAMES = [
  // Direct requests
  '{action}',
  'Please {action}',
  'Can you {action}',
  'Could you {action}',
  'I need to {action}',
  'I want to {action}',
  'I\'d like to {action}',
  'Help me {action}',
  'Can you help me {action}',
  'I need help with {gerund}',

  // Questions
  'How do I {action}',
  'What\'s the best way to {action}',
  'Can I {action}',
  'Is it possible to {action}',
  'How can I {action}',

  // Statements
  'I\'m trying to {action}',
  'I want to {action}',
  'I need to {action}',
  'I should {action}',
  'I have to {action}',

  // Emotional context
  'I\'m feeling like I need to {action}',
  'I think I should {action}',
  'I\'ve been meaning to {action}',
  'It\'s time to {action}',

  // Casual
  'Let\'s {action}',
  'Time to {action}',
  'Gonna {action}',
  'Wanna {action}',
];

const TIME_CONTEXTS = [
  '',
  ' right now',
  ' today',
  ' tomorrow',
  ' this week',
  ' later',
  ' when I get home',
  ' at 3pm',
  ' in the morning',
  ' tonight',
];

const EMOTIONAL_PREFIXES = [
  '',
  'I\'m feeling stressed, ',
  'I\'m a bit anxious, ',
  'I need some peace, ',
  'Things are overwhelming, ',
  'I\'m excited to ',
  'I\'m curious about ',
  'I\'ve been thinking about ',
];

// ============================================================================
// TOOL CATEGORY PATTERNS
// ============================================================================

interface ToolPattern {
  verbs: string[];
  objects: string[];
  contexts: string[];
  examples: string[];
}

const CATEGORY_PATTERNS: Record<string, ToolPattern> = {
  // Calendar & Scheduling
  schedule: {
    verbs: ['schedule', 'book', 'set up', 'arrange', 'plan', 'create'],
    objects: ['a meeting', 'an appointment', 'a call', 'time for', 'a session'],
    contexts: ['for tomorrow', 'next week', 'with John', 'at 2pm', 'for an hour'],
    examples: [
      'Schedule a meeting with Sarah for tomorrow',
      'Book time for a doctor appointment',
      'Set up a call with the team',
      'Can you arrange a meeting for Friday',
    ],
  },

  // Reminders
  reminder: {
    verbs: ['remind', 'alert', 'notify', 'don\'t let me forget'],
    objects: ['to call', 'to send', 'about the', 'to buy', 'to check'],
    contexts: ['at 5pm', 'tomorrow morning', 'when I get home', 'before the meeting'],
    examples: [
      'Remind me to call mom at 5pm',
      'Don\'t let me forget to buy milk',
      'Set a reminder for the meeting tomorrow',
      'Alert me when it\'s time to leave',
    ],
  },

  // Information & Search
  get: {
    verbs: ['get', 'find', 'show', 'tell me', 'what is', 'look up'],
    objects: ['the weather', 'my schedule', 'information about', 'news about', 'details on'],
    contexts: ['in New York', 'for today', 'about Tesla', 'for this week'],
    examples: [
      'What\'s the weather like today',
      'Show me my schedule for tomorrow',
      'Find information about the event',
      'Tell me about the news',
    ],
  },

  // Tracking & Monitoring
  track: {
    verbs: ['track', 'monitor', 'log', 'record', 'keep track of'],
    objects: ['my habits', 'my progress', 'my mood', 'my sleep', 'my expenses'],
    contexts: ['daily', 'this week', 'over time', 'consistently'],
    examples: [
      'Track my water intake',
      'Log my workout today',
      'Record my mood',
      'Keep track of my spending',
    ],
  },

  // Emotional Support
  process: {
    verbs: ['help me process', 'work through', 'deal with', 'understand', 'cope with'],
    objects: ['my feelings', 'this situation', 'my grief', 'my anxiety', 'these emotions'],
    contexts: ['about the breakup', 'after the loss', 'around work', 'with my family'],
    examples: [
      'Help me process my feelings about the breakup',
      'I need to work through some difficult emotions',
      'Can you help me deal with my anxiety',
      'I\'m struggling to cope with this loss',
    ],
  },

  // Navigation & Guidance
  navigate: {
    verbs: ['help me navigate', 'guide me through', 'how do I handle', 'what should I do about'],
    objects: ['this conflict', 'this transition', 'this relationship', 'this situation'],
    contexts: ['with my boss', 'at work', 'with my partner', 'in my life'],
    examples: [
      'Help me navigate this conflict with my coworker',
      'How do I handle this difficult conversation',
      'Guide me through this career transition',
      'What should I do about this situation',
    ],
  },

  // Exploration & Discovery
  explore: {
    verbs: ['explore', 'discover', 'find out', 'learn about', 'understand'],
    objects: ['my options', 'new possibilities', 'different approaches', 'my values'],
    contexts: ['for my career', 'in my relationship', 'for personal growth', 'in life'],
    examples: [
      'Help me explore my career options',
      'I want to discover my values',
      'Let\'s explore different approaches',
      'Help me understand my patterns',
    ],
  },

  // Assessment & Evaluation
  assess: {
    verbs: ['assess', 'evaluate', 'check', 'measure', 'analyze'],
    objects: ['my progress', 'my situation', 'my health', 'my relationship', 'my career'],
    contexts: ['honestly', 'objectively', 'in detail', 'thoroughly'],
    examples: [
      'Assess my career progress',
      'Help me evaluate my relationship',
      'Can you analyze my spending patterns',
      'Check how I\'m doing with my goals',
    ],
  },

  // Celebration & Acknowledgment
  celebrate: {
    verbs: ['celebrate', 'acknowledge', 'recognize', 'appreciate', 'honor'],
    objects: ['this win', 'my progress', 'this milestone', 'this achievement', 'this moment'],
    contexts: ['with me', 'properly', 'together', 'as it deserves'],
    examples: [
      'Help me celebrate this achievement',
      'I want to acknowledge my progress',
      'Let\'s recognize this milestone',
      'Can we appreciate this moment',
    ],
  },

  // Planning & Organization
  plan: {
    verbs: ['plan', 'organize', 'prepare for', 'set up', 'create a plan for'],
    objects: ['my week', 'this project', 'the event', 'my goals', 'the trip'],
    contexts: ['in detail', 'step by step', 'carefully', 'efficiently'],
    examples: [
      'Help me plan my week',
      'Let\'s organize this project',
      'Can you help me prepare for the meeting',
      'Create a plan for my goals',
    ],
  },

  // Communication
  share: {
    verbs: ['share', 'tell', 'express', 'communicate', 'convey'],
    objects: ['my thoughts', 'this insight', 'my feelings', 'this message', 'my gratitude'],
    contexts: ['with my partner', 'to the team', 'clearly', 'honestly'],
    examples: [
      'Help me share my thoughts effectively',
      'I want to express my gratitude',
      'Can you help me communicate this better',
      'Help me convey my feelings',
    ],
  },

  // Practice & Development
  practice: {
    verbs: ['practice', 'work on', 'improve', 'develop', 'strengthen'],
    objects: ['my skills', 'self-compassion', 'boundaries', 'communication', 'mindfulness'],
    contexts: ['daily', 'consistently', 'with guidance', 'step by step'],
    examples: [
      'Help me practice self-compassion',
      'I want to work on my communication skills',
      'Can we practice setting boundaries',
      'Help me develop mindfulness',
    ],
  },

  // Finding & Discovery
  find: {
    verbs: ['find', 'locate', 'search for', 'look for', 'discover'],
    objects: ['a therapist', 'resources', 'support groups', 'information', 'help'],
    contexts: ['near me', 'online', 'that fits my needs', 'affordable'],
    examples: [
      'Find a therapist near me',
      'Help me locate support groups',
      'Search for resources on anxiety',
      'Look for affordable options',
    ],
  },

  // Suggestions & Recommendations
  suggest: {
    verbs: ['suggest', 'recommend', 'give me ideas for', 'what do you think about'],
    objects: ['activities', 'books', 'strategies', 'approaches', 'options'],
    contexts: ['for relaxation', 'to help with stress', 'for the weekend', 'for self-care'],
    examples: [
      'Suggest some relaxation activities',
      'Recommend books on personal growth',
      'Give me ideas for date night',
      'What strategies do you suggest for stress',
    ],
  },

  // Embracing & Accepting
  embrace: {
    verbs: ['embrace', 'accept', 'come to terms with', 'make peace with', 'welcome'],
    objects: ['this change', 'uncertainty', 'imperfection', 'my journey', 'the unknown'],
    contexts: ['gracefully', 'openly', 'with courage', 'fully'],
    examples: [
      'Help me embrace this change',
      'I want to accept uncertainty',
      'Can you help me make peace with this',
      'I need to welcome this new chapter',
    ],
  },

  // Identification & Recognition
  identify: {
    verbs: ['identify', 'recognize', 'spot', 'notice', 'become aware of'],
    objects: ['patterns', 'triggers', 'my needs', 'warning signs', 'opportunities'],
    contexts: ['in my behavior', 'in my relationships', 'at work', 'in my life'],
    examples: [
      'Help me identify my triggers',
      'I want to recognize patterns in my behavior',
      'Can you help me spot warning signs',
      'Help me become aware of my needs',
    ],
  },

  // Listing & Organization
  list: {
    verbs: ['list', 'show me', 'what are my', 'display', 'enumerate'],
    objects: ['tasks', 'goals', 'options', 'priorities', 'items'],
    contexts: ['for today', 'this week', 'in order', 'by priority'],
    examples: [
      'List my tasks for today',
      'Show me my goals',
      'What are my options',
      'Display my priorities',
    ],
  },

  // Checking & Verification
  check: {
    verbs: ['check', 'verify', 'confirm', 'see if', 'make sure'],
    objects: ['my calendar', 'the status', 'my progress', 'availability', 'the details'],
    contexts: ['for tomorrow', 'quickly', 'before the meeting', 'one more time'],
    examples: [
      'Check my calendar for tomorrow',
      'Verify the meeting details',
      'See if I\'m free at 3pm',
      'Make sure I have time for this',
    ],
  },
};

// ============================================================================
// GENERATOR FUNCTIONS
// ============================================================================

function extractVerbFromToolId(toolId: string): string {
  const verbs = [
    'get', 'set', 'create', 'track', 'find', 'check', 'schedule', 'explore',
    'assess', 'navigate', 'embrace', 'practice', 'plan', 'share', 'celebrate',
    'identify', 'suggest', 'list', 'search', 'process', 'manage', 'review',
    'analyze', 'build', 'prepare', 'connect', 'discover', 'acknowledge',
    'request', 'trigger', 'log', 'record', 'start', 'stop', 'pause', 'resume',
    'play', 'skip', 'adjust', 'control', 'activate', 'deactivate', 'enable',
    'disable', 'add', 'remove', 'update', 'delete', 'save', 'load', 'send',
    'receive', 'call', 'text', 'email', 'invite', 'accept', 'decline', 'cancel',
    'transfer', 'connect', 'disconnect', 'open', 'close', 'show', 'hide',
    'expand', 'collapse', 'zoom', 'focus', 'blur', 'select', 'deselect',
  ];

  for (const verb of verbs) {
    if (toolId.toLowerCase().startsWith(verb)) {
      return verb;
    }
  }

  // Extract first word from camelCase
  const match = toolId.match(/^[a-z]+/);
  return match ? match[0] : 'handle';
}

function toolIdToNaturalLanguage(toolId: string): string[] {
  // Convert camelCase to words
  const words = toolId
    .replace(/([A-Z])/g, ' $1')
    .toLowerCase()
    .trim();

  const verb = extractVerbFromToolId(toolId);
  const subject = words.replace(new RegExp(`^${verb}\\s*`), '');

  const results: string[] = [];

  // Get category patterns
  const pattern = CATEGORY_PATTERNS[verb] || CATEGORY_PATTERNS['get'];

  // Generate from patterns
  if (pattern) {
    // Use verbs from pattern
    for (const v of pattern.verbs.slice(0, 3)) {
      results.push(`${v} ${subject}`);
    }

    // Use example templates
    for (const ex of pattern.examples.slice(0, 2)) {
      // Replace generic objects with specific subject
      const adapted = ex
        .replace(/my \w+/, `my ${subject}`)
        .replace(/this \w+/, `this ${subject}`)
        .replace(/the \w+/, `the ${subject}`);
      if (!results.includes(adapted)) {
        results.push(adapted);
      }
    }
  }

  // Generate conversational variations
  const gerund = verb.endsWith('e') ? verb.slice(0, -1) + 'ing' : verb + 'ing';

  for (const frame of CONVERSATIONAL_FRAMES.slice(0, 10)) {
    const filled = frame
      .replace('{action}', `${verb} ${subject}`)
      .replace('{gerund}', `${gerund} ${subject}`);
    if (!results.includes(filled)) {
      results.push(filled);
    }
  }

  // Add time contexts to some
  const withTime = results.slice(0, 3).map(r => {
    const time = TIME_CONTEXTS[Math.floor(Math.random() * TIME_CONTEXTS.length)];
    return r + time;
  });
  results.push(...withTime);

  // Add emotional context to some
  const withEmotion = results.slice(0, 2).map(r => {
    const prefix = EMOTIONAL_PREFIXES[Math.floor(Math.random() * EMOTIONAL_PREFIXES.length)];
    return prefix + r;
  });
  results.push(...withEmotion.filter(e => e.length < 100));

  // Clean and dedupe
  return [...new Set(results.map(r => r.trim().replace(/\s+/g, ' ')))].filter(r => r.length > 5);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('=== Rich Training Data Generator ===\n');

  // Load label map
  const labelMapPath = path.join(__dirname, 'outputs/ferni-router-rich/label_map.json');
  const labelMap: Record<string, number> = JSON.parse(fs.readFileSync(labelMapPath, 'utf-8'));
  const allToolIds = Object.keys(labelMap);

  console.log(`Label map has ${allToolIds.length} tools`);

  // Load existing training data
  const existingTrainPath = path.join(__dirname, 'data/train.jsonl');
  const existingLines = fs.readFileSync(existingTrainPath, 'utf-8').split('\n').filter(Boolean);
  const existingExamples: TrainingExample[] = existingLines.map(line => JSON.parse(line));

  // Count existing examples per tool
  const existingCounts: Record<string, number> = {};
  existingExamples.forEach(ex => {
    ex.selected_tools.forEach(tool => {
      existingCounts[tool] = (existingCounts[tool] || 0) + 1;
    });
  });

  console.log(`Existing: ${existingExamples.length} examples covering ${Object.keys(existingCounts).length} tools`);

  // Generate rich examples for all tools
  const newExamples: TrainingExample[] = [];
  const targetPerTool = 100;
  let exampleId = 0;

  for (const toolId of allToolIds) {
    const existingCount = existingCounts[toolId] || 0;
    const needed = Math.max(0, targetPerTool - existingCount);

    if (needed === 0) continue;

    const generated = toolIdToNaturalLanguage(toolId);
    const toAdd = generated.slice(0, needed);

    toAdd.forEach(query => {
      newExamples.push({
        id: `rich_${Date.now()}_${exampleId++}`,
        query,
        selected_tools: [toolId],
        is_open_intent: false,
        source: 'generated_rich',
      });
    });
  }

  console.log(`Generated ${newExamples.length} new rich examples`);

  // Combine and save
  const allExamples = [...existingExamples, ...newExamples];
  const outputPath = path.join(__dirname, 'data/train_rich.jsonl');

  fs.writeFileSync(
    outputPath,
    allExamples.map(ex => JSON.stringify(ex)).join('\n') + '\n'
  );

  console.log(`\nSaved ${allExamples.length} total examples to ${outputPath}`);

  // Stats
  const newCounts: Record<string, number> = {};
  allExamples.forEach(ex => {
    ex.selected_tools.forEach(tool => {
      newCounts[tool] = (newCounts[tool] || 0) + 1;
    });
  });

  const coverage = Object.keys(newCounts).length;
  console.log(`\n=== Coverage: ${coverage}/${allToolIds.length} (${(coverage/allToolIds.length*100).toFixed(1)}%) ===`);

  // Show examples by category
  console.log('\n=== Sample Examples by Category ===');

  const sampleTools = ['scheduleReminder', 'trackHabit', 'navigateConflict', 'embraceUncertainty', 'assessBurnout'];
  for (const tool of sampleTools) {
    const examples = allExamples.filter(ex => ex.selected_tools.includes(tool)).slice(0, 3);
    if (examples.length > 0) {
      console.log(`\n${tool}:`);
      examples.forEach(ex => console.log(`  - "${ex.query}"`));
    }
  }
}

main().catch(console.error);
