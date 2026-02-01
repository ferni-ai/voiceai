/**
 * Quality Training Data Generator
 *
 * Generates high-quality, contextually appropriate training examples.
 * Uses tool-specific templates and avoids generic patterns that don't fit.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface TrainingExample {
  id: string;
  query: string;
  selected_tools: string[];
  is_open_intent: boolean;
  source: string;
}

// ============================================================================
// DOMAIN-SPECIFIC TEMPLATES
// ============================================================================

interface DomainTemplates {
  patterns: string[];
  fillers: Record<string, string[]>;
}

const DOMAIN_TEMPLATES: Record<string, DomainTemplates> = {
  // Music & Audio
  music: {
    patterns: [
      'play {genre} music',
      'put on some {genre}',
      'I want to listen to {genre}',
      'play something {mood}',
      'can you play {genre}',
      'let\'s hear some {genre}',
      'queue up some {genre}',
      'play my {playlist} playlist',
      '{command} the music',
      '{command} this song',
    ],
    fillers: {
      genre: ['jazz', 'rock', 'classical', 'pop', 'hip hop', 'country', 'electronic', 'ambient', 'lo-fi', 'indie'],
      mood: ['relaxing', 'upbeat', 'chill', 'energetic', 'calm', 'happy', 'mellow'],
      playlist: ['workout', 'focus', 'sleep', 'party', 'driving', 'cooking'],
      command: ['pause', 'stop', 'skip', 'resume', 'restart'],
    },
  },

  // Weather
  weather: {
    patterns: [
      'what\'s the weather {when}',
      'is it going to rain {when}',
      'will it be {condition} {when}',
      'weather forecast for {location}',
      'what\'s the temperature {when}',
      'do I need an umbrella {when}',
      'how\'s the weather in {location}',
      'weather {when}',
    ],
    fillers: {
      when: ['today', 'tomorrow', 'this week', 'right now', 'this weekend', 'tonight', 'this afternoon'],
      condition: ['sunny', 'rainy', 'cold', 'warm', 'hot', 'cloudy'],
      location: ['New York', 'here', 'downtown', 'at home', 'at the beach'],
    },
  },

  // Calendar & Scheduling
  calendar: {
    patterns: [
      'schedule {event} {when}',
      'add {event} to my calendar',
      'book {duration} for {event}',
      'what\'s on my calendar {when}',
      'am I free {when}',
      'create an event for {event}',
      'set up a meeting {when}',
      'block time for {event}',
      'cancel my {event}',
      'reschedule {event} to {when}',
    ],
    fillers: {
      event: ['a meeting', 'lunch', 'the doctor appointment', 'a call', 'focus time', 'workout', 'date night'],
      when: ['tomorrow', 'at 3pm', 'next week', 'Monday morning', 'this Friday', 'for next month'],
      duration: ['an hour', '30 minutes', '2 hours', 'the afternoon'],
    },
  },

  // Reminders
  reminder: {
    patterns: [
      'remind me to {action} {when}',
      'set a reminder {when} to {action}',
      'don\'t let me forget to {action}',
      'alert me {when} about {topic}',
      'remind me about {topic}',
      'I need to remember to {action}',
      'set an alarm for {time}',
    ],
    fillers: {
      action: ['call mom', 'take my medicine', 'buy groceries', 'submit the report', 'pick up dry cleaning', 'send the email', 'water the plants'],
      when: ['at 3pm', 'tomorrow morning', 'in an hour', 'when I get home', 'before the meeting', 'tonight'],
      topic: ['the dentist appointment', 'Sarah\'s birthday', 'the deadline', 'the meeting'],
      time: ['6am', '7:30am', '5pm', '8pm'],
    },
  },

  // Habits & Tracking
  habits: {
    patterns: [
      'log my {habit}',
      'I {completed} my {habit}',
      'track {habit}',
      'mark {habit} as done',
      'how\'s my {habit} streak',
      'did I {habit} today',
      'add {habit} to my habits',
      'start tracking {habit}',
      'show my {habit} progress',
    ],
    fillers: {
      habit: ['workout', 'meditation', 'reading', 'water intake', 'sleep', 'journaling', 'vitamins', 'exercise'],
      completed: ['did', 'finished', 'completed', 'just did'],
    },
  },

  // Emotional Support
  emotional: {
    patterns: [
      'I\'m feeling {emotion}',
      'I need help with {issue}',
      'can we talk about {topic}',
      'I\'m struggling with {issue}',
      'help me process {topic}',
      'I\'m going through {situation}',
      'I need support with {issue}',
      'how do I deal with {issue}',
    ],
    fillers: {
      emotion: ['anxious', 'stressed', 'sad', 'overwhelmed', 'lonely', 'frustrated', 'lost', 'confused'],
      issue: ['anxiety', 'stress', 'grief', 'anger', 'self-doubt', 'burnout', 'loneliness', 'uncertainty'],
      topic: ['my feelings', 'this situation', 'what happened', 'my emotions', 'my relationship'],
      situation: ['a difficult time', 'a loss', 'a breakup', 'a transition', 'some challenges'],
    },
  },

  // Communication
  communication: {
    patterns: [
      'send a text to {person}',
      'text {person} that {message}',
      'call {person}',
      'email {person} about {topic}',
      'draft a message to {person}',
      'schedule an email to {person}',
      'compose a message about {topic}',
    ],
    fillers: {
      person: ['mom', 'John', 'my boss', 'Sarah', 'the team', 'David'],
      message: ['I\'ll be late', 'I\'m on my way', 'let\'s reschedule', 'thank you'],
      topic: ['the project', 'tomorrow\'s meeting', 'the deadline', 'the update'],
    },
  },

  // Navigation & Guidance
  guidance: {
    patterns: [
      'help me navigate {situation}',
      'how do I handle {situation}',
      'what should I do about {situation}',
      'guide me through {process}',
      'I need advice on {topic}',
      'how do I approach {situation}',
    ],
    fillers: {
      situation: ['this conflict', 'a difficult conversation', 'my career change', 'this relationship issue', 'this decision'],
      process: ['this transition', 'setting boundaries', 'having this conversation', 'making this decision'],
      topic: ['my career', 'this relationship', 'work-life balance', 'setting goals'],
    },
  },

  // Assessment & Reflection
  assessment: {
    patterns: [
      'assess my {area}',
      'how am I doing with {area}',
      'evaluate my {area}',
      'check on my {area} progress',
      'am I making progress on {area}',
      'review my {area}',
    ],
    fillers: {
      area: ['goals', 'habits', 'career', 'relationship', 'health', 'finances', 'wellbeing', 'work-life balance'],
    },
  },

  // Information & Search
  information: {
    patterns: [
      'what is {topic}',
      'tell me about {topic}',
      'look up {topic}',
      'find information on {topic}',
      'search for {topic}',
      'what does {term} mean',
      'define {term}',
    ],
    fillers: {
      topic: ['the news', 'stock prices', 'local events', 'restaurants nearby', 'the latest updates'],
      term: ['mindfulness', 'cognitive behavioral therapy', 'attachment styles', 'burnout'],
    },
  },

  // Smart Home
  smarthome: {
    patterns: [
      'turn {state} the {device}',
      'set the {device} to {value}',
      '{device} {command}',
      'adjust the {device}',
      'what\'s the {device} status',
      'is the {device} on',
    ],
    fillers: {
      state: ['on', 'off'],
      device: ['lights', 'thermostat', 'TV', 'speaker', 'fan', 'AC'],
      value: ['72 degrees', 'dim', 'bright', '50%'],
      command: ['on', 'off', 'up', 'down'],
    },
  },

  // Travel & Transportation
  travel: {
    patterns: [
      'find flights to {destination}',
      'search for hotels in {destination}',
      'book a {transport} to {destination}',
      'how long to get to {destination}',
      'directions to {destination}',
      'traffic to {destination}',
    ],
    fillers: {
      destination: ['New York', 'the airport', 'downtown', 'work', 'home', 'San Francisco', 'the hotel'],
      transport: ['flight', 'hotel', 'car', 'ride', 'uber'],
    },
  },

  // Career
  career: {
    patterns: [
      'help with my resume',
      'prepare for {interview}',
      'career advice for {field}',
      'how do I get promoted',
      'job search in {field}',
      'practice interview questions',
      'salary negotiation tips',
    ],
    fillers: {
      interview: ['my interview', 'a technical interview', 'a behavioral interview', 'the meeting'],
      field: ['tech', 'finance', 'marketing', 'healthcare', 'engineering'],
    },
  },

  // Relationships
  relationships: {
    patterns: [
      'advice for {relationship}',
      'how to improve {relationship}',
      'navigate {conflict}',
      'communicate better with {person}',
      'strengthen my {relationship}',
    ],
    fillers: {
      relationship: ['my relationship', 'my marriage', 'my friendship', 'family relationships'],
      conflict: ['this argument', 'disagreements', 'tension', 'conflict with my partner'],
      person: ['my partner', 'my spouse', 'my friend', 'my family'],
    },
  },
};

// ============================================================================
// TOOL TO DOMAIN MAPPING
// ============================================================================

function getToolDomain(toolId: string): string {
  const lowerTool = toolId.toLowerCase();

  // Music-related
  if (lowerTool.includes('music') || lowerTool.includes('sonos') ||
      lowerTool.includes('spotify') || lowerTool.includes('play') ||
      lowerTool.includes('song') || lowerTool.includes('track') && lowerTool.includes('skip')) {
    return 'music';
  }

  // Weather
  if (lowerTool.includes('weather') || lowerTool.includes('forecast') ||
      lowerTool.includes('temperature')) {
    return 'weather';
  }

  // Calendar
  if (lowerTool.includes('calendar') || lowerTool.includes('event') ||
      lowerTool.includes('meeting') || lowerTool.includes('appointment') ||
      lowerTool.includes('schedule') && !lowerTool.includes('reminder')) {
    return 'calendar';
  }

  // Reminders
  if (lowerTool.includes('reminder') || lowerTool.includes('alarm') ||
      lowerTool.includes('timer') || lowerTool.includes('alert')) {
    return 'reminder';
  }

  // Habits
  if (lowerTool.includes('habit') || lowerTool.includes('streak') ||
      lowerTool.includes('routine') || lowerTool.includes('log') && !lowerTool.includes('symptom')) {
    return 'habits';
  }

  // Emotional support
  if (lowerTool.includes('grief') || lowerTool.includes('anxiety') ||
      lowerTool.includes('emotion') || lowerTool.includes('feeling') ||
      lowerTool.includes('stress') || lowerTool.includes('burnout') ||
      lowerTool.includes('anger') || lowerTool.includes('lonely') ||
      lowerTool.includes('compassion') || lowerTool.includes('self') ||
      lowerTool.includes('process') || lowerTool.includes('embrace') ||
      lowerTool.includes('acknowledge')) {
    return 'emotional';
  }

  // Communication
  if (lowerTool.includes('text') || lowerTool.includes('email') ||
      lowerTool.includes('call') || lowerTool.includes('message') ||
      lowerTool.includes('send') || lowerTool.includes('sms')) {
    return 'communication';
  }

  // Navigation & Guidance
  if (lowerTool.includes('navigate') || lowerTool.includes('guide') ||
      lowerTool.includes('coach') || lowerTool.includes('advice')) {
    return 'guidance';
  }

  // Assessment
  if (lowerTool.includes('assess') || lowerTool.includes('evaluate') ||
      lowerTool.includes('check') || lowerTool.includes('review')) {
    return 'assessment';
  }

  // Information
  if (lowerTool.includes('search') || lowerTool.includes('find') ||
      lowerTool.includes('lookup') || lowerTool.includes('info') ||
      lowerTool.includes('news') || lowerTool.includes('get') && !lowerTool.includes('calendar')) {
    return 'information';
  }

  // Smart home
  if (lowerTool.includes('light') || lowerTool.includes('thermostat') ||
      lowerTool.includes('device') || lowerTool.includes('scene') ||
      lowerTool.includes('home') && lowerTool.includes('smart')) {
    return 'smarthome';
  }

  // Travel
  if (lowerTool.includes('flight') || lowerTool.includes('hotel') ||
      lowerTool.includes('travel') || lowerTool.includes('direction') ||
      lowerTool.includes('traffic')) {
    return 'travel';
  }

  // Career
  if (lowerTool.includes('career') || lowerTool.includes('job') ||
      lowerTool.includes('interview') || lowerTool.includes('resume') ||
      lowerTool.includes('workplace')) {
    return 'career';
  }

  // Relationships
  if (lowerTool.includes('relationship') || lowerTool.includes('connect') ||
      lowerTool.includes('dating') || lowerTool.includes('friend')) {
    return 'relationships';
  }

  return 'emotional'; // Default to emotional for unknown tools
}

// ============================================================================
// GENERATION
// ============================================================================

function fillTemplate(pattern: string, fillers: Record<string, string[]>): string[] {
  const results: string[] = [];

  // Find all placeholders
  const placeholders = pattern.match(/\{(\w+)\}/g) || [];

  if (placeholders.length === 0) {
    return [pattern];
  }

  // Generate combinations (limit to avoid explosion)
  const maxCombinations = 5;

  for (let i = 0; i < maxCombinations; i++) {
    let filled = pattern;
    for (const placeholder of placeholders) {
      const key = placeholder.slice(1, -1);
      const options = fillers[key] || [''];
      const choice = options[Math.floor(Math.random() * options.length)];
      filled = filled.replace(placeholder, choice);
    }
    if (!results.includes(filled)) {
      results.push(filled);
    }
  }

  return results;
}

function generateExamplesForTool(toolId: string, count: number): string[] {
  const domain = getToolDomain(toolId);
  const templates = DOMAIN_TEMPLATES[domain];

  if (!templates) {
    // Fallback: generate from tool name
    const words = toolId.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
    return [
      `help me ${words}`,
      `I need to ${words}`,
      `can you ${words}`,
      `${words} please`,
      `I want to ${words}`,
    ].slice(0, count);
  }

  const examples: string[] = [];

  // Generate from templates
  for (const pattern of templates.patterns) {
    const filled = fillTemplate(pattern, templates.fillers);
    examples.push(...filled);
    if (examples.length >= count * 2) break;
  }

  // Add conversational variants
  const prefixes = ['', 'Can you ', 'Please ', 'I need to ', 'Hey, '];
  const suffixes = ['', ' please', ' for me', ' right now'];

  const base = examples.slice(0, 3);
  for (const b of base) {
    for (const p of prefixes.slice(0, 2)) {
      for (const s of suffixes.slice(0, 2)) {
        const variant = `${p}${b}${s}`.trim();
        if (!examples.includes(variant)) {
          examples.push(variant);
        }
      }
    }
  }

  // Dedupe and limit
  return [...new Set(examples)].slice(0, count);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('=== Quality Training Data Generator ===\n');

  // Load label map
  const labelMapPath = path.join(__dirname, 'outputs/ferni-router-rich/label_map.json');
  const labelMap: Record<string, number> = JSON.parse(fs.readFileSync(labelMapPath, 'utf-8'));
  const allToolIds = Object.keys(labelMap);

  console.log(`Label map: ${allToolIds.length} tools`);

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

  console.log(`Existing: ${existingExamples.length} examples, ${Object.keys(existingCounts).length} tools`);

  // Generate quality examples
  const newExamples: TrainingExample[] = [];
  const targetPerTool = 80;
  let exampleId = 0;

  for (const toolId of allToolIds) {
    const existingCount = existingCounts[toolId] || 0;
    const needed = Math.max(0, targetPerTool - existingCount);

    if (needed === 0) continue;

    const generated = generateExamplesForTool(toolId, needed);

    generated.forEach(query => {
      newExamples.push({
        id: `quality_${Date.now()}_${exampleId++}`,
        query,
        selected_tools: [toolId],
        is_open_intent: false,
        source: 'generated_quality',
      });
    });
  }

  console.log(`Generated: ${newExamples.length} new examples`);

  // Combine
  const allExamples = [...existingExamples, ...newExamples];
  const outputPath = path.join(__dirname, 'data/train_quality.jsonl');

  fs.writeFileSync(
    outputPath,
    allExamples.map(ex => JSON.stringify(ex)).join('\n') + '\n'
  );

  console.log(`\nTotal: ${allExamples.length} examples → ${outputPath}`);

  // Coverage stats
  const newCounts: Record<string, number> = {};
  allExamples.forEach(ex => {
    ex.selected_tools.forEach(tool => {
      newCounts[tool] = (newCounts[tool] || 0) + 1;
    });
  });

  console.log(`\nCoverage: ${Object.keys(newCounts).length}/${allToolIds.length} tools`);

  // Sample output by domain
  console.log('\n=== Samples by Domain ===');

  const sampleByDomain: Record<string, TrainingExample[]> = {};
  newExamples.forEach(ex => {
    const domain = getToolDomain(ex.selected_tools[0]);
    if (!sampleByDomain[domain]) sampleByDomain[domain] = [];
    if (sampleByDomain[domain].length < 3) {
      sampleByDomain[domain].push(ex);
    }
  });

  for (const [domain, samples] of Object.entries(sampleByDomain).slice(0, 8)) {
    console.log(`\n${domain}:`);
    samples.forEach(ex => {
      console.log(`  [${ex.selected_tools[0]}] "${ex.query}"`);
    });
  }
}

main().catch(console.error);
