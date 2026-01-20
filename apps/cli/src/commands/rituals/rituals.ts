/**
 * Rituals Command Hub
 *
 * Cultural rituals automation for Ferni community.
 *
 * Commands:
 *   ferni rituals              - Today's ritual dashboard
 *   ferni rituals daily        - Daily rituals status
 *   ferni rituals morning      - Morning ritual content
 *   ferni rituals evening      - Evening ritual content
 *   ferni rituals complete <id> - Complete a ritual
 *   ferni rituals weekly       - Weekly reflection
 *   ferni rituals milestone    - Upcoming milestones
 *   ferni rituals celebrate <id> - Celebrate a milestone
 */

import chalk from 'chalk';
import {
  getRitualsDashboard,
  getDailyRituals,
  getTodaysRituals,
  completeRitual,
  toggleRitual,
  getWeeklyReflections,
  getCurrentWeekReflection,
  saveWeeklyReflection,
  getMilestones,
  addMilestone,
  celebrateMilestone,
  getPrompts,
  type DailyRitual,
  type Milestone,
} from './rituals-storage.js';

// ============================================================================
// DASHBOARD
// ============================================================================

async function showDashboard(): Promise<void> {
  const dashboard = await getRitualsDashboard();

  console.log(chalk.bold("\n🌿 Today's Rituals\n"));

  // Today's prompt
  if (dashboard.today.prompt) {
    const personaColors: Record<string, string> = {
      ferni: '#4a6741',
      maya: '#a67a6a',
      peter: '#3a6b73',
      jordan: '#c4856a',
      alex: '#5a6b8a',
      nayan: '#b8956a',
    };
    const color = dashboard.today.prompt.persona
      ? personaColors[dashboard.today.prompt.persona]
      : '#4a6741';

    console.log(chalk.hex(color).bold('💭 Today\'s Prompt'));
    console.log(chalk.hex(color)(`   "${dashboard.today.prompt.prompt}"`));
    if (dashboard.today.prompt.persona) {
      console.log(chalk.dim(`   — ${dashboard.today.prompt.persona}`));
    }
    console.log('');
  }

  // Today's rituals
  console.log(chalk.cyan.bold('Daily Rituals'));
  console.log(
    `  Progress: ${chalk.green(dashboard.today.completed)}/${dashboard.today.rituals.length} completed`
  );
  console.log('');

  const today = new Date().toISOString().split('T')[0];
  for (const ritual of dashboard.today.rituals) {
    const completed = ritual.completions.some((c) => c.date.startsWith(today));
    const icon = completed ? chalk.green('✓') : chalk.yellow('○');
    const name = completed ? chalk.gray(ritual.name) : chalk.white(ritual.name);
    const streak = ritual.streak > 0 ? chalk.dim(` 🔥${ritual.streak}`) : '';

    console.log(`  ${icon} ${name}${streak}`);
  }
  console.log('');

  // Streaks
  if (dashboard.streaks.length > 0) {
    console.log(chalk.cyan.bold('🔥 Active Streaks'));
    for (const streak of dashboard.streaks) {
      console.log(`  ${streak.ritual}: ${chalk.yellow(streak.streak)} days`);
    }
    console.log('');
  }

  // Weekly reflection
  console.log(chalk.cyan.bold('📝 Weekly Reflection'));
  if (dashboard.weeklyReflectionStatus === 'completed') {
    console.log(`  ${chalk.green('✓')} Completed for this week`);
  } else {
    console.log(`  ${chalk.yellow('○')} Not yet completed`);
    console.log(chalk.dim('  Run: ferni rituals weekly'));
  }
  console.log('');

  // Upcoming milestones
  if (dashboard.upcomingMilestones.length > 0) {
    console.log(chalk.cyan.bold('🎯 Upcoming Milestones'));
    for (const milestone of dashboard.upcomingMilestones) {
      const daysUntil = Math.ceil(
        (new Date(milestone.date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      const urgency =
        daysUntil <= 7 ? chalk.red : daysUntil <= 30 ? chalk.yellow : chalk.gray;

      console.log(`  ${chalk.white(milestone.name)}`);
      console.log(`  ${urgency(`${daysUntil} days away`)}`);
    }
    console.log('');
  }

  console.log(chalk.dim('─'.repeat(50)));
  console.log(chalk.dim('Commands:'));
  console.log(chalk.dim('  ferni rituals morning     - Morning ritual'));
  console.log(chalk.dim('  ferni rituals evening     - Evening ritual'));
  console.log(chalk.dim('  ferni rituals weekly      - Weekly reflection'));
  console.log(chalk.dim('  ferni rituals milestone   - View milestones'));
}

// ============================================================================
// DAILY RITUALS
// ============================================================================

async function showDailyRituals(): Promise<void> {
  const rituals = await getDailyRituals();

  console.log(chalk.bold('\n🌅 Daily Rituals\n'));

  const typeEmoji: Record<DailyRitual['type'], string> = {
    morning: '🌅',
    midday: '☀️',
    evening: '🌙',
  };

  for (const ritual of rituals) {
    const icon = ritual.enabled ? chalk.green('✓') : chalk.gray('○');
    const name = ritual.enabled ? chalk.white(ritual.name) : chalk.gray(ritual.name);
    const streak = ritual.streak > 0 ? chalk.yellow(` 🔥${ritual.streak}`) : '';

    console.log(`${icon} ${typeEmoji[ritual.type]} ${name}${streak}`);
    console.log(`   ${chalk.dim(ritual.description)}`);
    console.log(`   ${chalk.dim(`Frequency: ${ritual.frequency}`)}`);
    if (ritual.timeOfDay) {
      console.log(`   ${chalk.dim(`Time: ${ritual.timeOfDay}`)}`);
    }
    if (ritual.lastCompleted) {
      console.log(`   ${chalk.dim(`Last: ${new Date(ritual.lastCompleted).toLocaleDateString()}`)}`);
    }
    console.log('');
  }

  console.log(chalk.dim('─'.repeat(50)));
  console.log(chalk.dim('Commands:'));
  console.log(chalk.dim('  ferni rituals toggle <id>   - Enable/disable ritual'));
  console.log(chalk.dim('  ferni rituals complete <id> - Mark as complete'));
}

async function showMorningRitual(): Promise<void> {
  const rituals = await getTodaysRituals();
  const morning = rituals.find((r) => r.type === 'morning');

  if (!morning) {
    console.log(chalk.yellow('\n⚠️  No morning ritual enabled'));
    console.log(chalk.dim('Run: ferni rituals daily'));
    return;
  }

  console.log(chalk.bold('\n🌅 Morning Ritual\n'));
  console.log(chalk.hex('#4a6741')(morning.promptTemplate));
  console.log('');

  const today = new Date().toISOString().split('T')[0];
  const completed = morning.completions.some((c) => c.date.startsWith(today));

  if (completed) {
    console.log(chalk.green('✓ Already completed today'));
  } else {
    console.log(chalk.dim('─'.repeat(50)));
    console.log(chalk.dim(`Complete: ferni rituals complete ${morning.id.slice(0, 8)}`));
  }
}

async function showEveningRitual(): Promise<void> {
  const rituals = await getTodaysRituals();
  const evening = rituals.find((r) => r.type === 'evening');

  if (!evening) {
    console.log(chalk.yellow('\n⚠️  No evening ritual enabled'));
    console.log(chalk.dim('Run: ferni rituals daily'));
    return;
  }

  console.log(chalk.bold('\n🌙 Evening Ritual\n'));
  console.log(chalk.hex('#4a6741')(evening.promptTemplate));
  console.log('');

  const today = new Date().toISOString().split('T')[0];
  const completed = evening.completions.some((c) => c.date.startsWith(today));

  if (completed) {
    console.log(chalk.green('✓ Already completed today'));
  } else {
    console.log(chalk.dim('─'.repeat(50)));
    console.log(chalk.dim(`Complete: ferni rituals complete ${evening.id.slice(0, 8)}`));
  }
}

async function doCompleteRitual(id: string, options: { reflection?: string; mood?: number }): Promise<void> {
  const rituals = await getDailyRituals();
  const ritual = rituals.find((r) => r.id.startsWith(id));

  if (!ritual) {
    console.log(chalk.red(`❌ Ritual not found: ${id}`));
    return;
  }

  const completed = await completeRitual(ritual.id, options.reflection, options.mood);
  if (completed) {
    console.log(chalk.green('\n✅ Ritual completed!'));
    console.log(`   ${completed.name}`);
    if (completed.streak > 1) {
      console.log(`   🔥 Streak: ${chalk.yellow(completed.streak)} days`);
    }
    if (options.reflection) {
      console.log(`   Reflection saved`);
    }
  }
}

async function doToggleRitual(id: string): Promise<void> {
  const rituals = await getDailyRituals();
  const ritual = rituals.find((r) => r.id.startsWith(id));

  if (!ritual) {
    console.log(chalk.red(`❌ Ritual not found: ${id}`));
    return;
  }

  const toggled = await toggleRitual(ritual.id);
  if (toggled) {
    const status = toggled.enabled ? chalk.green('enabled') : chalk.gray('disabled');
    console.log(`\n${toggled.name}: ${status}`);
  }
}

// ============================================================================
// WEEKLY REFLECTION
// ============================================================================

async function showWeeklyReflection(): Promise<void> {
  const current = await getCurrentWeekReflection();
  const recent = await getWeeklyReflections(4);

  console.log(chalk.bold('\n📝 Weekly Reflection\n'));

  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  const weekStr = startOfWeek.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  console.log(chalk.cyan.bold(`Week of ${weekStr}`));
  console.log('');

  if (current) {
    console.log(chalk.green('✓ Completed'));
    console.log('');

    if (current.gratitude.length > 0) {
      console.log(chalk.white('Gratitude:'));
      current.gratitude.forEach((g) => console.log(`  • ${g}`));
      console.log('');
    }

    if (current.wins.length > 0) {
      console.log(chalk.white('Wins:'));
      current.wins.forEach((w) => console.log(`  • ${w}`));
      console.log('');
    }

    if (current.intentions.length > 0) {
      console.log(chalk.white('Intentions for next week:'));
      current.intentions.forEach((i) => console.log(`  • ${i}`));
      console.log('');
    }

    console.log(`Overall mood: ${'⭐'.repeat(current.overallMood)}${'☆'.repeat(5 - current.overallMood)}`);
  } else {
    console.log(chalk.yellow('○ Not yet completed'));
    console.log('');
    console.log(chalk.dim('Prompts to reflect on:'));
    console.log(chalk.dim('  • What are you grateful for this week?'));
    console.log(chalk.dim('  • What were your wins?'));
    console.log(chalk.dim('  • What challenges did you face?'));
    console.log(chalk.dim('  • What did you learn?'));
    console.log(chalk.dim('  • What intentions do you set for next week?'));
    console.log('');
    console.log(chalk.dim('─'.repeat(50)));
    console.log(chalk.dim('Create: ferni rituals weekly create'));
  }

  // Show recent reflections
  const past = recent.filter((r) => r.weekOf !== current?.weekOf);
  if (past.length > 0) {
    console.log('');
    console.log(chalk.cyan.bold('Recent Reflections'));
    for (const reflection of past.slice(0, 3)) {
      const weekDate = new Date(reflection.weekOf);
      const label = weekDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const mood = '⭐'.repeat(reflection.overallMood);
      console.log(`  ${label}: ${mood} - ${reflection.wins.length} wins, ${reflection.gratitude.length} gratitudes`);
    }
  }
}

async function createWeeklyReflection(options: {
  gratitude?: string;
  wins?: string;
  challenges?: string;
  learnings?: string;
  intentions?: string;
  mood?: number;
}): Promise<void> {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  const weekOf = startOfWeek.toISOString().split('T')[0];

  const reflection = await saveWeeklyReflection({
    weekOf,
    gratitude: options.gratitude?.split(',').map((s) => s.trim()) || [],
    wins: options.wins?.split(',').map((s) => s.trim()) || [],
    challenges: options.challenges?.split(',').map((s) => s.trim()) || [],
    learnings: options.learnings?.split(',').map((s) => s.trim()) || [],
    intentions: options.intentions?.split(',').map((s) => s.trim()) || [],
    overallMood: options.mood || 3,
    sharedToDiscord: false,
  });

  console.log(chalk.green('\n✅ Weekly reflection saved!'));
  console.log(`   Gratitudes: ${reflection.gratitude.length}`);
  console.log(`   Wins: ${reflection.wins.length}`);
  console.log(`   Intentions: ${reflection.intentions.length}`);
  console.log(`   Mood: ${'⭐'.repeat(reflection.overallMood)}`);
}

// ============================================================================
// MILESTONES
// ============================================================================

async function showMilestones(filter?: string): Promise<void> {
  let milestones: Milestone[];

  switch (filter) {
    case 'upcoming':
      milestones = await getMilestones({ upcoming: true });
      break;
    case 'celebrated':
      milestones = await getMilestones({ celebrated: true });
      break;
    default:
      milestones = await getMilestones();
  }

  console.log(chalk.bold(`\n🎯 Milestones${filter ? ` (${filter})` : ''}\n`));

  if (milestones.length === 0) {
    console.log(chalk.gray('  No milestones found'));
    console.log(chalk.dim('\n  Add a milestone: ferni rituals milestone add'));
    return;
  }

  const typeEmoji: Record<Milestone['type'], string> = {
    user_milestone: '👤',
    product_milestone: '🚀',
    team_milestone: '👥',
    community_milestone: '🏘️',
  };

  for (const milestone of milestones) {
    const icon = milestone.celebrated ? chalk.green('✓') : chalk.yellow('○');
    const date = new Date(milestone.date);
    const isPast = date < new Date();

    const daysAway = Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    const urgency =
      milestone.celebrated
        ? chalk.gray
        : daysAway <= 0
          ? chalk.red
          : daysAway <= 7
            ? chalk.yellow
            : chalk.white;

    console.log(`${icon} ${typeEmoji[milestone.type]} ${urgency(milestone.name)}`);
    console.log(`   ${chalk.dim('Date:')} ${date.toLocaleDateString()}`);
    if (!milestone.celebrated && !isPast) {
      console.log(`   ${chalk.dim('In:')} ${daysAway} days`);
    }
    console.log(`   ${chalk.dim('Type:')} ${milestone.celebrationType}`);
    if (milestone.celebrated && milestone.celebratedAt) {
      console.log(`   ${chalk.dim('Celebrated:')} ${new Date(milestone.celebratedAt).toLocaleDateString()}`);
    }
    console.log('');
  }

  console.log(chalk.dim('─'.repeat(50)));
  console.log(chalk.dim('Commands:'));
  console.log(chalk.dim('  ferni rituals milestone add        - Add milestone'));
  console.log(chalk.dim('  ferni rituals celebrate <id>       - Celebrate milestone'));
}

async function addNewMilestone(options: {
  name: string;
  type?: Milestone['type'];
  description?: string;
  date: string;
  celebrationType?: Milestone['celebrationType'];
}): Promise<void> {
  if (!options.name || !options.date) {
    console.log(chalk.yellow('⚠️  Name and date required'));
    console.log(chalk.dim('Usage: ferni rituals milestone add --name "Milestone" --date "2026-03-01"'));
    return;
  }

  const milestone = await addMilestone({
    name: options.name,
    type: options.type || 'product_milestone',
    description: options.description || '',
    date: options.date,
    celebrationType: options.celebrationType || 'community',
  });

  console.log(chalk.green('\n✅ Milestone added'));
  console.log(`   ID: ${milestone.id.slice(0, 8)}`);
  console.log(`   Name: ${milestone.name}`);
  console.log(`   Date: ${new Date(milestone.date).toLocaleDateString()}`);
}

async function doCelebrateMilestone(id: string, options: { message?: string }): Promise<void> {
  const milestones = await getMilestones();
  const milestone = milestones.find((m) => m.id.startsWith(id));

  if (!milestone) {
    console.log(chalk.red(`❌ Milestone not found: ${id}`));
    return;
  }

  const celebrated = await celebrateMilestone(milestone.id, {
    message: options.message,
  });

  if (celebrated) {
    console.log(chalk.green('\n🎉 Milestone celebrated!'));
    console.log(`   ${celebrated.name}`);
    if (options.message) {
      console.log(`   Message: "${options.message}"`);
    }
  }
}

// ============================================================================
// PROMPTS
// ============================================================================

async function showPrompts(category?: string): Promise<void> {
  const prompts = await getPrompts(category as never);

  console.log(chalk.bold(`\n💭 Reflection Prompts${category ? ` (${category})` : ''}\n`));

  const categoryEmoji: Record<string, string> = {
    gratitude: '🙏',
    reflection: '🪞',
    intention: '🎯',
    celebration: '🎉',
    growth: '🌱',
  };

  const personaColors: Record<string, string> = {
    ferni: '#4a6741',
    maya: '#a67a6a',
    peter: '#3a6b73',
    jordan: '#c4856a',
    alex: '#5a6b8a',
    nayan: '#b8956a',
  };

  const grouped: Record<string, typeof prompts> = {};
  for (const prompt of prompts) {
    if (!grouped[prompt.category]) grouped[prompt.category] = [];
    grouped[prompt.category].push(prompt);
  }

  for (const [cat, catPrompts] of Object.entries(grouped)) {
    console.log(chalk.cyan.bold(`${categoryEmoji[cat] || '📝'} ${cat.charAt(0).toUpperCase() + cat.slice(1)}`));
    for (const prompt of catPrompts) {
      const color = prompt.persona ? personaColors[prompt.persona] : '#4a6741';
      console.log(chalk.hex(color)(`  "${prompt.prompt}"`));
      if (prompt.persona) {
        console.log(chalk.dim(`    — ${prompt.persona}`));
      }
    }
    console.log('');
  }
}

// ============================================================================
// MAIN COMMAND ROUTER
// ============================================================================

export async function rituals(
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
    // Daily rituals
    case 'daily':
      await showDailyRituals();
      break;

    case 'morning':
      await showMorningRitual();
      break;

    case 'evening':
      await showEveningRitual();
      break;

    case 'complete':
      if (subcommand) {
        await doCompleteRitual(subcommand, {
          reflection: options.reflection as string | undefined,
          mood: options.mood as number | undefined,
        });
      } else {
        console.log(chalk.yellow('⚠️  Ritual ID required'));
        console.log(chalk.dim('Usage: ferni rituals complete <id>'));
      }
      break;

    case 'toggle':
      if (subcommand) {
        await doToggleRitual(subcommand);
      } else {
        console.log(chalk.yellow('⚠️  Ritual ID required'));
      }
      break;

    // Weekly reflection
    case 'weekly':
      if (!subcommand || subcommand === 'show') {
        await showWeeklyReflection();
      } else if (subcommand === 'create') {
        await createWeeklyReflection({
          gratitude: options.gratitude as string | undefined,
          wins: options.wins as string | undefined,
          challenges: options.challenges as string | undefined,
          learnings: options.learnings as string | undefined,
          intentions: options.intentions as string | undefined,
          mood: options.mood as number | undefined,
        });
      }
      break;

    // Milestones
    case 'milestone':
    case 'milestones':
      if (!subcommand || subcommand === 'list') {
        await showMilestones(options.filter as string | undefined);
      } else if (subcommand === 'upcoming') {
        await showMilestones('upcoming');
      } else if (subcommand === 'add') {
        await addNewMilestone({
          name: options.name as string,
          type: options.type as Milestone['type'] | undefined,
          description: options.description as string | undefined,
          date: options.date as string,
          celebrationType: options.celebrationType as Milestone['celebrationType'] | undefined,
        });
      }
      break;

    case 'celebrate':
      if (subcommand) {
        await doCelebrateMilestone(subcommand, {
          message: options.message as string | undefined,
        });
      } else {
        console.log(chalk.yellow('⚠️  Milestone ID required'));
        console.log(chalk.dim('Usage: ferni rituals celebrate <id>'));
      }
      break;

    // Prompts
    case 'prompts':
      await showPrompts(subcommand);
      break;

    default:
      console.log(chalk.yellow(`Unknown command: ${command}`));
      console.log(chalk.dim('\nAvailable commands:'));
      console.log(chalk.dim('  ferni rituals          - Dashboard'));
      console.log(chalk.dim('  ferni rituals daily    - Daily rituals'));
      console.log(chalk.dim('  ferni rituals morning  - Morning ritual'));
      console.log(chalk.dim('  ferni rituals evening  - Evening ritual'));
      console.log(chalk.dim('  ferni rituals weekly   - Weekly reflection'));
      console.log(chalk.dim('  ferni rituals milestone - Milestones'));
      console.log(chalk.dim('  ferni rituals prompts  - Reflection prompts'));
  }
}
