/**
 * Training Data Generator for ONNX Router
 *
 * Generates comprehensive training data using:
 * 1. Semantic tool definitions (examples, phrases, patterns)
 * 2. Template-based augmentation
 * 3. LLM-based paraphrasing (optional)
 *
 * Target: ~100 examples per tool for 758 tools = 75,800 examples
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

interface SemanticTool {
  id: string;
  name: string;
  description: string;
  examples?: string[];
  triggers?: {
    phrases?: string[];
    patterns?: RegExp[];
    keywords?: Array<{ word: string; weight: number }>;
  };
  counterExamples?: string[];
}

// ============================================================================
// AUGMENTATION TEMPLATES
// ============================================================================

const PREFIXES = [
  '',
  'Can you ',
  'Could you ',
  'I need to ',
  'I want to ',
  'Please ',
  'Help me ',
  "I'd like to ",
  'I need help with ',
  'Can you help me ',
];

const SUFFIXES = [
  '',
  ' please',
  ' for me',
  ' right now',
  ' when you get a chance',
];

const QUERY_TEMPLATES: Record<string, string[]> = {
  // Calendar/Scheduling
  schedule: [
    'schedule {action}',
    'set up {action}',
    'book {action}',
    'arrange {action}',
    'plan {action}',
  ],
  reminder: [
    'remind me to {action}',
    'set a reminder for {action}',
    'don\'t let me forget to {action}',
    'alert me about {action}',
  ],
  // Information
  get: [
    'what is {subject}',
    'tell me about {subject}',
    'find out about {subject}',
    'look up {subject}',
    'show me {subject}',
  ],
  search: [
    'search for {subject}',
    'find {subject}',
    'look for {subject}',
    'locate {subject}',
  ],
  // Actions
  create: [
    'create {object}',
    'make {object}',
    'set up {object}',
    'start {object}',
  ],
  track: [
    'track {subject}',
    'monitor {subject}',
    'keep an eye on {subject}',
    'follow {subject}',
  ],
  // Emotional/Coaching
  help: [
    'I need help with {subject}',
    'can you help me with {subject}',
    'I\'m struggling with {subject}',
    'I need support for {subject}',
  ],
  process: [
    'I\'m dealing with {subject}',
    'I\'m going through {subject}',
    'I\'m experiencing {subject}',
    'I need to work through {subject}',
  ],
};

// ============================================================================
// TOOL NAME TO DESCRIPTION MAPPING
// ============================================================================

/**
 * Generate natural language descriptions for tool IDs
 */
function toolIdToDescription(toolId: string): { action: string; subject: string; object: string } {
  // Convert camelCase to words
  const words = toolId
    .replace(/([A-Z])/g, ' $1')
    .toLowerCase()
    .trim()
    .split(' ');

  // Common verb patterns
  const verbMap: Record<string, string> = {
    get: 'get',
    set: 'set',
    create: 'create',
    track: 'track',
    find: 'find',
    check: 'check',
    schedule: 'schedule',
    explore: 'explore',
    assess: 'assess',
    navigate: 'navigate',
    embrace: 'embrace',
    practice: 'practice',
    plan: 'plan',
    share: 'share',
    celebrate: 'celebrate',
    identify: 'identify',
    suggest: 'suggest',
    list: 'list',
    search: 'search',
    process: 'process',
    manage: 'manage',
    review: 'review',
    analyze: 'analyze',
    build: 'build',
    prepare: 'prepare',
    connect: 'connect',
    discover: 'discover',
  };

  const action = verbMap[words[0]] || words[0];
  const subject = words.slice(1).join(' ');
  const object = words.slice(1).join(' ');

  return { action, subject, object };
}

/**
 * Generate example queries for a tool ID
 */
function generateExamplesForTool(toolId: string): string[] {
  const { action, subject } = toolIdToDescription(toolId);
  const examples: string[] = [];

  // Direct examples
  examples.push(`${action} ${subject}`);
  examples.push(`help me ${action} ${subject}`);
  examples.push(`I need to ${action} ${subject}`);
  examples.push(`can you ${action} ${subject}`);
  examples.push(`I want to ${action} ${subject}`);

  // Template-based
  const templates = QUERY_TEMPLATES[action] || QUERY_TEMPLATES['get'];
  if (templates) {
    templates.forEach(template => {
      const filled = template
        .replace('{action}', `${action} ${subject}`)
        .replace('{subject}', subject)
        .replace('{object}', subject);
      examples.push(filled);
    });
  }

  // Add prefixes and suffixes
  const base = `${action} ${subject}`;
  PREFIXES.slice(0, 5).forEach(prefix => {
    examples.push(`${prefix}${base}`);
  });

  // Contextual variations
  const contextualVariations = [
    `I'm trying to ${base}`,
    `How do I ${base}`,
    `What's the best way to ${base}`,
    `I'd like to ${base}`,
    `Could you ${base} for me`,
    `Let's ${base}`,
  ];
  examples.push(...contextualVariations);

  // Clean and dedupe
  return [...new Set(examples.map(e => e.trim().toLowerCase()))].filter(e => e.length > 3);
}

// ============================================================================
// MAIN GENERATOR
// ============================================================================

async function main() {
  console.log('=== Training Data Generator ===\n');

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

  console.log(`Existing training data has ${existingExamples.length} examples covering ${Object.keys(existingCounts).length} tools`);

  // Generate new examples for missing tools
  const newExamples: TrainingExample[] = [];
  const targetPerTool = 50; // Target examples per tool
  let exampleId = 0;

  for (const toolId of allToolIds) {
    const existingCount = existingCounts[toolId] || 0;
    const needed = Math.max(0, targetPerTool - existingCount);

    if (needed === 0) continue;

    const generated = generateExamplesForTool(toolId);
    const toAdd = generated.slice(0, needed);

    toAdd.forEach(query => {
      newExamples.push({
        id: `gen_${Date.now()}_${exampleId++}`,
        query,
        selected_tools: [toolId],
        is_open_intent: false,
        source: 'generated',
      });
    });
  }

  console.log(`\nGenerated ${newExamples.length} new examples`);

  // Save augmented training data
  const augmentedPath = path.join(__dirname, 'data/train_augmented.jsonl');
  const allExamples = [...existingExamples, ...newExamples];

  fs.writeFileSync(
    augmentedPath,
    allExamples.map(ex => JSON.stringify(ex)).join('\n') + '\n'
  );

  console.log(`\nSaved ${allExamples.length} total examples to ${augmentedPath}`);

  // Stats
  const newCounts: Record<string, number> = {};
  allExamples.forEach(ex => {
    ex.selected_tools.forEach(tool => {
      newCounts[tool] = (newCounts[tool] || 0) + 1;
    });
  });

  const coverageOld = Object.keys(existingCounts).length;
  const coverageNew = Object.keys(newCounts).length;

  console.log(`\n=== Coverage Improvement ===`);
  console.log(`Before: ${coverageOld}/${allToolIds.length} tools (${(coverageOld/allToolIds.length*100).toFixed(1)}%)`);
  console.log(`After:  ${coverageNew}/${allToolIds.length} tools (${(coverageNew/allToolIds.length*100).toFixed(1)}%)`);

  // Show sample of new examples
  console.log(`\n=== Sample New Examples ===`);
  newExamples.slice(0, 10).forEach(ex => {
    console.log(`  "${ex.query}" → ${ex.selected_tools[0]}`);
  });
}

main().catch(console.error);
