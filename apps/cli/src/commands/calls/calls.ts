#!/usr/bin/env npx tsx
/**
 * Ferni Calls Command
 *
 * Initiate outbound calls through Ferni.
 *
 * Usage:
 *   ferni call "Jordan" --reason "check on snowstorm"
 *   ferni call +14845551234 --message "Hi, just checking in!"
 *   ferni calls status <callId>
 *   ferni calls list
 *
 * Authentication:
 *   Requires `ferni auth login` first.
 */

import {
  isAuthenticated,
  getCurrentUser,
  getAuthHeaders,
} from '../../services/cli-auth.service.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const API_BASE_URL =
  process.env.FERNI_API_URL || 'https://john-bogle-ui-1031920444452.us-central1.run.app';

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
  cyan: '\x1b[36m',
};

const log = {
  info: (msg: string) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  header: (msg: string) => console.log(`\n${colors.bold}${colors.cyan}━━━ ${msg} ━━━${colors.reset}\n`),
};

// ============================================================================
// HELPERS
// ============================================================================

interface Contact {
  name: string;
  phone: string;
}

/**
 * Look up a contact by name from user's contacts
 */
async function lookupContact(nameQuery: string): Promise<Contact | null> {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(
      `${API_BASE_URL}/api/contacts/search?q=${encodeURIComponent(nameQuery)}`,
      { headers }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (data.contacts && data.contacts.length > 0) {
      const contact = data.contacts[0];
      return {
        name: contact.name || contact.displayName,
        phone: contact.phone || contact.phoneNumber,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Normalize phone number
 */
function normalizePhone(input: string): string | null {
  // If it looks like a phone number, normalize it
  const digits = input.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+1${digits}`;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  } else if (digits.length > 10) {
    return `+${digits}`;
  }
  return null;
}

/**
 * Initiate an outbound call
 */
async function initiateCall(options: {
  name: string;
  phone: string;
  reason?: string;
  message?: string;
  personaId?: string;
}): Promise<{ success: boolean; callId?: string; error?: string }> {
  try {
    const headers = await getAuthHeaders();
    const user = getCurrentUser();

    const response = await fetch(`${API_BASE_URL}/api/outbound-call/initiate`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user: {
          id: `cli-call-${Date.now()}`,
          name: options.name,
          phone: options.phone,
        },
        trigger: {
          id: `cli-${Date.now()}`,
          type: 'friend_checkin',
          reason: options.reason || 'CLI initiated call',
          urgency: 'medium',
        },
        personaId: options.personaId || 'ferni',
        message:
          options.message ||
          `Hi ${options.name}! This is Ferni calling on behalf of ${user?.displayName || 'your friend'}. ${options.reason ? options.reason : 'Just wanted to check in and see how you are doing!'}`,
        enableConversation: true,
        voicemailFallback: true,
        sponsorUserId: user?.userId,
      }),
    });

    const data = await response.json();

    if (data.success) {
      return { success: true, callId: data.callId };
    } else {
      return { success: false, error: data.error || 'Unknown error' };
    }
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Get call status
 */
async function getCallStatus(callId: string): Promise<Record<string, unknown> | null> {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/api/outbound-call/${callId}`, {
      headers,
    });

    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch {
    return null;
  }
}

/**
 * List active calls
 */
async function listActiveCalls(): Promise<Record<string, unknown>[]> {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/api/outbound-call/active`, {
      headers,
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.calls || [];
  } catch {
    return [];
  }
}

// ============================================================================
// COMMANDS
// ============================================================================

function printHelp(): void {
  console.log(`
${colors.bold}Ferni Call Commands${colors.reset}

${colors.cyan}ferni call <target>${colors.reset}
  Call someone by name (from contacts) or phone number

  Options:
    --reason, -r <reason>    Reason for the call
    --message, -m <message>  Custom opening message
    --persona, -p <persona>  Persona to use (default: ferni)

  Examples:
    ferni call "Jordan"
    ferni call +14845551234 --reason "checking in about the snowstorm"
    ferni call mom --message "Hi mom, just calling to say hi!"

${colors.cyan}ferni calls status <callId>${colors.reset}
  Check the status of a call

${colors.cyan}ferni calls list${colors.reset}
  List active calls

${colors.cyan}ferni calls history${colors.reset}
  Show recent call history
`);
}

/**
 * Main call command - initiate a call
 */
async function handleCall(
  target: string,
  options: { reason?: string; message?: string; persona?: string }
): Promise<void> {
  log.header('📞 Ferni Call');

  // Check authentication
  if (!isAuthenticated()) {
    log.error(`Not authenticated. Run ${colors.cyan}ferni auth login${colors.reset} first.`);
    process.exit(1);
  }

  const user = getCurrentUser();
  log.info(`Calling as ${colors.cyan}${user?.displayName || user?.email || 'unknown'}${colors.reset}`);

  // Resolve target to name + phone
  let name: string;
  let phone: string;

  // Check if target is a phone number
  const normalizedPhone = normalizePhone(target);
  if (normalizedPhone) {
    phone = normalizedPhone;
    name = target;
    log.info(`Phone number detected: ${colors.cyan}${phone}${colors.reset}`);
  } else {
    // Try to look up as a contact name
    log.info(`Looking up "${target}" in your contacts...`);
    const contact = await lookupContact(target);

    if (contact && contact.phone) {
      log.success(`Found: ${colors.cyan}${contact.name}${colors.reset} - ${colors.dim}${contact.phone}${colors.reset}`);
      name = contact.name;
      phone = contact.phone;
    } else {
      log.error(`Contact "${target}" not found. Please provide a phone number.`);
      console.log(`\nUsage: ${colors.cyan}ferni call +1234567890${colors.reset}`);
      process.exit(1);
    }
  }

  // Initiate the call
  log.info('Initiating call...');

  const result = await initiateCall({
    name,
    phone,
    reason: options.reason,
    message: options.message,
    personaId: options.persona,
  });

  if (result.success) {
    log.success(`Call initiated!`);
    log.info(`Ferni is calling ${colors.cyan}${name}${colors.reset} now.`);
    if (result.callId) {
      log.info(`Call ID: ${colors.dim}${result.callId}${colors.reset}`);
      log.info(`Check status: ${colors.cyan}ferni calls status ${result.callId}${colors.reset}`);
    }
  } else {
    log.error(`Failed to initiate call: ${result.error}`);
    process.exit(1);
  }
}

/**
 * Status command - check call status
 */
async function handleStatus(callId: string): Promise<void> {
  log.header('📞 Call Status');

  if (!isAuthenticated()) {
    log.error(`Not authenticated. Run ${colors.cyan}ferni auth login${colors.reset} first.`);
    process.exit(1);
  }

  log.info('Fetching call status...');

  const status = await getCallStatus(callId);

  if (!status) {
    log.error('Call not found');
    process.exit(1);
  }

  log.success('Call found');

  console.log(`\n${colors.bold}Call Details:${colors.reset}`);
  console.log(`  Status: ${colors.cyan}${String(status.status)}${colors.reset}`);
  console.log(`  Name: ${status.userName || 'N/A'}`);
  console.log(`  Phone: ${status.phoneNumber || 'N/A'}`);
  console.log(`  Persona: ${status.personaId || 'ferni'}`);
  console.log(`  Started: ${status.startedAt || 'N/A'}`);

  if (status.conversationSummary) {
    console.log(`\n${colors.bold}Summary:${colors.reset} ${status.conversationSummary}`);
  }
}

/**
 * List command - show active calls
 */
async function handleList(): Promise<void> {
  log.header('📞 Active Calls');

  if (!isAuthenticated()) {
    log.error(`Not authenticated. Run ${colors.cyan}ferni auth login${colors.reset} first.`);
    process.exit(1);
  }

  log.info('Fetching active calls...');

  const calls = await listActiveCalls();

  log.info(`Found ${calls.length} active call(s)`);

  if (calls.length === 0) {
    console.log(`\n${colors.dim}No active calls.${colors.reset}`);
  } else {
    console.log('');
    for (const call of calls) {
      console.log(
        `  ${colors.cyan}${String(call.id)}${colors.reset} - ${call.userName || 'Unknown'} (${call.status})`
      );
    }
  }
}

// ============================================================================
// ARGUMENT PARSING
// ============================================================================

function parseArgs(args: string[]): {
  command: string;
  target?: string;
  options: Record<string, string>;
} {
  const options: Record<string, string> = {};
  let command = '';
  let target: string | undefined;

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--reason' || arg === '-r') {
      options.reason = args[++i];
    } else if (arg === '--message' || arg === '-m') {
      options.message = args[++i];
    } else if (arg === '--persona' || arg === '-p') {
      options.persona = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      options.help = 'true';
    } else if (arg.startsWith('--') || arg.startsWith('-')) {
      // Skip unknown flags
      i++;
    } else if (!command) {
      command = arg;
    } else if (!target) {
      target = arg;
    }
    i++;
  }

  return { command, target, options };
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { command, target, options } = parseArgs(args);

  if (options.help || (!command && !target)) {
    printHelp();
    return;
  }

  // Handle "ferni call <target>" - direct call initiation
  if (!command && target) {
    await handleCall(target, options);
    return;
  }

  // Handle subcommands
  switch (command) {
    case 'status':
      if (!target) {
        log.error('Call ID required. Usage: ferni calls status <callId>');
        process.exit(1);
      }
      await handleStatus(target);
      break;

    case 'list':
      await handleList();
      break;

    case 'help':
      printHelp();
      break;

    default:
      // If command looks like a target (name or phone), treat as direct call
      if (command) {
        await handleCall(command, options);
      } else {
        printHelp();
      }
  }
}

main().catch((error) => {
  log.error(`Error: ${error.message}`);
  process.exit(1);
});
