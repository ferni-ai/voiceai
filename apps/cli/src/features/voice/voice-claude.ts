#!/usr/bin/env npx tsx
/**
 * Voice-Driven Claude Code
 *
 * Talk to Ferni, who translates your requests into Claude Code commands.
 * Ferni narrates what Claude is doing and tells you when input is needed.
 *
 * Architecture:
 *   Voice → LiveKit → Ferni (transcription) → Claude Code (stream-json) → Ferni (narration) → Voice
 *
 * Uses Claude Code's streaming JSON API for clean bidirectional communication:
 *   --input-format stream-json   → Send messages as NDJSON
 *   --output-format stream-json  → Receive events as NDJSON
 *
 * Prerequisites:
 *   1. Claude Code CLI installed: npm install -g @anthropic-ai/claude-code
 *   2. Token server running: pnpm ui-server
 *   3. Agent running: pnpm agent:dev
 *
 * Usage:
 *   ferni code                    # Voice-driven coding with Ferni
 *   ferni code --dir ./myproject  # Work in a specific directory
 */

import { config as dotenvConfig } from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';
import { spawn, ChildProcess, execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';

// Detect if running as SEA binary (shim URL) vs normal execution
const isSEA = import.meta.url.includes('ferni-sea-binary');
const __dirname = isSEA ? process.cwd() : dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = isSEA ? process.cwd() : dirname(dirname(__dirname));

// Load environment
dotenvConfig({ path: join(PROJECT_ROOT, '.env') });

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  tokenServerUrl: process.env.CLI_TOKEN_SERVER || 'http://localhost:3002',
  livekitUrl: process.env.LIVEKIT_URL || '',
};

// ============================================================================
// SOUND EFFECTS
// ============================================================================

const SOUNDS_DIR = join(PROJECT_ROOT, 'design-system', 'assets', 'sounds');

function playSound(soundName: 'connect' | 'disconnect'): void {
  const soundPath = join(SOUNDS_DIR, `${soundName}.mp3`);
  if (!existsSync(soundPath)) return;

  // Use afplay on macOS, aplay on Linux (both are non-blocking with &)
  const player = process.platform === 'darwin' ? 'afplay' : 'aplay';
  spawn(player, [soundPath], {
    stdio: 'ignore',
    detached: true,
  }).unref();
}

// ============================================================================
// MCP NARRATION QUEUE (Reads from ferni-mcp-server.ts)
// ============================================================================

const MCP_STATE_DIR = join(PROJECT_ROOT, '.ferni-mcp');
const MCP_NARRATION_FILE = join(MCP_STATE_DIR, 'narration.json');
const MCP_STATE_FILE = join(MCP_STATE_DIR, 'state.json');

interface NarrationMessage {
  id: string;
  text: string;
  type: 'narration' | 'progress' | 'question' | 'completion';
  timestamp: number;
  processed: boolean;
}

interface FerniMcpState {
  currentTask: string | null;
  taskQueue: string[];
  lastNarration: string | null;
  lastNarrationTime: number | null;
  voiceInputPending: boolean;
  voiceInputResult: string | null;
  progressUpdates: Array<{
    message: string;
    timestamp: number;
    type: 'info' | 'success' | 'warning' | 'error';
  }>;
}

function ensureMcpStateDir(): void {
  if (!existsSync(MCP_STATE_DIR)) {
    mkdirSync(MCP_STATE_DIR, { recursive: true });
  }
}

function readNarrationQueue(): NarrationMessage[] {
  if (!existsSync(MCP_NARRATION_FILE)) return [];
  try {
    return JSON.parse(readFileSync(MCP_NARRATION_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function markNarrationsProcessed(ids: string[]): void {
  if (ids.length === 0) return;
  const queue = readNarrationQueue();
  for (const msg of queue) {
    if (ids.includes(msg.id)) {
      msg.processed = true;
    }
  }
  writeFileSync(MCP_NARRATION_FILE, JSON.stringify(queue, null, 2));
}

function getUnprocessedNarrations(): NarrationMessage[] {
  return readNarrationQueue().filter((m) => !m.processed);
}

function setCurrentTask(task: string): void {
  ensureMcpStateDir();
  let state: FerniMcpState = {
    currentTask: null,
    taskQueue: [],
    lastNarration: null,
    lastNarrationTime: null,
    voiceInputPending: false,
    voiceInputResult: null,
    progressUpdates: [],
  };
  if (existsSync(MCP_STATE_FILE)) {
    try {
      state = JSON.parse(readFileSync(MCP_STATE_FILE, 'utf-8'));
    } catch {}
  }
  state.currentTask = task;
  writeFileSync(MCP_STATE_FILE, JSON.stringify(state, null, 2));
}

// ============================================================================
// COLORS
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

// ============================================================================
// CLAUDE CODE STREAMING JSON API
// ============================================================================

interface ClaudeEvent {
  type: 'init' | 'system' | 'assistant' | 'user' | 'result';
  session_id?: string;
  message?: {
    role: string;
    content: Array<{
      type: string;
      text?: string;
      name?: string;
      input?: unknown;
    }>;
  };
  status?: string;
  subtype?: string;
  result?: string;
  duration_ms?: number;
  total_cost_usd?: number;
  num_turns?: number;
}

interface ClaudeState {
  process: ChildProcess | null;
  sessionId: string | null;
  isWorking: boolean;
  isReady: boolean;
  currentTool: string | null;
  lastMessage: string;
  workingDir: string;
  onOutput: ((event: ClaudeEvent) => void) | null;
}

const claudeState: ClaudeState = {
  process: null,
  sessionId: null,
  isWorking: false,
  isReady: true,
  currentTool: null,
  lastMessage: '',
  workingDir: process.cwd(),
  onOutput: null,
};

function checkClaudeInstalled(): boolean {
  try {
    execSync('which claude', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function createUserMessage(text: string): string {
  const message = {
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'text', text }],
    },
  };
  return JSON.stringify(message);
}

function parseClaudeEvent(line: string): ClaudeEvent | null {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function formatClaudeOutput(event: ClaudeEvent): {
  display: string;
  narrate: string | null;
  state: 'working' | 'done' | 'ready';
} {
  // Handle system events (init, tool_use, tool_result)
  if (event.type === 'system') {
    if (event.subtype === 'init') {
      claudeState.sessionId = event.session_id || null;
      claudeState.isWorking = true;
      return {
        display: `${colors.dim}Session: ${event.session_id?.slice(0, 8)}...${colors.reset}`,
        narrate: null,
        state: 'working',
      };
    }
    if (event.subtype === 'tool_use' && event.message?.content?.[0]) {
      const content = event.message.content[0];
      const toolName = content.name || 'tool';
      claudeState.currentTool = toolName;
      return {
        display: `${colors.yellow}[${toolName}]${colors.reset}`,
        narrate: null,
        state: 'working',
      };
    }
    if (event.subtype === 'tool_result') {
      claudeState.currentTool = null;
      return {
        display: '',
        narrate: null,
        state: 'working',
      };
    }
    return { display: '', narrate: null, state: 'working' };
  }

  // Handle assistant messages
  if (event.type === 'assistant') {
    if (event.message?.content) {
      const textContent = event.message.content.find((c) => c.type === 'text');
      if (textContent?.text) {
        claudeState.lastMessage = textContent.text;
        return {
          display: `${colors.cyan}Claude:${colors.reset} ${textContent.text}`,
          narrate: textContent.text,
          state: 'working', // Still working until we get result
        };
      }
      // Check for tool use in assistant message
      const toolContent = event.message.content.find((c) => c.type === 'tool_use');
      if (toolContent?.name) {
        claudeState.currentTool = toolContent.name;
        return {
          display: `${colors.yellow}[${toolContent.name}]${colors.reset}`,
          narrate: null,
          state: 'working',
        };
      }
    }
    return { display: '', narrate: null, state: 'working' };
  }

  // Handle result - this is when Claude is done and ready for next input
  if (event.type === 'result') {
    claudeState.isWorking = false;
    claudeState.isReady = true;
    claudeState.currentTool = null;
    const isSuccess = event.subtype === 'success';
    const status = isSuccess ? colors.green : colors.red;
    const costStr = event.total_cost_usd
      ? ` ${colors.dim}($${event.total_cost_usd.toFixed(4)})${colors.reset}`
      : '';
    return {
      display: `${status}[Ready]${colors.reset}${costStr}`,
      narrate: null,
      state: 'done',
    };
  }

  return { display: '', narrate: null, state: 'working' };
}

// ============================================================================
// TOKEN FETCHING
// ============================================================================

interface TokenResponse {
  token: string;
  url: string;
  room?: string;
}

async function fetchToken(
  roomName: string,
  username: string,
  personaId: string
): Promise<TokenResponse> {
  const params = new URLSearchParams({
    room: roomName,
    username,
    device_id: `cli-claude-${Date.now()}`,
    persona_id: personaId,
  });

  const response = await fetch(`${CONFIG.tokenServerUrl}/token?${params}`);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token server error: ${response.status} - ${error}`);
  }

  return response.json();
}

// ============================================================================
// CLAUDE CODE PROCESS
// ============================================================================

function spawnClaudeProcess(
  workingDir: string,
  sessionId: string | null,
  message: string,
  onOutput: (event: ClaudeEvent) => void
): ChildProcess {
  const args = [
    '--print',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    // Load Ferni MCP server for voice narration
    '--mcp-config', join(PROJECT_ROOT, '.mcp.json'),
    // Skip permissions for headless operation
    '--dangerously-skip-permissions',
  ];

  // Resume session if we have one
  if (sessionId) {
    args.push('--resume', sessionId);
  }

  const claude = spawn('claude', args, {
    cwd: workingDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      FORCE_COLOR: '0',
    },
  });

  // Parse NDJSON output
  let buffer = '';
  claude.stdout?.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        const event = parseClaudeEvent(line);
        if (event) {
          onOutput(event);
        }
      }
    }
  });

  claude.stderr?.on('data', (data) => {
    const text = data.toString().trim();
    if (text && !text.includes('deprecated')) {
      console.log(`${colors.dim}[stderr] ${text}${colors.reset}`);
    }
  });

  claude.on('close', () => {
    claudeState.process = null;
    // Don't log - this is expected after each message
  });

  // Send the message immediately
  const jsonMessage = createUserMessage(message);
  claude.stdin?.write(jsonMessage + '\n');
  claude.stdin?.end(); // Signal we're done sending

  claudeState.process = claude;
  claudeState.isWorking = true;
  claudeState.isReady = false;

  return claude;
}

function sendToClaude(message: string): void {
  if (claudeState.isWorking && !claudeState.isReady) {
    console.log(`${colors.yellow}[Claude is still working, please wait...]${colors.reset}`);
    return;
  }

  console.log(`\n${colors.blue}You:${colors.reset} ${message}\n`);

  // Set current task in MCP state so Claude can retrieve it via MCP tools
  setCurrentTask(message);

  // Spawn a new Claude process for this message
  // It will resume the session if we have a sessionId
  spawnClaudeProcess(
    claudeState.workingDir,
    claudeState.sessionId,
    message,
    claudeState.onOutput!
  );
}

function initializeClaude(workingDir: string, onOutput: (event: ClaudeEvent) => void): void {
  claudeState.workingDir = workingDir;
  claudeState.onOutput = onOutput;
  claudeState.isReady = true;
  console.log(`${colors.dim}Claude Code ready (stream-json mode with session resumption)${colors.reset}`);
}

// ============================================================================
// LIVEKIT + CLAUDE BRIDGE
// ============================================================================

interface BridgeOptions {
  debug: boolean;
  workingDir: string;
}

async function connectVoiceToClaude(
  token: string,
  url: string,
  options: BridgeOptions
): Promise<void> {
  const lk = await import('@livekit/rtc-node');
  const { Room, RoomEvent, dispose } = lk;

  console.log(`${colors.dim}Connecting to LiveKit...${colors.reset}`);

  const room = new Room();

  // Send narration to Ferni via data channel
  const sendNarrationToFerni = async (text: string, type: 'progress' | 'result' | 'tool') => {
    if (!text || !room.localParticipant) return;

    try {
      const message = JSON.stringify({
        type: 'claude_narration',
        text,
        narration_type: type,
        timestamp: Date.now(),
      });
      const encoder = new TextEncoder();
      await room.localParticipant.publishData(encoder.encode(message), { reliable: true });

      if (options.debug) {
        console.log(`${colors.dim}[SENT TO FERNI] ${text.substring(0, 50)}...${colors.reset}`);
      }
    } catch (err) {
      console.log(`${colors.dim}[Failed to send to Ferni: ${(err as Error).message}]${colors.reset}`);
    }
  };

  // Handle Claude output - display and send to Ferni for narration
  const handleClaudeOutput = (event: ClaudeEvent) => {
    const formatted = formatClaudeOutput(event);

    if (formatted.display) {
      console.log(formatted.display);
    }

    // In debug mode, show raw events
    if (options.debug && event.type !== 'system') {
      console.log(`${colors.dim}[EVENT] ${JSON.stringify(event).substring(0, 200)}${colors.reset}`);
    }

    // Send narration to Ferni to speak via TTS
    if (formatted.narrate) {
      const narType = formatted.state === 'done' ? 'result' : 'progress';
      void sendNarrationToFerni(formatted.narrate, narType);
    }
  };

  // Connection events
  room.on(RoomEvent.Connected, () => {
    console.log(`${colors.green}Connected to Ferni!${colors.reset}`);
  });

  room.on(RoomEvent.Disconnected, () => {
    playSound('disconnect');
    console.log(`\n${colors.yellow}Disconnected from voice${colors.reset}`);
  });

  room.on(RoomEvent.ParticipantConnected, (participant) => {
    if (participant.identity?.includes('agent')) {
      playSound('connect');
      console.log(`${colors.green}Ferni joined - ready to help with coding!${colors.reset}`);
    }
  });

  room.on(RoomEvent.ParticipantDisconnected, (participant) => {
    if (participant.identity?.includes('agent')) {
      playSound('disconnect');
      console.log(`${colors.yellow}Ferni left${colors.reset}`);
    }
  });

  // Track audio playback processes for cleanup
  let audioPlayProcess: ChildProcess | null = null;

  // Handle audio tracks from Ferni - PIPE TO SPEAKERS
  room.on(RoomEvent.TrackSubscribed, async (track, publication, participant) => {
    // Only handle audio tracks from the agent
    if (track.kind !== lk.TrackKind.KIND_AUDIO) return;
    if (!participant.identity?.includes('agent')) return;

    if (options.debug) {
      console.log(`${colors.dim}[TRACK] Subscribed to audio from ${participant.identity}${colors.reset}`);
    }

    try {
      const { AudioStream } = lk;

      // Create audio stream to receive frames
      const audioStream = new AudioStream(track);

      // Spawn sox play process to play audio
      // Format: 16-bit signed PCM, 48kHz (LiveKit default), mono
      const PLAYBACK_SAMPLE_RATE = 48000;
      const PLAYBACK_CHANNELS = 1;

      audioPlayProcess = spawn('sox', [
        '-t', 'raw',              // Input is raw PCM
        '-b', '16',               // 16-bit
        '-e', 'signed-integer',   // Signed integers
        '-r', String(PLAYBACK_SAMPLE_RATE),  // Sample rate (48kHz default for LiveKit)
        '-c', String(PLAYBACK_CHANNELS),     // Mono
        '-',                      // Read from stdin
        '-d',                     // Output to default audio device (speakers)
      ], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      audioPlayProcess.on('error', (err) => {
        console.log(`${colors.yellow}Audio playback error: ${err.message}${colors.reset}`);
      });

      audioPlayProcess.stderr?.on('data', (data) => {
        // Suppress sox WARN messages about audio format
        const msg = data.toString();
        if (!msg.includes('WARN') && options.debug) {
          console.log(`${colors.dim}[sox] ${msg}${colors.reset}`);
        }
      });

      console.log(`${colors.green}Audio playback active - you'll hear Ferni speak!${colors.reset}`);

      // Pipe audio frames to sox
      for await (const frame of audioStream) {
        if (audioPlayProcess && !audioPlayProcess.killed && audioPlayProcess.stdin) {
          // Convert samples to Buffer (16-bit signed PCM)
          const samples = frame.data;
          const buffer = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
          audioPlayProcess.stdin.write(buffer);
        }
      }
    } catch (err) {
      console.log(`${colors.yellow}Audio stream error: ${(err as Error).message}${colors.reset}`);
    }
  });

  // Handle transcription - THIS IS WHERE VOICE BECOMES CLAUDE INPUT
  room.on(RoomEvent.TranscriptionReceived, (segments, participant) => {
    for (const segment of segments) {
      if (segment.final && segment.text) {
        const isAgent = participant?.identity?.includes('agent');

        if (isAgent) {
          // Ferni is speaking (narration)
          console.log(`${colors.magenta}Ferni:${colors.reset} ${segment.text}`);
        } else {
          // User is speaking - send to Claude!
          sendToClaude(segment.text);
        }
      }
    }
  });

  // Register text stream handler for transcriptions (newer API)
  room.registerTextStreamHandler('lk.transcription', async (reader, { identity }) => {
    const text = await reader.readAll();
    const isAgent = identity?.includes('agent');

    if (isAgent) {
      // Ferni is speaking (agent transcription)
      console.log(`${colors.magenta}Ferni:${colors.reset} ${text}`);
    } else if (text.trim()) {
      // User is speaking - send to Claude!
      sendToClaude(text);
    }
  });

  // Connect to LiveKit room
  try {
    await room.connect(url, token, {
      autoSubscribe: true,
    });
  } catch (err) {
    throw new Error(`Failed to connect: ${(err as Error).message}`);
  }

  console.log(`${colors.dim}Room: ${room.name}${colors.reset}`);

  // Publish microphone using sox for audio capture (Node.js doesn't have native mic access)
  console.log(`${colors.dim}Enabling microphone...${colors.reset}`);

  let micProcess: ChildProcess | null = null;

  try {
    const { AudioSource, LocalAudioTrack, AudioFrame, TrackPublishOptions, TrackSource } = lk;

    // Check if sox is available
    try {
      execSync('which sox', { stdio: 'pipe' });
    } catch {
      throw new Error('sox not installed. Install with: brew install sox');
    }

    // Create audio source (16kHz mono for speech)
    const SAMPLE_RATE = 16000;
    const CHANNELS = 1;
    const source = new AudioSource(SAMPLE_RATE, CHANNELS);
    const track = LocalAudioTrack.createAudioTrack('microphone', source);

    // Publish track
    const pubOptions = new TrackPublishOptions();
    pubOptions.source = TrackSource.SOURCE_MICROPHONE;
    await room.localParticipant?.publishTrack(track, pubOptions);

    // Start sox to capture mic audio as raw PCM
    micProcess = spawn('sox', [
      '-d',                    // Default audio device (mic)
      '-t', 'raw',             // Output raw PCM
      '-b', '16',              // 16-bit
      '-e', 'signed-integer',  // Signed integers
      '-r', String(SAMPLE_RATE), // Sample rate
      '-c', String(CHANNELS),  // Mono
      '-',                     // Output to stdout
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Feed audio frames to LiveKit
    const FRAME_DURATION_MS = 20; // 20ms frames
    const SAMPLES_PER_FRAME = (SAMPLE_RATE * FRAME_DURATION_MS) / 1000;
    const BYTES_PER_FRAME = SAMPLES_PER_FRAME * 2; // 16-bit = 2 bytes per sample
    let buffer = Buffer.alloc(0);

    micProcess.stdout?.on('data', (data: Buffer) => {
      buffer = Buffer.concat([buffer, data]);

      while (buffer.length >= BYTES_PER_FRAME) {
        const frameData = buffer.subarray(0, BYTES_PER_FRAME);
        buffer = buffer.subarray(BYTES_PER_FRAME);

        const int16Array = new Int16Array(frameData.buffer, frameData.byteOffset, SAMPLES_PER_FRAME);
        const frame = new AudioFrame(int16Array, SAMPLE_RATE, CHANNELS, SAMPLES_PER_FRAME);
        source.captureFrame(frame);
      }
    });

    micProcess.on('error', (err) => {
      console.log(`${colors.yellow}Mic process error: ${err.message}${colors.reset}`);
    });

    console.log(`${colors.green}Microphone active!${colors.reset}`);
  } catch (err) {
    console.log(`${colors.yellow}Microphone error: ${(err as Error).message}${colors.reset}`);
    console.log(`${colors.dim}You can still type commands.${colors.reset}`);
  }

  // Initialize Claude Code with streaming JSON (spawns per-message with session resumption)
  initializeClaude(options.workingDir, handleClaudeOutput);

  // Poll MCP narration queue for messages from Claude's MCP tool calls
  let mcpPollInterval: NodeJS.Timeout | null = null;

  const pollMcpNarrations = async () => {
    const narrations = getUnprocessedNarrations();
    if (narrations.length > 0) {
      const ids: string[] = [];
      for (const narration of narrations) {
        ids.push(narration.id);

        // Map MCP narration type to our narration type
        const narType =
          narration.type === 'completion'
            ? 'result'
            : narration.type === 'progress'
              ? 'progress'
              : 'progress';

        // Display locally
        console.log(`${colors.magenta}[MCP]${colors.reset} ${narration.text}`);

        // Send to Ferni for TTS
        await sendNarrationToFerni(narration.text, narType);
      }
      markNarrationsProcessed(ids);
    }
  };

  // Start polling MCP queue every 500ms
  mcpPollInterval = setInterval(pollMcpNarrations, 500);

  // Initialize MCP state directory
  ensureMcpStateDir();

  console.log(`
${colors.green}Ready!${colors.reset} Talk to Ferni about what you want to build.

${colors.dim}How it works:${colors.reset}
  1. Speak naturally - Ferni transcribes your voice
  2. Your words are sent to Claude Code as commands
  3. Claude works on your request (you'll see tool usage)
  4. Results appear in the terminal

${colors.dim}Examples:${colors.reset}
  "Add a dark mode toggle to the settings page"
  "Fix the bug in the login form"
  "Refactor the user service"

${colors.dim}Commands:${colors.reset}
  Type 'exit' to quit
  Type 'restart' to restart Claude
  Or just type a message to send directly to Claude

`);

  // Handle keyboard input as fallback
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Cleanup helper for mic and audio playback processes
  const cleanupAudio = () => {
    if (micProcess && !micProcess.killed) {
      micProcess.kill();
    }
    if (audioPlayProcess && !audioPlayProcess.killed) {
      audioPlayProcess.kill();
    }
  };

  rl.on('line', async (line) => {
    const cmd = line.trim().toLowerCase();

    if (cmd === 'exit' || cmd === 'quit') {
      console.log(`\n${colors.dim}Shutting down...${colors.reset}`);
      if (mcpPollInterval) clearInterval(mcpPollInterval);
      cleanupAudio();
      claudeState.process?.kill();
      await room.disconnect();
      dispose();
      console.log(`${colors.green}Goodbye!${colors.reset}\n`);
      process.exit(0);
    } else if (cmd === 'restart' || cmd === 'reset') {
      console.log(`${colors.dim}Resetting session...${colors.reset}`);
      claudeState.process?.kill();
      claudeState.sessionId = null;
      claudeState.isReady = true;
      console.log(`${colors.green}Session reset. Speak to start fresh.${colors.reset}`);
    } else if (line.trim()) {
      // Send typed input to Claude
      sendToClaude(line.trim());
    }
  });

  // Handle Ctrl+C
  process.on('SIGINT', async () => {
    console.log(`\n${colors.dim}Shutting down...${colors.reset}`);
    if (mcpPollInterval) clearInterval(mcpPollInterval);
    cleanupAudio();
    claudeState.process?.kill();
    await room.disconnect();
    dispose();
    console.log(`${colors.green}Goodbye!${colors.reset}\n`);
    process.exit(0);
  });

  // Keep process alive
  await new Promise(() => {});
}

// ============================================================================
// MAIN
// ============================================================================

interface Options {
  debug: boolean;
  workingDir: string;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
${colors.bold}Voice-Driven Claude Code${colors.reset}

Talk to Ferni, who helps you code with Claude.

${colors.bold}Usage:${colors.reset}
  ferni code                    # Start voice coding session
  ferni code --dir ./myproject  # Work in a specific directory
  ferni code --debug            # Show debug info (raw JSON events)

${colors.bold}Prerequisites:${colors.reset}
  1. Claude Code CLI: npm install -g @anthropic-ai/claude-code
  2. Token server: pnpm ui-server
  3. Agent: pnpm agent:dev

${colors.bold}How it works:${colors.reset}
  Uses Claude Code's streaming JSON API for clean bidirectional communication:

  1. You speak to Ferni
  2. Ferni transcribes and sends to Claude (stream-json input)
  3. Claude executes, streaming events back (stream-json output)
  4. You see tool usage, results, and responses in real-time
  5. Speak again when Claude is ready for more input

${colors.bold}Architecture:${colors.reset}
  Voice → LiveKit → Gemini STT → Claude Code (NDJSON) → Terminal

`);
    return;
  }

  // Check prerequisites
  if (!checkClaudeInstalled()) {
    console.log(`${colors.red}Claude Code CLI not found!${colors.reset}`);
    console.log(`\n${colors.yellow}Install it with:${colors.reset}`);
    console.log(`${colors.dim}  npm install -g @anthropic-ai/claude-code${colors.reset}\n`);
    process.exit(1);
  }

  const options: Options = {
    debug: args.includes('--debug') || args.includes('-d'),
    workingDir: process.cwd(),
  };

  // Parse --dir option
  const dirIdx = args.indexOf('--dir');
  if (dirIdx !== -1 && args[dirIdx + 1]) {
    options.workingDir = args[dirIdx + 1];
  }

  console.log(`
${colors.bold}${colors.magenta}╔════════════════════════════════════════════════════════════╗
║  🎙️  Voice-Driven Coding with Ferni + Claude               ║
╚════════════════════════════════════════════════════════════╝${colors.reset}

${colors.dim}Talk to Ferni about what you want to build.
Using Claude Code's streaming JSON API for real-time communication.${colors.reset}

`);

  // Check if token server is running
  try {
    const healthCheck = await fetch(`${CONFIG.tokenServerUrl}/health`);
    if (!healthCheck.ok) throw new Error('unhealthy');
  } catch {
    console.log(`${colors.red}Token server not running!${colors.reset}`);
    console.log(`\n${colors.yellow}Start it with:${colors.reset}`);
    console.log(`${colors.dim}  pnpm ui-server${colors.reset}\n`);
    process.exit(1);
  }

  // Generate room name and identity
  const roomName = `cli-claude-${Date.now()}`;
  const username = `cli-coder-${Math.random().toString(36).slice(2, 6)}`;

  console.log(`${colors.dim}Working directory: ${options.workingDir}${colors.reset}`);
  console.log(`${colors.dim}Room: ${roomName}${colors.reset}`);

  // Fetch token
  console.log(`${colors.dim}Fetching token...${colors.reset}`);

  let tokenData: TokenResponse;
  try {
    tokenData = await fetchToken(roomName, username, 'ferni');
  } catch (err) {
    console.log(`${colors.red}Failed to get token: ${(err as Error).message}${colors.reset}`);
    process.exit(1);
  }

  const livekitUrl = tokenData.url || CONFIG.livekitUrl;
  if (!livekitUrl) {
    console.log(`${colors.red}No LiveKit URL configured${colors.reset}`);
    process.exit(1);
  }

  // Connect voice to Claude
  try {
    await connectVoiceToClaude(tokenData.token, livekitUrl, options);
  } catch (err) {
    console.log(`${colors.red}Connection failed: ${(err as Error).message}${colors.reset}`);
    if (options.debug) {
      console.log(`${colors.dim}${(err as Error).stack}${colors.reset}`);
    }
    process.exit(1);
  }
}

// Export for CLI integration
export async function handleVoiceClaude(args: string[]): Promise<void> {
  // Check prerequisites
  if (!checkClaudeInstalled()) {
    console.log(`${colors.red}Claude Code CLI not found!${colors.reset}`);
    console.log(`${colors.yellow}Install: npm install -g @anthropic-ai/claude-code${colors.reset}\n`);
    return;
  }

  const options: Options = {
    debug: args.includes('--debug') || args.includes('-d'),
    workingDir: process.cwd(),
  };

  const dirIdx = args.indexOf('--dir');
  if (dirIdx !== -1 && args[dirIdx + 1]) {
    options.workingDir = args[dirIdx + 1];
  }

  console.log(`
${colors.bold}${colors.magenta}╔════════════════════════════════════════════════════════════╗
║  🎙️  Voice-Driven Coding with Ferni + Claude               ║
╚════════════════════════════════════════════════════════════╝${colors.reset}
`);

  try {
    const healthCheck = await fetch(`${CONFIG.tokenServerUrl}/health`);
    if (!healthCheck.ok) throw new Error('unhealthy');
  } catch {
    console.log(`${colors.red}Token server not running!${colors.reset}`);
    console.log(`${colors.yellow}Start it: pnpm ui-server${colors.reset}\n`);
    return;
  }

  const roomName = `cli-claude-${Date.now()}`;
  const username = `cli-coder-${Math.random().toString(36).slice(2, 6)}`;

  console.log(`${colors.dim}Working directory: ${options.workingDir}${colors.reset}`);

  let tokenData: TokenResponse;
  try {
    tokenData = await fetchToken(roomName, username, 'ferni');
  } catch (err) {
    console.log(`${colors.red}Token error: ${(err as Error).message}${colors.reset}`);
    return;
  }

  const livekitUrl = tokenData.url || CONFIG.livekitUrl;
  if (!livekitUrl) {
    console.log(`${colors.red}No LiveKit URL${colors.reset}`);
    return;
  }

  await connectVoiceToClaude(tokenData.token, livekitUrl, options);
}

main().catch((err) => {
  console.error(`${colors.red}Error: ${err.message}${colors.reset}`);
  process.exit(1);
});
