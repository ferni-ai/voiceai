#!/usr/bin/env npx tsx
/**
 * Agent Memory Command
 *
 * Add and manage memories for custom agents.
 *
 * Usage:
 *   ferni agent memory add <agent-id>           # Interactive memory capture
 *   ferni agent memory list <agent-id>          # List all memories
 *   ferni agent memory delete <agent-id> <id>   # Delete a memory
 */

import * as p from '@clack/prompts';
import * as picocolorsModule from 'picocolors';
import { cliAuth, isAuthenticated } from '../../services/cli-auth.service.js';

const color = picocolorsModule.default || picocolorsModule;

// ============================================================================
// TYPES
// ============================================================================

interface Memory {
  id: string;
  type: 'story' | 'wisdom' | 'sharedMoment' | 'journalEntry';
  title?: string;
  content: string;
  context?: string;
  createdAt: string;
}

interface AddMemoryRequest {
  type: 'story' | 'wisdom' | 'sharedMoment' | 'journalEntry';
  title?: string;
  content: string;
  context?: string;
}

interface AddMemoryResponse {
  id: string;
  type: string;
  title?: string;
}

interface CustomAgent {
  id: string;
  displayName: string;
  type: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MEMORY_TYPES = {
  story: {
    label: 'Story',
    hint: 'A story they used to tell',
    icon: '📖',
    prompt: 'Tell me a story they used to share...',
    example: 'There was this one time when...',
  },
  wisdom: {
    label: 'Wisdom',
    hint: 'Advice or sayings they shared',
    icon: '💡',
    prompt: 'What wisdom or advice did they share?',
    example: 'They always said that...',
  },
  sharedMoment: {
    label: 'Shared Moment',
    hint: 'A memory you shared together',
    icon: '💝',
    prompt: 'Describe a moment you shared together...',
    example: 'I remember when we...',
  },
  journalEntry: {
    label: 'Journal Entry',
    hint: 'A personal reflection (for Digital Twin)',
    icon: '📝',
    prompt: 'Write a personal reflection...',
    example: "Today I'm thinking about...",
  },
};

// ============================================================================
// COMMANDS
// ============================================================================

async function handleAdd(agentId: string): Promise<void> {
  p.intro(color.bgMagenta(color.white(' Add Memory ')));

  if (!isAuthenticated()) {
    p.log.warn("You're not logged in.");
    p.log.info(`Run ${color.cyan('ferni auth login')} first.`);
    process.exit(1);
  }

  // Fetch agent info first
  const spinner = p.spinner();
  spinner.start('Loading agent...');

  let agent: CustomAgent;
  try {
    agent = await cliAuth.apiRequest<CustomAgent>(`/api/custom-agents/${agentId}`);
    spinner.stop(`Adding memory to ${color.cyan(agent.displayName)}`);
  } catch (error) {
    spinner.stop('Agent not found.');
    p.log.error(`${error instanceof Error ? error.message : 'Could not find agent'}`);
    process.exit(1);
  }

  // Choose memory type
  const memoryType = await p.select({
    message: 'What type of memory would you like to add?',
    options: Object.entries(MEMORY_TYPES).map(([key, val]) => ({
      value: key,
      label: `${val.icon} ${val.label}`,
      hint: val.hint,
    })),
  });

  if (p.isCancel(memoryType)) {
    p.cancel('No worries! Come back when you are ready.');
    process.exit(0);
  }

  const memoryConfig = MEMORY_TYPES[memoryType as keyof typeof MEMORY_TYPES];

  // Get optional title
  const title = await p.text({
    message: 'Give this memory a title (optional)',
    placeholder: `e.g., The time at the lake, Sunday dinners...`,
  });

  if (p.isCancel(title)) {
    p.cancel('No worries! Come back when you are ready.');
    process.exit(0);
  }

  // Get the memory content
  p.log.info(color.dim(memoryConfig.prompt));

  const content = await p.text({
    message: memoryConfig.prompt,
    placeholder: memoryConfig.example,
    validate: (value) => {
      if (!value) return 'Please share the memory';
      if (value.length < 20) return 'Tell me a bit more...';
      return undefined;
    },
  });

  if (p.isCancel(content)) {
    p.cancel('No worries! Come back when you are ready.');
    process.exit(0);
  }

  // Get optional context
  const context = await p.text({
    message: 'Any additional context? (optional)',
    placeholder: 'e.g., This happened during Christmas 2015...',
  });

  // Confirm
  console.log('');
  p.log.info(color.bold('Memory Preview:'));
  console.log(`  Type: ${memoryConfig.icon} ${memoryConfig.label}`);
  if (title) console.log(`  Title: ${title}`);
  console.log(`  ${color.dim((content as string).slice(0, 100))}${(content as string).length > 100 ? '...' : ''}`);
  console.log('');

  const confirm = await p.confirm({
    message: 'Save this memory?',
    initialValue: true,
  });

  if (p.isCancel(confirm) || !confirm) {
    p.cancel('Memory not saved.');
    process.exit(0);
  }

  // Save the memory
  spinner.start('Saving memory...');

  try {
    const request: AddMemoryRequest = {
      type: memoryType as 'story' | 'wisdom' | 'sharedMoment' | 'journalEntry',
      title: (title as string) || undefined,
      content: content as string,
      context: (context as string) || undefined,
    };

    const response = await cliAuth.apiRequest<AddMemoryResponse>(
      `/api/custom-agents/${agentId}/memories`,
      {
        method: 'POST',
        body: JSON.stringify(request),
      }
    );

    spinner.stop('Memory saved!');

    p.log.success(`${color.green('✓')} Added: ${memoryConfig.icon} ${response.title || memoryConfig.label}`);

    // Prompt to add more
    const addMore = await p.confirm({
      message: 'Add another memory?',
      initialValue: true,
    });

    if (addMore && !p.isCancel(addMore)) {
      console.log('');
      await handleAdd(agentId);
      return;
    }

    p.outro(color.green('Memory saved successfully!'));
  } catch (error) {
    spinner.stop('Failed to save memory.');
    p.log.error(`${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

async function handleList(agentId: string): Promise<void> {
  p.intro(color.bgCyan(color.black(' Agent Memories ')));

  if (!isAuthenticated()) {
    p.log.warn("You're not logged in.");
    process.exit(1);
  }

  const spinner = p.spinner();
  spinner.start('Loading memories...');

  try {
    const memories = await cliAuth.apiRequest<Memory[]>(
      `/api/custom-agents/${agentId}/memories`
    );

    spinner.stop('Memories loaded.');

    if (memories.length === 0) {
      p.log.info('No memories yet.');
      p.log.info(`Add one: ${color.cyan(`ferni agent memory add ${agentId}`)}`);
      p.outro('');
      return;
    }

    // Group by type
    const grouped: Record<string, Memory[]> = {};
    for (const memory of memories) {
      if (!grouped[memory.type]) grouped[memory.type] = [];
      grouped[memory.type].push(memory);
    }

    console.log('');

    for (const [type, typeMemories] of Object.entries(grouped)) {
      const config = MEMORY_TYPES[type as keyof typeof MEMORY_TYPES];
      console.log(color.bold(`${config?.icon || '📄'} ${config?.label || type} (${typeMemories.length})`));

      for (const memory of typeMemories) {
        const preview = memory.content.slice(0, 50) + (memory.content.length > 50 ? '...' : '');
        console.log(`  ${color.dim(memory.id.slice(0, 8))} ${memory.title || color.dim('(untitled)')}`);
        console.log(`    ${color.dim(preview)}`);
      }
      console.log('');
    }

    p.log.info(`Total: ${color.cyan(memories.length.toString())} memories`);
    p.outro('');
  } catch (error) {
    spinner.stop('Failed to load memories.');
    p.log.error(`${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

async function handleDelete(agentId: string, memoryId: string): Promise<void> {
  p.intro(color.bgRed(color.white(' Delete Memory ')));

  if (!isAuthenticated()) {
    p.log.warn("You're not logged in.");
    process.exit(1);
  }

  const confirm = await p.confirm({
    message: `Delete memory ${color.dim(memoryId)}?`,
    initialValue: false,
  });

  if (p.isCancel(confirm) || !confirm) {
    p.cancel('Deletion cancelled.');
    process.exit(0);
  }

  const spinner = p.spinner();
  spinner.start('Deleting memory...');

  try {
    await cliAuth.apiRequest(
      `/api/custom-agents/${agentId}/memories/${memoryId}`,
      { method: 'DELETE' }
    );

    spinner.stop('Memory deleted.');
    p.log.success('Memory removed.');
    p.outro('');
  } catch (error) {
    spinner.stop('Failed to delete memory.');
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
    case 'add': {
      const agentId = args[1];
      if (!agentId) {
        p.log.error('Agent ID required');
        p.log.info(`Usage: ${color.cyan('ferni agent memory add <agent-id>')}`);
        process.exit(1);
      }
      await handleAdd(agentId);
      break;
    }

    case 'list': {
      const agentId = args[1];
      if (!agentId) {
        p.log.error('Agent ID required');
        p.log.info(`Usage: ${color.cyan('ferni agent memory list <agent-id>')}`);
        process.exit(1);
      }
      await handleList(agentId);
      break;
    }

    case 'delete':
    case 'remove': {
      const agentId = args[1];
      const memoryId = args[2];
      if (!agentId || !memoryId) {
        p.log.error('Agent ID and memory ID required');
        p.log.info(`Usage: ${color.cyan('ferni agent memory delete <agent-id> <memory-id>')}`);
        process.exit(1);
      }
      await handleDelete(agentId, memoryId);
      break;
    }

    default:
      p.log.error(`Unknown subcommand: ${subcommand || '(none)'}`);
      console.log('');
      console.log('Available commands:');
      console.log(`  ${color.cyan('ferni agent memory add <agent-id>')}              Add a memory`);
      console.log(`  ${color.cyan('ferni agent memory list <agent-id>')}             List all memories`);
      console.log(`  ${color.cyan('ferni agent memory delete <agent-id> <id>')}      Delete a memory`);
      process.exit(1);
  }
}

main().catch((error) => {
  console.error(color.red('Error:'), error.message);
  process.exit(1);
});
