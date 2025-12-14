#!/usr/bin/env node

/**
 * Persona CLI
 *
 * Command-line interface for managing voice AI personas.
 *
 * Usage:
 *   npx tsx src/cli/persona-cli.ts <command> [options]
 *
 * Commands:
 *   list              List all available personas
 *   info <id>         Show detailed info about a persona
 *   create <id>       Create a new persona scaffold
 *   validate [id]     Validate persona bundles
 *   build [id]        Build persona bundles for deployment
 *   deploy <id>       Deploy a persona to production
 *   export <id>       Export persona bundle as archive
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const BUNDLES_DIR = path.join(process.cwd(), 'src', 'personas', 'bundles');
const OUTPUT_DIR = path.join(process.cwd(), 'dist', 'personas');

/**
 * Persona manifest v2 structure
 */
interface PersonaManifest {
  version: string;
  manifest_version: number;
  identity: {
    id: string;
    name: string;
    display_name: string;
    description: string;
    aliases?: string[];
    self_reference?: string;
  };
  voice: {
    provider: string;
    voice_id: string;
    default_rate?: string;
  };
  personality?: {
    warmth?: number;
    humor_level?: number;
    directness?: number;
    energy?: number;
    traits?: string[];
  };
  role?: {
    id: string;
    domains?: string[];
    can_handoff?: boolean;
    handoff_targets?: string[];
  };
  marketplace?: {
    display_name: string;
    short_description: string;
    long_description?: string;
    category?: string;
    tags?: string[];
    icon?: string;
    license?: string;
  };
  content?: {
    stories?: { directory: string; lazy_load?: boolean };
    knowledge?: { directory: string; lazy_load?: boolean };
    behaviors?: { directory: string };
    voice?: { directory: string; lazy_load?: boolean };
    identity?: { directory: string; lazy_load?: boolean };
  };
  metadata?: {
    author?: string;
    content_files_count?: number;
    created_at?: string;
    updated_at?: string;
    version_notes?: string;
  };
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ============================================================================
// COLOR HELPERS (ANSI escape codes)
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message: string, color?: keyof typeof colors): void {
  const c = color ? colors[color] : '';
  console.log(`${c}${message}${colors.reset}`);
}

function logSuccess(message: string): void {
  log(`✓ ${message}`, 'green');
}

function logError(message: string): void {
  log(`✗ ${message}`, 'red');
}

function logWarning(message: string): void {
  log(`⚠ ${message}`, 'yellow');
}

function logInfo(message: string): void {
  log(`ℹ ${message}`, 'cyan');
}

// ============================================================================
// PERSONA DISCOVERY
// ============================================================================

function discoverPersonas(): string[] {
  if (!fs.existsSync(BUNDLES_DIR)) {
    return [];
  }

  return fs
    .readdirSync(BUNDLES_DIR, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .filter((dirent) => {
      const manifestPath = path.join(BUNDLES_DIR, dirent.name, 'persona.manifest.json');
      return fs.existsSync(manifestPath);
    })
    .map((dirent) => dirent.name);
}

function loadManifest(personaId: string): PersonaManifest | null {
  const manifestPath = path.join(BUNDLES_DIR, personaId, 'persona.manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(manifestPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    return null;
  }
}

// ============================================================================
// COMMANDS
// ============================================================================

/**
 * List all available personas
 */
function commandList(): void {
  log('\n📦 Available Personas\n', 'bright');

  const personas = discoverPersonas();
  if (personas.length === 0) {
    logInfo('No personas found in bundles directory');
    return;
  }

  const maxIdLength = Math.max(...personas.map((p) => p.length));

  for (const personaId of personas.sort()) {
    const manifest = loadManifest(personaId);
    if (manifest) {
      const paddedId = personaId.padEnd(maxIdLength);
      const displayName = manifest.identity?.display_name || manifest.identity?.name || personaId;
      const shortDesc =
        manifest.marketplace?.short_description || manifest.identity?.description || '';
      log(
        `  ${colors.cyan}${paddedId}${colors.reset}  ${displayName} - ${shortDesc.slice(0, 60)}${shortDesc.length > 60 ? '...' : ''}`
      );
    }
  }

  log(`\n  Total: ${personas.length} personas\n`, 'dim');
}

/**
 * Show detailed info about a persona
 */
function commandInfo(personaId: string): void {
  const manifest = loadManifest(personaId);
  if (!manifest) {
    logError(`Persona not found: ${personaId}`);
    return;
  }

  const displayName = manifest.identity?.display_name || manifest.identity?.name || personaId;
  log(`\n📋 Persona: ${displayName}\n`, 'bright');

  log(`  ID:          ${manifest.identity?.id || personaId}`);
  log(`  Version:     ${manifest.version}`);
  log(`  Role:        ${manifest.role?.id || 'assistant'}`);
  log(
    `  Voice:       ${manifest.voice?.provider || 'unknown'} (${manifest.voice?.voice_id?.slice(0, 20) || 'N/A'}...)`
  );
  if (manifest.metadata?.author) {
    log(`  Author:      ${manifest.metadata.author}`);
  }
  if (manifest.marketplace?.category) {
    log(`  Category:    ${manifest.marketplace.category}`);
  }

  if (manifest.identity?.description) {
    log(`\n  Description:`, 'cyan');
    log(
      `    ${manifest.identity.description.slice(0, 100)}${manifest.identity.description.length > 100 ? '...' : ''}`
    );
  }

  if (manifest.personality?.traits) {
    log(`\n  Personality Traits:`, 'cyan');
    for (const trait of manifest.personality.traits) {
      log(`    • ${trait}`);
    }
  }

  if (manifest.role?.domains) {
    log(`\n  Domains:`, 'cyan');
    const domainStr = manifest.role.domains.join(', ');
    log(`    ${domainStr.slice(0, 80)}${domainStr.length > 80 ? '...' : ''}`);
  }

  if (manifest.marketplace?.tags) {
    log(`\n  Tags:`, 'cyan');
    log(`    ${manifest.marketplace.tags.join(', ')}`);
  }

  // Check bundle contents
  const bundlePath = path.join(BUNDLES_DIR, personaId);
  const contentDirs = ['behaviors', 'knowledge', 'stories', 'voice', 'identity'];

  log(`\n  Bundle Contents:`, 'cyan');
  for (const dir of contentDirs) {
    const contentPath = path.join(bundlePath, 'content', dir);
    if (fs.existsSync(contentPath)) {
      const files = fs.readdirSync(contentPath);
      log(`    ${dir}: ${files.length} files`, 'green');
    } else {
      log(`    ${dir}: (not found)`, 'dim');
    }
  }

  if (manifest.metadata?.updated_at) {
    log(`\n  Last Updated: ${manifest.metadata.updated_at}`, 'dim');
  }

  log('');
}

/**
 * Create a new persona scaffold
 */
function commandCreate(personaId: string, displayName?: string): void {
  const bundlePath = path.join(BUNDLES_DIR, personaId);

  if (fs.existsSync(bundlePath)) {
    logError(`Persona already exists: ${personaId}`);
    return;
  }

  log(`\n🆕 Creating persona: ${personaId}\n`, 'bright');

  // Create directory structure
  const dirs = [
    '',
    'content',
    'content/behaviors',
    'content/knowledge',
    'content/stories',
    'content/voice',
    'content/identity',
    'identity',
  ];

  for (const dir of dirs) {
    fs.mkdirSync(path.join(bundlePath, dir), { recursive: true });
    logSuccess(`Created ${dir || personaId}/`);
  }

  // Create manifest (v2 format)
  const resolvedDisplayName =
    displayName ||
    personaId
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  const manifest: PersonaManifest = {
    version: '1.0.0',
    manifest_version: 2,
    identity: {
      id: personaId,
      name: resolvedDisplayName,
      display_name: resolvedDisplayName,
      description: 'A new voice AI persona',
      self_reference: resolvedDisplayName.split(' ')[0],
    },
    voice: {
      provider: 'cartesia',
      voice_id: 'TBD',
      default_rate: 'normal',
    },
    personality: {
      warmth: 0.7,
      humor_level: 0.3,
      directness: 0.5,
      energy: 0.5,
      traits: ['helpful', 'friendly'],
    },
    role: {
      id: 'assistant',
      domains: [],
      can_handoff: true,
      handoff_targets: ['ferni'],
    },
    marketplace: {
      display_name: resolvedDisplayName,
      short_description: 'A new voice AI persona',
      category: 'custom',
      tags: [],
      icon: '🤖',
      license: 'standard',
    },
    content: {
      behaviors: { directory: 'content/behaviors' },
      knowledge: { directory: 'content/knowledge', lazy_load: true },
      stories: { directory: 'content/stories', lazy_load: true },
      voice: { directory: 'content/voice', lazy_load: true },
      identity: { directory: 'content/identity', lazy_load: true },
    },
    metadata: {
      author: 'VoiceAI User',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };

  fs.writeFileSync(
    path.join(bundlePath, 'persona.manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
  logSuccess('Created persona.manifest.json');

  // Create default behavior files
  const defaultBehaviors = {
    greetings: [{ text: "Hello! I'm {name}. What's on your mind?", context: 'first-meeting' }],
    goodbyes: [
      { text: 'Take care! Looking forward to our next conversation.', context: 'default' },
    ],
    catchphrases: [],
    'witty-remarks': [],
    backchannels: ['Mm-hmm', 'I see', 'Right', 'Of course'],
    'thinking-sounds': ['Let me think...', 'Hmm...'],
  };

  for (const [name, content] of Object.entries(defaultBehaviors)) {
    fs.writeFileSync(
      path.join(bundlePath, 'content', 'behaviors', `${name}.json`),
      JSON.stringify(content, null, 2)
    );
  }
  logSuccess('Created default behavior files');

  // Create identity files
  fs.writeFileSync(
    path.join(bundlePath, 'identity', 'biography.md'),
    `# ${manifest.identity.display_name}\n\n## Background\n\nTBD\n\n## Personality\n\nTBD\n`
  );
  fs.writeFileSync(
    path.join(bundlePath, 'identity', 'system-prompt.md'),
    `# System Prompt for ${manifest.identity.display_name}\n\nYou are ${manifest.identity.display_name}, a warm and supportive life coach.\n\n## Core Behaviors\n\n- Be helpful and friendly\n- Listen actively\n- Provide clear, concise responses\n`
  );
  logSuccess('Created identity files');

  // Create knowledge index
  fs.writeFileSync(
    path.join(bundlePath, 'content', 'knowledge', '_index.json'),
    JSON.stringify(
      {
        topics: [],
        lastUpdated: new Date().toISOString(),
      },
      null,
      2
    )
  );
  logSuccess('Created knowledge index');

  log(`\n✨ Persona ${personaId} created successfully!`, 'green');
  log(`\nNext steps:`, 'cyan');
  log(`  1. Update persona.manifest.json with voice ID and details`);
  log(`  2. Edit identity/biography.md and system-prompt.md`);
  log(`  3. Add behavior files in content/behaviors/`);
  log(`  4. Add knowledge files in content/knowledge/`);
  log(`  5. Run: npx tsx src/cli/persona-cli.ts validate ${personaId}\n`);
}

/**
 * Validate persona bundles
 */
function commandValidate(personaId?: string): void {
  log('\n🔍 Validating Personas\n', 'bright');

  const personas = personaId ? [personaId] : discoverPersonas();
  let totalErrors = 0;
  let totalWarnings = 0;

  for (const id of personas) {
    const result = validatePersona(id);

    if (result.valid) {
      logSuccess(`${id}: Valid`);
    } else {
      logError(`${id}: Invalid`);
    }

    for (const error of result.errors) {
      log(`    ✗ ${error}`, 'red');
      totalErrors++;
    }
    for (const warning of result.warnings) {
      log(`    ⚠ ${warning}`, 'yellow');
      totalWarnings++;
    }
  }

  log('');
  if (totalErrors > 0) {
    logError(`${totalErrors} error(s), ${totalWarnings} warning(s)`);
    process.exit(1);
  } else if (totalWarnings > 0) {
    logWarning(`0 errors, ${totalWarnings} warning(s)`);
  } else {
    logSuccess('All personas valid!');
  }
  log('');
}

function validatePersona(personaId: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const bundlePath = path.join(BUNDLES_DIR, personaId);

  // Check manifest exists
  const manifest = loadManifest(personaId);
  if (!manifest) {
    errors.push('persona.manifest.json not found or invalid');
    return { valid: false, errors, warnings };
  }

  // Validate manifest v2 fields
  if (!manifest.identity?.id) errors.push('Missing identity.id in manifest');
  if (!manifest.identity?.name) errors.push('Missing identity.name in manifest');
  if (!manifest.version) errors.push('Missing version in manifest');
  if (!manifest.voice?.voice_id || manifest.voice.voice_id === 'TBD') {
    warnings.push('Voice ID not configured');
  }
  if (!manifest.identity?.description) warnings.push('Missing identity.description');
  if (!manifest.marketplace?.short_description)
    warnings.push('Missing marketplace.short_description');

  // Check required directories
  const requiredDirs = ['content/behaviors', 'identity'];
  for (const dir of requiredDirs) {
    if (!fs.existsSync(path.join(bundlePath, dir))) {
      errors.push(`Missing directory: ${dir}`);
    }
  }

  // Check required files
  const requiredFiles = ['identity/system-prompt.md'];
  for (const file of requiredFiles) {
    if (!fs.existsSync(path.join(bundlePath, file))) {
      errors.push(`Missing file: ${file}`);
    }
  }

  // Check behavior files for valid JSON
  const behaviorsPath = path.join(bundlePath, 'content', 'behaviors');
  if (fs.existsSync(behaviorsPath)) {
    const behaviorFiles = fs.readdirSync(behaviorsPath).filter((f) => f.endsWith('.json'));
    for (const file of behaviorFiles) {
      try {
        JSON.parse(fs.readFileSync(path.join(behaviorsPath, file), 'utf-8'));
      } catch (e) {
        errors.push(`Invalid JSON in behaviors/${file}`);
      }
    }
  }

  // Suggested behaviors
  const suggestedBehaviors = ['greetings.json', 'goodbyes.json', 'backchannels.json'];
  for (const behavior of suggestedBehaviors) {
    if (!fs.existsSync(path.join(behaviorsPath, behavior))) {
      warnings.push(`Missing recommended behavior: ${behavior}`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Build persona bundles for deployment
 */
function commandBuild(personaId?: string): void {
  log('\n🔨 Building Personas\n', 'bright');

  const personas = personaId ? [personaId] : discoverPersonas();

  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const id of personas) {
    // First validate
    const result = validatePersona(id);
    if (!result.valid) {
      logError(`${id}: Cannot build - validation failed`);
      continue;
    }

    const manifest = loadManifest(id)!;
    const bundlePath = path.join(BUNDLES_DIR, id);
    const outputPath = path.join(OUTPUT_DIR, id);

    // Create output directory
    fs.mkdirSync(outputPath, { recursive: true });

    // Copy manifest
    fs.copyFileSync(
      path.join(bundlePath, 'persona.manifest.json'),
      path.join(outputPath, 'persona.manifest.json')
    );

    // Bundle all behaviors into single file
    const behaviors = bundleBehaviors(bundlePath);
    fs.writeFileSync(path.join(outputPath, 'behaviors.json'), JSON.stringify(behaviors, null, 2));

    // Bundle all stories into single file
    const stories = bundleStories(bundlePath);
    fs.writeFileSync(path.join(outputPath, 'stories.json'), JSON.stringify(stories, null, 2));

    // Copy identity files
    fs.mkdirSync(path.join(outputPath, 'identity'), { recursive: true });
    const identityFiles = fs.readdirSync(path.join(bundlePath, 'identity'));
    for (const file of identityFiles) {
      fs.copyFileSync(
        path.join(bundlePath, 'identity', file),
        path.join(outputPath, 'identity', file)
      );
    }

    // Create build metadata
    const buildMeta = {
      personaId: id,
      version: manifest.version,
      builtAt: new Date().toISOString(),
      files: fs.readdirSync(outputPath, { recursive: true }),
    };
    fs.writeFileSync(path.join(outputPath, 'build.json'), JSON.stringify(buildMeta, null, 2));

    logSuccess(`${id}: Built to dist/personas/${id}/`);
  }

  log('');
}

function bundleBehaviors(bundlePath: string): Record<string, unknown> {
  const behaviorsPath = path.join(bundlePath, 'content', 'behaviors');
  const result: Record<string, unknown> = {};

  if (fs.existsSync(behaviorsPath)) {
    const files = fs.readdirSync(behaviorsPath).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      const name = path.basename(file, '.json');
      try {
        result[name] = JSON.parse(fs.readFileSync(path.join(behaviorsPath, file), 'utf-8'));
      } catch (_e) {
        // Skip invalid files
      }
    }
  }

  return result;
}

function bundleStories(bundlePath: string): unknown[] {
  const storiesPath = path.join(bundlePath, 'content', 'stories');
  const result: unknown[] = [];

  if (fs.existsSync(storiesPath)) {
    const files = fs.readdirSync(storiesPath).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      try {
        const story = JSON.parse(fs.readFileSync(path.join(storiesPath, file), 'utf-8'));
        result.push(story);
      } catch (_e) {
        // Skip invalid files
      }
    }
  }

  return result;
}

/**
 * Export persona bundle as archive
 */
function commandExport(personaId: string): void {
  const bundlePath = path.join(BUNDLES_DIR, personaId);

  if (!fs.existsSync(bundlePath)) {
    logError(`Persona not found: ${personaId}`);
    return;
  }

  log(`\n📦 Exporting persona: ${personaId}\n`, 'bright');

  // First build it
  commandBuild(personaId);

  // Create export info
  const manifest = loadManifest(personaId)!;
  const exportPath = path.join(OUTPUT_DIR, `${personaId}-${manifest.version}.tar.gz`);

  logInfo(`Export would be created at: ${exportPath}`);
  logInfo('Note: Archive creation requires tar - run manually:');
  log(`  cd dist/personas && tar -czvf ${personaId}-${manifest.version}.tar.gz ${personaId}/\n`);
}

/**
 * Deploy a persona to production (placeholder)
 */
function commandDeploy(personaId: string): void {
  const manifest = loadManifest(personaId);
  if (!manifest) {
    logError(`Persona not found: ${personaId}`);
    return;
  }

  log(`\n🚀 Deploying persona: ${personaId}\n`, 'bright');

  // First validate
  const result = validatePersona(personaId);
  if (!result.valid) {
    logError('Persona validation failed. Fix errors before deploying.');
    process.exit(1);
  }

  // Build
  commandBuild(personaId);

  logInfo('Deployment steps:');
  log('  1. Upload bundle to storage');
  log('  2. Update persona registry');
  log('  3. Invalidate caches');
  log('  4. Notify running agents');
  log('');
  logWarning('Full deployment integration pending - run manually for now');
  log('');
}

// ============================================================================
// HELP
// ============================================================================

function showHelp(): void {
  log(`
${colors.bright}📚 Persona CLI${colors.reset}

Usage: npx tsx src/cli/persona-cli.ts <command> [options]

Commands:
  ${colors.cyan}list${colors.reset}              List all available personas
  ${colors.cyan}info${colors.reset} <id>         Show detailed info about a persona
  ${colors.cyan}create${colors.reset} <id>       Create a new persona scaffold
  ${colors.cyan}validate${colors.reset} [id]     Validate persona bundles (all if no id)
  ${colors.cyan}build${colors.reset} [id]        Build persona bundles for deployment
  ${colors.cyan}export${colors.reset} <id>       Export persona bundle as archive
  ${colors.cyan}deploy${colors.reset} <id>       Deploy a persona to production

Examples:
  npx tsx src/cli/persona-cli.ts list
  npx tsx src/cli/persona-cli.ts info ferni
  npx tsx src/cli/persona-cli.ts create my-new-persona "My New Persona"
  npx tsx src/cli/persona-cli.ts validate
  npx tsx src/cli/persona-cli.ts build ferni
`);
}

// ============================================================================
// MAIN
// ============================================================================

function main(): void {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'list':
      commandList();
      break;
    case 'info':
      if (!args[1]) {
        logError('Usage: persona-cli info <persona-id>');
        process.exit(1);
      }
      commandInfo(args[1]);
      break;
    case 'create':
      if (!args[1]) {
        logError('Usage: persona-cli create <persona-id> [display-name]');
        process.exit(1);
      }
      commandCreate(args[1], args[2]);
      break;
    case 'validate':
      commandValidate(args[1]);
      break;
    case 'build':
      commandBuild(args[1]);
      break;
    case 'export':
      if (!args[1]) {
        logError('Usage: persona-cli export <persona-id>');
        process.exit(1);
      }
      commandExport(args[1]);
      break;
    case 'deploy':
      if (!args[1]) {
        logError('Usage: persona-cli deploy <persona-id>');
        process.exit(1);
      }
      commandDeploy(args[1]);
      break;
    case 'help':
    case '--help':
    case '-h':
      showHelp();
      break;
    default:
      if (command) {
        logError(`Unknown command: ${command}`);
      }
      showHelp();
      process.exit(command ? 1 : 0);
  }
}

main();
