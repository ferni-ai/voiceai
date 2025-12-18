/**
 * Developer Tools Domain
 *
 * Provides voice-driven access to:
 * - Ferni CLI commands (deploy, status, logs, etc.)
 * - Git operations (status, commit, diff)
 * - File reading and editing
 * - Bash command execution
 * - Background job tracking
 *
 * VOICE-OPTIMIZED: All outputs are summarized for spoken delivery (~300 chars max)
 *
 * Use cases:
 * - "Deploy the agent" → runs `ferni deploy agent`
 * - "What's my git status?" → shows changed files
 * - "Commit with message fix typo" → creates commit
 * - "Read the README file" → reads and summarizes README.md
 *
 * @module developer
 */

import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { createDomainExport } from '../../registry/loader.js';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { z } from 'zod';
import { execSync, spawn, spawnSync, type ChildProcess } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';

import { getToolDescription } from '../../utils/tool-descriptions.js';
const log = getLogger();

// ============================================================================
// HELPERS
// ============================================================================

// Get project root - look for package.json
function getProjectRoot(): string {
  let dir = process.cwd();
  while (dir !== '/') {
    if (existsSync(join(dir, 'package.json'))) {
      return dir;
    }
    dir = dirname(dir);
  }
  return process.cwd();
}

const PROJECT_ROOT = getProjectRoot();

/**
 * Summarize output for voice delivery
 * Voice output should be ~300 chars max, spoken naturally
 */
function summarizeForVoice(output: string, context: string): string {
  // Strip ANSI codes
  const clean = output.replace(/\x1b\[[0-9;]*m/g, '').trim();

  if (!clean) {
    return `${context} completed successfully.`;
  }

  // Count lines for context
  const lines = clean.split('\n').filter((l) => l.trim());
  const lineCount = lines.length;

  // If short enough, return as-is but cleaned up
  if (clean.length <= 300) {
    return clean;
  }

  // Extract key information based on patterns
  const hasError = /error|fail|exception/i.test(clean);
  const hasSuccess = /success|complete|done|✓|passed/i.test(clean);
  const hasWarning = /warn|warning/i.test(clean);

  // Build a voice-friendly summary
  let summary = `${context}: `;

  if (hasError) {
    // Extract first error line
    const errorLine = lines.find((l) => /error|fail/i.test(l));
    summary += `Failed. ${errorLine?.slice(0, 150) || 'Check the logs for details.'}`;
  } else if (hasSuccess) {
    summary += `Completed successfully. `;
    if (lineCount > 1) {
      summary += `${lineCount} items processed.`;
    }
  } else if (hasWarning) {
    const warnCount = lines.filter((l) => /warn/i.test(l)).length;
    summary += `Done with ${warnCount} warning${warnCount > 1 ? 's' : ''}.`;
  } else {
    // Generic summary - first meaningful line + count
    const firstLine = lines[0]?.slice(0, 150) || '';
    summary += firstLine;
    if (lineCount > 1) {
      summary += ` ...and ${lineCount - 1} more line${lineCount > 2 ? 's' : ''}.`;
    }
  }

  return summary.slice(0, 350);
}

/**
 * Run a command safely using spawn with explicit args
 */
function runCommandSafe(
  cmd: string,
  args: string[],
  options: { cwd?: string; timeout?: number } = {}
): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync(cmd, args, {
    cwd: options.cwd || PROJECT_ROOT,
    encoding: 'utf-8',
    timeout: options.timeout || 60000,
    maxBuffer: 1024 * 1024,
  });

  return {
    stdout: (result.stdout || '').toString(),
    stderr: (result.stderr || '').toString(),
    exitCode: result.status ?? 1,
  };
}

// ============================================================================
// BACKGROUND JOB TRACKING
// ============================================================================

interface BackgroundJob {
  id: string;
  command: string;
  startTime: Date;
  process: ChildProcess;
  output: string[];
  status: 'running' | 'completed' | 'failed';
  exitCode?: number;
}

const backgroundJobs = new Map<string, BackgroundJob>();

function generateJobId(): string {
  return `job-${Date.now().toString(36)}`;
}

function startBackgroundJob(cmd: string, args: string[]): BackgroundJob {
  const jobId = generateJobId();
  const child = spawn(cmd, args, {
    cwd: PROJECT_ROOT,
    detached: false, // Keep attached so we can track output
  });

  const job: BackgroundJob = {
    id: jobId,
    command: `${cmd} ${args.join(' ')}`,
    startTime: new Date(),
    process: child,
    output: [],
    status: 'running',
  };

  child.stdout?.on('data', (data) => {
    job.output.push(data.toString());
    // Keep only last 50 lines
    if (job.output.length > 50) job.output.shift();
  });

  child.stderr?.on('data', (data) => {
    job.output.push(data.toString());
    if (job.output.length > 50) job.output.shift();
  });

  child.on('close', (code) => {
    job.status = code === 0 ? 'completed' : 'failed';
    job.exitCode = code ?? 1;
  });

  backgroundJobs.set(jobId, job);

  // Clean up old jobs (keep last 10)
  if (backgroundJobs.size > 10) {
    const oldest = Array.from(backgroundJobs.keys())[0];
    backgroundJobs.delete(oldest);
  }

  return job;
}

// ============================================================================
// GIT STATUS TOOL
// ============================================================================

const gitStatusDef: ToolDefinition = {
  id: 'gitStatus',
  name: 'Git Status',
  description: 'Check git status - what files have changed',
  domain: 'developer',
  tags: ['git', 'status', 'changes', 'vcs'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('gitStatus'),
      parameters: z.object({}),
      execute: async () => {
        try {
          const result = runCommandSafe('git', ['status', '--porcelain']);

          if (result.exitCode !== 0) {
            return 'Not a git repository or git error.';
          }

          const lines = result.stdout.trim().split('\n').filter(Boolean);

          if (lines.length === 0) {
            return 'Working directory is clean. No changes to commit.';
          }

          // Parse status codes
          const modified = lines.filter((l) => l.startsWith(' M') || l.startsWith('M ')).length;
          const added = lines.filter((l) => l.startsWith('A ') || l.startsWith('??')).length;
          const deleted = lines.filter((l) => l.startsWith(' D') || l.startsWith('D ')).length;

          // Voice-friendly summary
          const parts: string[] = [];
          if (modified > 0) parts.push(`${modified} modified`);
          if (added > 0) parts.push(`${added} new`);
          if (deleted > 0) parts.push(`${deleted} deleted`);

          let summary = `${lines.length} file${lines.length > 1 ? 's' : ''} changed: ${parts.join(', ')}.`;

          // Add first few file names
          const fileNames = lines.slice(0, 3).map((l) => l.slice(3).trim());
          if (fileNames.length > 0) {
            summary += ` Including: ${fileNames.join(', ')}`;
            if (lines.length > 3) summary += ` and ${lines.length - 3} more.`;
          }

          return summary;
        } catch (error) {
          log.error({ error: String(error) }, 'Git status failed');
          return 'Failed to get git status.';
        }
      },
    });
  },
};

// ============================================================================
// GIT DIFF TOOL
// ============================================================================

const gitDiffDef: ToolDefinition = {
  id: 'gitDiff',
  name: 'Git Diff',
  description: 'Show what changed in files',
  domain: 'developer',
  tags: ['git', 'diff', 'changes', 'vcs'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('gitDiff'),
      parameters: z.object({
        file: z.string().optional().describe('Specific file to diff (optional)'),
        staged: z.boolean().optional().describe('Show staged changes only'),
      }),
      execute: async ({ file, staged }) => {
        try {
          const args = ['diff', '--stat'];
          if (staged) args.push('--staged');
          if (file) args.push(file);

          const result = runCommandSafe('git', args);

          if (result.exitCode !== 0) {
            return 'Git diff failed. Are you in a git repository?';
          }

          if (!result.stdout.trim()) {
            return staged ? 'No staged changes.' : 'No changes to show.';
          }

          // Parse diff stat for voice summary
          const lines = result.stdout.trim().split('\n');
          const summaryLine = lines[lines.length - 1]; // "X files changed, Y insertions, Z deletions"

          // Extract numbers from summary
          const filesMatch = summaryLine.match(/(\d+) files? changed/);
          const insertMatch = summaryLine.match(/(\d+) insertions?/);
          const deleteMatch = summaryLine.match(/(\d+) deletions?/);

          const files = filesMatch ? parseInt(filesMatch[1]) : 0;
          const inserts = insertMatch ? parseInt(insertMatch[1]) : 0;
          const deletes = deleteMatch ? parseInt(deleteMatch[1]) : 0;

          let summary = `${files} file${files > 1 ? 's' : ''} changed`;
          if (inserts > 0) summary += `, ${inserts} line${inserts > 1 ? 's' : ''} added`;
          if (deletes > 0) summary += `, ${deletes} line${deletes > 1 ? 's' : ''} removed`;
          summary += '.';

          // Add file names
          const changedFiles = lines.slice(0, -1).map((l) => l.split('|')[0].trim());
          if (changedFiles.length > 0 && changedFiles.length <= 3) {
            summary += ` Files: ${changedFiles.join(', ')}.`;
          } else if (changedFiles.length > 3) {
            summary += ` Including ${changedFiles.slice(0, 2).join(', ')} and ${changedFiles.length - 2} more.`;
          }

          return summary;
        } catch (error) {
          log.error({ error: String(error) }, 'Git diff failed');
          return 'Failed to get diff.';
        }
      },
    });
  },
};

// ============================================================================
// GIT COMMIT TOOL
// ============================================================================

const gitCommitDef: ToolDefinition = {
  id: 'gitCommit',
  name: 'Git Commit',
  description: 'Commit staged changes with a message',
  domain: 'developer',
  tags: ['git', 'commit', 'save', 'vcs'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('gitCommit'),
      parameters: z.object({
        message: z.string().describe('The commit message'),
        addAll: z.boolean().optional().describe('Stage all changes first (git add -A)'),
      }),
      execute: async ({ message, addAll }) => {
        try {
          // Optionally stage all changes
          if (addAll) {
            const addResult = runCommandSafe('git', ['add', '-A']);
            if (addResult.exitCode !== 0) {
              return 'Failed to stage changes.';
            }
          }

          // Check if there are staged changes
          const statusResult = runCommandSafe('git', ['diff', '--staged', '--quiet']);
          if (statusResult.exitCode === 0) {
            return 'Nothing staged to commit. Use addAll to stage all changes, or stage files manually.';
          }

          // Create commit
          const result = runCommandSafe('git', ['commit', '-m', message]);

          if (result.exitCode !== 0) {
            return `Commit failed: ${result.stderr || result.stdout}`.slice(0, 300);
          }

          // Parse commit output for voice summary
          const output = result.stdout;
          const hashMatch = output.match(/\[[\w-]+\s+([a-f0-9]+)\]/);
          const hash = hashMatch ? hashMatch[1].slice(0, 7) : '';

          const filesMatch = output.match(/(\d+) files? changed/);
          const files = filesMatch ? filesMatch[1] : '0';

          return `Committed${hash ? ` (${hash})` : ''}: "${message.slice(0, 50)}${message.length > 50 ? '...' : ''}". ${files} file${files !== '1' ? 's' : ''} changed.`;
        } catch (error) {
          log.error({ error: String(error) }, 'Git commit failed');
          return 'Failed to create commit.';
        }
      },
    });
  },
};

// ============================================================================
// GIT LOG TOOL
// ============================================================================

const gitLogDef: ToolDefinition = {
  id: 'gitLog',
  name: 'Git Log',
  description: 'Show recent commits',
  domain: 'developer',
  tags: ['git', 'log', 'history', 'commits'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('gitLog'),
      parameters: z.object({
        count: z.number().optional().describe('Number of commits to show (default: 5)'),
      }),
      execute: async ({ count = 5 }) => {
        try {
          const result = runCommandSafe('git', [
            'log',
            `--max-count=${Math.min(count, 10)}`,
            '--oneline',
            '--no-decorate',
          ]);

          if (result.exitCode !== 0) {
            return 'Failed to get git log.';
          }

          const commits = result.stdout.trim().split('\n').filter(Boolean);

          if (commits.length === 0) {
            return 'No commits found.';
          }

          // Voice-friendly: describe last few commits
          if (commits.length === 1) {
            return `Last commit: ${commits[0]}`;
          }

          // Format: "3 recent commits: [hash] message, [hash] message..."
          const summaries = commits.slice(0, 3).map((c) => {
            const [hash, ...msg] = c.split(' ');
            return `${hash}: ${msg.join(' ').slice(0, 40)}`;
          });

          let response = `${commits.length} recent commit${commits.length > 1 ? 's' : ''}. `;
          response += summaries.join('. ');
          if (commits.length > 3) {
            response += `. Plus ${commits.length - 3} more.`;
          }

          return response;
        } catch (error) {
          log.error({ error: String(error) }, 'Git log failed');
          return 'Failed to get commit history.';
        }
      },
    });
  },
};

// ============================================================================
// FERNI CLI TOOL (improved)
// ============================================================================

const runFerniCommandDef: ToolDefinition = {
  id: 'runFerniCommand',
  name: 'Run Ferni CLI Command',
  description: 'Execute ferni CLI commands like deploy, status, logs, etc.',
  domain: 'developer',
  tags: ['cli', 'ferni', 'deploy', 'status', 'devops'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('runFerniCommand'),
      parameters: z.object({
        command: z.string().describe('The ferni command (without "ferni" prefix)'),
        background: z.boolean().optional().describe('Run in background for long commands'),
      }),
      execute: async ({ command, background = false }) => {
        try {
          log.info({ command, userId: ctx.userId }, 'Running ferni CLI command');

          // Security: Only allow safe ferni commands
          const allowedCommands = [
            'deploy',
            'status',
            'logs',
            'test',
            'quality',
            'doctor',
            'db',
            'env',
            'build',
            'metrics',
            'rollback',
            'secrets',
            'agents',
            'personas',
            'tools',
            'voices',
            'validate',
            'tokens',
          ];

          const firstWord = command.split(' ')[0];
          if (!allowedCommands.includes(firstWord)) {
            return `I can only run: ${allowedCommands.slice(0, 8).join(', ')}... Try "deploy agent" or "status".`;
          }

          const args = ['tsx', 'scripts/ferni.ts', ...command.split(' ')];

          // Long-running commands go to background
          const longRunning = ['deploy', 'build', 'test'];
          const isLongRunning = longRunning.some((cmd) => command.startsWith(cmd));

          if (background || isLongRunning) {
            const job = startBackgroundJob('npx', args);
            return `Started "${command}" in background. Job ID: ${job.id}. Ask me to "check job ${job.id}" for status.`;
          }

          // Run synchronously for quick commands
          const result = runCommandSafe('npx', args, { timeout: 120000 });

          if (result.exitCode !== 0) {
            return summarizeForVoice(result.stderr || result.stdout, `ferni ${command}`);
          }

          return summarizeForVoice(result.stdout, `ferni ${command}`);
        } catch (error) {
          log.error({ error: String(error), command }, 'Ferni CLI command failed');
          return `Command failed: ${(error as Error).message}`.slice(0, 200);
        }
      },
    });
  },
};

// ============================================================================
// CHECK BACKGROUND JOB TOOL
// ============================================================================

const checkJobDef: ToolDefinition = {
  id: 'checkBackgroundJob',
  name: 'Check Background Job',
  description: 'Check status of a background job',
  domain: 'developer',
  tags: ['job', 'background', 'status', 'check'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('checkBackgroundJob'),
      parameters: z.object({
        jobId: z.string().optional().describe('Job ID to check (optional - shows all if omitted)'),
      }),
      execute: async ({ jobId }) => {
        try {
          if (jobId) {
            const job = backgroundJobs.get(jobId);
            if (!job) {
              return `Job ${jobId} not found. It may have finished or expired.`;
            }

            const duration = Math.round((Date.now() - job.startTime.getTime()) / 1000);
            const lastOutput = job.output.slice(-3).join('\n').slice(-200);

            if (job.status === 'running') {
              return `Job ${jobId} is still running (${duration}s). Command: ${job.command}. Recent output: ${lastOutput || 'none yet'}`;
            } else {
              return `Job ${jobId} ${job.status} (exit code ${job.exitCode}). Ran for ${duration}s. Output: ${lastOutput || 'none'}`;
            }
          }

          // List all jobs
          if (backgroundJobs.size === 0) {
            return 'No background jobs running.';
          }

          const jobList = Array.from(backgroundJobs.values())
            .map((j) => `${j.id}: ${j.status} - ${j.command.slice(0, 30)}`)
            .join('. ');

          return `${backgroundJobs.size} job${backgroundJobs.size > 1 ? 's' : ''}: ${jobList}`;
        } catch (error) {
          log.error({ error: String(error) }, 'Check job failed');
          return 'Failed to check job status.';
        }
      },
    });
  },
};

// ============================================================================
// FILE READING TOOL (improved)
// ============================================================================

const readFileDef: ToolDefinition = {
  id: 'readFile',
  name: 'Read File',
  description: 'Read the contents of a file',
  domain: 'developer',
  tags: ['file', 'read', 'code', 'view'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('readFile'),
      parameters: z.object({
        path: z.string().describe('File path relative to project root'),
        startLine: z.number().optional().describe('Start line (1-indexed)'),
        endLine: z.number().optional().describe('End line'),
        summarize: z.boolean().optional().describe('Summarize for voice (default: true)'),
      }),
      execute: async ({ path, startLine, endLine, summarize = true }) => {
        try {
          const fullPath = resolve(PROJECT_ROOT, path);

          // Security: Don't allow reading outside project
          if (!fullPath.startsWith(PROJECT_ROOT)) {
            return 'I can only read files within the project.';
          }

          if (!existsSync(fullPath)) {
            return `File not found: ${path}`;
          }

          const content = readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n');

          // Apply line range
          let selectedLines = lines;
          if (startLine || endLine) {
            const start = (startLine || 1) - 1;
            const end = endLine || lines.length;
            selectedLines = lines.slice(start, end);
          }

          const result = selectedLines.join('\n');

          // Voice summary
          if (summarize && result.length > 300) {
            const lineCount = selectedLines.length;
            const preview = selectedLines
              .slice(0, 5)
              .map((l) => l.trim())
              .filter(Boolean)
              .join(' ')
              .slice(0, 150);
            return `${path}: ${lineCount} lines. Preview: ${preview}...`;
          }

          if (result.length > 2000) {
            return `${path} (${lines.length} lines): ${result.slice(0, 2000)}... [truncated]`;
          }

          return `${path}:\n${result}`;
        } catch (error) {
          log.error({ error: String(error), path }, 'Failed to read file');
          return `Couldn't read that file. Double-check the path?`;
        }
      },
    });
  },
};

// ============================================================================
// FILE EDITING TOOL (improved)
// ============================================================================

const editFileDef: ToolDefinition = {
  id: 'editFile',
  name: 'Edit File',
  description: 'Edit or create a file with find/replace',
  domain: 'developer',
  tags: ['file', 'edit', 'write', 'code', 'modify'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('editFile'),
      parameters: z.object({
        path: z.string().describe('File path relative to project root'),
        oldText: z.string().describe('Text to find and replace (empty for new file)'),
        newText: z.string().describe('Replacement text'),
        description: z.string().optional().describe('What this edit does'),
      }),
      execute: async ({ path, oldText, newText, description }) => {
        try {
          const fullPath = resolve(PROJECT_ROOT, path);

          // Security checks
          if (!fullPath.startsWith(PROJECT_ROOT)) {
            return 'I can only edit files within the project.';
          }

          const forbidden = ['.env', '.env.local', 'secrets', 'credentials', '.git'];
          if (forbidden.some((fp) => path.includes(fp))) {
            return "I can't edit sensitive files like .env for security.";
          }

          if (!oldText) {
            writeFileSync(fullPath, newText, 'utf-8');
            log.info({ path, userId: ctx.userId }, 'Created file');
            return `Created ${path}. ${description || ''}`;
          }

          if (!existsSync(fullPath)) {
            return `File not found: ${path}. Use empty oldText to create new.`;
          }

          const content = readFileSync(fullPath, 'utf-8');

          if (!content.includes(oldText)) {
            return `Couldn't find that text in ${path}. Check exact match.`;
          }

          const occurrences = content.split(oldText).length - 1;
          if (occurrences > 1) {
            return `Found ${occurrences} matches. Be more specific.`;
          }

          writeFileSync(fullPath, content.replace(oldText, newText), 'utf-8');
          log.info({ path, userId: ctx.userId, description }, 'Edited file');

          return `Edited ${path}. ${description || 'Done.'}`;
        } catch (error) {
          log.error({ error: String(error), path }, 'Failed to edit');
          return `Couldn't edit that file. Check if the path is correct?`;
        }
      },
    });
  },
};

// ============================================================================
// BASH COMMAND TOOL (improved with spawn)
// ============================================================================

const runBashDef: ToolDefinition = {
  id: 'runBash',
  name: 'Run Bash Command',
  description: 'Execute a bash command',
  domain: 'developer',
  tags: ['bash', 'shell', 'terminal', 'command'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('runBash'),
      parameters: z.object({
        command: z.string().describe('The bash command'),
        workingDir: z.string().optional().describe('Working directory'),
      }),
      execute: async ({ command, workingDir }) => {
        try {
          // Security: Block dangerous patterns
          const dangerous = [
            /rm\s+-rf?\s+[\/~]/i,
            /rm\s+-rf?\s+\*/i,
            />\s*\/dev\//i,
            /mkfs/i,
            /dd\s+if=/i,
            /chmod\s+777/i,
            /curl.*\|.*sh/i,
            /wget.*\|.*sh/i,
            /:(){ :|:& };:/i,
          ];

          if (dangerous.some((p) => p.test(command))) {
            return "That command looks dangerous. I won't run it.";
          }

          const cwd = workingDir ? resolve(PROJECT_ROOT, workingDir) : PROJECT_ROOT;

          if (!cwd.startsWith(PROJECT_ROOT)) {
            return 'I can only run commands within the project.';
          }

          log.info({ command, cwd, userId: ctx.userId }, 'Running bash');

          // Use shell for complex commands, but with timeout
          const result = spawnSync('bash', ['-c', command], {
            cwd,
            encoding: 'utf-8',
            timeout: 60000,
            maxBuffer: 1024 * 1024,
          });

          if (result.error) {
            return `Command error: ${result.error.message}`;
          }

          if (result.status !== 0) {
            return summarizeForVoice(result.stderr || result.stdout || 'Command failed', command);
          }

          return summarizeForVoice(result.stdout || 'Done.', command);
        } catch (error) {
          log.error({ error: String(error), command }, 'Bash failed');
          return `That command didn't work. Maybe check the syntax?`;
        }
      },
    });
  },
};

// ============================================================================
// SEARCH FILES TOOL (improved)
// ============================================================================

const searchFilesDef: ToolDefinition = {
  id: 'searchFiles',
  name: 'Search Files',
  description: 'Search for text in files',
  domain: 'developer',
  tags: ['search', 'grep', 'find', 'code'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('searchFiles'),
      parameters: z.object({
        pattern: z.string().describe('Text to search for'),
        filePattern: z.string().optional().describe('File glob (e.g. "*.ts")'),
        maxResults: z.number().optional().describe('Max results (default: 10)'),
      }),
      execute: async ({ pattern, filePattern = '*.ts', maxResults = 10 }) => {
        try {
          // Use ripgrep if available
          const rgCheck = spawnSync('which', ['rg'], { encoding: 'utf-8' });
          const hasRg = rgCheck.status === 0;

          let result;
          if (hasRg) {
            result = runCommandSafe('rg', [
              '--no-heading',
              '--line-number',
              `--max-count=${maxResults}`,
              pattern,
              '--glob',
              filePattern,
            ]);
          } else {
            result = runCommandSafe('grep', ['-rn', `--include=${filePattern}`, pattern, '.']);
          }

          const output = result.stdout.trim();

          if (!output) {
            return `No matches for "${pattern}" in ${filePattern} files.`;
          }

          const lines = output.split('\n').slice(0, maxResults);
          const fileCount = new Set(lines.map((l) => l.split(':')[0])).size;

          // Voice summary
          return `Found ${lines.length} match${lines.length > 1 ? 'es' : ''} for "${pattern}" in ${fileCount} file${fileCount > 1 ? 's' : ''}. First: ${lines[0]?.slice(0, 100)}`;
        } catch (error) {
          log.error({ error: String(error), pattern }, 'Search failed');
          return `Search failed: ${(error as Error).message}`;
        }
      },
    });
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const developerToolDefinitions: ToolDefinition[] = [
  // Git tools
  gitStatusDef,
  gitDiffDef,
  gitCommitDef,
  gitLogDef,
  // CLI tools
  runFerniCommandDef,
  checkJobDef,
  // File tools
  readFileDef,
  editFileDef,
  // Shell tools
  runBashDef,
  searchFilesDef,
];

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'developer',
  developerToolDefinitions
);

export {
  gitStatusDef,
  gitDiffDef,
  gitCommitDef,
  gitLogDef,
  runFerniCommandDef,
  checkJobDef,
  readFileDef,
  editFileDef,
  runBashDef,
  searchFilesDef,
};
