/**
 * Community Automation Storage Client
 *
 * Stores community state: Discord config, user stories, ambassadors.
 */

import { homedir } from 'os';
import { join } from 'path';
import { promises as fs } from 'fs';
import { randomUUID } from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

export interface DiscordConfig {
  serverId?: string;
  botToken?: string;
  channels: {
    name: string;
    id?: string;
    category: string;
    purpose: string;
    created: boolean;
  }[];
  roles: {
    name: string;
    id?: string;
    color: string;
    permissions: string[];
    created: boolean;
  }[];
  welcomeMessage?: string;
  rulesMessage?: string;
  setupComplete: boolean;
  lastSync?: string;
}

export interface UserStory {
  id: string;
  userName: string;
  userEmail?: string;
  userHandle?: string;
  story: string;
  persona?: 'ferni' | 'maya' | 'peter' | 'jordan' | 'alex' | 'nayan';
  useCase?: string;
  quote?: string;
  photoUrl?: string;
  approved: boolean;
  featured: boolean;
  consentGiven: boolean;
  source: 'form' | 'discord' | 'email' | 'interview' | 'social';
  submittedAt: string;
  approvedAt?: string;
  publishedAt?: string;
  publishedTo?: string[];
  metrics?: {
    views?: number;
    shares?: number;
    engagement?: number;
  };
}

export interface Ambassador {
  id: string;
  name: string;
  email: string;
  handle?: string;
  platform: 'discord' | 'twitter' | 'tiktok' | 'instagram' | 'youtube';
  tier: 'community' | 'creator' | 'advocate' | 'founding';
  status: 'invited' | 'pending' | 'active' | 'inactive' | 'alumni';
  joinedAt?: string;
  invitedAt: string;
  contributions: {
    type: 'content' | 'moderation' | 'feedback' | 'referral' | 'event';
    description: string;
    date: string;
    impact?: number;
  }[];
  rewards: {
    type: 'swag' | 'feature_access' | 'credit' | 'shoutout';
    description: string;
    grantedAt: string;
  }[];
  notes?: string;
}

export interface CommunityEvent {
  id: string;
  name: string;
  type: 'ama' | 'workshop' | 'launch' | 'celebration' | 'challenge';
  description: string;
  scheduledFor: string;
  platform: 'discord' | 'twitter_spaces' | 'zoom' | 'in_person';
  status: 'planning' | 'announced' | 'live' | 'completed' | 'cancelled';
  attendees?: number;
  recording?: string;
  notes?: string;
  createdAt: string;
}

export interface CommunityMetrics {
  date: string;
  discord?: {
    totalMembers: number;
    activeMembers: number;
    messagesThisWeek: number;
    newJoins: number;
  };
  stories?: {
    submitted: number;
    approved: number;
    published: number;
  };
  ambassadors?: {
    total: number;
    active: number;
    contributions: number;
  };
}

export interface CommunityState {
  discord: DiscordConfig;
  stories: UserStory[];
  ambassadors: Ambassador[];
  events: CommunityEvent[];
  metrics: CommunityMetrics[];
  settings: {
    autoApproveStories: boolean;
    notifyOnNewStory: boolean;
    discordWebhook?: string;
    slackWebhook?: string;
  };
  lastUpdated: string;
}

// ============================================================================
// STORAGE
// ============================================================================

const COMMUNITY_STATE_FILE = join(homedir(), '.ferni', 'community-state.json');

async function ensureDirectory(): Promise<void> {
  const dir = join(homedir(), '.ferni');
  await fs.mkdir(dir, { recursive: true });
}

async function loadState(): Promise<CommunityState> {
  try {
    const data = await fs.readFile(COMMUNITY_STATE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return getDefaultState();
  }
}

async function saveState(state: CommunityState): Promise<void> {
  await ensureDirectory();
  state.lastUpdated = new Date().toISOString();
  await fs.writeFile(COMMUNITY_STATE_FILE, JSON.stringify(state, null, 2));
}

function getDefaultState(): CommunityState {
  return {
    discord: getDefaultDiscordConfig(),
    stories: [],
    ambassadors: [],
    events: [],
    metrics: [],
    settings: {
      autoApproveStories: false,
      notifyOnNewStory: true,
    },
    lastUpdated: new Date().toISOString(),
  };
}

// Default Discord server structure from COMMUNITY-PLAYBOOK.md
function getDefaultDiscordConfig(): DiscordConfig {
  return {
    channels: [
      // WELCOME
      { name: 'welcome', category: 'WELCOME', purpose: 'Auto-welcome, rules', created: false },
      { name: 'introduce-yourself', category: 'WELCOME', purpose: 'New member intros', created: false },
      { name: 'faq', category: 'WELCOME', purpose: 'Common questions', created: false },
      // GENERAL
      { name: 'general-chat', category: 'GENERAL', purpose: 'Main discussion', created: false },
      { name: 'daily-wins', category: 'GENERAL', purpose: 'Share today\'s wins', created: false },
      { name: 'weekly-reflections', category: 'GENERAL', purpose: 'Deeper sharing (Sunday tradition)', created: false },
      { name: 'off-topic', category: 'GENERAL', purpose: 'Non-Ferni chat', created: false },
      // PERSONAS
      { name: 'ferni-life-coaching', category: 'PERSONAS', purpose: 'Ferni-related discussion', created: false },
      { name: 'maya-habits', category: 'PERSONAS', purpose: 'Habit tracking support', created: false },
      { name: 'peter-research', category: 'PERSONAS', purpose: 'Deep dives, data discussions', created: false },
      { name: 'alex-communication', category: 'PERSONAS', purpose: 'Relationship help', created: false },
      { name: 'jordan-celebrations', category: 'PERSONAS', purpose: 'Event planning, milestones', created: false },
      { name: 'nayan-wisdom', category: 'PERSONAS', purpose: 'Big questions', created: false },
      // FEEDBACK
      { name: 'feature-requests', category: 'FEEDBACK', purpose: 'Product suggestions', created: false },
      { name: 'bugs', category: 'FEEDBACK', purpose: 'Issue reporting', created: false },
      { name: 'phrase-workshop', category: 'FEEDBACK', purpose: 'Suggest Ferni responses', created: false },
      { name: 'beta-testing', category: 'FEEDBACK', purpose: 'Early access program', created: false },
      // CREATORS
      { name: 'fan-art', category: 'CREATORS', purpose: 'Visual creations', created: false },
      { name: 'stories', category: 'CREATORS', purpose: 'Written content', created: false },
      { name: 'showcase', category: 'CREATORS', purpose: 'Show what you\'ve made', created: false },
      { name: 'collaborations', category: 'CREATORS', purpose: 'Work together', created: false },
      // AMBASSADORS (Private)
      { name: 'ambassador-chat', category: 'AMBASSADORS', purpose: 'Ambassador-only discussion', created: false },
      { name: 'feedback-direct', category: 'AMBASSADORS', purpose: 'Direct line to team', created: false },
      { name: 'ambassador-resources', category: 'AMBASSADORS', purpose: 'Tools and guidelines', created: false },
    ],
    roles: [
      { name: 'Ferni Team', color: '#4a6741', permissions: ['admin'], created: false },
      { name: 'Ambassador', color: '#c4856a', permissions: ['manage_messages'], created: false },
      { name: 'Beta Tester', color: '#3a6b73', permissions: ['view_beta'], created: false },
      { name: 'Community Member', color: '#8a7a6a', permissions: [], created: false },
    ],
    welcomeMessage: `Welcome to the Ferni community! 🌿

We believe in making AI human—and we're glad you're here.

**Getting Started:**
1. Read our community guidelines in #welcome
2. Introduce yourself in #introduce-yourself
3. Share a win in #daily-wins

**Persona Channels:**
Pick the persona that resonates with you and join their channel:
- #ferni-life-coaching - General life guidance
- #maya-habits - Habit building & wellness
- #peter-research - Data & deep dives
- #alex-communication - Relationships & communication
- #jordan-celebrations - Milestones & events
- #nayan-wisdom - Big life questions

We're so happy you're here. 💚`,
    rulesMessage: `**Community Guidelines**

1. **Be human** — Treat others with the same warmth Ferni shows you
2. **Respect privacy** — What's shared here stays here
3. **Support growth** — Celebrate wins, support struggles
4. **No judgment** — We all have different journeys
5. **Constructive feedback** — Build up, don't tear down

Breaking these guidelines may result in warnings or removal from the community.`,
    setupComplete: false,
  };
}

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

// Discord
export async function getDiscordConfig(): Promise<DiscordConfig> {
  const state = await loadState();
  return state.discord;
}

export async function updateDiscordConfig(updates: Partial<DiscordConfig>): Promise<DiscordConfig> {
  const state = await loadState();
  state.discord = { ...state.discord, ...updates };
  await saveState(state);
  return state.discord;
}

export async function markChannelCreated(channelName: string, channelId: string): Promise<void> {
  const state = await loadState();
  const channel = state.discord.channels.find((c) => c.name === channelName);
  if (channel) {
    channel.created = true;
    channel.id = channelId;
  }
  await saveState(state);
}

// User Stories
export async function getStories(filter?: { approved?: boolean; featured?: boolean; source?: UserStory['source'] }): Promise<UserStory[]> {
  const state = await loadState();
  let stories = state.stories;

  if (filter?.approved !== undefined) {
    stories = stories.filter((s) => s.approved === filter.approved);
  }
  if (filter?.featured !== undefined) {
    stories = stories.filter((s) => s.featured === filter.featured);
  }
  if (filter?.source) {
    stories = stories.filter((s) => s.source === filter.source);
  }

  return stories;
}

export async function addStory(story: Omit<UserStory, 'id' | 'submittedAt'>): Promise<UserStory> {
  const state = await loadState();
  const newStory: UserStory = {
    ...story,
    id: randomUUID(),
    submittedAt: new Date().toISOString(),
  };
  state.stories.push(newStory);
  await saveState(state);
  return newStory;
}

export async function approveStory(id: string, featured: boolean = false): Promise<UserStory | null> {
  const state = await loadState();
  const story = state.stories.find((s) => s.id === id);
  if (!story) return null;

  story.approved = true;
  story.approvedAt = new Date().toISOString();
  story.featured = featured;

  await saveState(state);
  return story;
}

export async function publishStory(id: string, platforms: string[]): Promise<UserStory | null> {
  const state = await loadState();
  const story = state.stories.find((s) => s.id === id);
  if (!story) return null;

  story.publishedAt = new Date().toISOString();
  story.publishedTo = [...(story.publishedTo || []), ...platforms];

  await saveState(state);
  return story;
}

// Ambassadors
export async function getAmbassadors(filter?: { status?: Ambassador['status']; tier?: Ambassador['tier'] }): Promise<Ambassador[]> {
  const state = await loadState();
  let ambassadors = state.ambassadors;

  if (filter?.status) {
    ambassadors = ambassadors.filter((a) => a.status === filter.status);
  }
  if (filter?.tier) {
    ambassadors = ambassadors.filter((a) => a.tier === filter.tier);
  }

  return ambassadors;
}

export async function addAmbassador(ambassador: Omit<Ambassador, 'id' | 'invitedAt' | 'contributions' | 'rewards'>): Promise<Ambassador> {
  const state = await loadState();
  const newAmbassador: Ambassador = {
    ...ambassador,
    id: randomUUID(),
    invitedAt: new Date().toISOString(),
    contributions: [],
    rewards: [],
  };
  state.ambassadors.push(newAmbassador);
  await saveState(state);
  return newAmbassador;
}

export async function updateAmbassador(id: string, updates: Partial<Ambassador>): Promise<Ambassador | null> {
  const state = await loadState();
  const index = state.ambassadors.findIndex((a) => a.id === id);
  if (index === -1) return null;

  state.ambassadors[index] = { ...state.ambassadors[index], ...updates };
  await saveState(state);
  return state.ambassadors[index];
}

export async function addContribution(ambassadorId: string, contribution: Ambassador['contributions'][0]): Promise<boolean> {
  const state = await loadState();
  const ambassador = state.ambassadors.find((a) => a.id === ambassadorId);
  if (!ambassador) return false;

  ambassador.contributions.push(contribution);
  await saveState(state);
  return true;
}

// Events
export async function getEvents(status?: CommunityEvent['status']): Promise<CommunityEvent[]> {
  const state = await loadState();
  return status ? state.events.filter((e) => e.status === status) : state.events;
}

export async function addEvent(event: Omit<CommunityEvent, 'id' | 'createdAt'>): Promise<CommunityEvent> {
  const state = await loadState();
  const newEvent: CommunityEvent = {
    ...event,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };
  state.events.push(newEvent);
  await saveState(state);
  return newEvent;
}

// Dashboard
export async function getDashboard(): Promise<{
  discord: { setupComplete: boolean; channelsCreated: number; totalChannels: number };
  stories: { total: number; pending: number; approved: number; featured: number };
  ambassadors: { total: number; active: number; invited: number };
  events: { upcoming: number; completed: number };
}> {
  const state = await loadState();

  const upcomingEvents = state.events.filter(
    (e) => e.status === 'planning' || e.status === 'announced'
  );

  return {
    discord: {
      setupComplete: state.discord.setupComplete,
      channelsCreated: state.discord.channels.filter((c) => c.created).length,
      totalChannels: state.discord.channels.length,
    },
    stories: {
      total: state.stories.length,
      pending: state.stories.filter((s) => !s.approved).length,
      approved: state.stories.filter((s) => s.approved).length,
      featured: state.stories.filter((s) => s.featured).length,
    },
    ambassadors: {
      total: state.ambassadors.length,
      active: state.ambassadors.filter((a) => a.status === 'active').length,
      invited: state.ambassadors.filter((a) => a.status === 'invited').length,
    },
    events: {
      upcoming: upcomingEvents.length,
      completed: state.events.filter((e) => e.status === 'completed').length,
    },
  };
}

// Reset (for testing)
export async function resetState(): Promise<void> {
  await saveState(getDefaultState());
}
