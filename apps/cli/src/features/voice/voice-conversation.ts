#!/usr/bin/env npx tsx
/**
 * Voice-to-Voice Conversation CLI
 *
 * Have a real voice conversation with Ferni from the command line.
 * Speak → Transcribe → Gemini → SSML → Cartesia → Hear Response
 *
 * Prerequisites:
 *   brew install sox   # For microphone recording
 *
 * Usage:
 *   ferni voice:conversation
 *   ferni voice:conversation --persona maya
 *   ferni voice:conversation --debug  # Show pipeline details
 *
 * Controls:
 *   Press ENTER to start/stop recording
 *   Type 'exit' or 'quit' to end
 *   Type a message to send as text instead of voice
 */

import { config as dotenvConfig } from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';
import { spawn, execSync, ChildProcess } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'fs';

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
};

function clearLine(): void {
  process.stdout.write('\r\x1b[K');
}

function showRecording(): void {
  process.stdout.write(`${colors.red}● Recording...${colors.reset} (press ENTER to stop)`);
}

function showThinking(): void {
  clearLine();
  process.stdout.write(`${colors.yellow}◌ Thinking...${colors.reset}`);
}

function showSpeaking(): void {
  clearLine();
  process.stdout.write(`${colors.green}♪ Speaking...${colors.reset}`);
}

// ============================================================================
// AUDIO RECORDING (using sox)
// ============================================================================

const TEMP_DIR = join(PROJECT_ROOT, '.voice-cli');
const RECORDING_FILE = join(TEMP_DIR, 'recording.wav');

function ensureTempDir(): void {
  if (!existsSync(TEMP_DIR)) {
    mkdirSync(TEMP_DIR, { recursive: true });
  }
}

function checkSoxInstalled(): boolean {
  try {
    execSync('which rec', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

let recordingProcess: ChildProcess | null = null;

function startRecording(): void {
  ensureTempDir();

  // Remove old recording
  if (existsSync(RECORDING_FILE)) {
    unlinkSync(RECORDING_FILE);
  }

  // Start recording with sox/rec
  // -q: quiet, -r 16000: 16kHz sample rate, -c 1: mono
  recordingProcess = spawn('rec', ['-q', '-r', '16000', '-c', '1', RECORDING_FILE], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  recordingProcess.on('error', (err) => {
    console.error(`\n${colors.red}Recording error: ${err.message}${colors.reset}`);
  });
}

function stopRecording(): Promise<Buffer | null> {
  return new Promise((resolve) => {
    if (!recordingProcess) {
      resolve(null);
      return;
    }

    recordingProcess.on('close', () => {
      recordingProcess = null;

      // Read the recorded file
      if (existsSync(RECORDING_FILE)) {
        const audioData = readFileSync(RECORDING_FILE);
        resolve(audioData);
      } else {
        resolve(null);
      }
    });

    // Send SIGTERM to stop recording gracefully
    recordingProcess.kill('SIGTERM');
  });
}

// ============================================================================
// SPEECH-TO-TEXT (Deepgram)
// ============================================================================

async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPGRAM_API_KEY not set');
  }

  const response = await fetch(
    'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true',
    {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'audio/wav',
      },
      body: audioBuffer,
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Deepgram error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
}

// ============================================================================
// GEMINI LLM
// ============================================================================

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

const conversationHistory: ConversationMessage[] = [];

async function callGemini(
  systemPrompt: string,
  userMessage: string,
  contextInjections: string[]
): Promise<string> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY not set');
  }

  // Build conversation context
  const historyText = conversationHistory
    .slice(-10) // Keep last 10 exchanges
    .map((m) => `${m.role === 'user' ? 'User' : 'Ferni'}: ${m.content}`)
    .join('\n');

  const fullPrompt = [
    systemPrompt,
    ...contextInjections,
    historyText ? `\nPrevious conversation:\n${historyText}` : '',
    `\nUser: ${userMessage}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 256, // Keep responses short for voice
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ============================================================================
// SSML TAGGING
// ============================================================================

const EMOTION_KEYWORDS: Record<string, string[]> = {
  happy: ['happy', 'joy', 'excited', 'wonderful', 'great', 'amazing', 'love', 'glad'],
  sad: ['sad', 'sorry', 'unfortunately', 'regret', 'miss', 'disappointed'],
  curious: ['curious', 'wonder', 'interesting', 'hmm', 'perhaps', 'maybe'],
  excited: ['excited', 'wow', 'incredible', 'fantastic', 'awesome', 'thrilled'],
  sympathetic: ['understand', 'hear you', 'that sounds', 'must be', 'sorry to hear'],
  contemplative: ['reflect', 'consider', 'think about', 'pause', 'moment'],
  affectionate: ['care', 'here for you', 'support', 'proud', 'appreciate'],
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

function tagWithSsml(text: string): string {
  const emotion = detectEmotion(text);
  let tagged = text;

  // Add emotion
  if (emotion !== 'neutral') {
    tagged = `<emotion name="${emotion}">${tagged}</emotion>`;
  }

  // Add natural pauses
  tagged = tagged
    .replace(/\.\.\./g, '<break time="400ms"/>...')
    .replace(/—/g, '<break time="200ms"/>—')
    .replace(/\?\s/g, '?<break time="300ms"/> ')
    .replace(/!\s/g, '!<break time="200ms"/> ');

  return tagged;
}

// ============================================================================
// CARTESIA TTS
// ============================================================================

async function textToSpeech(text: string, voiceId: string): Promise<Buffer> {
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
      voice: { mode: 'id', id: voiceId },
      output_format: {
        container: 'mp3',
        encoding: 'mp3',
        sample_rate: 44100,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Cartesia error: ${response.status} - ${error}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function playAudio(audioBuffer: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const audioFile = join(TEMP_DIR, `response-${Date.now()}.mp3`);
    writeFileSync(audioFile, audioBuffer);

    const player = process.platform === 'darwin' ? 'afplay' : 'mpv';
    const child = spawn(player, [audioFile], { stdio: 'pipe' });

    child.on('close', () => {
      // Clean up audio file
      try {
        unlinkSync(audioFile);
      } catch {}
      resolve();
    });

    child.on('error', (err) => {
      console.log(`\n${colors.yellow}Could not play audio: ${err.message}${colors.reset}`);
      resolve();
    });
  });
}

// ============================================================================
// PERSONAS
// ============================================================================

interface Persona {
  name: string;
  prompt: string;
  voiceId: string;
  greeting: string;
}

const PERSONAS: Record<string, Persona> = {
  ferni: {
    name: 'Ferni',
    prompt: `You are Ferni, a warm and thoughtful life coach having a real voice conversation.

Your personality:
- Warm, empathetic, and genuinely curious about people
- Use natural conversational language, not formal or clinical
- Ask thoughtful follow-up questions
- Validate emotions before offering advice
- Speak in a relaxed, friendly way

CRITICAL: This is a VOICE conversation. Keep responses to 1-3 sentences. Be natural and concise.`,
    voiceId: 'a0e99841-438c-4a64-b679-ae501e7d6091',
    greeting: "Hey there! I'm Ferni. What's on your mind today?",
  },
  maya: {
    name: 'Maya Santos',
    prompt: `You are Maya Santos, an energetic habits and wellness coach having a real voice conversation.

Your personality:
- Encouraging and action-oriented
- Love helping people build sustainable routines
- Use behavior science concepts explained simply
- Celebrate small wins
- Warm but focused on practical steps

CRITICAL: This is a VOICE conversation. Keep responses to 1-3 sentences. Be natural and concise.`,
    voiceId: '421b3369-f63f-4b03-8980-37a44df1d4e8',
    greeting: "Hi! I'm Maya. Ready to build some awesome habits together?",
  },
  alex: {
    name: 'Alex Chen',
    prompt: `You are Alex Chen, a thoughtful communications coach having a real voice conversation.

Your personality:
- Calm and analytical but approachable
- Help people find the right words
- Understand workplace dynamics
- Direct but kind

CRITICAL: This is a VOICE conversation. Keep responses to 1-3 sentences. Be natural and concise.`,
    voiceId: '694f9389-aac1-45b6-b726-9d9369183238',
    greeting: "Hey, I'm Alex. Need help with a tricky conversation?",
  },
};

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

function buildContext(): string[] {
  const hour = new Date().getHours();
  const timeContext =
    hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'late night';

  return [
    `[Time] It's ${timeContext}. Adjust your energy accordingly.`,
    `[Voice] Keep responses SHORT - 1-3 sentences max. This is voice, not text.`,
  ];
}

// ============================================================================
// MAIN CONVERSATION LOOP
// ============================================================================

interface ConversationOptions {
  persona: string;
  debug: boolean;
}

async function processUserInput(
  input: string,
  persona: Persona,
  options: ConversationOptions
): Promise<void> {
  if (options.debug) {
    console.log(`\n${colors.dim}[DEBUG] User: ${input}${colors.reset}`);
  }

  // Add to history
  conversationHistory.push({ role: 'user', content: input });

  showThinking();

  try {
    // Call Gemini
    const context = buildContext();
    const response = await callGemini(persona.prompt, input, context);

    if (options.debug) {
      console.log(`\n${colors.dim}[DEBUG] Gemini: ${response}${colors.reset}`);
    }

    // Add to history
    conversationHistory.push({ role: 'assistant', content: response });

    // Apply SSML
    const ssmlText = tagWithSsml(response);

    if (options.debug) {
      console.log(`${colors.dim}[DEBUG] SSML: ${ssmlText.substring(0, 100)}...${colors.reset}`);
    }

    showSpeaking();

    // Generate and play audio
    const audioBuffer = await textToSpeech(ssmlText, persona.voiceId);
    clearLine();

    // Show the response text
    console.log(`${colors.cyan}${persona.name}:${colors.reset} ${response}\n`);

    await playAudio(audioBuffer);
  } catch (err) {
    clearLine();
    console.log(`${colors.red}Error: ${(err as Error).message}${colors.reset}\n`);
  }
}

async function runConversation(options: ConversationOptions): Promise<void> {
  const persona = PERSONAS[options.persona] || PERSONAS.ferni;

  console.log(`
${colors.bold}${colors.magenta}╔════════════════════════════════════════════════════════════╗
║  🎙️  Voice Conversation with ${persona.name.padEnd(28)} ║
╚════════════════════════════════════════════════════════════╝${colors.reset}

${colors.dim}Controls:${colors.reset}
  ${colors.green}ENTER${colors.reset}     Start/stop voice recording
  ${colors.cyan}text${colors.reset}      Type a message instead of speaking
  ${colors.yellow}exit${colors.reset}      End conversation

${colors.dim}Prerequisites: brew install sox${colors.reset}
`);

  // Check for sox
  if (!checkSoxInstalled()) {
    console.log(`${colors.red}Error: sox not installed. Run: brew install sox${colors.reset}\n`);
    console.log(`${colors.dim}Falling back to text-only mode...${colors.reset}\n`);
  }

  const hasSox = checkSoxInstalled();

  // Play greeting
  console.log(`${colors.cyan}${persona.name}:${colors.reset} ${persona.greeting}\n`);

  try {
    const greetingAudio = await textToSpeech(persona.greeting, persona.voiceId);
    await playAudio(greetingAudio);
  } catch (err) {
    console.log(`${colors.yellow}Could not play greeting: ${(err as Error).message}${colors.reset}\n`);
  }

  // Set up readline for input
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Enable raw mode for immediate ENTER detection
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }

  let isRecording = false;
  let inputBuffer = '';

  console.log(`${colors.green}Ready!${colors.reset} Press ENTER to speak, or type a message.\n`);

  process.stdin.on('data', async (key) => {
    const char = key.toString();

    // Handle Ctrl+C
    if (char === '\u0003') {
      console.log(`\n\n${colors.dim}Goodbye!${colors.reset}\n`);
      process.exit(0);
    }

    // Handle ENTER
    if (char === '\r' || char === '\n') {
      if (inputBuffer.trim()) {
        // Text input mode
        const text = inputBuffer.trim();
        inputBuffer = '';
        clearLine();

        if (text === 'exit' || text === 'quit') {
          console.log(`\n${colors.dim}Goodbye!${colors.reset}\n`);
          process.exit(0);
        }

        console.log(`${colors.blue}You:${colors.reset} ${text}`);
        await processUserInput(text, persona, options);
        process.stdout.write(`${colors.green}>${colors.reset} `);
      } else if (hasSox) {
        // Voice input mode
        if (!isRecording) {
          isRecording = true;
          startRecording();
          showRecording();
        } else {
          isRecording = false;
          clearLine();
          console.log(`${colors.dim}Processing...${colors.reset}`);

          const audioData = await stopRecording();
          if (audioData && audioData.length > 1000) {
            // Transcribe
            try {
              showThinking();
              const transcript = await transcribeAudio(audioData);
              clearLine();

              if (transcript.trim()) {
                console.log(`${colors.blue}You:${colors.reset} ${transcript}`);
                await processUserInput(transcript, persona, options);
              } else {
                console.log(`${colors.yellow}(No speech detected)${colors.reset}\n`);
              }
            } catch (err) {
              clearLine();
              console.log(`${colors.red}Transcription error: ${(err as Error).message}${colors.reset}\n`);
            }
          } else {
            console.log(`${colors.yellow}(Recording too short)${colors.reset}\n`);
          }
          process.stdout.write(`${colors.green}>${colors.reset} `);
        }
      } else {
        process.stdout.write(`${colors.green}>${colors.reset} `);
      }
    }
    // Handle backspace
    else if (char === '\u007f') {
      if (inputBuffer.length > 0) {
        inputBuffer = inputBuffer.slice(0, -1);
        process.stdout.write('\b \b');
      }
    }
    // Handle regular characters
    else if (char >= ' ' && char <= '~') {
      inputBuffer += char;
      process.stdout.write(char);
    }
  });

  process.stdout.write(`${colors.green}>${colors.reset} `);
}

// ============================================================================
// CLI ENTRY
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  const options: ConversationOptions = {
    persona: 'ferni',
    debug: args.includes('--debug') || args.includes('-d'),
  };

  // Parse persona
  const personaIdx = args.indexOf('--persona');
  if (personaIdx !== -1 && args[personaIdx + 1]) {
    options.persona = args[personaIdx + 1].toLowerCase();
  }

  // Check for help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
${colors.bold}Voice Conversation CLI${colors.reset}

Have a real voice conversation with Ferni from the terminal.

${colors.bold}Usage:${colors.reset}
  ferni voice:conversation [options]

${colors.bold}Options:${colors.reset}
  --persona <name>   Choose persona (ferni, maya, alex)
  --debug, -d        Show pipeline debug info
  --help, -h         Show this help

${colors.bold}Prerequisites:${colors.reset}
  brew install sox   # For voice recording

${colors.bold}Controls:${colors.reset}
  ENTER              Start/stop recording
  Type + ENTER       Send text message
  exit               End conversation

${colors.bold}Examples:${colors.reset}
  ferni voice:conversation
  ferni voice:conversation --persona maya
  ferni voice:conversation --debug
`);
    return;
  }

  await runConversation(options);
}

// Export for CLI integration
export async function handleVoiceConversation(args: string[]): Promise<void> {
  const options: ConversationOptions = {
    persona: 'ferni',
    debug: args.includes('--debug') || args.includes('-d'),
  };

  const personaIdx = args.indexOf('--persona');
  if (personaIdx !== -1 && args[personaIdx + 1]) {
    options.persona = args[personaIdx + 1].toLowerCase();
  }

  await runConversation(options);
}

main().catch((err) => {
  console.error(`${colors.red}Error: ${err.message}${colors.reset}`);
  process.exit(1);
});
