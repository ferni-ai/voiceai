#!/usr/bin/env npx tsx
/**
 * Agent Voice Command
 *
 * Manage voice configuration for custom agents.
 *
 * Usage:
 *   ferni agent voice upload <agent-id> <audio-file>  # Upload voice sample
 *   ferni agent voice status <agent-id>               # Check voice status
 *   ferni agent voice library                         # Browse voice library
 */

import * as p from '@clack/prompts';
import * as picocolorsModule from 'picocolors';
import * as fs from 'fs';
import * as path from 'path';
import { cliAuth, isAuthenticated } from '../../services/cli-auth.service.js';

const color = picocolorsModule.default || picocolorsModule;

// ============================================================================
// TYPES
// ============================================================================

interface VoiceUploadResponse {
  success: boolean;
  voiceId?: string;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  quality?: {
    duration: number;
    clarity: number;
    recommendation: string;
  };
  message?: string;
}

interface VoiceStatusResponse {
  type: 'cloned' | 'selected' | 'generated';
  status: 'pending' | 'processing' | 'ready' | 'failed';
  voiceId?: string;
  message?: string;
}

interface LibraryVoice {
  id: string;
  name: string;
  gender: string;
  style: string;
  preview_url?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SUPPORTED_FORMATS = ['.wav', '.mp3', '.m4a', '.webm', '.ogg', '.flac'];
const MIN_DURATION_SECONDS = 10;
const RECOMMENDED_DURATION_SECONDS = 60;

// ============================================================================
// HELPERS
// ============================================================================

function getFileExtension(filename: string): string {
  return path.extname(filename).toLowerCase();
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} seconds`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

// ============================================================================
// COMMANDS
// ============================================================================

async function handleUpload(agentId: string, audioFile: string): Promise<void> {
  p.intro(color.bgMagenta(color.white(' Upload Voice Sample ')));

  // Check authentication
  if (!isAuthenticated()) {
    p.log.warn("You're not logged in.");
    p.log.info(`Run ${color.cyan('ferni auth login')} first.`);
    process.exit(1);
  }

  // Validate file exists
  if (!fs.existsSync(audioFile)) {
    p.log.error(`File not found: ${audioFile}`);
    process.exit(1);
  }

  // Validate file format
  const ext = getFileExtension(audioFile);
  if (!SUPPORTED_FORMATS.includes(ext)) {
    p.log.error(`Unsupported format: ${ext}`);
    p.log.info(`Supported formats: ${SUPPORTED_FORMATS.join(', ')}`);
    process.exit(1);
  }

  // Get file info
  const stats = fs.statSync(audioFile);
  const fileSizeMB = stats.size / (1024 * 1024);

  p.log.info(`File: ${color.cyan(path.basename(audioFile))}`);
  p.log.info(`Size: ${fileSizeMB.toFixed(2)} MB`);
  console.log('');

  // Warn if file is very large
  if (fileSizeMB > 50) {
    p.log.warn('Large file detected. Upload may take a while.');
  }

  const spinner = p.spinner();
  spinner.start('Uploading voice sample...');

  try {
    // Read the file
    const fileBuffer = fs.readFileSync(audioFile);
    const filename = path.basename(audioFile);
    const contentType = ext === '.mp3' ? 'audio/mpeg' : `audio/${ext.slice(1)}`;

    // Upload via API
    const response = await cliAuth.apiUpload<VoiceUploadResponse>(
      `/api/custom-agents/${agentId}/voice/upload`,
      fileBuffer,
      filename,
      contentType
    );

    spinner.stop('Upload complete!');

    // Show quality analysis
    if (response.quality) {
      console.log('');
      p.log.info(color.bold('Voice Analysis:'));
      console.log(`  Duration: ${formatDuration(response.quality.duration)}`);
      console.log(`  Clarity: ${Math.round(response.quality.clarity * 100)}%`);

      if (response.quality.duration < MIN_DURATION_SECONDS) {
        p.log.warn(`Audio is short (${formatDuration(response.quality.duration)}). Consider uploading a longer sample.`);
      } else if (response.quality.duration >= RECOMMENDED_DURATION_SECONDS) {
        p.log.success('Great! This should produce a high-quality voice clone.');
      }

      if (response.quality.recommendation) {
        p.log.info(response.quality.recommendation);
      }
    }

    // Show status
    console.log('');
    if (response.status === 'processing') {
      p.log.info('Voice cloning is in progress...');
      p.log.info(`Check status: ${color.cyan(`ferni agent voice status ${agentId}`)}`);
    } else if (response.status === 'ready') {
      p.log.success('Voice clone is ready!');
    }

    p.outro(color.green('Voice sample uploaded successfully!'));
  } catch (error) {
    spinner.stop('Upload failed.');
    p.log.error(`${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

async function handleStatus(agentId: string): Promise<void> {
  p.intro(color.bgCyan(color.black(' Voice Status ')));

  if (!isAuthenticated()) {
    p.log.warn("You're not logged in.");
    process.exit(1);
  }

  const spinner = p.spinner();
  spinner.start('Checking voice status...');

  try {
    const response = await cliAuth.apiRequest<VoiceStatusResponse>(
      `/api/custom-agents/${agentId}/voice`
    );

    spinner.stop('Status loaded.');

    const statusIcons: Record<string, string> = {
      pending: '⏳',
      processing: '⚙️',
      ready: '✓',
      failed: '✗',
    };

    const statusColors: Record<string, (s: string) => string> = {
      pending: color.yellow,
      processing: color.blue,
      ready: color.green,
      failed: color.red,
    };

    console.log('');
    console.log(`  Type: ${color.cyan(response.type)}`);
    console.log(`  Status: ${statusIcons[response.status]} ${statusColors[response.status](response.status)}`);

    if (response.voiceId) {
      console.log(`  Voice ID: ${color.dim(response.voiceId)}`);
    }

    if (response.message) {
      console.log(`  ${color.dim(response.message)}`);
    }

    console.log('');

    if (response.status === 'pending') {
      p.log.info(`Upload a voice sample: ${color.cyan(`ferni agent voice upload ${agentId} <file>`)}`);
    } else if (response.status === 'failed') {
      p.log.warn('Voice cloning failed. Try uploading a clearer sample.');
    }

    p.outro('');
  } catch (error) {
    spinner.stop('Failed to get status.');
    p.log.error(`${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

async function handleLibrary(): Promise<void> {
  p.intro(color.bgCyan(color.black(' Voice Library ')));

  if (!isAuthenticated()) {
    p.log.warn("You're not logged in.");
    process.exit(1);
  }

  const spinner = p.spinner();
  spinner.start('Loading voice library...');

  try {
    const voices = await cliAuth.apiRequest<LibraryVoice[]>('/api/voices/library');

    spinner.stop('Library loaded.');

    if (voices.length === 0) {
      p.log.info('No voices available in the library.');
      p.outro('');
      return;
    }

    console.log('');
    console.log(color.bold(`  ${'Name'.padEnd(20)} ${'Gender'.padEnd(10)} ${'Style'.padEnd(15)} ${'ID'}`));
    console.log(color.dim('  ' + '─'.repeat(70)));

    for (const voice of voices) {
      console.log(
        `  ${color.cyan(voice.name.padEnd(20))} ` +
        `${voice.gender.padEnd(10)} ` +
        `${voice.style.padEnd(15)} ` +
        `${color.dim(voice.id)}`
      );
    }

    console.log('');
    p.log.info('To use a library voice, set it via the web interface or API.');
    p.outro('');
  } catch (error) {
    spinner.stop('Failed to load library.');
    p.log.error(`${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const subcommand = args[0];

  switch (subcommand) {
    case 'upload': {
      const agentId = args[1];
      const audioFile = args[2];

      if (!agentId || !audioFile) {
        p.log.error('Agent ID and audio file required');
        p.log.info(`Usage: ${color.cyan('ferni agent voice upload <agent-id> <audio-file>')}`);
        process.exit(1);
      }

      await handleUpload(agentId, audioFile);
      break;
    }

    case 'status': {
      const agentId = args[1];

      if (!agentId) {
        p.log.error('Agent ID required');
        p.log.info(`Usage: ${color.cyan('ferni agent voice status <agent-id>')}`);
        process.exit(1);
      }

      await handleStatus(agentId);
      break;
    }

    case 'library':
      await handleLibrary();
      break;

    default:
      p.log.error(`Unknown subcommand: ${subcommand || '(none)'}`);
      console.log('');
      console.log('Available commands:');
      console.log(`  ${color.cyan('ferni agent voice upload <agent-id> <file>')}  Upload voice sample`);
      console.log(`  ${color.cyan('ferni agent voice status <agent-id>')}         Check voice status`);
      console.log(`  ${color.cyan('ferni agent voice library')}                   Browse voice library`);
      process.exit(1);
  }
}

main().catch((error) => {
  console.error(color.red('Error:'), error.message);
  process.exit(1);
});
