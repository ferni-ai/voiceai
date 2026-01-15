/**
 * Slack ChatOps Bot
 *
 * Enables ops commands via Slack:
 * - /ferni status - Check system status
 * - /ferni deploy [target] - Trigger deployment
 * - /ferni rollback - Rollback to previous version
 * - /ferni health - Health check all services
 * - /ferni logs [service] - Get recent logs
 * - /ferni incidents - List active incidents
 * - /ferni disk - Check disk usage
 *
 * "ChatOps: where conversations and operations collide" - GitHub
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { execSync } from 'child_process';

const log = createLogger({ module: 'SlackChatOps' });

// ============================================================================
// CONFIGURATION
// ============================================================================

interface ChatOpsConfig {
  port: number;
  slackSigningSecret?: string;
  slackBotToken?: string;
  allowedChannels: string[];
  allowedUsers: string[];
  enableDangerousCommands: boolean; // deploy, rollback
}

const DEFAULT_CONFIG: ChatOpsConfig = {
  port: 3003,
  slackSigningSecret: process.env.SLACK_SIGNING_SECRET,
  slackBotToken: process.env.SLACK_BOT_TOKEN,
  allowedChannels: ['ops', 'deployments', 'ferni-ops'],
  allowedUsers: [], // Empty = all users allowed
  enableDangerousCommands: true,
};

// ============================================================================
// COMMAND HANDLERS
// ============================================================================

type CommandHandler = (args: string[], context: CommandContext) => Promise<SlackResponse>;

interface CommandContext {
  userId: string;
  userName: string;
  channelId: string;
  channelName: string;
}

interface SlackResponse {
  response_type: 'in_channel' | 'ephemeral';
  text: string;
  blocks?: SlackBlock[];
}

interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  fields?: Array<{ type: string; text: string }>;
  elements?: unknown[];
}

const commands: Record<string, CommandHandler> = {
  status: handleStatus,
  health: handleHealth,
  deploy: handleDeploy,
  rollback: handleRollback,
  logs: handleLogs,
  incidents: handleIncidents,
  disk: handleDisk,
  quality: handleQuality,
  help: handleHelp,
};

async function handleStatus(): Promise<SlackResponse> {
  try {
    // Get status from health endpoint
    const healthResponse = await fetch('http://localhost:8080/health').catch(() => null);
    const healthData = healthResponse
      ? ((await healthResponse.json().catch(() => ({}))) as Record<string, unknown>)
      : {};

    const isHealthy = healthData.status === 'ok';

    return {
      response_type: 'in_channel',
      text: '🟢 System Status',
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: isHealthy ? '🟢 Ferni System Status' : '🔴 Ferni System Status',
            emoji: true,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Health*\n${isHealthy ? 'Healthy' : 'Unhealthy'}`,
            },
            {
              type: 'mrkdwn',
              text: `*Service*\n${(healthData.service as string) || 'voice-agent'}`,
            },
            {
              type: 'mrkdwn',
              text: `*Timestamp*\n${(healthData.timestamp as string) || new Date().toISOString()}`,
            },
          ],
        },
      ],
    };
  } catch (error) {
    return {
      response_type: 'ephemeral',
      text: `❌ Error getting status: ${error}`,
    };
  }
}

async function handleHealth(): Promise<SlackResponse> {
  try {
    // Check multiple endpoints
    const endpoints = [
      { name: 'Voice Agent', url: 'http://localhost:8080/health' },
      { name: 'Readiness', url: 'http://localhost:8080/health/ready' },
    ];

    const results = await Promise.all(
      endpoints.map(async (ep) => {
        try {
          const start = Date.now();
          const res = await fetch(ep.url);
          const latency = Date.now() - start;
          return { name: ep.name, healthy: res.ok, latencyMs: latency };
        } catch {
          return { name: ep.name, healthy: false, latencyMs: 0 };
        }
      })
    );

    const serviceBlocks = results.map((s) => ({
      type: 'mrkdwn',
      text: `${s.healthy ? '✅' : '❌'} *${s.name}*: ${s.healthy ? 'Healthy' : 'Unhealthy'} (${s.latencyMs}ms)`,
    }));

    return {
      response_type: 'in_channel',
      text: '🏥 Health Check Results',
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '🏥 Service Health', emoji: true },
        },
        {
          type: 'section',
          fields: serviceBlocks,
        },
      ],
    };
  } catch (error) {
    return {
      response_type: 'ephemeral',
      text: `❌ Error running health check: ${error}`,
    };
  }
}

async function handleDeploy(args: string[], context: CommandContext): Promise<SlackResponse> {
  const target = args[0] || 'gce';
  const validTargets = ['gce', 'ui', 'frontend', 'all'];

  if (!validTargets.includes(target)) {
    return {
      response_type: 'ephemeral',
      text: `❌ Invalid target: ${target}. Valid targets: ${validTargets.join(', ')}`,
    };
  }

  // Send immediate response
  const response: SlackResponse = {
    response_type: 'in_channel',
    text: `🚀 Deployment started`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🚀 *Deployment started* by <@${context.userId}>\n*Target:* ${target}\n\nThis will take 3-5 minutes. You'll be notified when complete.`,
        },
      },
    ],
  };

  // Trigger deployment in background
  setTimeout(() => {
    try {
      log.info({ target, user: context.userName }, 'ChatOps deploy triggered');
      execSync(`npx tsx apps/cli/src/index.ts deploy ${target}`, {
        cwd: process.cwd(),
        timeout: 10 * 60 * 1000, // 10 minute timeout
      });
      log.info({ target }, 'ChatOps deploy completed');
    } catch (error) {
      log.error({ error: String(error), target }, 'ChatOps deploy failed');
    }
  }, 100);

  return response;
}

async function handleRollback(_args: string[], context: CommandContext): Promise<SlackResponse> {
  const response: SlackResponse = {
    response_type: 'in_channel',
    text: `🔄 Rollback started`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🔄 *Rollback started* by <@${context.userId}>\n\nRolling back to previous version...`,
        },
      },
    ],
  };

  // Trigger rollback in background
  setTimeout(() => {
    try {
      log.info({ user: context.userName }, 'ChatOps rollback triggered');
      execSync(`npx tsx apps/cli/src/index.ts deploy gce --rollback`, {
        cwd: process.cwd(),
        timeout: 10 * 60 * 1000,
      });
      log.info('ChatOps rollback completed');
    } catch (error) {
      log.error({ error: String(error) }, 'ChatOps rollback failed');
    }
  }, 100);

  return response;
}

async function handleLogs(args: string[]): Promise<SlackResponse> {
  const lines = parseInt(args[0]) || 20;
  const maxLines = 50;

  try {
    const output = execSync(
      `gcloud compute ssh voiceai-agent-gce --zone us-central1-a --command "docker logs voiceai-agent-blue --tail ${Math.min(lines, maxLines)}" 2>&1`,
      { encoding: 'utf-8', timeout: 30000 }
    );

    // Truncate if too long for Slack
    const truncated =
      output.length > 2900 ? `${output.substring(0, 2900)}\n...(truncated)` : output;

    return {
      response_type: 'ephemeral',
      text: `📜 Recent Logs (${Math.min(lines, maxLines)} lines)`,
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `\`\`\`${truncated}\`\`\`` },
        },
      ],
    };
  } catch (error) {
    return {
      response_type: 'ephemeral',
      text: `❌ Error fetching logs: ${error}`,
    };
  }
}

async function handleIncidents(): Promise<SlackResponse> {
  try {
    const incidentsResponse = await fetch('http://localhost:8080/api/incidents/active').catch(
      () => null
    );
    const data = incidentsResponse
      ? ((await incidentsResponse.json().catch(() => ({ incidents: [] }))) as {
          incidents: Array<{ title: string; severity: string; detectedAt: number }>;
        })
      : { incidents: [] };
    const active = data.incidents || [];

    if (active.length === 0) {
      return {
        response_type: 'in_channel',
        text: '✅ No active incidents',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `✅ *No active incidents*`,
            },
          },
        ],
      };
    }

    const incidentText = active
      .map(
        (i) =>
          `• *${i.title}* (${i.severity}) - ${Math.floor((Date.now() - i.detectedAt) / 60000)}min ago`
      )
      .join('\n');

    return {
      response_type: 'in_channel',
      text: `🚨 ${active.length} Active Incident(s)`,
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `🚨 *Active Incidents*\n\n${incidentText}` },
        },
      ],
    };
  } catch (error) {
    return {
      response_type: 'ephemeral',
      text: `❌ Error fetching incidents: ${error}`,
    };
  }
}

async function handleDisk(): Promise<SlackResponse> {
  try {
    const watchdogResponse = await fetch('http://localhost:8080/api/watchdog').catch(() => null);
    const data = watchdogResponse
      ? ((await watchdogResponse.json().catch(() => ({ data: {} }))) as {
          data: {
            disk?: { usedPercent?: number; availableBytes?: number };
            cleanupCount?: number;
            lastCleanup?: number;
          };
        })
      : { data: {} };
    const watchdog = data.data || {};

    return {
      response_type: 'in_channel',
      text: '💾 Disk Status',
      blocks: [
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Used*\n${watchdog.disk?.usedPercent || 'N/A'}%`,
            },
            {
              type: 'mrkdwn',
              text: `*Available*\n${watchdog.disk?.availableBytes ? (watchdog.disk.availableBytes / 1024 / 1024 / 1024).toFixed(1) : 'N/A'} GB`,
            },
            {
              type: 'mrkdwn',
              text: `*Cleanup Count*\n${watchdog.cleanupCount || 0}`,
            },
            {
              type: 'mrkdwn',
              text: `*Last Cleanup*\n${watchdog.lastCleanup ? new Date(watchdog.lastCleanup).toLocaleString() : 'Never'}`,
            },
          ],
        },
      ],
    };
  } catch (error) {
    return {
      response_type: 'ephemeral',
      text: `❌ Error getting disk status: ${error}`,
    };
  }
}

async function handleQuality(): Promise<SlackResponse> {
  try {
    const qualityResponse = await fetch('http://localhost:8080/api/quality').catch(() => null);
    const data = qualityResponse
      ? ((await qualityResponse.json().catch(() => ({}))) as {
          metrics?: {
            qualityScore?: number;
            connectionSuccessRate?: number;
            totalCalls?: number;
            avgCallDurationMs?: number;
            avgFirstResponseTimeMs?: number;
          };
          activeCalls?: unknown[];
        })
      : {};
    const stats = data.metrics || {};

    return {
      response_type: 'in_channel',
      text: '📊 Call Quality',
      blocks: [
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Quality Score*\n${stats.qualityScore || 'N/A'}/100` },
            {
              type: 'mrkdwn',
              text: `*Success Rate*\n${stats.connectionSuccessRate ? (stats.connectionSuccessRate * 100).toFixed(1) : 'N/A'}%`,
            },
            { type: 'mrkdwn', text: `*Total Calls*\n${stats.totalCalls || 0}` },
            { type: 'mrkdwn', text: `*Active Calls*\n${data.activeCalls?.length || 0}` },
            {
              type: 'mrkdwn',
              text: `*Avg Duration*\n${stats.avgCallDurationMs ? Math.floor(stats.avgCallDurationMs / 1000) : 0}s`,
            },
            { type: 'mrkdwn', text: `*Avg TTFR*\n${stats.avgFirstResponseTimeMs || 0}ms` },
          ],
        },
      ],
    };
  } catch (error) {
    return {
      response_type: 'ephemeral',
      text: `❌ Error getting quality stats: ${error}`,
    };
  }
}

async function handleHelp(): Promise<SlackResponse> {
  return {
    response_type: 'ephemeral',
    text: '📚 Ferni ChatOps Commands',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*📚 Ferni ChatOps Commands*

*Status & Monitoring*
• \`/ferni status\` - System overview
• \`/ferni health\` - Service health checks
• \`/ferni quality\` - Call quality metrics
• \`/ferni incidents\` - Active incidents
• \`/ferni disk\` - Disk usage

*Operations*
• \`/ferni deploy [gce|ui|frontend|all]\` - Trigger deployment
• \`/ferni rollback\` - Rollback to previous version
• \`/ferni logs [lines]\` - View recent logs

*Help*
• \`/ferni help\` - This message`,
        },
      },
    ],
  };
}

// ============================================================================
// SLACK REQUEST HANDLING
// ============================================================================

let config_: ChatOpsConfig = { ...DEFAULT_CONFIG };

async function handleSlackCommand(body: Record<string, string>): Promise<SlackResponse> {
  const commandText = body.text || '';
  const [command, ...args] = commandText.trim().split(/\s+/);

  const context: CommandContext = {
    userId: body.user_id,
    userName: body.user_name,
    channelId: body.channel_id,
    channelName: body.channel_name,
  };

  log.info({ command, args, user: context.userName }, 'ChatOps command received');

  // Check if command exists
  const handler = commands[command || 'help'];
  if (!handler) {
    return {
      response_type: 'ephemeral',
      text: `❓ Unknown command: ${command}. Try \`/ferni help\``,
    };
  }

  // Check dangerous command permissions
  const dangerousCommands = ['deploy', 'rollback'];
  if (dangerousCommands.includes(command) && !config_.enableDangerousCommands) {
    return {
      response_type: 'ephemeral',
      text: `🔒 Command \`${command}\` is disabled in this environment`,
    };
  }

  // Execute command
  try {
    return await handler(args, context);
  } catch (error) {
    log.error({ error: String(error), command }, 'ChatOps command failed');
    return {
      response_type: 'ephemeral',
      text: `❌ Command failed: ${error}`,
    };
  }
}

function parseBody(body: string): Record<string, string> {
  const params = new URLSearchParams(body);
  const result: Record<string, string> = {};
  for (const [key, value] of params) {
    result[key] = value;
  }
  return result;
}

// ============================================================================
// SERVER
// ============================================================================

let server: ReturnType<typeof createServer> | null = null;

export function startChatOpsServer(userConfig?: Partial<ChatOpsConfig>): void {
  config_ = { ...DEFAULT_CONFIG, ...userConfig };

  if (server) {
    log.warn('ChatOps server already running');
    return;
  }

  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'POST' || req.url !== '/slack/commands') {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    // Read body and handle async
    void (async () => {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
      }

      try {
        const parsed = parseBody(body);
        const response = await handleSlackCommand(parsed);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      } catch (error) {
        log.error({ error: String(error) }, 'Error handling Slack command');
        res.writeHead(500);
        res.end(JSON.stringify({ text: 'Internal error' }));
      }
    })();
  });

  server.listen(config_.port, () => {
    log.info({ port: config_.port }, '🤖 Slack ChatOps server started');
  });
}

export function stopChatOpsServer(): void {
  if (server) {
    server.close();
    server = null;
    log.info('ChatOps server stopped');
  }
}
