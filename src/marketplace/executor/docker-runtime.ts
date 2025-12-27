/**
 * Docker Runtime for Container-Based Tool Execution
 *
 * Provides maximum isolation for untrusted marketplace tools by running
 * them in ephemeral Docker containers.
 *
 * Security features:
 * - Full process isolation
 * - Network isolation (optional controlled access)
 * - Filesystem isolation (read-only, tmpfs)
 * - Resource limits (CPU, memory, time)
 * - No host access
 *
 * Usage:
 *   const runtime = new DockerRuntime();
 *   await runtime.initialize();
 *
 *   const result = await runtime.execute('tool-image:v1', {
 *     command: ['node', 'run.js'],
 *     input: { query: 'test' },
 *     limits: { memoryMB: 256, cpuShares: 512, timeoutSeconds: 30 },
 *   });
 */

import { spawn } from 'child_process';
import { getLogger } from '../../utils/safe-logger.js';
import type { TrustLevel } from '../schema/types.js';
import { isValidDockerImage, isValidCommand } from '../auth/index.js';

const log = getLogger().child({ module: 'docker-runtime' });

// Allowlist of approved base images for marketplace tools
const APPROVED_BASE_IMAGES = new Set([
  'node:20-alpine',
  'node:20-slim',
  'node:18-alpine',
  'node:18-slim',
  'denoland/deno:alpine',
  'denoland/deno:latest',
  'python:3.12-slim',
  'python:3.11-slim',
  'golang:1.22-alpine',
  'rust:1.75-slim',
]);

/**
 * Validate Docker image is safe to use
 */
function validateDockerImage(image: string, trustLevel: TrustLevel): { valid: boolean; reason?: string } {
  // Basic format validation
  if (!isValidDockerImage(image)) {
    return { valid: false, reason: 'Invalid Docker image format' };
  }

  // For unverified/community tools, only allow approved base images
  if (trustLevel === 'unverified' || trustLevel === 'community') {
    // Extract base image (remove tag/digest for comparison)
    const baseImage = image.split('@')[0]; // Remove digest
    const imageWithoutTag = baseImage.includes(':') ? baseImage : `${baseImage}:latest`;
    
    // Check against approved list
    let isApproved = false;
    for (const approved of APPROVED_BASE_IMAGES) {
      if (imageWithoutTag === approved || imageWithoutTag.startsWith(`${approved.split(':')[0]}:`)) {
        isApproved = true;
        break;
      }
    }

    if (!isApproved) {
      return { 
        valid: false, 
        reason: `Image '${image}' not in approved list for ${trustLevel} tools` 
      };
    }
  }

  // For verified/platform, allow any valid image format
  return { valid: true };
}

/**
 * Validate command array is safe to execute
 */
function validateCommand(command: string[]): { valid: boolean; reason?: string } {
  if (!isValidCommand(command)) {
    return { valid: false, reason: 'Invalid command format or contains shell metacharacters' };
  }

  // Block dangerous commands
  const dangerousCommands = ['rm', 'dd', 'mkfs', 'fdisk', 'mount', 'umount', 'chmod', 'chown', 'kill', 'pkill'];
  const firstArg = command[0].split('/').pop() || '';
  
  if (dangerousCommands.includes(firstArg)) {
    return { valid: false, reason: `Command '${firstArg}' is not allowed` };
  }

  return { valid: true };
}

// ============================================================================
// TYPES
// ============================================================================

export interface DockerExecutionOptions {
  /** Command to run in container */
  command: string[];
  /** Input data (JSON, passed via stdin) */
  input?: Record<string, unknown>;
  /** Environment variables */
  env?: Record<string, string>;
  /** Resource limits */
  limits?: DockerLimits;
  /** Trust level affects security settings */
  trustLevel?: TrustLevel;
  /** Allow network access (only for verified+ tools) */
  networkAccess?: boolean;
}

export interface DockerLimits {
  /** Memory limit in MB (default: 256) */
  memoryMB?: number;
  /** CPU shares (default: 512, max 1024) */
  cpuShares?: number;
  /** Timeout in seconds (default: 30) */
  timeoutSeconds?: number;
  /** Max output size in KB (default: 1024) */
  maxOutputKB?: number;
}

export interface DockerExecutionResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  data?: unknown;
  error?: {
    code: string;
    message: string;
  };
  metrics: {
    executionTimeMs: number;
    memoryUsedMB?: number;
  };
}

// Default limits based on trust level
const DEFAULT_LIMITS: Record<TrustLevel, DockerLimits> = {
  platform: { memoryMB: 1024, cpuShares: 1024, timeoutSeconds: 120, maxOutputKB: 10240 },
  verified: { memoryMB: 512, cpuShares: 768, timeoutSeconds: 60, maxOutputKB: 5120 },
  community: { memoryMB: 256, cpuShares: 512, timeoutSeconds: 30, maxOutputKB: 1024 },
  unverified: { memoryMB: 128, cpuShares: 256, timeoutSeconds: 10, maxOutputKB: 512 },
};

// Security profiles based on trust level
const SECURITY_PROFILES: Record<TrustLevel, string[]> = {
  platform: [], // Full access
  verified: [
    '--security-opt=no-new-privileges:true',
    '--cap-drop=ALL',
    '--cap-add=NET_BIND_SERVICE', // Allow binding to ports if network enabled
  ],
  community: [
    '--security-opt=no-new-privileges:true',
    '--cap-drop=ALL',
    '--read-only',
    '--tmpfs=/tmp:size=64M',
  ],
  unverified: [
    '--security-opt=no-new-privileges:true',
    '--cap-drop=ALL',
    '--read-only',
    '--tmpfs=/tmp:size=32M',
    '--network=none', // No network access ever
    '--pids-limit=64',
  ],
};

// ============================================================================
// DOCKER RUNTIME
// ============================================================================

export class DockerRuntime {
  private initialized = false;
  private dockerAvailable = false;

  /**
   * Initialize the Docker runtime
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Check if Docker is available
    try {
      await this.runCommand(['docker', 'version', '--format', '{{.Server.Version}}']);
      this.dockerAvailable = true;
      log.info('Docker runtime initialized');
    } catch (error) {
      log.warn({ error: String(error) }, 'Docker not available');
      this.dockerAvailable = false;
    }

    this.initialized = true;
  }

  /**
   * Check if Docker is available
   */
  isAvailable(): boolean {
    return this.dockerAvailable;
  }

  /**
   * Execute a tool in a Docker container
   */
  async execute(image: string, options: DockerExecutionOptions): Promise<DockerExecutionResult> {
    const startTime = Date.now();

    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.dockerAvailable) {
      return {
        success: false,
        exitCode: -1,
        stdout: '',
        stderr: '',
        error: { code: 'DOCKER_UNAVAILABLE', message: 'Docker is not available' },
        metrics: { executionTimeMs: 0 },
      };
    }

    // Get limits and security based on trust level
    const trustLevel = options.trustLevel || 'community';

    // SECURITY: Validate Docker image
    const imageValidation = validateDockerImage(image, trustLevel);
    if (!imageValidation.valid) {
      log.warn({ image, trustLevel, reason: imageValidation.reason }, 'Docker image validation failed');
      return {
        success: false,
        exitCode: -1,
        stdout: '',
        stderr: '',
        error: { code: 'INVALID_IMAGE', message: imageValidation.reason || 'Invalid Docker image' },
        metrics: { executionTimeMs: Date.now() - startTime },
      };
    }

    // SECURITY: Validate command
    const commandValidation = validateCommand(options.command);
    if (!commandValidation.valid) {
      log.warn({ command: options.command, reason: commandValidation.reason }, 'Command validation failed');
      return {
        success: false,
        exitCode: -1,
        stdout: '',
        stderr: '',
        error: { code: 'INVALID_COMMAND', message: commandValidation.reason || 'Invalid command' },
        metrics: { executionTimeMs: Date.now() - startTime },
      };
    }

    const baseLimits = DEFAULT_LIMITS[trustLevel];
    const limits: Required<DockerLimits> = {
      memoryMB: options.limits?.memoryMB ?? baseLimits.memoryMB ?? 256,
      cpuShares: options.limits?.cpuShares ?? baseLimits.cpuShares ?? 512,
      timeoutSeconds: options.limits?.timeoutSeconds ?? baseLimits.timeoutSeconds ?? 30,
      maxOutputKB: options.limits?.maxOutputKB ?? baseLimits.maxOutputKB ?? 1024,
    };

    // Build docker run command
    const dockerArgs = this.buildDockerArgs(image, options, limits, trustLevel);

    try {
      const result = await this.runDockerContainer(
        dockerArgs,
        options.input,
        limits.timeoutSeconds * 1000,
        limits.maxOutputKB * 1024
      );

      // Try to parse JSON output
      let data: unknown;
      try {
        data = JSON.parse(result.stdout.trim());
      } catch {
        // Output wasn't JSON, keep as string
        data = result.stdout.trim();
      }

      const metrics = {
        executionTimeMs: Date.now() - startTime,
        memoryUsedMB: undefined as number | undefined,
      };

      if (result.exitCode === 0) {
        return {
          success: true,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          data,
          metrics,
        };
      } else {
        return {
          success: false,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          error: {
            code: 'EXECUTION_FAILED',
            message: result.stderr || `Container exited with code ${result.exitCode}`,
          },
          metrics,
        };
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      let code = 'DOCKER_ERROR';
      if (err.message.includes('timeout')) code = 'TIMEOUT';
      if (err.message.includes('OOM')) code = 'OUT_OF_MEMORY';
      if (err.message.includes('output limit')) code = 'OUTPUT_LIMIT_EXCEEDED';

      return {
        success: false,
        exitCode: -1,
        stdout: '',
        stderr: err.message,
        error: { code, message: err.message },
        metrics: { executionTimeMs: Date.now() - startTime },
      };
    }
  }

  /**
   * Build Docker run arguments
   */
  private buildDockerArgs(
    image: string,
    options: DockerExecutionOptions,
    limits: Required<DockerLimits>,
    trustLevel: TrustLevel
  ): string[] {
    const args = [
      'run',
      '--rm', // Remove container after exit
      '-i', // Interactive (for stdin)
      '--init', // Use init process
      `--memory=${limits.memoryMB}m`,
      `--memory-swap=${limits.memoryMB}m`, // No swap
      `--cpu-shares=${limits.cpuShares}`,
      '--label=ferni.marketplace=true',
      `--label=ferni.trust=${trustLevel}`,
    ];

    // Add security profile
    const securityOpts = SECURITY_PROFILES[trustLevel];
    args.push(...securityOpts);

    // Network access (only for verified+ and if explicitly requested)
    if (trustLevel !== 'unverified' && options.networkAccess) {
      // Keep default network
    } else if (!securityOpts.some((o) => o.includes('--network'))) {
      args.push('--network=none');
    }

    // Add environment variables
    if (options.env) {
      for (const [key, value] of Object.entries(options.env)) {
        // Sanitize env var names
        if (/^[A-Z_][A-Z0-9_]*$/i.test(key)) {
          args.push('-e', `${key}=${value}`);
        }
      }
    }

    // Add image and command
    args.push(image);
    args.push(...options.command);

    return args;
  }

  /**
   * Run a Docker container and capture output
   */
  private async runDockerContainer(
    args: string[],
    input: Record<string, unknown> | undefined,
    timeoutMs: number,
    maxOutputBytes: number
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const proc = spawn('docker', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let outputLimitExceeded = false;

      const timeout = setTimeout(() => {
        proc.kill('SIGKILL');
        reject(new Error('Execution timeout'));
      }, timeoutMs);

      proc.stdout.on('data', (data: Buffer) => {
        if (stdout.length + data.length > maxOutputBytes) {
          outputLimitExceeded = true;
          proc.kill('SIGKILL');
          return;
        }
        stdout += data.toString();
      });

      proc.stderr.on('data', (data: Buffer) => {
        if (stderr.length + data.length > maxOutputBytes) {
          outputLimitExceeded = true;
          proc.kill('SIGKILL');
          return;
        }
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        clearTimeout(timeout);

        if (outputLimitExceeded) {
          reject(new Error('Output limit exceeded'));
          return;
        }

        resolve({
          exitCode: code ?? -1,
          stdout,
          stderr,
        });
      });

      proc.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      // Write input to stdin
      if (input) {
        proc.stdin.write(JSON.stringify(input));
      }
      proc.stdin.end();
    });
  }

  /**
   * Run a simple command and get output
   */
  private async runCommand(command: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command[0], command.slice(1), {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });

      proc.on('error', reject);
    });
  }

  /**
   * Pull a Docker image
   */
  async pullImage(image: string): Promise<boolean> {
    if (!this.dockerAvailable) return false;

    try {
      await this.runCommand(['docker', 'pull', image]);
      log.info({ image }, 'Docker image pulled');
      return true;
    } catch (error) {
      log.warn({ image, error: String(error) }, 'Failed to pull Docker image');
      return false;
    }
  }

  /**
   * Check if an image exists locally
   */
  async imageExists(image: string): Promise<boolean> {
    if (!this.dockerAvailable) return false;

    try {
      await this.runCommand(['docker', 'image', 'inspect', image]);
      return true;
    } catch {
      return false;
    }
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let runtimeInstance: DockerRuntime | null = null;

/**
 * Get the Docker runtime singleton
 */
export async function getDockerRuntime(): Promise<DockerRuntime> {
  if (!runtimeInstance) {
    runtimeInstance = new DockerRuntime();
    await runtimeInstance.initialize();
  }
  return runtimeInstance;
}

/**
 * Reset the runtime (for testing)
 */
export function resetDockerRuntime(): void {
  runtimeInstance = null;
}
