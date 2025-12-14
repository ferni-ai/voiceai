#!/usr/bin/env npx tsx
/**
 * Voice-Driven Claude Code
 *
 * Talk to Ferni, who translates your requests into Claude Code commands.
 * Ferni narrates what Claude is doing and tells you when input is needed.
 *
 * Flow:
 *   You speak → Ferni understands → Claude Code executes → Ferni narrates
 *
 * Prerequisites:
 *   1. Claude Code CLI installed: npm install -g @anthropic-ai/claude-code
 *   2. Token server running: node token-server.js
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = dirname(dirname(__dirname));

// Load environment
dotenvConfig({ path: join(PROJECT_ROOT, '.env') });

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  tokenServerUrl: process.env.CLI_TOKEN_SERVER || 'http://localhost:3001',
  livekitUrl: process.env.LIVEKIT_URL || '',
};

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
// CLAUDE CODE PROCESS
// ============================================================================

interface ClaudeState {
  process: ChildProcess | null;
  isWaitingForInput: boolean;
  lastActivity: string;
  currentTask: string;
}

const claudeState: ClaudeState = {
  process: null,
  isWaitingForInput: false,
  lastActivity: '',
  currentTask: '',
};

function checkClaudeInstalled(): boolean {
  try {
    execSync('which claude', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function spawnClaude(workingDir: string): ChildProcess {
  const claude = spawn('claude', ['--dangerously-skip-permissions'], {
    cwd: workingDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      FORCE_COLOR: '0', // Disable colors for easier parsing
    },
  });

  return claude;
}

function parseClaudeOutput(data: string): {
  type: 'working' | 'waiting' | 'done' | 'error' | 'info';
  message: string;
} {
  const text = data.toString().trim();

  // Detect when Claude is waiting for input
  if (
    text.includes('What would you like') ||
    text.includes('How can I help') ||
    text.includes('Is there anything') ||
    text.includes('Would you like me to') ||
    text.includes('?') && text.length < 200
  ) {
    return { type: 'waiting', message: text };
  }

  // Detect errors
  if (text.includes('Error:') || text.includes('error:') || text.includes('failed')) {
    return { type: 'error', message: text };
  }

  // Detect completion
  if (
    text.includes('Done!') ||
    text.includes('Complete') ||
    text.includes('finished') ||
    text.includes('successfully')
  ) {
    return { type: 'done', message: text };
  }

  // Detect file operations
  if (
    text.includes('Reading') ||
    text.includes('Writing') ||
    text.includes('Creating') ||
    text.includes('Editing') ||
    text.includes('Searching')
  ) {
    return { type: 'working', message: text };
  }

  return { type: 'info', message: text };
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
// VOICE + CLAUDE INTEGRATION
// ============================================================================

interface BridgeState {
  room: any;
  claudeProcess: ChildProcess | null;
  pendingUserSpeech: string[];
  isProcessing: boolean;
  workingDir: string;
}

const bridgeState: BridgeState = {
  room: null,
  claudeProcess: null,
  pendingUserSpeech: [],
  isProcessing: false,
  workingDir: process.cwd(),
};

async function sendToAgent(room: any, message: string): Promise<void> {
  // Send a data message to the agent
  // The agent will speak this message via TTS
  const payload = JSON.stringify({
    type: 'narrator_message',
    text: message,
    source: 'claude_bridge',
  });

  try {
    const encoder = new TextEncoder();
    await room.localParticipant?.publishData(encoder.encode(payload), { reliable: true });
  } catch (err) {
    console.log(`${colors.dim}[Could not send to agent: ${(err as Error).message}]${colors.reset}`);
  }
}

async function startClaudeSession(workingDir: string): Promise<ChildProcess> {
  console.log(`${colors.dim}Starting Claude Code in ${workingDir}...${colors.reset}`);

  const claude = spawnClaude(workingDir);

  claude.stdout?.on('data', (data) => {
    const text = data.toString();
    const parsed = parseClaudeOutput(text);

    // Show in terminal
    console.log(`${colors.cyan}Claude:${colors.reset} ${text}`);

    // Update state
    claudeState.lastActivity = text;

    if (parsed.type === 'waiting') {
      claudeState.isWaitingForInput = true;
      console.log(`\n${colors.yellow}[Claude needs your input - speak your response]${colors.reset}\n`);
    } else {
      claudeState.isWaitingForInput = false;
    }
  });

  claude.stderr?.on('data', (data) => {
    const text = data.toString();
    console.log(`${colors.red}Claude Error:${colors.reset} ${text}`);
  });

  claude.on('close', (code) => {
    console.log(`${colors.dim}Claude session ended (code: ${code})${colors.reset}`);
    claudeState.process = null;
  });

  claudeState.process = claude;
  return claude;
}

function sendToClaude(message: string): void {
  if (!claudeState.process) {
    console.log(`${colors.red}Claude is not running${colors.reset}`);
    return;
  }

  console.log(`\n${colors.blue}You → Claude:${colors.reset} ${message}\n`);
  claudeState.process.stdin?.write(message + '\n');
  claudeState.isWaitingForInput = false;
}

// ============================================================================
// LIVEKIT CONNECTION
// ============================================================================

async function connectToRoom(
  token: string,
  url: string,
  options: { debug: boolean; workingDir: string }
): Promise<void> {
  const lk = await import('@livekit/rtc-node');
  const { Room, RoomEvent, dispose } = lk;

  console.log(`${colors.dim}Connecting to LiveKit...${colors.reset}`);

  const room = new Room();
  bridgeState.room = room;

  // Handle connection events
  room.on(RoomEvent.Connected, () => {
    console.log(`${colors.green}Connected to Ferni!${colors.reset}`);
  });

  room.on(RoomEvent.Disconnected, (reason?: string) => {
    console.log(`\n${colors.yellow}Disconnected: ${reason || 'unknown'}${colors.reset}`);
  });

  // Handle participants
  room.on(RoomEvent.ParticipantConnected, (participant) => {
    if (participant.identity?.includes('agent')) {
      console.log(`${colors.green}Ferni joined - ready to help with coding!${colors.reset}`);
    }
  });

  // Handle transcription - THIS IS WHERE VOICE BECOMES TEXT
  room.on(RoomEvent.TranscriptionReceived, (segments, participant) => {
    for (const segment of segments) {
      if (segment.final && segment.text) {
        const isAgent = participant?.identity?.includes('agent');

        if (isAgent) {
          // Ferni is speaking (narration)
          console.log(`${colors.cyan}Ferni:${colors.reset} ${segment.text}`);
        } else {
          // User is speaking - send to Claude!
          console.log(`${colors.blue}You:${colors.reset} ${segment.text}`);

          // If Claude is running and waiting for input, send it
          if (claudeState.process && claudeState.isWaitingForInput) {
            sendToClaude(segment.text);
          } else if (claudeState.process) {
            // Claude is working, queue the message
            console.log(`${colors.dim}[Queued - Claude is still working]${colors.reset}`);
            bridgeState.pendingUserSpeech.push(segment.text);
          } else {
            // No Claude session yet - start one with this request
            sendToClaude(segment.text);
          }
        }
      }
    }
  });

  // Handle data messages from agent
  room.on(RoomEvent.DataReceived, (data, participant) => {
    if (options.debug) {
      try {
        const msg = JSON.parse(new TextDecoder().decode(data));
        console.log(`${colors.dim}[DATA] ${JSON.stringify(msg).substring(0, 100)}${colors.reset}`);
      } catch {}
    }
  });

  // Connect to room
  try {
    await room.connect(url, token, {
      autoSubscribe: true,
    });
  } catch (err) {
    throw new Error(`Failed to connect: ${(err as Error).message}`);
  }

  console.log(`${colors.dim}Room: ${room.name}${colors.reset}`);

  // Publish microphone
  console.log(`${colors.dim}Enabling microphone...${colors.reset}`);

  try {
    const { LocalAudioTrack } = lk;
    const micTrack = await LocalAudioTrack.createMicrophoneTrack();
    await room.localParticipant?.publishTrack(micTrack);
    console.log(`${colors.green}Microphone active!${colors.reset}`);
  } catch (err) {
    console.log(`${colors.yellow}Microphone error: ${(err as Error).message}${colors.reset}`);
  }

  // Start Claude session
  await startClaudeSession(options.workingDir);

  console.log(`
${colors.green}Ready!${colors.reset} Talk to Ferni about what you want to build.

${colors.dim}Examples:${colors.reset}
  "Hey Ferni, let's add a dark mode toggle to the settings page"
  "Can you help me fix the bug in the login form?"
  "I want to refactor the user service to use TypeScript"

${colors.dim}Commands:${colors.reset}
  Type 'exit' to quit
  Type 'restart' to restart Claude
  Type anything else to send directly to Claude

`);

  // Handle keyboard input as fallback
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.on('line', async (line) => {
    const cmd = line.trim().toLowerCase();

    if (cmd === 'exit' || cmd === 'quit') {
      console.log(`\n${colors.dim}Shutting down...${colors.reset}`);
      claudeState.process?.kill();
      await room.disconnect();
      dispose();
      console.log(`${colors.green}Goodbye!${colors.reset}\n`);
      process.exit(0);
    } else if (cmd === 'restart') {
      console.log(`${colors.dim}Restarting Claude...${colors.reset}`);
      claudeState.process?.kill();
      await startClaudeSession(options.workingDir);
    } else if (line.trim()) {
      // Send typed input to Claude
      sendToClaude(line.trim());
    }
  });

  // Handle Ctrl+C
  process.on('SIGINT', async () => {
    console.log(`\n${colors.dim}Shutting down...${colors.reset}`);
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
  ferni code --debug            # Show debug info

${colors.bold}Prerequisites:${colors.reset}
  1. Claude Code CLI: npm install -g @anthropic-ai/claude-code
  2. Token server: node token-server.js
  3. Agent: pnpm agent:dev

${colors.bold}How it works:${colors.reset}
  1. You speak to Ferni
  2. Ferni understands your intent
  3. Claude Code executes the task
  4. Ferni narrates progress
  5. When Claude needs input, Ferni asks you

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
Ferni will work with Claude Code to make it happen.${colors.reset}

`);

  // Check if token server is running
  try {
    const healthCheck = await fetch(`${CONFIG.tokenServerUrl}/health`);
    if (!healthCheck.ok) throw new Error('unhealthy');
  } catch {
    console.log(`${colors.red}Token server not running!${colors.reset}`);
    console.log(`\n${colors.yellow}Start it with:${colors.reset}`);
    console.log(`${colors.dim}  node token-server.js${colors.reset}\n`);
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

  // Connect
  try {
    await connectToRoom(tokenData.token, livekitUrl, options);
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
    console.log(`${colors.yellow}Start it: node token-server.js${colors.reset}\n`);
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

  await connectToRoom(tokenData.token, livekitUrl, options);
}

main().catch((err) => {
  console.error(`${colors.red}Error: ${err.message}${colors.reset}`);
  process.exit(1);
});
