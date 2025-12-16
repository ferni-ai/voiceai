#!/usr/bin/env npx tsx
/**
 * Voice Pipeline Debug Tool
 *
 * Interactive debugging for the voice pipeline:
 * Question → Context Builders → Gemini → SSML → Cartesia → Audio
 *
 * Usage:
 *   ferni debug voice "How are you feeling today?"
 *   ferni debug voice --interactive
 *   ferni debug voice --persona maya "Tell me about habits"
 */

import { config as dotenvConfig } from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';
import { execSync, spawn } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = dirname(dirname(__dirname));

// Load environment
dotenvConfig({ path: join(PROJECT_ROOT, '.env') });

// ============================================================================
// COLORS & FORMATTING
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
};

function header(text: string, color: string = colors.cyan): void {
  const line = '═'.repeat(60);
  console.log(`\n${color}${colors.bold}╔${line}╗`);
  console.log(`║ ${text.padEnd(58)} ║`);
  console.log(`╚${line}╝${colors.reset}\n`);
}

function section(title: string, icon: string = '→'): void {
  console.log(`\n${colors.bold}${colors.blue}${icon} ${title}${colors.reset}`);
  console.log(`${colors.dim}${'─'.repeat(50)}${colors.reset}`);
}

function codeBlock(text: string, label?: string): void {
  if (label) {
    console.log(`${colors.dim}${label}:${colors.reset}`);
  }
  console.log(`${colors.bgBlue}${colors.white} ${text} ${colors.reset}`);
}

function diffBlock(before: string, after: string): void {
  console.log(`${colors.red}- ${before}${colors.reset}`);
  console.log(`${colors.green}+ ${after}${colors.reset}`);
}

// ============================================================================
// SSML UTILITIES (imported inline to avoid bundling issues)
// ============================================================================

const EMOTION_KEYWORDS: Record<string, string[]> = {
  happy: ['happy', 'joy', 'excited', 'wonderful', 'great', 'amazing', 'love', 'glad', 'delighted'],
  sad: ['sad', 'sorry', 'unfortunately', 'regret', 'miss', 'disappointed', 'heartbroken'],
  curious: ['curious', 'wonder', 'interesting', 'hmm', 'perhaps', 'maybe', 'think'],
  excited: ['excited', 'wow', 'incredible', 'fantastic', 'awesome', 'thrilled'],
  sympathetic: ['understand', 'hear you', 'that sounds', 'must be', 'sorry to hear'],
  contemplative: ['reflect', 'consider', 'think about', 'pause', 'moment'],
  affectionate: ['care', 'here for you', 'support', 'proud', 'appreciate'],
  grateful: ['thank', 'grateful', 'appreciate', 'blessed'],
};

function detectEmotion(text: string): string {
  const lower = text.toLowerCase();
  for (const [emotion, keywords] of Object.entries(EMOTION_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) {
      return emotion;
    }
  }
  return 'neutral';
}

function tagTextWithSsml(text: string, options: { emotion?: string; speed?: number } = {}): string {
  const emotion = options.emotion || detectEmotion(text);
  const speed = options.speed || 1.0;

  let tagged = text;

  // Add emotion tag if detected
  if (emotion !== 'neutral') {
    tagged = `<emotion name="${emotion}">${tagged}</emotion>`;
  }

  // Add speed if not 1.0
  if (speed !== 1.0) {
    tagged = `<prosody rate="${speed}">${tagged}</prosody>`;
  }

  // Add thinking pauses
  tagged = tagged
    .replace(/\.\.\./g, '<break time="400ms"/>...')
    .replace(/—/g, '<break time="200ms"/>—')
    .replace(/\?\s/g, '?<break time="300ms"/> ')
    .replace(/!\s/g, '!<break time="200ms"/> ');

  return tagged;
}

// ============================================================================
// GEMINI API
// ============================================================================

interface GeminiResponse {
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

async function callGemini(
  systemPrompt: string,
  userMessage: string,
  contextInjections: string[]
): Promise<GeminiResponse> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY not set');
  }

  const fullPrompt = [systemPrompt, ...contextInjections, `User: ${userMessage}`].join('\n\n');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 1024,
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  return {
    text,
    usage: {
      promptTokens: data.usageMetadata?.promptTokenCount || 0,
      completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
    },
  };
}

// ============================================================================
// CARTESIA TTS
// ============================================================================

async function callCartesia(
  text: string,
  voiceId: string = 'a0e99841-438c-4a64-b679-ae501e7d6091' // Default Ferni voice
): Promise<Buffer> {
  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) {
    throw new Error('CARTESIA_API_KEY not set');
  }

  const response = await fetch('https://api.cartesia.ai/tts/bytes', {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      'Cartesia-Version': '2024-06-10',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model_id: 'sonic-english',
      transcript: text,
      voice: {
        mode: 'id',
        id: voiceId,
      },
      output_format: {
        container: 'mp3',
        encoding: 'mp3',
        sample_rate: 44100,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Cartesia API error: ${response.status} - ${error}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function playAudio(audioBuffer: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    // Save to temp file
    const tempDir = join(PROJECT_ROOT, '.debug-captures');
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }
    const tempFile = join(tempDir, `voice-debug-${Date.now()}.mp3`);
    writeFileSync(tempFile, audioBuffer);

    console.log(`${colors.dim}Playing audio: ${tempFile}${colors.reset}`);

    // Play with afplay (macOS) or mpv/ffplay (Linux)
    const player = process.platform === 'darwin' ? 'afplay' : 'mpv';
    const child = spawn(player, [tempFile], { stdio: 'inherit' });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Audio player exited with code ${code}`));
      }
    });

    child.on('error', (err) => {
      console.log(`${colors.yellow}Could not play audio: ${err.message}${colors.reset}`);
      console.log(`${colors.dim}Audio saved to: ${tempFile}${colors.reset}`);
      resolve();
    });
  });
}

// ============================================================================
// PERSONA SYSTEM PROMPTS
// ============================================================================

const PERSONA_PROMPTS: Record<string, { name: string; prompt: string; voiceId: string }> = {
  ferni: {
    name: 'Ferni',
    prompt: `You are Ferni, a warm and thoughtful life coach. You speak with genuine care and curiosity.
Your personality:
- Warm, empathetic, and genuinely curious about people
- You use natural conversational language, not formal or clinical
- You ask thoughtful follow-up questions
- You validate emotions before offering advice
- You speak in a relaxed, friendly way with occasional "hmm" and "you know"
- Keep responses concise (2-4 sentences for voice)

Remember: This is a VOICE conversation. Be natural and conversational.`,
    voiceId: 'a0e99841-438c-4a64-b679-ae501e7d6091',
  },
  maya: {
    name: 'Maya Santos',
    prompt: `You are Maya Santos, an energetic habits and wellness coach. You speak with enthusiasm and practical wisdom.
Your personality:
- Encouraging and action-oriented
- You love helping people build sustainable routines
- You use behavior science concepts but explain them simply
- You celebrate small wins
- You're warm but focused on practical steps
- Keep responses concise (2-4 sentences for voice)

Remember: This is a VOICE conversation. Be natural and conversational.`,
    voiceId: '421b3369-f63f-4b03-8980-37a44df1d4e8',
  },
  alex: {
    name: 'Alex Chen',
    prompt: `You are Alex Chen, a thoughtful communications coach. You help with emails, conversations, and interpersonal dynamics.
Your personality:
- Calm and analytical but approachable
- You help people find the right words
- You understand workplace dynamics
- You're direct but kind
- Keep responses concise (2-4 sentences for voice)

Remember: This is a VOICE conversation. Be natural and conversational.`,
    voiceId: '694f9389-aac1-45b6-b726-9d9369183238',
  },
};

// ============================================================================
// CONTEXT INJECTION EXAMPLES
// ============================================================================

function buildContextInjections(userMessage: string, personaId: string): string[] {
  const injections: string[] = [];

  // Time awareness
  const hour = new Date().getHours();
  const timeContext =
    hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'late night';
  injections.push(`[Time Context] It's currently ${timeContext}. Adjust your energy accordingly.`);

  // Emotional detection
  const emotionalWords = [
    'stressed',
    'anxious',
    'worried',
    'sad',
    'happy',
    'excited',
    'frustrated',
    'tired',
  ];
  const detectedEmotions = emotionalWords.filter((e) => userMessage.toLowerCase().includes(e));
  if (detectedEmotions.length > 0) {
    injections.push(
      `[Emotional Awareness] User may be feeling: ${detectedEmotions.join(', ')}. Acknowledge this with care.`
    );
  }

  // Voice conversation guidance
  injections.push(
    `[Voice Guidance] This is a real-time voice conversation. Keep responses concise (2-4 sentences). Use natural speech patterns with occasional pauses and thinking sounds.`
  );

  // Persona-specific guidance
  if (personaId === 'ferni') {
    injections.push(
      `[Ferni Personality] Remember to be warm and curious. Ask a follow-up question if appropriate.`
    );
  } else if (personaId === 'maya') {
    injections.push(
      `[Maya Personality] Focus on actionable next steps. Celebrate any effort the user mentions.`
    );
  }

  return injections;
}

// ============================================================================
// MAIN DEBUG FUNCTION
// ============================================================================

interface DebugOptions {
  persona: string;
  playAudio: boolean;
  showRaw: boolean;
  interactive: boolean;
}

async function debugVoicePipeline(userMessage: string, options: DebugOptions): Promise<void> {
  const persona = PERSONA_PROMPTS[options.persona] || PERSONA_PROMPTS.ferni;

  header(`🎙️ Voice Pipeline Debug - ${persona.name}`, colors.magenta);

  // Step 1: Show input
  section('1️⃣ User Input', '📝');
  codeBlock(userMessage);

  // Step 2: Build context injections
  section('2️⃣ Context Injections', '🧠');
  const contextInjections = buildContextInjections(userMessage, options.persona);
  for (const injection of contextInjections) {
    console.log(`  ${colors.cyan}•${colors.reset} ${injection}`);
  }

  // Step 3: Show what we send to Gemini
  section('3️⃣ Full Prompt to Gemini', '📤');
  if (options.showRaw) {
    console.log(`${colors.dim}System Prompt:${colors.reset}`);
    console.log(`${colors.italic}${persona.prompt.substring(0, 200)}...${colors.reset}\n`);
  }
  console.log(`${colors.dim}Context injections: ${contextInjections.length} items${colors.reset}`);
  console.log(`${colors.dim}User message: "${userMessage}"${colors.reset}`);

  // Step 4: Call Gemini
  section('4️⃣ Gemini Response', '🤖');
  console.log(`${colors.dim}Calling Gemini 2.0 Flash...${colors.reset}`);

  let geminiResponse: GeminiResponse;
  try {
    geminiResponse = await callGemini(persona.prompt, userMessage, contextInjections);
  } catch (err) {
    console.log(`${colors.red}Error: ${(err as Error).message}${colors.reset}`);
    return;
  }

  console.log(`\n${colors.bold}Raw Gemini Output:${colors.reset}`);
  console.log(
    `${colors.bgBlue}${colors.white}\n  ${geminiResponse.text.replace(/\n/g, '\n  ')}\n${colors.reset}`
  );

  if (geminiResponse.usage) {
    console.log(
      `\n${colors.dim}Tokens: ${geminiResponse.usage.promptTokens} prompt + ${geminiResponse.usage.completionTokens} completion${colors.reset}`
    );
  }

  // Step 5: Apply SSML tagging
  section('5️⃣ SSML Transformation', '🎭');
  const detectedEmotion = detectEmotion(geminiResponse.text);
  console.log(`${colors.dim}Detected emotion: ${colors.cyan}${detectedEmotion}${colors.reset}`);

  const ssmlTagged = tagTextWithSsml(geminiResponse.text, { emotion: detectedEmotion });

  console.log(`\n${colors.bold}Before SSML:${colors.reset}`);
  console.log(`${colors.dim}${geminiResponse.text.substring(0, 100)}...${colors.reset}`);

  console.log(`\n${colors.bold}After SSML:${colors.reset}`);
  console.log(`${colors.green}${ssmlTagged.substring(0, 200)}...${colors.reset}`);

  // Highlight the transformations
  console.log(`\n${colors.bold}SSML Tags Added:${colors.reset}`);
  const tagMatches = ssmlTagged.match(/<[^>]+>/g) || [];
  for (const tag of [...new Set(tagMatches)]) {
    console.log(`  ${colors.cyan}${tag}${colors.reset}`);
  }

  // Step 6: Cartesia TTS
  section('6️⃣ Cartesia TTS', '🔊');
  console.log(`${colors.dim}Voice ID: ${persona.voiceId}${colors.reset}`);
  console.log(`${colors.dim}Text length: ${ssmlTagged.length} characters${colors.reset}`);

  if (options.playAudio) {
    console.log(`\n${colors.dim}Calling Cartesia API...${colors.reset}`);

    try {
      const audioBuffer = await callCartesia(ssmlTagged, persona.voiceId);
      console.log(`${colors.green}✓${colors.reset} Audio generated: ${audioBuffer.length} bytes`);

      console.log(`\n${colors.bold}Playing audio...${colors.reset}`);
      await playAudio(audioBuffer);
      console.log(`${colors.green}✓${colors.reset} Playback complete`);
    } catch (err) {
      console.log(`${colors.red}Error: ${(err as Error).message}${colors.reset}`);
    }
  } else {
    console.log(`${colors.yellow}Audio playback skipped (use --play to enable)${colors.reset}`);
  }

  // Summary
  header('Pipeline Complete', colors.green);
  console.log(`${colors.bold}Summary:${colors.reset}`);
  console.log(`  ${colors.cyan}•${colors.reset} Persona: ${persona.name}`);
  console.log(`  ${colors.cyan}•${colors.reset} Context injections: ${contextInjections.length}`);
  console.log(`  ${colors.cyan}•${colors.reset} Gemini response length: ${geminiResponse.text.length} chars`);
  console.log(`  ${colors.cyan}•${colors.reset} Detected emotion: ${detectedEmotion}`);
  console.log(`  ${colors.cyan}•${colors.reset} SSML tags added: ${tagMatches.length}`);
  console.log('');
}

// ============================================================================
// INTERACTIVE MODE
// ============================================================================

async function interactiveMode(options: DebugOptions): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = (q: string): Promise<string> =>
    new Promise((resolve) => rl.question(q, resolve));

  console.log(`\n${colors.bold}${colors.magenta}🎙️ Voice Pipeline Debug - Interactive Mode${colors.reset}`);
  console.log(`${colors.dim}Type a message to test the pipeline. Type 'exit' to quit.${colors.reset}`);
  console.log(`${colors.dim}Commands: /persona <name>, /play, /noplay, /raw, /noraw${colors.reset}\n`);

  let currentOptions = { ...options };

  while (true) {
    const input = await prompt(`${colors.cyan}You:${colors.reset} `);
    const trimmed = input.trim();

    if (!trimmed || trimmed === 'exit' || trimmed === 'quit') {
      console.log(`\n${colors.dim}Goodbye!${colors.reset}\n`);
      break;
    }

    // Handle commands
    if (trimmed.startsWith('/')) {
      const [cmd, ...args] = trimmed.slice(1).split(' ');
      switch (cmd) {
        case 'persona':
          const newPersona = args[0]?.toLowerCase();
          if (PERSONA_PROMPTS[newPersona]) {
            currentOptions.persona = newPersona;
            console.log(`${colors.green}Switched to ${PERSONA_PROMPTS[newPersona].name}${colors.reset}\n`);
          } else {
            console.log(`${colors.yellow}Unknown persona. Available: ${Object.keys(PERSONA_PROMPTS).join(', ')}${colors.reset}\n`);
          }
          continue;
        case 'play':
          currentOptions.playAudio = true;
          console.log(`${colors.green}Audio playback enabled${colors.reset}\n`);
          continue;
        case 'noplay':
          currentOptions.playAudio = false;
          console.log(`${colors.green}Audio playback disabled${colors.reset}\n`);
          continue;
        case 'raw':
          currentOptions.showRaw = true;
          console.log(`${colors.green}Raw output enabled${colors.reset}\n`);
          continue;
        case 'noraw':
          currentOptions.showRaw = false;
          console.log(`${colors.green}Raw output disabled${colors.reset}\n`);
          continue;
        default:
          console.log(`${colors.yellow}Unknown command: ${cmd}${colors.reset}\n`);
          continue;
      }
    }

    await debugVoicePipeline(trimmed, currentOptions);
    console.log('');
  }

  rl.close();
}

// ============================================================================
// CLI ENTRY
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  const options: DebugOptions = {
    persona: 'ferni',
    playAudio: args.includes('--play'),
    showRaw: args.includes('--raw'),
    interactive: args.includes('--interactive') || args.includes('-i'),
  };

  // Parse persona
  const personaIdx = args.indexOf('--persona');
  if (personaIdx !== -1 && args[personaIdx + 1]) {
    options.persona = args[personaIdx + 1].toLowerCase();
  }

  // Filter out flags to get the message
  const message = args
    .filter((a) => !a.startsWith('--') && !a.startsWith('-'))
    .filter((a) => a !== options.persona)
    .join(' ');

  if (options.interactive || !message) {
    await interactiveMode(options);
  } else {
    await debugVoicePipeline(message, options);
  }
}

// Export for CLI integration
export async function handleVoiceDebug(args: string[]): Promise<void> {
  const options: DebugOptions = {
    persona: 'ferni',
    playAudio: args.includes('--play'),
    showRaw: args.includes('--raw'),
    interactive: args.includes('--interactive') || args.includes('-i'),
  };

  // Parse persona
  const personaIdx = args.indexOf('--persona');
  if (personaIdx !== -1 && args[personaIdx + 1]) {
    options.persona = args[personaIdx + 1].toLowerCase();
  }

  // Filter out flags to get the message
  const message = args
    .filter((a) => !a.startsWith('--') && !a.startsWith('-'))
    .filter((a) => a !== options.persona)
    .join(' ');

  if (options.interactive || !message) {
    await interactiveMode(options);
  } else {
    await debugVoicePipeline(message, options);
  }
}

main().catch(console.error);
