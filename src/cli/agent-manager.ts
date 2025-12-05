#!/usr/bin/env node
/**
 * Ferni Agent Manager CLI
 *
 * Command-line tool for managing AI agents in the Ferni voice platform.
 *
 * USAGE:
 *   npx ts-node src/cli/agent-manager.ts <command> [options]
 *
 * COMMANDS:
 *   list                    List all available agents
 *   show <agent-id>         Show details for a specific agent
 *   create <agent-id>       Create a new agent from template
 *   validate [agent-id]     Validate agent bundle(s)
 *   enable <agent-id>       Enable an agent
 *   disable <agent-id>      Disable an agent
 *   install <agent-id>      Install an agent from external repository
 *   uninstall <agent-id>    Remove an installed agent
 *
 * EXAMPLES:
 *   npx ts-node src/cli/agent-manager.ts list
 *   npx ts-node src/cli/agent-manager.ts show jack-bogle
 *   npx ts-node src/cli/agent-manager.ts create my-advisor --template sage
 *   npx ts-node src/cli/agent-manager.ts validate
 *   npx ts-node src/cli/agent-manager.ts install joel-dickson --from github:sethdford/voiceai-agents
 */

import { readdir, stat, readFile, writeFile, mkdir, copyFile, rm } from 'fs/promises';
import { join, dirname, basename } from 'path';
import { existsSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Colors for terminal output
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
};

function log(msg: string): void {
  console.log(msg);
}

function success(msg: string): void {
  console.log(`${colors.green}✓${colors.reset} ${msg}`);
}

function error(msg: string): void {
  console.error(`${colors.red}✗${colors.reset} ${msg}`);
}

function warn(msg: string): void {
  console.warn(`${colors.yellow}⚠${colors.reset} ${msg}`);
}

function info(msg: string): void {
  console.log(`${colors.blue}ℹ${colors.reset} ${msg}`);
}

function heading(msg: string): void {
  console.log(`\n${colors.bold}${colors.cyan}${msg}${colors.reset}\n`);
}

// ============================================================================
// BUNDLE DISCOVERY
// ============================================================================

const BUNDLES_DIR = join(process.cwd(), 'src/personas/bundles');

interface BundleInfo {
  id: string;
  path: string;
  manifest: {
    identity: {
      id: string;
      name: string;
      display_name: string;
      description: string;
    };
    voice: {
      provider: string;
      voice_id: string;
    };
    team?: {
      coordinator?: boolean;
      role_id?: string;
      role_description?: string;
    };
    metadata?: {
      content_files_count?: number;
    };
  };
  isValid: boolean;
  errors: string[];
}

async function discoverBundles(): Promise<BundleInfo[]> {
  const bundles: BundleInfo[] = [];

  if (!existsSync(BUNDLES_DIR)) {
    error(`Bundles directory not found: ${BUNDLES_DIR}`);
    return bundles;
  }

  const entries = await readdir(BUNDLES_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;

    const bundlePath = join(BUNDLES_DIR, entry.name);
    const manifestPath = join(bundlePath, 'persona.manifest.json');

    const bundleInfo: BundleInfo = {
      id: entry.name,
      path: bundlePath,
      manifest: {
        identity: { id: entry.name, name: entry.name, display_name: entry.name, description: '' },
        voice: { provider: 'cartesia', voice_id: '' },
      },
      isValid: false,
      errors: [],
    };

    try {
      const statResult = await stat(manifestPath);
      if (!statResult.isFile()) {
        bundleInfo.errors.push('persona.manifest.json is not a file');
        bundles.push(bundleInfo);
        continue;
      }

      const content = await readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(content);

      bundleInfo.manifest = manifest;
      bundleInfo.isValid = true;

      // Validate required fields
      if (!manifest.identity?.id) {
        bundleInfo.errors.push('Missing identity.id');
        bundleInfo.isValid = false;
      }
      if (!manifest.identity?.name) {
        bundleInfo.errors.push('Missing identity.name');
        bundleInfo.isValid = false;
      }
      if (!manifest.voice?.voice_id) {
        bundleInfo.errors.push('Missing voice.voice_id');
        bundleInfo.isValid = false;
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        bundleInfo.errors.push('Missing persona.manifest.json');
      } else if (err instanceof SyntaxError) {
        bundleInfo.errors.push(`Invalid JSON: ${err.message}`);
      } else {
        bundleInfo.errors.push(`Error: ${(err as Error).message}`);
      }
    }

    bundles.push(bundleInfo);
  }

  return bundles;
}

// ============================================================================
// COMMANDS
// ============================================================================

async function listAgents(): Promise<void> {
  heading('Available Agents');

  const bundles = await discoverBundles();

  if (bundles.length === 0) {
    warn('No agent bundles found');
    info(`Create one with: ferni create <agent-id> --template basic`);
    return;
  }

  // Header
  console.log(
    `${colors.dim}${'ID'.padEnd(20)} ${'Name'.padEnd(15)} ${'Role'.padEnd(20)} ${'Status'.padEnd(10)}${colors.reset}`
  );
  console.log(`${colors.dim}${'─'.repeat(70)}${colors.reset}`);

  // Sort: coordinator first, then by name
  bundles.sort((a, b) => {
    if (a.manifest.team?.coordinator && !b.manifest.team?.coordinator) return -1;
    if (!a.manifest.team?.coordinator && b.manifest.team?.coordinator) return 1;
    return a.manifest.identity.name.localeCompare(b.manifest.identity.name);
  });

  for (const bundle of bundles) {
    const status = bundle.isValid
      ? `${colors.green}✓ Valid${colors.reset}`
      : `${colors.red}✗ Invalid${colors.reset}`;

    const roleIcon = bundle.manifest.team?.coordinator ? '👑' : '🤖';
    const role =
      bundle.manifest.team?.role_description?.slice(0, 18) || bundle.manifest.team?.role_id || '-';

    console.log(
      `${roleIcon} ${bundle.id.padEnd(18)} ${bundle.manifest.identity.name.padEnd(15)} ${role.padEnd(20)} ${status}`
    );

    if (!bundle.isValid) {
      for (const err of bundle.errors) {
        console.log(`   ${colors.red}└─ ${err}${colors.reset}`);
      }
    }
  }

  console.log('');
  info(`Total: ${bundles.length} agents (${bundles.filter((b) => b.isValid).length} valid)`);
}

async function showAgent(agentId: string): Promise<void> {
  const bundles = await discoverBundles();
  const bundle = bundles.find((b) => b.id === agentId || b.manifest.identity.id === agentId);

  if (!bundle) {
    error(`Agent not found: ${agentId}`);
    info('Use "ferni list" to see available agents');
    return;
  }

  heading(`Agent: ${bundle.manifest.identity.display_name || bundle.manifest.identity.name}`);

  const m = bundle.manifest;

  console.log(`${colors.bold}Identity${colors.reset}`);
  console.log(`  ID:          ${m.identity.id}`);
  console.log(`  Name:        ${m.identity.name}`);
  console.log(`  Display:     ${m.identity.display_name}`);
  console.log(`  Description: ${m.identity.description.slice(0, 60)}...`);
  console.log('');

  console.log(`${colors.bold}Voice${colors.reset}`);
  console.log(`  Provider:    ${m.voice.provider}`);
  console.log(`  Voice ID:    ${m.voice.voice_id}`);
  console.log('');

  if (m.team) {
    console.log(`${colors.bold}Team${colors.reset}`);
    console.log(`  Coordinator: ${m.team.coordinator ? 'Yes 👑' : 'No'}`);
    console.log(`  Role ID:     ${m.team.role_id || '-'}`);
    console.log(`  Role:        ${m.team.role_description || '-'}`);
    console.log('');
  }

  console.log(`${colors.bold}Status${colors.reset}`);
  console.log(
    `  Valid:       ${bundle.isValid ? `${colors.green}Yes${colors.reset}` : `${colors.red}No${colors.reset}`}`
  );
  console.log(`  Path:        ${bundle.path}`);
  console.log(`  Files:       ${m.metadata?.content_files_count || 'Unknown'}`);

  if (bundle.errors.length > 0) {
    console.log('');
    console.log(`${colors.bold}${colors.red}Errors${colors.reset}`);
    for (const err of bundle.errors) {
      console.log(`  - ${err}`);
    }
  }
}

async function validateAgents(agentId?: string): Promise<void> {
  heading('Validating Agent Bundles');

  const bundles = await discoverBundles();

  const toValidate = agentId
    ? bundles.filter((b) => b.id === agentId || b.manifest.identity.id === agentId)
    : bundles;

  if (toValidate.length === 0) {
    if (agentId) {
      error(`Agent not found: ${agentId}`);
    } else {
      warn('No agent bundles found');
    }
    return;
  }

  let validCount = 0;
  let invalidCount = 0;

  for (const bundle of toValidate) {
    const errors: string[] = [...bundle.errors];
    const warnings: string[] = [];

    // Additional validation
    if (bundle.isValid) {
      const m = bundle.manifest;

      // Check voice ID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (m.voice.voice_id && !m.voice.voice_id.startsWith('${env:')) {
        if (!uuidRegex.test(m.voice.voice_id)) {
          warnings.push(`Voice ID doesn't look like a valid UUID: ${m.voice.voice_id}`);
        }
      }

      // Check for required content directories
      const contentDir = join(bundle.path, 'content');
      if (!existsSync(contentDir)) {
        warnings.push('Missing content/ directory');
      }

      // Check for identity directory
      const identityDir = join(bundle.path, 'identity');
      if (!existsSync(identityDir)) {
        warnings.push('Missing identity/ directory');
      } else {
        // Check for biography.md
        if (!existsSync(join(identityDir, 'biography.md'))) {
          warnings.push('Missing identity/biography.md');
        }
        // Check for system-prompt.md
        if (!existsSync(join(identityDir, 'system-prompt.md'))) {
          warnings.push('Missing identity/system-prompt.md');
        }
      }

      // Check for missing handoff targets
      const handoffTargets =
        (m as any).role?.handoff_targets || (m as any).capabilities?.handoff_targets || [];
      const allAgentIds = toValidate.map((b) => b.manifest.identity.id);
      const allAliases = new Set<string>();

      for (const b of toValidate) {
        allAliases.add(b.manifest.identity.id);
        const aliases = (b.manifest.identity as any).aliases || [];
        aliases.forEach((a: string) => allAliases.add(a.toLowerCase()));
      }

      for (const target of handoffTargets) {
        if (target === '*') continue; // Wildcard is valid
        const targetLower = target.toLowerCase();
        if (!allAliases.has(targetLower) && !allAgentIds.includes(target)) {
          warnings.push(`Handoff target not found: "${target}"`);
        }
      }
    }

    // Output results
    if (errors.length === 0 && warnings.length === 0) {
      success(`${bundle.manifest.identity.name} (${bundle.id})`);
      validCount++;
    } else if (errors.length === 0) {
      warn(`${bundle.manifest.identity.name} (${bundle.id})`);
      for (const w of warnings) {
        console.log(`   ${colors.yellow}└─ ${w}${colors.reset}`);
      }
      validCount++;
    } else {
      error(`${bundle.manifest.identity.name || bundle.id}`);
      for (const e of errors) {
        console.log(`   ${colors.red}└─ ${e}${colors.reset}`);
      }
      for (const w of warnings) {
        console.log(`   ${colors.yellow}└─ ${w}${colors.reset}`);
      }
      invalidCount++;
    }
  }

  console.log('');
  if (invalidCount === 0) {
    success(`All ${validCount} agents are valid!`);
  } else {
    warn(`${validCount} valid, ${invalidCount} invalid`);
  }
}

// ============================================================================
// INSTALL FROM EXTERNAL REPOSITORY
// ============================================================================

interface ExternalRegistry {
  agents: Array<{
    id: string;
    name: string;
    version: string;
    description: string;
    path: string;
    requirements?: {
      voice_id_env?: string;
      min_platform_version?: string;
    };
  }>;
}

async function parseRepoSource(
  source: string
): Promise<{ type: 'github' | 'url'; owner?: string; repo?: string; url?: string }> {
  // Parse github:owner/repo format
  if (source.startsWith('github:')) {
    const parts = source.slice(7).split('/');
    if (parts.length >= 2) {
      return { type: 'github', owner: parts[0], repo: parts[1] };
    }
    throw new Error(`Invalid GitHub source format. Use: github:owner/repo`);
  }

  // Parse https://github.com/owner/repo format
  if (source.startsWith('https://github.com/')) {
    const parts = source.replace('https://github.com/', '').replace(/\/$/, '').split('/');
    if (parts.length >= 2) {
      return { type: 'github', owner: parts[0], repo: parts[1] };
    }
    throw new Error(`Invalid GitHub URL format`);
  }

  // Direct URL
  if (source.startsWith('http://') || source.startsWith('https://')) {
    return { type: 'url', url: source };
  }

  throw new Error(`Unknown source format: ${source}. Use github:owner/repo or a URL.`);
}

async function fetchRegistry(source: string): Promise<ExternalRegistry> {
  const parsed = await parseRepoSource(source);

  let registryUrl: string;
  if (parsed.type === 'github') {
    registryUrl = `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/main/registry.json`;
  } else {
    registryUrl = `${parsed.url}/registry.json`;
  }

  info(`Fetching registry from ${registryUrl}...`);

  try {
    const response = await fetch(registryUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch registry: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as ExternalRegistry;
  } catch (err) {
    throw new Error(`Could not fetch registry: ${(err as Error).message}`);
  }
}

async function installAgent(agentId: string, source: string): Promise<void> {
  heading(`Installing Agent: ${agentId}`);

  // Check if agent already exists
  const existingPath = join(BUNDLES_DIR, agentId);
  if (existsSync(existingPath)) {
    error(`Agent "${agentId}" already exists at ${existingPath}`);
    info('Use "ferni uninstall" first if you want to reinstall');
    return;
  }

  try {
    // Fetch registry
    const registry = await fetchRegistry(source);

    // Find agent in registry
    const agentInfo = registry.agents.find((a) => a.id === agentId);
    if (!agentInfo) {
      error(`Agent "${agentId}" not found in registry`);
      info('Available agents:');
      for (const a of registry.agents) {
        console.log(`  - ${a.id}: ${a.description}`);
      }
      return;
    }

    success(`Found: ${agentInfo.name} (v${agentInfo.version})`);

    // Determine the download URL
    const parsed = await parseRepoSource(source);
    let downloadBaseUrl: string;

    if (parsed.type === 'github') {
      downloadBaseUrl = `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/main/${agentInfo.path}`;
    } else {
      downloadBaseUrl = `${parsed.url}/${agentInfo.path}`;
    }

    // We need to clone/download the agent bundle
    // For GitHub, we can use sparse checkout or download files individually
    info(`Downloading from ${downloadBaseUrl}...`);

    // Create temp directory
    const tempDir = join(process.cwd(), '.tmp-agent-install');
    await mkdir(tempDir, { recursive: true });

    try {
      // For GitHub, use git sparse-checkout for efficiency
      if (parsed.type === 'github') {
        const repoUrl = `https://github.com/${parsed.owner}/${parsed.repo}.git`;

        info('Cloning repository (sparse checkout)...');

        // Clone with sparse checkout
        await execAsync(
          `git clone --depth 1 --filter=blob:none --sparse "${repoUrl}" "${tempDir}/repo"`
        );

        // Add the specific agent path to sparse checkout
        const agentPath = agentInfo.path.replace(/^\//, ''); // Remove leading slash if present
        await execAsync(`cd "${tempDir}/repo" && git sparse-checkout set "${agentPath}"`);

        // Copy agent to bundles directory
        const sourcePath = join(tempDir, 'repo', agentPath);

        if (!existsSync(sourcePath)) {
          throw new Error(`Agent bundle not found at ${sourcePath}`);
        }

        info(`Copying to ${existingPath}...`);
        await copyDirectory(sourcePath, existingPath);

        success(`Installed ${agentInfo.name}!`);
      } else {
        // For URL-based installs, we'd need to download individual files
        // This is a simplified implementation
        error('Direct URL installs are not yet supported. Please use github:owner/repo format.');
        return;
      }
    } finally {
      // Clean up temp directory
      await rm(tempDir, { recursive: true, force: true });
    }

    // Clear registry cache so the new agent is discovered immediately
    info('Refreshing agent registry...');
    try {
      const { AgentRegistry } = await import('../personas/registry/unified-registry.js');
      await AgentRegistry.refresh();
      success('Agent registry refreshed');
    } catch {
      // Registry refresh is optional - agent will be discovered on next startup
    }

    // Show post-install instructions
    console.log('');
    success('Installation complete!');
    console.log('');

    if (agentInfo.requirements?.voice_id_env) {
      warn(`This agent requires: ${agentInfo.requirements.voice_id_env}`);
      console.log(`  Add to your .env file:`);
      console.log(`  ${agentInfo.requirements.voice_id_env}=<your-voice-id>`);
      console.log('');
    }

    info('Next steps:');
    console.log(`  1. Validate: npm run agents validate ${agentId}`);
    console.log(`  2. Test:     PERSONA_ID=${agentId} npm run dev`);
    console.log('');
    info('The agent is now discoverable and can receive handoffs automatically!');
  } catch (err) {
    error(`Installation failed: ${(err as Error).message}`);
  }
}

async function copyDirectory(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      await copyFile(srcPath, destPath);
    }
  }
}

async function uninstallAgent(agentId: string): Promise<void> {
  heading(`Uninstalling Agent: ${agentId}`);

  const bundlePath = join(BUNDLES_DIR, agentId);

  if (!existsSync(bundlePath)) {
    error(`Agent "${agentId}" not found`);
    info('Use "ferni list" to see installed agents');
    return;
  }

  // Get agent info before deleting
  const manifestPath = join(bundlePath, 'persona.manifest.json');
  let agentName = agentId;
  try {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
    agentName = manifest.identity?.display_name || manifest.identity?.name || agentId;
  } catch {
    // Ignore errors reading manifest
  }

  warn(`This will permanently delete: ${bundlePath}`);

  // In a real CLI, you'd prompt for confirmation
  // For now, we'll just proceed
  info('Removing agent bundle...');

  try {
    await rm(bundlePath, { recursive: true, force: true });
    success(`Uninstalled "${agentName}" successfully`);
    console.log('');
    info('The agent will be unavailable on next server restart.');
  } catch (err) {
    error(`Failed to remove: ${(err as Error).message}`);
  }
}

async function searchAgents(query: string, source: string): Promise<void> {
  heading(`Searching for: ${query}`);

  try {
    const registry = await fetchRegistry(source);

    const results = registry.agents.filter(
      (a) =>
        a.id.includes(query.toLowerCase()) ||
        a.name.toLowerCase().includes(query.toLowerCase()) ||
        a.description.toLowerCase().includes(query.toLowerCase())
    );

    if (results.length === 0) {
      warn(`No agents found matching "${query}"`);
      return;
    }

    console.log(
      `${colors.dim}${'ID'.padEnd(20)} ${'Name'.padEnd(20)} ${'Description'.padEnd(40)}${colors.reset}`
    );
    console.log(`${colors.dim}${'─'.repeat(80)}${colors.reset}`);

    for (const agent of results) {
      console.log(
        `${agent.id.padEnd(20)} ${agent.name.padEnd(20)} ${agent.description.slice(0, 40)}`
      );
    }

    console.log('');
    info(`Found ${results.length} agent(s)`);
    info(`Install with: npm run agents install <agent-id> --from ${source}`);
  } catch (err) {
    error(`Search failed: ${(err as Error).message}`);
  }
}

async function createAgent(agentId: string, template = 'basic'): Promise<void> {
  heading(`Creating Agent: ${agentId}`);

  // Validate agent ID
  if (!/^[a-z][a-z0-9-]*$/.test(agentId)) {
    error(
      'Agent ID must start with a letter and contain only lowercase letters, numbers, and hyphens'
    );
    return;
  }

  // Check if already exists
  const bundlePath = join(BUNDLES_DIR, agentId);
  if (existsSync(bundlePath)) {
    error(`Agent already exists: ${bundlePath}`);
    return;
  }

  // Get template path
  const templatesDir = join(BUNDLES_DIR, '.templates');
  const templatePath = join(templatesDir, template);

  // If template directory doesn't exist, create from scratch
  const useTemplate = existsSync(templatePath);

  info(`Creating bundle at: ${bundlePath}`);

  try {
    // Create directory structure
    await mkdir(bundlePath, { recursive: true });
    await mkdir(join(bundlePath, 'identity'), { recursive: true });
    await mkdir(join(bundlePath, 'content', 'behaviors'), { recursive: true });
    await mkdir(join(bundlePath, 'content', 'stories'), { recursive: true });
    await mkdir(join(bundlePath, 'content', 'knowledge'), { recursive: true });

    // Create manifest
    const displayName = agentId
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    const manifest = {
      $schema: 'https://voiceai.example.com/schemas/persona-manifest.v2.json',
      version: '1.0.0',
      manifest_version: 2,

      identity: {
        id: agentId,
        name: displayName,
        display_name: displayName,
        description: `A helpful ${template} assistant.`,
        aliases: [agentId.split('-')[0]],
        self_reference: displayName.split(' ')[0],
      },

      voice: {
        provider: 'cartesia',
        voice_id: `\${env:${agentId
          .toUpperCase()
          .replace(/-/g, '_')}_VOICE_ID|fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc}`,
        default_rate: 'medium',
      },

      speech_characteristics: {
        base_speed_multiplier: 0.85,
        pause_multiplier: 1.0,
        thinking_sound_frequency: 0.3,
        emphasis_style: 'moderate',
      },

      personality: {
        warmth: 0.8,
        humor_level: 0.4,
        directness: 0.6,
        energy: 0.6,
        traits: ['helpful', 'knowledgeable', 'friendly'],
      },

      role: {
        id:
          template === 'sage'
            ? 'sage-mentor'
            : template === 'specialist'
              ? 'specialist'
              : 'assistant',
        domains: ['general'],
        can_handoff: true,
        handoff_targets: ['ferni'],
      },

      team: {
        membership: 'ferni-team',
        role_id: agentId,
        role_description: `${displayName} - your ${template} assistant`,
        coordinator: false,
        handoff_triggers: [
          `hey ${displayName.split(' ')[0].toLowerCase()}`,
          `talk to ${displayName.split(' ')[0].toLowerCase()}`,
        ],
        handoff_phrases: {
          to_coordinator: [`Let me hand you back to Ferni for anything else.`],
          receive: [`${displayName.split(' ')[0]} here. What can I help you with?`],
        },
      },

      content: {
        stories: { directory: 'content/stories', lazy_load: true },
        knowledge: { directory: 'content/knowledge', lazy_load: true },
        behaviors: { directory: 'content/behaviors' },
      },

      metadata: {
        author: 'Created by ferni create',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    };

    await writeFile(join(bundlePath, 'persona.manifest.json'), JSON.stringify(manifest, null, 2));
    success('Created persona.manifest.json');

    // Create biography.md
    const biography = `# ${displayName}

## Background

[Describe the agent's background, history, and expertise here.]

## Personality

[Describe personality traits, communication style, and how they interact with users.]

## Expertise

[List the agent's areas of expertise and what they can help users with.]
`;
    await writeFile(join(bundlePath, 'identity', 'biography.md'), biography);
    success('Created identity/biography.md');

    // Create system-prompt.md
    const systemPrompt = `You are ${displayName}, a helpful assistant.

## Your Role

[Describe the role in detail]

## Communication Style

- Be warm and approachable
- Speak naturally, as if talking to a friend
- Use appropriate humor when the moment calls for it
- Acknowledge the user's emotions before providing information

## Expertise Areas

[List key expertise areas]

## Boundaries

- Be honest when something is outside your expertise
- Recommend appropriate specialists when needed
- Never provide advice that could be harmful
`;
    await writeFile(join(bundlePath, 'identity', 'system-prompt.md'), systemPrompt);
    success('Created identity/system-prompt.md');

    // Create empty content index files
    const storyIndex = { stories: [] };
    await writeFile(
      join(bundlePath, 'content', 'stories', '_index.json'),
      JSON.stringify(storyIndex, null, 2)
    );
    success('Created content/stories/_index.json');

    const knowledgeIndex = { topics: [] };
    await writeFile(
      join(bundlePath, 'content', 'knowledge', '_index.json'),
      JSON.stringify(knowledgeIndex, null, 2)
    );
    success('Created content/knowledge/_index.json');

    // Create basic behavior files
    const greetings = {
      new_user: [`Hi there! I'm ${displayName.split(' ')[0]}. How can I help you today?`],
      returning_user: [`Welcome back! ${displayName.split(' ')[0]} here. What's on your mind?`],
    };
    await writeFile(
      join(bundlePath, 'content', 'behaviors', 'greetings.json'),
      JSON.stringify(greetings, null, 2)
    );
    success('Created content/behaviors/greetings.json');

    console.log('');
    success(`Agent "${agentId}" created successfully!`);
    console.log('');
    info('Next steps:');
    console.log("  1. Edit identity/biography.md with your agent's background");
    console.log('  2. Edit identity/system-prompt.md with detailed instructions');
    console.log('  3. Add stories to content/stories/');
    console.log('  4. Add knowledge files to content/knowledge/');
    console.log('  5. Set the voice ID environment variable or update the manifest');
    console.log('');
    console.log(`  Validate with: npx ts-node src/cli/agent-manager.ts validate ${agentId}`);
    console.log(`  Test with:     PERSONA_ID=${agentId} npm run dev`);
  } catch (err) {
    error(`Failed to create agent: ${(err as Error).message}`);
  }
}

// ============================================================================
// MAIN CLI
// ============================================================================

function printUsage(): void {
  console.log(`
${colors.bold}Ferni Agent Manager${colors.reset}

${colors.bold}Usage:${colors.reset}
  npm run agents <command> [options]

${colors.bold}Commands:${colors.reset}
  list                    List all installed agents
  show <agent-id>         Show details for a specific agent
  create <agent-id>       Create a new agent from template
  validate [agent-id]     Validate agent bundle(s)
  install <agent-id>      Install an agent from external repository
  uninstall <agent-id>    Remove an installed agent
  search <query>          Search for agents in external repository

${colors.bold}Options for 'create':${colors.reset}
  --template <type>       Template type: basic, sage, specialist (default: basic)

${colors.bold}Options for 'install' and 'search':${colors.reset}
  --from <source>         Source repository (default: github:sethdford/voiceai-agents)
                          Formats: github:owner/repo or https://github.com/owner/repo

${colors.bold}Examples:${colors.reset}
  ${colors.dim}# List and manage local agents${colors.reset}
  npm run agents list
  npm run agents show jack-bogle
  npm run agents validate
  npm run agents validate jack-bogle

  ${colors.dim}# Create a new agent from template${colors.reset}
  npm run agents create my-advisor --template sage

  ${colors.dim}# Install agents from external repository${colors.reset}
  npm run agents search mentor --from github:sethdford/voiceai-agents
  npm run agents install joel-dickson --from github:sethdford/voiceai-agents

  ${colors.dim}# Remove an agent${colors.reset}
  npm run agents uninstall joel-dickson

${colors.bold}Adding a New Agent:${colors.reset}
  1. Run: npm run agents create my-agent --template sage
  2. Edit the generated files in src/personas/bundles/my-agent/
  3. Validate: npm run agents validate my-agent
  4. Test: PERSONA_ID=my-agent npm run dev

${colors.bold}Installing External Agents:${colors.reset}
  1. Search: npm run agents search <query> --from github:sethdford/voiceai-agents
  2. Install: npm run agents install <agent-id> --from github:sethdford/voiceai-agents
  3. Configure: Add required environment variables (see output)
  4. Test: PERSONA_ID=<agent-id> npm run dev

${colors.bold}Removing an Agent:${colors.reset}
  npm run agents uninstall <agent-id>
`);
}

const DEFAULT_REPO = 'github:sethdford/voiceai-agents';

function getFromArg(args: string[]): string {
  const fromIndex = args.indexOf('--from');
  return fromIndex > -1 && args[fromIndex + 1] ? args[fromIndex + 1] : DEFAULT_REPO;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage();
    return;
  }

  const command = args[0];

  switch (command) {
    case 'list':
    case 'ls':
      await listAgents();
      break;

    case 'show':
    case 'info':
      if (!args[1]) {
        error('Please specify an agent ID');
        info('Usage: npm run agents show <agent-id>');
        return;
      }
      await showAgent(args[1]);
      break;

    case 'validate':
    case 'check':
      await validateAgents(args[1]);
      break;

    case 'create':
    case 'new':
      if (!args[1]) {
        error('Please specify an agent ID');
        info('Usage: npm run agents create <agent-id> [--template <type>]');
        return;
      }
      const templateIndex = args.indexOf('--template');
      const template =
        templateIndex > -1 && args[templateIndex + 1] ? args[templateIndex + 1] : 'basic';
      await createAgent(args[1], template);
      break;

    case 'install':
    case 'add':
      if (!args[1]) {
        error('Please specify an agent ID to install');
        info('Usage: npm run agents install <agent-id> --from github:owner/repo');
        return;
      }
      await installAgent(args[1], getFromArg(args));
      break;

    case 'uninstall':
    case 'remove':
    case 'rm':
      if (!args[1]) {
        error('Please specify an agent ID to uninstall');
        info('Usage: npm run agents uninstall <agent-id>');
        return;
      }
      await uninstallAgent(args[1]);
      break;

    case 'search':
    case 'find':
      if (!args[1]) {
        error('Please specify a search query');
        info('Usage: npm run agents search <query> --from github:owner/repo');
        return;
      }
      await searchAgents(args[1], getFromArg(args));
      break;

    default:
      error(`Unknown command: ${command}`);
      printUsage();
  }
}

main().catch((err) => {
  error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
