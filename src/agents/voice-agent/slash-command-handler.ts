/**
 * Voice Agent Slash Command Handler
 *
 * Handles slash commands like "/daily-check-in" or "/weekly-review".
 * Commands are defined per-persona via extensibility integration.
 *
 * Extracted from voice-agent.ts to reduce file size and improve maintainability.
 *
 * @module voice-agent/slash-command-handler
 */

import { log, type llm } from '@livekit/agents';

// ============================================================================
// TYPES
// ============================================================================

export interface SlashCommandContext {
  /** The raw command text (e.g., "/daily-check-in user=123") */
  text: string;
  /** LLM chat context for injecting results */
  turnCtx: llm.ChatContext;
  /** Current persona ID */
  personaId: string;
  /** Session services (userId, sessionId) */
  services: {
    userId?: string;
    sessionId: string;
  };
}

export interface SlashCommandResult {
  /** Whether the command was handled */
  handled: boolean;
  /** Command ID if parsed */
  commandId?: string;
  /** Error message if any */
  error?: string;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * Handle slash commands like "/daily-check-in" or "/weekly-review".
 * Returns true if the command was handled, false if not a valid command.
 *
 * The command's rendered prompt is injected into the LLM context so the
 * LLM can respond appropriately.
 */
export async function handleSlashCommand(ctx: SlashCommandContext): Promise<SlashCommandResult> {
  const { text, turnCtx, personaId, services } = ctx;
  const logger = log();

  try {
    // Parse command: "/command-name arg1 arg2" -> commandName, args
    const match = text.match(/^\/([a-zA-Z0-9_-]+)(?:\s+(.*))?$/);
    if (!match) {
      return { handled: false }; // Not a valid command format
    }

    const commandId = match[1];
    const argsString = match[2] || '';

    // Execute the command via extensibility integration
    const { executeCommand, getCommands } =
      await import('../../personas/bundles/extensibility-integration.js');

    // Check if this persona has this command
    const commands = await getCommands(personaId);
    const command = commands.find(
      (c) => c.id === commandId || c.name.toLowerCase() === commandId.toLowerCase()
    );

    if (!command) {
      // Not a valid command for this persona - let normal processing handle it
      return { handled: false, commandId };
    }

    // Parse arguments (simple key=value format for now)
    const args: Record<string, string> = {};
    const argMatches = argsString.matchAll(/(\w+)=["']?([^"'\s]+)["']?/g);
    for (const argMatch of argMatches) {
      args[argMatch[1]] = argMatch[2];
    }

    logger.info({ commandId, args, personaId }, 'Executing slash command');

    const result = await executeCommand(personaId, commandId, args, {
      userId: services.userId,
      sessionId: services.sessionId,
    });

    if (!result.success) {
      logger.error({ error: result.error, commandId }, 'Command execution failed');
      // Inject error message as context for LLM to handle gracefully
      turnCtx.addMessage({
        role: 'system',
        content: `[COMMAND ERROR] The user invoked /${commandId} but it failed: ${result.error}. Please acknowledge the issue gracefully and offer to help another way.`,
      });
      return { handled: true, commandId, error: result.error }; // Still handled - LLM will respond about the error
    }

    // Inject the command's rendered prompt as context
    if (result.prompt) {
      turnCtx.addMessage({
        role: 'system',
        content: `[SLASH COMMAND: /${commandId}]\n${result.prompt}`,
      });
    }

    logger.info({ commandId }, 'Slash command executed successfully');
    return { handled: true, commandId }; // Command was handled
  } catch (error) {
    logger.error({ error: String(error), text }, 'Error handling slash command');
    return { handled: false, error: String(error) }; // Let normal processing handle it
  }
}

export default handleSlashCommand;
