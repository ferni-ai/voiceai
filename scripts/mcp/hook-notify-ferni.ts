#!/usr/bin/env npx tsx
/**
 * Claude Code Hook Script - Notify Ferni
 *
 * This script is called by Claude Code hooks (PostToolUse, Stop, etc.)
 * to add narration messages to the Ferni MCP queue.
 *
 * Usage:
 *   npx tsx hook-notify-ferni.ts <type> <message>
 *
 * Types: progress, completion, tool
 *
 * Examples:
 *   npx tsx hook-notify-ferni.ts tool "Finished using Edit"
 *   npx tsx hook-notify-ferni.ts completion "Ready for next request"
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = dirname(dirname(__dirname));

const MCP_STATE_DIR = join(PROJECT_ROOT, '.ferni-mcp');
const NARRATION_FILE = join(MCP_STATE_DIR, 'narration.json');

interface NarrationMessage {
  id: string;
  text: string;
  type: 'narration' | 'progress' | 'question' | 'completion';
  timestamp: number;
  processed: boolean;
}

function queueNarration(text: string, type: NarrationMessage['type']): void {
  if (!existsSync(MCP_STATE_DIR)) {
    mkdirSync(MCP_STATE_DIR, { recursive: true });
  }

  let queue: NarrationMessage[] = [];
  if (existsSync(NARRATION_FILE)) {
    try {
      queue = JSON.parse(readFileSync(NARRATION_FILE, 'utf-8'));
    } catch {
      queue = [];
    }
  }

  const message: NarrationMessage = {
    id: `hook_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    text,
    type,
    timestamp: Date.now(),
    processed: false,
  };

  queue.push(message);

  // Keep only last 100 messages
  if (queue.length > 100) {
    queue = queue.slice(-100);
  }

  writeFileSync(NARRATION_FILE, JSON.stringify(queue, null, 2));
}

// Main
const args = process.argv.slice(2);
const type = (args[0] || 'progress') as NarrationMessage['type'];
const message = args.slice(1).join(' ') || 'Update from Claude';

queueNarration(message, type);
