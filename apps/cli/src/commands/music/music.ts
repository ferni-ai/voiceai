#!/usr/bin/env npx tsx
/**
 * Music CLI Command
 *
 * Control music playback via the CLI.
 *
 * Usage:
 *   ferni music play "jazz"       # Play music
 *   ferni music pause             # Pause playback
 *   ferni music resume            # Resume playback
 *   ferni music stop              # Stop playback
 *   ferni music skip              # Skip to next track
 *   ferni music volume 80         # Set volume to 80%
 *   ferni music status            # Show what's playing
 *   ferni music suggest "chill"   # Get music suggestion for mood
 *
 * @module cli/commands/music
 */

import { isAuthenticated, getCurrentUser, getAuthHeaders } from '../../services/cli-auth.service.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const API_BASE_URL =
  process.env.FERNI_API_URL || 'https://john-bogle-ui-1031920444452.us-central1.run.app';

// ANSI colors for terminal output
const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

interface MusicArgs {
  command: string;
  query?: string;
  volume?: number;
}

function parseArgs(args: string[]): MusicArgs {
  const command = args[0]?.toLowerCase() || 'status';
  const rest = args.slice(1);

  // Handle volume as number
  if (command === 'volume' && rest[0]) {
    return { command, volume: parseInt(rest[0], 10) };
  }

  // Handle play/suggest with query
  if ((command === 'play' || command === 'suggest') && rest.length > 0) {
    return { command, query: rest.join(' ') };
  }

  return { command };
}

function showHelp(): void {
  console.log(`
${colors.bold('🎵 Ferni Music CLI')}

${colors.cyan('Usage:')}
  ferni music <command> [options]

${colors.cyan('Commands:')}
  ${colors.green('play <query>')}     Play music by query (artist, genre, mood)
  ${colors.green('pause')}            Pause current playback
  ${colors.green('resume')}           Resume paused playback
  ${colors.green('stop')}             Stop playback completely
  ${colors.green('skip')}             Skip to next track
  ${colors.green('volume <0-100>')}   Set volume level
  ${colors.green('status')}           Show what's currently playing
  ${colors.green('suggest <mood>')}   Get music suggestion for your mood

${colors.cyan('Examples:')}
  ferni music play "relaxing piano"
  ferni music play "90s hip hop"
  ferni music volume 70
  ferni music suggest "focused work"
`);
}

async function executeMusic(fn: string, args: Record<string, unknown>): Promise<{ success: boolean; result?: unknown; error?: string }> {
  if (!isAuthenticated()) {
    return { success: false, error: 'Not authenticated. Run: ferni auth login' };
  }

  const user = getCurrentUser();
  if (!user) {
    return { success: false, error: 'No user found. Run: ferni auth login' };
  }

  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/api/chat/tool`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fn,
        args,
        userId: user.userId,
        source: 'cli-music',
      }),
    });

    const data = await response.json();
    return { success: data.success, result: data.result, error: data.error };
  } catch (error) {
    return { success: false, error: `API error: ${error}` };
  }
}

async function handlePlay(query: string): Promise<void> {
  console.log(colors.dim(`Playing "${query}"...`));

  const result = await executeMusic('playMusic', { query });

  if (result.success) {
    console.log(colors.green(`🎵 ${result.result || 'Music started!'}`));
  } else {
    console.log(colors.red(`❌ ${result.error || "Couldn't play music"}`));
  }
}

async function handleControl(action: string, level?: number): Promise<void> {
  const args: Record<string, unknown> = { action };
  if (level !== undefined) {
    args.level = level;
  }

  const actionLabels: Record<string, string> = {
    pause: 'Pausing...',
    resume: 'Resuming...',
    stop: 'Stopping...',
    skip: 'Skipping...',
    volume: `Setting volume to ${level}%...`,
  };

  console.log(colors.dim(actionLabels[action] || `${action}...`));

  const result = await executeMusic('musicControl', args);

  if (result.success) {
    console.log(colors.green(`🎵 ${result.result}`));
  } else {
    console.log(colors.red(`❌ ${result.error || `Couldn't ${action} music`}`));
  }
}

async function handleStatus(): Promise<void> {
  console.log(colors.dim('Checking playback status...'));

  const result = await executeMusic('musicInfo', { action: 'playing' });

  if (result.success && result.result) {
    console.log(colors.green(`🎵 ${result.result}`));
  } else {
    console.log(colors.yellow('🔇 Nothing playing right now'));
  }
}

async function handleSuggest(mood: string): Promise<void> {
  console.log(colors.dim(`Finding music for "${mood}" mood...`));

  const result = await executeMusic('suggestMusic', { mood });

  if (result.success) {
    console.log(colors.green(`🎵 ${result.result || 'Playing suggested music!'}`));
  } else {
    console.log(colors.red(`❌ ${result.error || "Couldn't find suggestions"}`));
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Handle help
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    showHelp();
    return;
  }

  const parsed = parseArgs(args);

  switch (parsed.command) {
    case 'play':
      if (!parsed.query) {
        console.log(colors.red('❌ Please specify what to play: ferni music play "jazz"'));
        return;
      }
      await handlePlay(parsed.query);
      break;

    case 'pause':
      await handleControl('pause');
      break;

    case 'resume':
    case 'unpause':
      await handleControl('resume');
      break;

    case 'stop':
      await handleControl('stop');
      break;

    case 'skip':
    case 'next':
      await handleControl('skip');
      break;

    case 'volume':
    case 'vol':
      if (parsed.volume === undefined || isNaN(parsed.volume)) {
        console.log(colors.red('❌ Please specify volume level: ferni music volume 80'));
        return;
      }
      if (parsed.volume < 0 || parsed.volume > 100) {
        console.log(colors.red('❌ Volume must be between 0 and 100'));
        return;
      }
      await handleControl('volume', parsed.volume);
      break;

    case 'status':
    case 'playing':
    case 'now':
      await handleStatus();
      break;

    case 'suggest':
    case 'mood':
      if (!parsed.query) {
        console.log(colors.red('❌ Please specify a mood: ferni music suggest "focused"'));
        return;
      }
      await handleSuggest(parsed.query);
      break;

    default:
      // Try to interpret as a play command
      if (args[0] && !args[0].startsWith('-')) {
        await handlePlay(args.join(' '));
      } else {
        console.log(colors.red(`❌ Unknown command: ${parsed.command}`));
        showHelp();
      }
  }
}

// Run
main().catch((err) => {
  console.error(colors.red(`Error: ${err.message}`));
  process.exit(1);
});
