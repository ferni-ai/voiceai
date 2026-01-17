/**
 * Ferni Discord Bot
 *
 * Manage Ferni agents directly from Discord.
 *
 * Commands:
 *   /ferni init <name>     - Create new agent
 *   /ferni list            - List your agents
 *   /ferni status <agent>  - Agent status
 *   /ferni deploy <agent>  - Deploy to production
 *   /ferni preview <agent> - Generate preview link
 *   /ferni logs <agent>    - View recent logs
 *   /ferni validate <agent> - Run validation
 *   /ferni voice <text>    - Preview voice
 */

import {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  REST,
  Routes,
  type Interaction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// CONFIGURATION
// ============================================================================

const config = {
  token: process.env.DISCORD_BOT_TOKEN!,
  clientId: process.env.DISCORD_CLIENT_ID!,
  apiEndpoint: process.env.FERNI_API_ENDPOINT || 'https://api.ferni.ai',
};

// ============================================================================
// API CLIENT
// ============================================================================

interface Agent {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'inactive';
  url?: string;
  sessions?: number;
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  userId?: string
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (userId) {
    headers['X-Discord-User-Id'] = userId;
  }

  const response = await fetch(`${config.apiEndpoint}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

// ============================================================================
// COMMAND HANDLERS
// ============================================================================

async function handleList(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  try {
    const agents = await apiRequest<Agent[]>('/api/agents', {}, interaction.user.id);

    if (agents.length === 0) {
      await interaction.editReply({
        content: "You don't have any agents yet. Use `/ferni init <name>` to create one!",
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('📋 Your Agents')
      .setColor(0x3d5a45)
      .setDescription(
        agents
          .map((a) => {
            const status = a.status === 'active' ? '✅' : a.status === 'draft' ? '⏸️' : '❌';
            const sessions = a.sessions ? `${a.sessions} sessions` : 'no sessions';
            return `${status} **${a.name}** - ${a.status} - ${sessions}`;
          })
          .join('\n')
      )
      .setFooter({ text: `Total: ${agents.length} agents` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await interaction.editReply({
      content: `❌ Error fetching agents: ${(error as Error).message}`,
    });
  }
}

async function handleStatus(interaction: ChatInputCommandInteraction): Promise<void> {
  const agentId = interaction.options.getString('agent', true);
  await interaction.deferReply();

  try {
    const agent = await apiRequest<Agent>(`/api/agents/${agentId}`, {}, interaction.user.id);

    const embed = new EmbedBuilder()
      .setTitle(`📊 ${agent.name}`)
      .setColor(agent.status === 'active' ? 0x27ae60 : 0xe67e22)
      .addFields(
        { name: 'Status', value: agent.status === 'active' ? '✅ Live' : '⏸️ Draft', inline: true },
        { name: 'Sessions', value: `${agent.sessions || 0} today`, inline: true },
        {
          name: 'URL',
          value: agent.url ? `[Open](${agent.url})` : 'Not deployed',
          inline: true,
        }
      )
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel('Open URL')
        .setStyle(ButtonStyle.Link)
        .setURL(agent.url || 'https://ferni.ai')
        .setDisabled(!agent.url),
      new ButtonBuilder()
        .setCustomId(`logs_${agentId}`)
        .setLabel('View Logs')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`deploy_${agentId}`)
        .setLabel('Redeploy')
        .setStyle(ButtonStyle.Primary)
    );

    await interaction.editReply({ embeds: [embed], components: [row] });
  } catch (error) {
    await interaction.editReply({
      content: `❌ Error fetching agent: ${(error as Error).message}`,
    });
  }
}

async function handleDeploy(interaction: ChatInputCommandInteraction): Promise<void> {
  const agentId = interaction.options.getString('agent', true);
  await interaction.deferReply();

  const embed = new EmbedBuilder()
    .setTitle(`🚀 Deploying ${agentId}...`)
    .setColor(0xe67e22)
    .setDescription('◇ Validating...')
    .setTimestamp();

  const message = await interaction.editReply({ embeds: [embed] });

  try {
    // Step 1: Validate
    await apiRequest(`/api/agents/${agentId}/validate`, { method: 'POST' }, interaction.user.id);
    embed.setDescription('✓ Validated\n◇ Building...');
    await interaction.editReply({ embeds: [embed] });

    // Step 2: Deploy
    const result = await apiRequest<{ url: string }>(
      `/api/agents/${agentId}/deploy`,
      { method: 'POST' },
      interaction.user.id
    );

    // Success
    embed
      .setTitle(`✅ Deployed ${agentId}`)
      .setColor(0x27ae60)
      .setDescription(`✓ Validated\n✓ Built\n✓ Deployed\n\n🌐 ${result.url}`);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setLabel('Open URL').setStyle(ButtonStyle.Link).setURL(result.url),
      new ButtonBuilder()
        .setCustomId(`logs_${agentId}`)
        .setLabel('View Logs')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.editReply({ embeds: [embed], components: [row] });
  } catch (error) {
    embed
      .setTitle(`❌ Deploy Failed`)
      .setColor(0xc0392b)
      .setDescription(`Error: ${(error as Error).message}`);

    await interaction.editReply({ embeds: [embed] });
  }
}

async function handleInit(interaction: ChatInputCommandInteraction): Promise<void> {
  const agentName = interaction.options.getString('name', true);

  // Validate name
  if (!/^[a-z][a-z0-9-]*$/.test(agentName)) {
    await interaction.reply({
      content:
        '❌ Agent name must start with a letter and contain only lowercase letters, numbers, and hyphens.',
      ephemeral: true,
    });
    return;
  }

  // Show modal for additional details
  const modal = new ModalBuilder()
    .setCustomId(`init_modal_${agentName}`)
    .setTitle(`Create Agent: ${agentName}`);

  const displayNameInput = new TextInputBuilder()
    .setCustomId('displayName')
    .setLabel("Display Name")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Alex Rivera')
    .setRequired(true);

  const taglineInput = new TextInputBuilder()
    .setCustomId('tagline')
    .setLabel('One-line tagline')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Career Coach for Engineers')
    .setRequired(true);

  const descriptionInput = new TextInputBuilder()
    .setCustomId('description')
    .setLabel('Description')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Describe what your agent does...')
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(displayNameInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(taglineInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput)
  );

  await interaction.showModal(modal);
}

async function handleModalSubmit(interaction: Interaction): Promise<void> {
  if (!interaction.isModalSubmit()) return;

  const customId = interaction.customId;
  if (!customId.startsWith('init_modal_')) return;

  const agentName = customId.replace('init_modal_', '');
  const displayName = interaction.fields.getTextInputValue('displayName');
  const tagline = interaction.fields.getTextInputValue('tagline');
  const description = interaction.fields.getTextInputValue('description');

  await interaction.deferReply();

  try {
    const result = await apiRequest<{ id: string; url: string }>(
      '/api/agents',
      {
        method: 'POST',
        body: JSON.stringify({
          id: agentName,
          displayName,
          tagline,
          description,
        }),
      },
      interaction.user.id
    );

    const embed = new EmbedBuilder()
      .setTitle(`✅ Created: ${displayName}`)
      .setColor(0x27ae60)
      .addFields(
        { name: 'ID', value: agentName, inline: true },
        { name: 'Status', value: 'Draft', inline: true }
      )
      .setDescription(`*${tagline}*\n\nUse \`/ferni deploy ${agentName}\` to go live.`)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await interaction.editReply({
      content: `❌ Error creating agent: ${(error as Error).message}`,
    });
  }
}

async function handlePreview(interaction: ChatInputCommandInteraction): Promise<void> {
  const agentId = interaction.options.getString('agent', true);
  await interaction.deferReply({ ephemeral: true });

  try {
    const result = await apiRequest<{ url: string; expiresIn: string }>(
      `/api/agents/${agentId}/preview`,
      { method: 'POST' },
      interaction.user.id
    );

    const embed = new EmbedBuilder()
      .setTitle(`🔗 Preview Link`)
      .setColor(0x3498db)
      .setDescription(`Agent: **${agentId}**\n\n${result.url}`)
      .setFooter({ text: `Expires in ${result.expiresIn}` })
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setLabel('Open Preview').setStyle(ButtonStyle.Link).setURL(result.url),
      new ButtonBuilder()
        .setCustomId(`preview_${agentId}`)
        .setLabel('Generate New Link')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.editReply({ embeds: [embed], components: [row] });
  } catch (error) {
    await interaction.editReply({
      content: `❌ Error generating preview: ${(error as Error).message}`,
    });
  }
}

async function handleLogs(interaction: ChatInputCommandInteraction): Promise<void> {
  const agentId = interaction.options.getString('agent', true);
  await interaction.deferReply();

  try {
    const logs = await apiRequest<{ entries: Array<{ time: string; level: string; message: string }> }>(
      `/api/agents/${agentId}/logs?limit=10`,
      {},
      interaction.user.id
    );

    const logsText = logs.entries
      .map((log) => {
        const level = log.level === 'error' ? '❌' : log.level === 'warn' ? '⚠️' : 'ℹ️';
        return `${log.time} ${level} ${log.message}`;
      })
      .join('\n');

    const embed = new EmbedBuilder()
      .setTitle(`📜 Logs: ${agentId}`)
      .setColor(0x3d5a45)
      .setDescription(`\`\`\`\n${logsText || 'No recent logs'}\n\`\`\``)
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`logs_refresh_${agentId}`)
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setLabel('Full Logs')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://dashboard.ferni.ai/agents/${agentId}/logs`)
    );

    await interaction.editReply({ embeds: [embed], components: [row] });
  } catch (error) {
    await interaction.editReply({
      content: `❌ Error fetching logs: ${(error as Error).message}`,
    });
  }
}

async function handleValidate(interaction: ChatInputCommandInteraction): Promise<void> {
  const agentId = interaction.options.getString('agent', true);
  await interaction.deferReply();

  try {
    const result = await apiRequest<{
      valid: boolean;
      checks: Array<{ name: string; passed: boolean; message?: string }>;
    }>(`/api/agents/${agentId}/validate`, { method: 'POST' }, interaction.user.id);

    const checksText = result.checks
      .map((c) => {
        const icon = c.passed ? '✅' : '❌';
        return `${icon} ${c.name}${c.message ? ` - ${c.message}` : ''}`;
      })
      .join('\n');

    const embed = new EmbedBuilder()
      .setTitle(`🔍 Validation: ${agentId}`)
      .setColor(result.valid ? 0x27ae60 : 0xc0392b)
      .setDescription(checksText)
      .setFooter({ text: result.valid ? 'Ready to deploy' : 'Fix issues before deploying' })
      .setTimestamp();

    if (result.valid) {
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`deploy_${agentId}`)
          .setLabel('Deploy Now')
          .setStyle(ButtonStyle.Success)
      );
      await interaction.editReply({ embeds: [embed], components: [row] });
    } else {
      await interaction.editReply({ embeds: [embed] });
    }
  } catch (error) {
    await interaction.editReply({
      content: `❌ Error validating: ${(error as Error).message}`,
    });
  }
}

async function handleVoice(interaction: ChatInputCommandInteraction): Promise<void> {
  const text = interaction.options.getString('text', true);
  await interaction.deferReply();

  try {
    const result = await apiRequest<{ audioUrl: string }>(
      '/api/voice/preview',
      {
        method: 'POST',
        body: JSON.stringify({ text }),
      },
      interaction.user.id
    );

    await interaction.editReply({
      content: `🔊 **Voice Preview**\n\n"${text}"\n\n[▶️ Play Audio](${result.audioUrl})`,
    });
  } catch (error) {
    await interaction.editReply({
      content: `❌ Error generating voice: ${(error as Error).message}`,
    });
  }
}

async function handleHelp(interaction: ChatInputCommandInteraction): Promise<void> {
  const embed = new EmbedBuilder()
    .setTitle('🎙️ Ferni Bot Commands')
    .setColor(0x3d5a45)
    .setDescription(
      [
        '**Agent Management**',
        '`/ferni init <name>` - Create new agent',
        '`/ferni list` - List your agents',
        '`/ferni status <agent>` - Agent status',
        '`/ferni validate <agent>` - Run validation',
        '',
        '**Deployment**',
        '`/ferni deploy <agent>` - Deploy to production',
        '`/ferni preview <agent>` - Generate preview link',
        '`/ferni logs <agent>` - View recent logs',
        '',
        '**Utilities**',
        '`/ferni voice <text>` - Preview voice',
        '`/ferni help` - This message',
        '',
        '**Documentation**',
        '[developers.ferni.ai](https://developers.ferni.ai)',
      ].join('\n')
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

// ============================================================================
// BUTTON HANDLERS
// ============================================================================

async function handleButton(interaction: Interaction): Promise<void> {
  if (!interaction.isButton()) return;

  const [action, agentId] = interaction.customId.split('_');

  if (action === 'deploy') {
    await interaction.deferReply();
    // Re-use deploy logic
    try {
      const result = await apiRequest<{ url: string }>(
        `/api/agents/${agentId}/deploy`,
        { method: 'POST' },
        interaction.user.id
      );

      const embed = new EmbedBuilder()
        .setTitle(`✅ Deployed ${agentId}`)
        .setColor(0x27ae60)
        .setDescription(`🌐 ${result.url}`)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      await interaction.editReply({
        content: `❌ Deploy failed: ${(error as Error).message}`,
      });
    }
  } else if (action === 'logs') {
    // Refresh logs
    await interaction.deferUpdate();
    // Similar to handleLogs but update existing message
  }
}

// ============================================================================
// SLASH COMMAND DEFINITIONS
// ============================================================================

const commands = [
  new SlashCommandBuilder()
    .setName('ferni')
    .setDescription('Manage Ferni voice AI agents')
    .addSubcommand((sub) =>
      sub
        .setName('init')
        .setDescription('Create a new agent')
        .addStringOption((opt) =>
          opt.setName('name').setDescription('Agent ID (lowercase, hyphens ok)').setRequired(true)
        )
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('List your agents'))
    .addSubcommand((sub) =>
      sub
        .setName('status')
        .setDescription('Get agent status')
        .addStringOption((opt) =>
          opt.setName('agent').setDescription('Agent ID').setRequired(true).setAutocomplete(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('deploy')
        .setDescription('Deploy agent to production')
        .addStringOption((opt) =>
          opt.setName('agent').setDescription('Agent ID').setRequired(true).setAutocomplete(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('preview')
        .setDescription('Generate preview link')
        .addStringOption((opt) =>
          opt.setName('agent').setDescription('Agent ID').setRequired(true).setAutocomplete(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('logs')
        .setDescription('View recent logs')
        .addStringOption((opt) =>
          opt.setName('agent').setDescription('Agent ID').setRequired(true).setAutocomplete(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('validate')
        .setDescription('Run validation checks')
        .addStringOption((opt) =>
          opt.setName('agent').setDescription('Agent ID').setRequired(true).setAutocomplete(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('voice')
        .setDescription('Preview text as voice')
        .addStringOption((opt) =>
          opt.setName('text').setDescription('Text to speak').setRequired(true)
        )
    )
    .addSubcommand((sub) => sub.setName('help').setDescription('Show available commands')),
];

// ============================================================================
// BOT INITIALIZATION
// ============================================================================

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user?.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  // Handle autocomplete
  if (interaction.isAutocomplete()) {
    try {
      const agents = await apiRequest<Agent[]>('/api/agents', {}, interaction.user.id);
      const choices = agents.map((a) => ({ name: a.name, value: a.id }));
      await interaction.respond(choices.slice(0, 25));
    } catch {
      await interaction.respond([]);
    }
    return;
  }

  // Handle modal submissions
  if (interaction.isModalSubmit()) {
    await handleModalSubmit(interaction);
    return;
  }

  // Handle buttons
  if (interaction.isButton()) {
    await handleButton(interaction);
    return;
  }

  // Handle slash commands
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'ferni') return;

  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'init':
      await handleInit(interaction);
      break;
    case 'list':
      await handleList(interaction);
      break;
    case 'status':
      await handleStatus(interaction);
      break;
    case 'deploy':
      await handleDeploy(interaction);
      break;
    case 'preview':
      await handlePreview(interaction);
      break;
    case 'logs':
      await handleLogs(interaction);
      break;
    case 'validate':
      await handleValidate(interaction);
      break;
    case 'voice':
      await handleVoice(interaction);
      break;
    case 'help':
      await handleHelp(interaction);
      break;
  }
});

// Register commands
async function registerCommands(): Promise<void> {
  const rest = new REST().setToken(config.token);

  console.log('🔄 Registering slash commands...');

  await rest.put(Routes.applicationCommands(config.clientId), {
    body: commands.map((c) => c.toJSON()),
  });

  console.log('✅ Slash commands registered');
}

// Main
async function main(): Promise<void> {
  if (!config.token || !config.clientId) {
    console.error('❌ Missing DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID');
    process.exit(1);
  }

  await registerCommands();
  await client.login(config.token);
}

main().catch(console.error);
