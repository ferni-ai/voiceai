/**
 * Rituals Storage Client
 *
 * Stores ritual state: daily rituals, weekly reflections, milestones.
 */

import { homedir } from 'os';
import { join } from 'path';
import { promises as fs } from 'fs';
import { randomUUID } from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

export interface DailyRitual {
  id: string;
  type: 'morning' | 'evening' | 'midday';
  name: string;
  description: string;
  promptTemplate: string;
  frequency: 'daily' | 'weekdays' | 'weekends';
  timeOfDay?: string; // HH:MM format
  enabled: boolean;
  lastCompleted?: string;
  streak: number;
  completions: {
    date: string;
    reflection?: string;
    mood?: number; // 1-5
  }[];
}

export interface WeeklyReflection {
  id: string;
  weekOf: string; // ISO date of the week start
  theme?: string;
  gratitude: string[];
  wins: string[];
  challenges: string[];
  learnings: string[];
  intentions: string[];
  overallMood: number; // 1-5
  sharedToDiscord: boolean;
  createdAt: string;
}

export interface Milestone {
  id: string;
  type:
    | 'user_milestone' // User achievement
    | 'product_milestone' // Feature launch, user count
    | 'team_milestone' // Team anniversary
    | 'community_milestone'; // Discord members, stories
  name: string;
  description: string;
  date: string;
  celebrationType: 'private' | 'community' | 'public';
  celebrationContent?: {
    message?: string;
    image?: string;
    socialPost?: string;
  };
  celebrated: boolean;
  celebratedAt?: string;
  associatedUserId?: string;
  metrics?: Record<string, number>;
  createdAt: string;
}

export interface RitualPrompt {
  id: string;
  category: 'gratitude' | 'reflection' | 'intention' | 'celebration' | 'growth';
  prompt: string;
  persona?: 'ferni' | 'maya' | 'peter' | 'jordan' | 'alex' | 'nayan';
  dayOfWeek?: number; // 0-6, Sunday-Saturday
  isActive: boolean;
}

export interface RitualsState {
  dailyRituals: DailyRitual[];
  weeklyReflections: WeeklyReflection[];
  milestones: Milestone[];
  prompts: RitualPrompt[];
  settings: {
    dailyReminderTime?: string;
    weeklyReflectionDay: number; // 0 = Sunday
    discordChannelId?: string;
    enableNotifications: boolean;
  };
  lastUpdated: string;
}

// ============================================================================
// STORAGE
// ============================================================================

const RITUALS_STATE_FILE = join(homedir(), '.ferni', 'rituals-state.json');

async function ensureDirectory(): Promise<void> {
  const dir = join(homedir(), '.ferni');
  await fs.mkdir(dir, { recursive: true });
}

async function loadState(): Promise<RitualsState> {
  try {
    const data = await fs.readFile(RITUALS_STATE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return getDefaultState();
  }
}

async function saveState(state: RitualsState): Promise<void> {
  await ensureDirectory();
  state.lastUpdated = new Date().toISOString();
  await fs.writeFile(RITUALS_STATE_FILE, JSON.stringify(state, null, 2));
}

function getDefaultState(): RitualsState {
  return {
    dailyRituals: getDefaultDailyRituals(),
    weeklyReflections: [],
    milestones: getDefaultMilestones(),
    prompts: getDefaultPrompts(),
    settings: {
      weeklyReflectionDay: 0, // Sunday
      enableNotifications: true,
    },
    lastUpdated: new Date().toISOString(),
  };
}

// ============================================================================
// DEFAULT DATA (from Brand Evolution Plan)
// ============================================================================

function getDefaultDailyRituals(): DailyRitual[] {
  return [
    {
      id: randomUUID(),
      type: 'morning',
      name: 'Morning Intention',
      description: 'Start your day with clarity and purpose',
      promptTemplate: `Good morning! 🌅

Take a moment to set your intention for today:

1. What's one thing that would make today great?
2. What energy do you want to bring?
3. Who might you connect with?

Share your morning intention with the community in #daily-wins`,
      frequency: 'daily',
      timeOfDay: '07:00',
      enabled: true,
      streak: 0,
      completions: [],
    },
    {
      id: randomUUID(),
      type: 'evening',
      name: 'Evening Reflection',
      description: 'Close the day with gratitude and learning',
      promptTemplate: `Good evening! 🌙

Before you rest, reflect on today:

1. What went well today?
2. What did you learn?
3. What are you grateful for?

A moment of reflection makes tomorrow better.`,
      frequency: 'daily',
      timeOfDay: '21:00',
      enabled: true,
      streak: 0,
      completions: [],
    },
    {
      id: randomUUID(),
      type: 'midday',
      name: 'Midday Check-In',
      description: 'A brief pause to recenter',
      promptTemplate: `Quick check-in! 🌤️

How are you doing right now?

1. Energy level (1-5)?
2. How's your focus?
3. Do you need a break?

Sometimes the best thing is a 5-minute pause.`,
      frequency: 'weekdays',
      timeOfDay: '12:00',
      enabled: false,
      streak: 0,
      completions: [],
    },
  ];
}

function getDefaultMilestones(): Milestone[] {
  const now = new Date();
  const year = now.getFullYear();

  return [
    {
      id: randomUUID(),
      type: 'product_milestone',
      name: 'Public Beta Launch',
      description: 'Ferni becomes available to the world',
      date: `${year}-03-01`,
      celebrationType: 'public',
      celebrated: false,
      createdAt: now.toISOString(),
    },
    {
      id: randomUUID(),
      type: 'community_milestone',
      name: 'First 100 Discord Members',
      description: 'Our community grows to 100 humans',
      date: `${year}-04-01`,
      celebrationType: 'community',
      celebrated: false,
      createdAt: now.toISOString(),
    },
    {
      id: randomUUID(),
      type: 'community_milestone',
      name: 'First 1,000 Users',
      description: '1,000 people using Ferni daily',
      date: `${year}-06-01`,
      celebrationType: 'public',
      celebrated: false,
      createdAt: now.toISOString(),
    },
    {
      id: randomUUID(),
      type: 'product_milestone',
      name: 'Full Team Launch',
      description: 'All 6 personas available',
      date: `${year}-05-01`,
      celebrationType: 'public',
      celebrated: false,
      createdAt: now.toISOString(),
    },
  ];
}

function getDefaultPrompts(): RitualPrompt[] {
  return [
    // Gratitude
    {
      id: randomUUID(),
      category: 'gratitude',
      prompt: "What's something small that brought you joy today?",
      persona: 'ferni',
      isActive: true,
    },
    {
      id: randomUUID(),
      category: 'gratitude',
      prompt: "Who's someone who helped you recently, even in a small way?",
      persona: 'alex',
      isActive: true,
    },
    {
      id: randomUUID(),
      category: 'gratitude',
      prompt: "What's a habit that's serving you well right now?",
      persona: 'maya',
      isActive: true,
    },

    // Reflection
    {
      id: randomUUID(),
      category: 'reflection',
      prompt: "What pattern have you noticed in yourself this week?",
      persona: 'peter',
      dayOfWeek: 0, // Sunday
      isActive: true,
    },
    {
      id: randomUUID(),
      category: 'reflection',
      prompt: "What would you tell your past self from a month ago?",
      persona: 'nayan',
      dayOfWeek: 0,
      isActive: true,
    },

    // Intention
    {
      id: randomUUID(),
      category: 'intention',
      prompt: "What's one thing you're committed to this week?",
      persona: 'maya',
      dayOfWeek: 1, // Monday
      isActive: true,
    },
    {
      id: randomUUID(),
      category: 'intention',
      prompt: "What conversation do you need to have this week?",
      persona: 'alex',
      dayOfWeek: 1,
      isActive: true,
    },

    // Celebration
    {
      id: randomUUID(),
      category: 'celebration',
      prompt: "What win deserves acknowledgment today?",
      persona: 'jordan',
      isActive: true,
    },
    {
      id: randomUUID(),
      category: 'celebration',
      prompt: "What progress have you made that you haven't celebrated yet?",
      persona: 'jordan',
      dayOfWeek: 5, // Friday
      isActive: true,
    },

    // Growth
    {
      id: randomUUID(),
      category: 'growth',
      prompt: "What's something that challenged you recently and what did it teach you?",
      persona: 'ferni',
      isActive: true,
    },
    {
      id: randomUUID(),
      category: 'growth',
      prompt: "What belief about yourself are you reconsidering?",
      persona: 'nayan',
      isActive: true,
    },
  ];
}

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

// Daily Rituals
export async function getDailyRituals(): Promise<DailyRitual[]> {
  const state = await loadState();
  return state.dailyRituals;
}

export async function getTodaysRituals(): Promise<DailyRitual[]> {
  const state = await loadState();
  const today = new Date();
  const isWeekend = today.getDay() === 0 || today.getDay() === 6;

  return state.dailyRituals.filter((ritual) => {
    if (!ritual.enabled) return false;
    if (ritual.frequency === 'weekdays' && isWeekend) return false;
    if (ritual.frequency === 'weekends' && !isWeekend) return false;
    return true;
  });
}

export async function completeRitual(
  ritualId: string,
  reflection?: string,
  mood?: number
): Promise<DailyRitual | null> {
  const state = await loadState();
  const ritual = state.dailyRituals.find((r) => r.id === ritualId);
  if (!ritual) return null;

  const today = new Date().toISOString().split('T')[0];

  // Check if already completed today
  const alreadyCompleted = ritual.completions.some((c) => c.date.startsWith(today));
  if (alreadyCompleted) {
    // Update today's completion
    const completion = ritual.completions.find((c) => c.date.startsWith(today));
    if (completion) {
      completion.reflection = reflection;
      completion.mood = mood;
    }
  } else {
    // Add new completion
    ritual.completions.push({
      date: new Date().toISOString(),
      reflection,
      mood,
    });

    // Update streak
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const completedYesterday = ritual.completions.some((c) => c.date.startsWith(yesterdayStr));

    ritual.streak = completedYesterday ? ritual.streak + 1 : 1;
  }

  ritual.lastCompleted = new Date().toISOString();
  await saveState(state);
  return ritual;
}

export async function toggleRitual(ritualId: string): Promise<DailyRitual | null> {
  const state = await loadState();
  const ritual = state.dailyRituals.find((r) => r.id === ritualId);
  if (!ritual) return null;

  ritual.enabled = !ritual.enabled;
  await saveState(state);
  return ritual;
}

// Weekly Reflections
export async function getWeeklyReflections(limit?: number): Promise<WeeklyReflection[]> {
  const state = await loadState();
  const reflections = state.weeklyReflections.sort(
    (a, b) => new Date(b.weekOf).getTime() - new Date(a.weekOf).getTime()
  );
  return limit ? reflections.slice(0, limit) : reflections;
}

export async function getCurrentWeekReflection(): Promise<WeeklyReflection | null> {
  const state = await loadState();
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const weekOfStr = startOfWeek.toISOString().split('T')[0];

  return state.weeklyReflections.find((r) => r.weekOf === weekOfStr) || null;
}

export async function saveWeeklyReflection(
  reflection: Omit<WeeklyReflection, 'id' | 'createdAt'>
): Promise<WeeklyReflection> {
  const state = await loadState();

  // Check if reflection exists for this week
  const existingIndex = state.weeklyReflections.findIndex((r) => r.weekOf === reflection.weekOf);

  if (existingIndex >= 0) {
    // Update existing
    state.weeklyReflections[existingIndex] = {
      ...state.weeklyReflections[existingIndex],
      ...reflection,
    };
    await saveState(state);
    return state.weeklyReflections[existingIndex];
  }

  // Create new
  const newReflection: WeeklyReflection = {
    ...reflection,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };
  state.weeklyReflections.push(newReflection);
  await saveState(state);
  return newReflection;
}

// Milestones
export async function getMilestones(filter?: {
  type?: Milestone['type'];
  celebrated?: boolean;
  upcoming?: boolean;
}): Promise<Milestone[]> {
  const state = await loadState();
  let milestones = state.milestones;

  if (filter?.type) {
    milestones = milestones.filter((m) => m.type === filter.type);
  }
  if (filter?.celebrated !== undefined) {
    milestones = milestones.filter((m) => m.celebrated === filter.celebrated);
  }
  if (filter?.upcoming) {
    const now = new Date().toISOString();
    milestones = milestones.filter((m) => m.date > now && !m.celebrated);
  }

  return milestones.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export async function addMilestone(milestone: Omit<Milestone, 'id' | 'createdAt' | 'celebrated'>): Promise<Milestone> {
  const state = await loadState();
  const newMilestone: Milestone = {
    ...milestone,
    id: randomUUID(),
    celebrated: false,
    createdAt: new Date().toISOString(),
  };
  state.milestones.push(newMilestone);
  await saveState(state);
  return newMilestone;
}

export async function celebrateMilestone(
  id: string,
  content?: Milestone['celebrationContent']
): Promise<Milestone | null> {
  const state = await loadState();
  const milestone = state.milestones.find((m) => m.id === id);
  if (!milestone) return null;

  milestone.celebrated = true;
  milestone.celebratedAt = new Date().toISOString();
  if (content) {
    milestone.celebrationContent = content;
  }

  await saveState(state);
  return milestone;
}

// Prompts
export async function getPrompts(category?: RitualPrompt['category']): Promise<RitualPrompt[]> {
  const state = await loadState();
  let prompts = state.prompts.filter((p) => p.isActive);

  if (category) {
    prompts = prompts.filter((p) => p.category === category);
  }

  return prompts;
}

export async function getTodaysPrompt(): Promise<RitualPrompt | null> {
  const state = await loadState();
  const today = new Date().getDay();

  // Find prompts for today
  const todaysPrompts = state.prompts.filter(
    (p) => p.isActive && (p.dayOfWeek === undefined || p.dayOfWeek === today)
  );

  if (todaysPrompts.length === 0) return null;

  // Return a random one
  return todaysPrompts[Math.floor(Math.random() * todaysPrompts.length)];
}

// Dashboard
export async function getRitualsDashboard(): Promise<{
  today: {
    rituals: DailyRitual[];
    completed: number;
    prompt: RitualPrompt | null;
  };
  streaks: { ritual: string; streak: number }[];
  upcomingMilestones: Milestone[];
  weeklyReflectionStatus: 'pending' | 'completed';
}> {
  const todaysRituals = await getTodaysRituals();
  const todaysPrompt = await getTodaysPrompt();
  const upcomingMilestones = await getMilestones({ upcoming: true });
  const currentReflection = await getCurrentWeekReflection();

  const today = new Date().toISOString().split('T')[0];
  const completedToday = todaysRituals.filter((r) =>
    r.completions.some((c) => c.date.startsWith(today))
  ).length;

  const streaks = todaysRituals
    .filter((r) => r.streak > 0)
    .map((r) => ({ ritual: r.name, streak: r.streak }))
    .sort((a, b) => b.streak - a.streak);

  return {
    today: {
      rituals: todaysRituals,
      completed: completedToday,
      prompt: todaysPrompt,
    },
    streaks,
    upcomingMilestones: upcomingMilestones.slice(0, 3),
    weeklyReflectionStatus: currentReflection ? 'completed' : 'pending',
  };
}

// Reset (for testing)
export async function resetState(): Promise<void> {
  await saveState(getDefaultState());
}
