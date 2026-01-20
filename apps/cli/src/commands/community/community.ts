/**
 * Community Automation Command Hub
 *
 * Manage Discord, user stories, ambassadors, and community events.
 *
 * Commands:
 *   ferni community              - Dashboard
 *   ferni community discord      - Discord server status
 *   ferni community discord setup - Initialize Discord structure
 *   ferni community stories      - User story pipeline
 *   ferni community stories add  - Add a user story
 *   ferni community stories review - Review pending stories
 *   ferni community ambassadors  - Ambassador program status
 *   ferni community ambassadors invite - Invite ambassador
 *   ferni community events       - Community events
 */

import chalk from 'chalk';
import {
  getDashboard,
  getDiscordConfig,
  updateDiscordConfig,
  markChannelCreated,
  getStories,
  addStory,
  approveStory,
  publishStory,
  getAmbassadors,
  addAmbassador,
  updateAmbassador,
  addContribution,
  getEvents,
  addEvent,
  type UserStory,
  type Ambassador,
  type CommunityEvent,
} from './community-storage.js';

// ============================================================================
// DASHBOARD
// ============================================================================

async function showDashboard(): Promise<void> {
  const dashboard = await getDashboard();

  console.log(chalk.bold('\n🏘️  Community Dashboard\n'));

  // Discord Section
  console.log(chalk.cyan.bold('Discord Server'));
  const discordStatus = dashboard.discord.setupComplete
    ? chalk.green('✅ Setup complete')
    : chalk.yellow(`🔄 In progress (${dashboard.discord.channelsCreated}/${dashboard.discord.totalChannels} channels)`);
  console.log(`  Status: ${discordStatus}`);
  console.log('');

  // Stories Section
  console.log(chalk.cyan.bold('User Stories'));
  console.log(`  Total: ${chalk.white(dashboard.stories.total)}`);
  console.log(`  Pending review: ${dashboard.stories.pending > 0 ? chalk.yellow(dashboard.stories.pending) : chalk.gray('0')}`);
  console.log(`  Approved: ${chalk.green(dashboard.stories.approved)}`);
  console.log(`  Featured: ${chalk.magenta(dashboard.stories.featured)}`);
  console.log('');

  // Ambassadors Section
  console.log(chalk.cyan.bold('Ambassador Program'));
  console.log(`  Total: ${chalk.white(dashboard.ambassadors.total)}`);
  console.log(`  Active: ${chalk.green(dashboard.ambassadors.active)}`);
  console.log(`  Invited (pending): ${chalk.yellow(dashboard.ambassadors.invited)}`);
  console.log('');

  // Events Section
  console.log(chalk.cyan.bold('Community Events'));
  console.log(`  Upcoming: ${chalk.blue(dashboard.events.upcoming)}`);
  console.log(`  Completed: ${chalk.gray(dashboard.events.completed)}`);
  console.log('');

  // Quick Actions
  console.log(chalk.dim('─'.repeat(50)));
  console.log(chalk.dim('Quick actions:'));
  console.log(chalk.dim('  ferni community stories review  - Review pending stories'));
  console.log(chalk.dim('  ferni community ambassadors     - Manage ambassadors'));
  console.log(chalk.dim('  ferni community discord setup   - Set up Discord server'));
}

// ============================================================================
// DISCORD
// ============================================================================

async function showDiscordStatus(): Promise<void> {
  const config = await getDiscordConfig();

  console.log(chalk.bold('\n💬 Discord Server Configuration\n'));

  // Server Info
  if (config.serverId) {
    console.log(`Server ID: ${chalk.cyan(config.serverId)}`);
  } else {
    console.log(`Server ID: ${chalk.yellow('Not configured')}`);
  }

  console.log(`Setup Complete: ${config.setupComplete ? chalk.green('Yes') : chalk.yellow('No')}`);
  if (config.lastSync) {
    console.log(`Last Sync: ${chalk.gray(new Date(config.lastSync).toLocaleString())}`);
  }
  console.log('');

  // Channels by Category
  console.log(chalk.cyan.bold('Channels'));
  const categories = Array.from(new Set(config.channels.map((c) => c.category)));

  for (const category of categories) {
    const categoryChannels = config.channels.filter((c) => c.category === category);
    const created = categoryChannels.filter((c) => c.created).length;
    const total = categoryChannels.length;
    const statusIcon = created === total ? '✅' : '🔄';

    console.log(`\n  ${statusIcon} ${chalk.bold(category)} (${created}/${total})`);
    for (const channel of categoryChannels) {
      const icon = channel.created ? chalk.green('✓') : chalk.gray('○');
      const name = channel.created ? chalk.white(`#${channel.name}`) : chalk.gray(`#${channel.name}`);
      console.log(`     ${icon} ${name} - ${chalk.dim(channel.purpose)}`);
    }
  }
  console.log('');

  // Roles
  console.log(chalk.cyan.bold('Roles'));
  for (const role of config.roles) {
    const icon = role.created ? chalk.green('✓') : chalk.gray('○');
    const name = role.created ? chalk.hex(role.color)(role.name) : chalk.gray(role.name);
    console.log(`  ${icon} ${name}`);
  }
  console.log('');

  if (!config.setupComplete) {
    console.log(chalk.dim('─'.repeat(50)));
    console.log(chalk.dim('Run: ferni community discord setup --server-id <id> --token <bot-token>'));
  }
}

async function setupDiscord(options: { serverId?: string; token?: string }): Promise<void> {
  console.log(chalk.bold('\n🚀 Discord Server Setup\n'));

  if (!options.serverId) {
    console.log(chalk.yellow('⚠️  Server ID required'));
    console.log(chalk.dim('Usage: ferni community discord setup --server-id <id> --token <bot-token>'));
    console.log(chalk.dim('\nTo get your server ID:'));
    console.log(chalk.dim('1. Enable Developer Mode in Discord settings'));
    console.log(chalk.dim('2. Right-click your server → Copy Server ID'));
    return;
  }

  await updateDiscordConfig({
    serverId: options.serverId,
    botToken: options.token,
  });

  console.log(chalk.green('✅ Server configuration saved'));
  console.log('');

  // Show what would be created
  const config = await getDiscordConfig();
  const channelsToCreate = config.channels.filter((c) => !c.created);
  const rolesToCreate = config.roles.filter((r) => !r.created);

  console.log(chalk.cyan('Channels to create:'), channelsToCreate.length);
  console.log(chalk.cyan('Roles to create:'), rolesToCreate.length);
  console.log('');

  console.log(chalk.yellow('⚠️  Discord API integration not yet implemented'));
  console.log(chalk.dim('For now, create channels manually following the structure above.'));
  console.log(chalk.dim('Mark channels as created: ferni community discord mark-created <channel-name> <channel-id>'));
}

async function markDiscordChannelCreated(channelName: string, channelId: string): Promise<void> {
  await markChannelCreated(channelName, channelId);
  console.log(chalk.green(`✅ Marked #${channelName} as created (${channelId})`));
}

// ============================================================================
// STORIES
// ============================================================================

async function showStories(filter?: string): Promise<void> {
  let stories: UserStory[];

  switch (filter) {
    case 'pending':
      stories = await getStories({ approved: false });
      break;
    case 'approved':
      stories = await getStories({ approved: true });
      break;
    case 'featured':
      stories = await getStories({ featured: true });
      break;
    default:
      stories = await getStories();
  }

  console.log(chalk.bold(`\n📖 User Stories${filter ? ` (${filter})` : ''}\n`));

  if (stories.length === 0) {
    console.log(chalk.gray('  No stories found'));
    console.log(chalk.dim('\n  Add a story: ferni community stories add'));
    return;
  }

  for (const story of stories) {
    const statusIcon = story.featured
      ? chalk.magenta('⭐')
      : story.approved
        ? chalk.green('✓')
        : chalk.yellow('○');

    console.log(`${statusIcon} ${chalk.bold(story.userName)}`);
    console.log(`   ${chalk.dim('ID:')} ${story.id.slice(0, 8)}`);
    console.log(`   ${chalk.dim('Source:')} ${story.source}`);
    if (story.persona) {
      console.log(`   ${chalk.dim('Persona:')} ${story.persona}`);
    }
    if (story.quote) {
      console.log(`   ${chalk.dim('Quote:')} "${story.quote.slice(0, 60)}${story.quote.length > 60 ? '...' : ''}"`);
    }
    console.log(`   ${chalk.dim('Submitted:')} ${new Date(story.submittedAt).toLocaleDateString()}`);
    if (story.publishedTo && story.publishedTo.length > 0) {
      console.log(`   ${chalk.dim('Published to:')} ${story.publishedTo.join(', ')}`);
    }
    console.log('');
  }

  console.log(chalk.dim('─'.repeat(50)));
  console.log(chalk.dim('Commands:'));
  console.log(chalk.dim('  ferni community stories add           - Add a story'));
  console.log(chalk.dim('  ferni community stories approve <id>  - Approve a story'));
  console.log(chalk.dim('  ferni community stories feature <id>  - Feature a story'));
  console.log(chalk.dim('  ferni community stories publish <id>  - Publish a story'));
}

async function addUserStory(options: {
  name: string;
  email?: string;
  story: string;
  source?: UserStory['source'];
  persona?: UserStory['persona'];
  quote?: string;
  consent?: boolean;
}): Promise<void> {
  if (!options.name || !options.story) {
    console.log(chalk.yellow('⚠️  Name and story required'));
    console.log(chalk.dim('Usage: ferni community stories add --name "Name" --story "Their story..."'));
    return;
  }

  const story = await addStory({
    userName: options.name,
    userEmail: options.email,
    story: options.story,
    source: options.source || 'form',
    persona: options.persona,
    quote: options.quote,
    approved: false,
    featured: false,
    consentGiven: options.consent || false,
  });

  console.log(chalk.green('\n✅ Story added'));
  console.log(`   ID: ${story.id.slice(0, 8)}`);
  console.log(`   From: ${story.userName}`);
  console.log(chalk.dim('\n   Review with: ferni community stories pending'));
}

async function approveUserStory(id: string, featured: boolean = false): Promise<void> {
  const stories = await getStories();
  const story = stories.find((s) => s.id.startsWith(id));

  if (!story) {
    console.log(chalk.red(`❌ Story not found: ${id}`));
    return;
  }

  const approved = await approveStory(story.id, featured);
  if (approved) {
    console.log(chalk.green(`✅ Story approved${featured ? ' and featured' : ''}`));
    console.log(`   From: ${approved.userName}`);
  }
}

async function publishUserStory(id: string, platforms: string[]): Promise<void> {
  const stories = await getStories();
  const story = stories.find((s) => s.id.startsWith(id));

  if (!story) {
    console.log(chalk.red(`❌ Story not found: ${id}`));
    return;
  }

  if (!story.approved) {
    console.log(chalk.yellow('⚠️  Story must be approved before publishing'));
    return;
  }

  const published = await publishStory(story.id, platforms);
  if (published) {
    console.log(chalk.green('✅ Story marked as published'));
    console.log(`   Platforms: ${platforms.join(', ')}`);
  }
}

// ============================================================================
// AMBASSADORS
// ============================================================================

async function showAmbassadors(filter?: string): Promise<void> {
  let ambassadors: Ambassador[];

  switch (filter) {
    case 'active':
      ambassadors = await getAmbassadors({ status: 'active' });
      break;
    case 'invited':
      ambassadors = await getAmbassadors({ status: 'invited' });
      break;
    case 'founding':
      ambassadors = await getAmbassadors({ tier: 'founding' });
      break;
    default:
      ambassadors = await getAmbassadors();
  }

  console.log(chalk.bold(`\n🎖️  Ambassador Program${filter ? ` (${filter})` : ''}\n`));

  if (ambassadors.length === 0) {
    console.log(chalk.gray('  No ambassadors found'));
    console.log(chalk.dim('\n  Invite an ambassador: ferni community ambassadors invite'));
    return;
  }

  const tierColors: Record<Ambassador['tier'], string> = {
    founding: '#FFD700',
    advocate: '#C0C0C0',
    creator: '#CD7F32',
    community: '#4a6741',
  };

  for (const ambassador of ambassadors) {
    const tierColor = tierColors[ambassador.tier];
    const statusIcon =
      ambassador.status === 'active'
        ? chalk.green('●')
        : ambassador.status === 'invited'
          ? chalk.yellow('○')
          : chalk.gray('○');

    console.log(`${statusIcon} ${chalk.bold(ambassador.name)} ${chalk.hex(tierColor)(`[${ambassador.tier}]`)}`);
    console.log(`   ${chalk.dim('Email:')} ${ambassador.email}`);
    console.log(`   ${chalk.dim('Platform:')} ${ambassador.platform}`);
    console.log(`   ${chalk.dim('Status:')} ${ambassador.status}`);
    console.log(`   ${chalk.dim('Contributions:')} ${ambassador.contributions.length}`);
    console.log(`   ${chalk.dim('Rewards:')} ${ambassador.rewards.length}`);
    if (ambassador.joinedAt) {
      console.log(`   ${chalk.dim('Joined:')} ${new Date(ambassador.joinedAt).toLocaleDateString()}`);
    }
    console.log('');
  }

  console.log(chalk.dim('─'.repeat(50)));
  console.log(chalk.dim('Commands:'));
  console.log(chalk.dim('  ferni community ambassadors invite       - Invite new ambassador'));
  console.log(chalk.dim('  ferni community ambassadors activate <id> - Activate ambassador'));
  console.log(chalk.dim('  ferni community ambassadors contribution <id> - Log contribution'));
}

async function inviteAmbassador(options: {
  name: string;
  email: string;
  platform?: Ambassador['platform'];
  tier?: Ambassador['tier'];
  handle?: string;
}): Promise<void> {
  if (!options.name || !options.email) {
    console.log(chalk.yellow('⚠️  Name and email required'));
    console.log(chalk.dim('Usage: ferni community ambassadors invite --name "Name" --email "email@example.com"'));
    return;
  }

  const ambassador = await addAmbassador({
    name: options.name,
    email: options.email,
    platform: options.platform || 'discord',
    tier: options.tier || 'community',
    status: 'invited',
    handle: options.handle,
  });

  console.log(chalk.green('\n✅ Ambassador invited'));
  console.log(`   ID: ${ambassador.id.slice(0, 8)}`);
  console.log(`   Name: ${ambassador.name}`);
  console.log(`   Tier: ${ambassador.tier}`);
  console.log(chalk.dim('\n   Send them the welcome email!'));
}

async function activateAmbassador(id: string): Promise<void> {
  const ambassadors = await getAmbassadors();
  const ambassador = ambassadors.find((a) => a.id.startsWith(id));

  if (!ambassador) {
    console.log(chalk.red(`❌ Ambassador not found: ${id}`));
    return;
  }

  const updated = await updateAmbassador(ambassador.id, {
    status: 'active',
    joinedAt: new Date().toISOString(),
  });

  if (updated) {
    console.log(chalk.green('✅ Ambassador activated'));
    console.log(`   Name: ${updated.name}`);
  }
}

async function logContribution(
  id: string,
  options: {
    type: Ambassador['contributions'][0]['type'];
    description: string;
    impact?: number;
  }
): Promise<void> {
  const ambassadors = await getAmbassadors();
  const ambassador = ambassadors.find((a) => a.id.startsWith(id));

  if (!ambassador) {
    console.log(chalk.red(`❌ Ambassador not found: ${id}`));
    return;
  }

  const success = await addContribution(ambassador.id, {
    type: options.type,
    description: options.description,
    date: new Date().toISOString(),
    impact: options.impact,
  });

  if (success) {
    console.log(chalk.green('✅ Contribution logged'));
    console.log(`   Type: ${options.type}`);
    console.log(`   Description: ${options.description}`);
  }
}

// ============================================================================
// EVENTS
// ============================================================================

async function showEvents(status?: CommunityEvent['status']): Promise<void> {
  const events = await getEvents(status);

  console.log(chalk.bold(`\n🎉 Community Events${status ? ` (${status})` : ''}\n`));

  if (events.length === 0) {
    console.log(chalk.gray('  No events found'));
    console.log(chalk.dim('\n  Create an event: ferni community events add'));
    return;
  }

  for (const event of events) {
    const statusIcon =
      event.status === 'completed'
        ? chalk.green('✓')
        : event.status === 'live'
          ? chalk.red('●')
          : event.status === 'announced'
            ? chalk.blue('◉')
            : chalk.yellow('○');

    const typeEmoji: Record<CommunityEvent['type'], string> = {
      ama: '🎤',
      workshop: '🛠️',
      launch: '🚀',
      celebration: '🎊',
      challenge: '🏆',
    };

    console.log(`${statusIcon} ${typeEmoji[event.type]} ${chalk.bold(event.name)}`);
    console.log(`   ${chalk.dim('Date:')} ${new Date(event.scheduledFor).toLocaleString()}`);
    console.log(`   ${chalk.dim('Platform:')} ${event.platform}`);
    console.log(`   ${chalk.dim('Status:')} ${event.status}`);
    if (event.attendees) {
      console.log(`   ${chalk.dim('Attendees:')} ${event.attendees}`);
    }
    console.log('');
  }
}

async function createEvent(options: {
  name: string;
  type?: CommunityEvent['type'];
  description?: string;
  date: string;
  platform?: CommunityEvent['platform'];
}): Promise<void> {
  if (!options.name || !options.date) {
    console.log(chalk.yellow('⚠️  Name and date required'));
    console.log(chalk.dim('Usage: ferni community events add --name "Event Name" --date "2026-02-01T18:00:00Z"'));
    return;
  }

  const event = await addEvent({
    name: options.name,
    type: options.type || 'ama',
    description: options.description || '',
    scheduledFor: options.date,
    platform: options.platform || 'discord',
    status: 'planning',
  });

  console.log(chalk.green('\n✅ Event created'));
  console.log(`   ID: ${event.id.slice(0, 8)}`);
  console.log(`   Name: ${event.name}`);
  console.log(`   Date: ${new Date(event.scheduledFor).toLocaleString()}`);
}

// ============================================================================
// MAIN COMMAND ROUTER
// ============================================================================

export async function community(
  command?: string,
  subcommand?: string,
  options: Record<string, unknown> = {}
): Promise<void> {
  // Default: show dashboard
  if (!command) {
    await showDashboard();
    return;
  }

  switch (command) {
    // Discord commands
    case 'discord':
      if (!subcommand || subcommand === 'status') {
        await showDiscordStatus();
      } else if (subcommand === 'setup') {
        await setupDiscord({
          serverId: options.serverId as string | undefined,
          token: options.token as string | undefined,
        });
      } else if (subcommand === 'mark-created' && options.channelName && options.channelId) {
        await markDiscordChannelCreated(options.channelName as string, options.channelId as string);
      }
      break;

    // Stories commands
    case 'stories':
      if (!subcommand || subcommand === 'list') {
        await showStories(options.filter as string | undefined);
      } else if (subcommand === 'pending') {
        await showStories('pending');
      } else if (subcommand === 'add') {
        await addUserStory({
          name: options.name as string,
          email: options.email as string | undefined,
          story: options.story as string,
          source: options.source as UserStory['source'] | undefined,
          persona: options.persona as UserStory['persona'] | undefined,
          quote: options.quote as string | undefined,
          consent: options.consent as boolean | undefined,
        });
      } else if (subcommand === 'approve' && options.id) {
        await approveUserStory(options.id as string, false);
      } else if (subcommand === 'feature' && options.id) {
        await approveUserStory(options.id as string, true);
      } else if (subcommand === 'publish' && options.id) {
        const platforms = (options.platforms as string)?.split(',') || ['website'];
        await publishUserStory(options.id as string, platforms);
      }
      break;

    // Ambassador commands
    case 'ambassadors':
      if (!subcommand || subcommand === 'list') {
        await showAmbassadors(options.filter as string | undefined);
      } else if (subcommand === 'active') {
        await showAmbassadors('active');
      } else if (subcommand === 'invite') {
        await inviteAmbassador({
          name: options.name as string,
          email: options.email as string,
          platform: options.platform as Ambassador['platform'] | undefined,
          tier: options.tier as Ambassador['tier'] | undefined,
          handle: options.handle as string | undefined,
        });
      } else if (subcommand === 'activate' && options.id) {
        await activateAmbassador(options.id as string);
      } else if (subcommand === 'contribution' && options.id) {
        await logContribution(options.id as string, {
          type: (options.type as Ambassador['contributions'][0]['type']) || 'content',
          description: options.description as string,
          impact: options.impact as number | undefined,
        });
      }
      break;

    // Events commands
    case 'events':
      if (!subcommand || subcommand === 'list') {
        await showEvents(options.status as CommunityEvent['status'] | undefined);
      } else if (subcommand === 'add') {
        await createEvent({
          name: options.name as string,
          type: options.type as CommunityEvent['type'] | undefined,
          description: options.description as string | undefined,
          date: options.date as string,
          platform: options.platform as CommunityEvent['platform'] | undefined,
        });
      }
      break;

    default:
      console.log(chalk.yellow(`Unknown command: ${command}`));
      console.log(chalk.dim('\nAvailable commands:'));
      console.log(chalk.dim('  ferni community           - Dashboard'));
      console.log(chalk.dim('  ferni community discord   - Discord server'));
      console.log(chalk.dim('  ferni community stories   - User stories'));
      console.log(chalk.dim('  ferni community ambassadors - Ambassador program'));
      console.log(chalk.dim('  ferni community events    - Community events'));
  }
}
