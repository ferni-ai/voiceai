/**
 * Growth Automation Storage Client
 *
 * Stores growth campaign state, content queue, analytics, and schedules.
 * Uses local JSON storage for simplicity - can be upgraded to Firestore.
 */

import { homedir } from 'os';
import { join } from 'path';
import { promises as fs } from 'fs';

// ============================================================================
// TYPES
// ============================================================================

export interface TikTokAccount {
  id: string;
  handle: string;
  angle: 'main' | 'motivation' | 'productivity' | 'emotional' | 'comparison';
  description: string;
  followers?: number;
  createdAt: string;
}

export interface ContentPiece {
  id: string;
  platform: 'tiktok' | 'reddit' | 'blog' | 'twitter';
  type: 'video_script' | 'post' | 'article' | 'comment' | 'email';
  title?: string;
  content: string;
  hook?: string;
  cta?: string;
  hashtags?: string[];
  status: 'draft' | 'scheduled' | 'posted' | 'failed';
  scheduledFor?: string;
  postedAt?: string;
  accountId?: string;
  metrics?: {
    views?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    signups?: number;
  };
  createdAt: string;
}

export interface InfluencerLead {
  id: string;
  name: string;
  handle: string;
  platform: 'tiktok' | 'instagram' | 'youtube' | 'twitter';
  followers: number;
  tier: 'nano' | 'micro' | 'mid' | 'macro';
  category: string;
  email?: string;
  status: 'researched' | 'contacted' | 'responded' | 'negotiating' | 'confirmed' | 'live' | 'declined';
  notes?: string;
  lastContactDate?: string;
  contentLiveDate?: string;
  trackingCode?: string;
  signups?: number;
  cost?: number;
  createdAt: string;
}

export interface SEOArticle {
  id: string;
  title: string;
  slug: string;
  targetKeyword: string;
  secondaryKeywords?: string[];
  outline?: string[];
  content?: string;
  wordCount?: number;
  status: 'planned' | 'outlined' | 'drafted' | 'published';
  publishedAt?: string;
  url?: string;
  metrics?: {
    organicTraffic?: number;
    rankings?: Record<string, number>;
    signups?: number;
  };
  createdAt: string;
}

export interface RedditAccount {
  id: string;
  username: string;
  karma: number;
  subreddits: string[];
  lastActivity?: string;
  createdAt: string;
}

export interface GrowthCampaign {
  id: string;
  name: string;
  channel: 'tiktok' | 'seo' | 'reddit' | 'influencer' | 'producthunt';
  status: 'planning' | 'active' | 'paused' | 'completed';
  startDate: string;
  endDate?: string;
  goals: {
    metric: string;
    target: number;
    current: number;
  }[];
  createdAt: string;
}

export interface GrowthMetrics {
  date: string;
  tiktok?: {
    totalFollowers: number;
    totalViews: number;
    signups: number;
  };
  seo?: {
    organicSessions: number;
    keywordsRanking: number;
    signups: number;
  };
  reddit?: {
    karma: number;
    signups: number;
  };
  influencer?: {
    activePartnerships: number;
    contentLive: number;
    signups: number;
  };
  total: {
    signups: number;
    spend: number;
    cac: number;
  };
}

export interface ScheduledTask {
  id: string;
  type: 'post_content' | 'send_outreach' | 'check_metrics' | 'generate_content' | 'engage_reddit';
  data: Record<string, unknown>;
  scheduledFor: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  error?: string;
  createdAt: string;
}

export interface GrowthState {
  tiktokAccounts: TikTokAccount[];
  contentQueue: ContentPiece[];
  influencerLeads: InfluencerLead[];
  seoArticles: SEOArticle[];
  redditAccounts: RedditAccount[];
  campaigns: GrowthCampaign[];
  metrics: GrowthMetrics[];
  scheduledTasks: ScheduledTask[];
  settings: {
    autoPost: boolean;
    autoEngage: boolean;
    autoGenerate: boolean;
    contentPerDay: number;
    engagementPerDay: number;
    openaiApiKey?: string;
    anthropicApiKey?: string;
    // Reddit OAuth credentials
    redditClientId?: string;
    redditClientSecret?: string;
    redditUsername?: string;
    redditPassword?: string;
    // TikTok API credentials (requires Business Account)
    tiktokAccessToken?: string;
    tiktokOpenId?: string;
    // Email (Resend) credentials
    resendApiKey?: string;
    emailFromAddress?: string;
    emailFromName?: string;
  };
  lastSync: string;
}

// ============================================================================
// STORAGE PATH
// ============================================================================

const CONFIG_DIR = join(homedir(), '.ferni');
const GROWTH_FILE = join(CONFIG_DIR, 'growth-state.json');

async function ensureConfigDir(): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

function defaultState(): GrowthState {
  return {
    tiktokAccounts: [],
    contentQueue: [],
    influencerLeads: [],
    seoArticles: [],
    redditAccounts: [],
    campaigns: [],
    metrics: [],
    scheduledTasks: [],
    settings: {
      autoPost: false,
      autoEngage: false,
      autoGenerate: false,
      contentPerDay: 10,
      engagementPerDay: 20,
    },
    lastSync: new Date().toISOString(),
  };
}

export async function loadGrowthState(): Promise<GrowthState> {
  try {
    await ensureConfigDir();
    const data = await fs.readFile(GROWTH_FILE, 'utf-8');
    return { ...defaultState(), ...JSON.parse(data) };
  } catch {
    return defaultState();
  }
}

export async function saveGrowthState(state: GrowthState): Promise<void> {
  await ensureConfigDir();
  state.lastSync = new Date().toISOString();
  await fs.writeFile(GROWTH_FILE, JSON.stringify(state, null, 2));
}

// ============================================================================
// TIKTOK ACCOUNTS
// ============================================================================

export async function addTikTokAccount(
  handle: string,
  angle: TikTokAccount['angle'],
  description: string
): Promise<TikTokAccount> {
  const state = await loadGrowthState();
  const account: TikTokAccount = {
    id: generateId(),
    handle,
    angle,
    description,
    createdAt: new Date().toISOString(),
  };
  state.tiktokAccounts.push(account);
  await saveGrowthState(state);
  return account;
}

export async function getTikTokAccounts(): Promise<TikTokAccount[]> {
  const state = await loadGrowthState();
  return state.tiktokAccounts;
}

export async function updateTikTokMetrics(accountId: string, followers: number): Promise<void> {
  const state = await loadGrowthState();
  const account = state.tiktokAccounts.find((a) => a.id === accountId);
  if (account) {
    account.followers = followers;
    await saveGrowthState(state);
  }
}

// ============================================================================
// CONTENT QUEUE
// ============================================================================

export async function addContent(content: Omit<ContentPiece, 'id' | 'createdAt' | 'status'>): Promise<ContentPiece> {
  const state = await loadGrowthState();
  const piece: ContentPiece = {
    ...content,
    id: generateId(),
    status: 'draft',
    createdAt: new Date().toISOString(),
  };
  state.contentQueue.push(piece);
  await saveGrowthState(state);
  return piece;
}

export async function getContentQueue(
  options: { platform?: string; status?: string; limit?: number } = {}
): Promise<ContentPiece[]> {
  const state = await loadGrowthState();
  let content = state.contentQueue;

  if (options.platform) {
    content = content.filter((c) => c.platform === options.platform);
  }
  if (options.status) {
    content = content.filter((c) => c.status === options.status);
  }

  // Sort by scheduledFor or createdAt
  content.sort((a, b) => {
    const dateA = a.scheduledFor || a.createdAt;
    const dateB = b.scheduledFor || b.createdAt;
    return new Date(dateA).getTime() - new Date(dateB).getTime();
  });

  if (options.limit) {
    content = content.slice(0, options.limit);
  }

  return content;
}

export async function updateContentStatus(
  contentId: string,
  status: ContentPiece['status'],
  metrics?: ContentPiece['metrics']
): Promise<void> {
  const state = await loadGrowthState();
  const content = state.contentQueue.find((c) => c.id === contentId);
  if (content) {
    content.status = status;
    if (status === 'posted') {
      content.postedAt = new Date().toISOString();
    }
    if (metrics) {
      content.metrics = { ...content.metrics, ...metrics };
    }
    await saveGrowthState(state);
  }
}

export async function scheduleContent(contentId: string, scheduledFor: string, accountId?: string): Promise<void> {
  const state = await loadGrowthState();
  const content = state.contentQueue.find((c) => c.id === contentId);
  if (content) {
    content.status = 'scheduled';
    content.scheduledFor = scheduledFor;
    if (accountId) content.accountId = accountId;
    await saveGrowthState(state);
  }
}

// ============================================================================
// INFLUENCER LEADS
// ============================================================================

export async function addInfluencerLead(
  lead: Omit<InfluencerLead, 'id' | 'createdAt' | 'status'>
): Promise<InfluencerLead> {
  const state = await loadGrowthState();
  const influencer: InfluencerLead = {
    ...lead,
    id: generateId(),
    status: 'researched',
    createdAt: new Date().toISOString(),
  };
  state.influencerLeads.push(influencer);
  await saveGrowthState(state);
  return influencer;
}

export async function getInfluencerLeads(
  options: { tier?: string; status?: string; platform?: string } = {}
): Promise<InfluencerLead[]> {
  const state = await loadGrowthState();
  let leads = state.influencerLeads;

  if (options.tier) leads = leads.filter((l) => l.tier === options.tier);
  if (options.status) leads = leads.filter((l) => l.status === options.status);
  if (options.platform) leads = leads.filter((l) => l.platform === options.platform);

  return leads;
}

export async function updateInfluencerStatus(
  leadId: string,
  status: InfluencerLead['status'],
  updates?: Partial<InfluencerLead>
): Promise<void> {
  const state = await loadGrowthState();
  const lead = state.influencerLeads.find((l) => l.id === leadId);
  if (lead) {
    lead.status = status;
    if (status === 'contacted') {
      lead.lastContactDate = new Date().toISOString();
    }
    if (updates) {
      Object.assign(lead, updates);
    }
    await saveGrowthState(state);
  }
}

// ============================================================================
// SEO ARTICLES
// ============================================================================

export async function addSEOArticle(article: Omit<SEOArticle, 'id' | 'createdAt' | 'status'>): Promise<SEOArticle> {
  const state = await loadGrowthState();
  const seoArticle: SEOArticle = {
    ...article,
    id: generateId(),
    status: 'planned',
    createdAt: new Date().toISOString(),
  };
  state.seoArticles.push(seoArticle);
  await saveGrowthState(state);
  return seoArticle;
}

export async function getSEOArticles(options: { status?: string } = {}): Promise<SEOArticle[]> {
  const state = await loadGrowthState();
  let articles = state.seoArticles;

  if (options.status) articles = articles.filter((a) => a.status === options.status);

  return articles;
}

export async function updateSEOArticle(articleId: string, updates: Partial<SEOArticle>): Promise<void> {
  const state = await loadGrowthState();
  const article = state.seoArticles.find((a) => a.id === articleId);
  if (article) {
    Object.assign(article, updates);
    await saveGrowthState(state);
  }
}

// ============================================================================
// SCHEDULED TASKS
// ============================================================================

export async function scheduleTask(
  type: ScheduledTask['type'],
  data: Record<string, unknown>,
  scheduledFor: string
): Promise<ScheduledTask> {
  const state = await loadGrowthState();
  const task: ScheduledTask = {
    id: generateId(),
    type,
    data,
    scheduledFor,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  state.scheduledTasks.push(task);
  await saveGrowthState(state);
  return task;
}

export async function getPendingTasks(): Promise<ScheduledTask[]> {
  const state = await loadGrowthState();
  const now = new Date().toISOString();
  return state.scheduledTasks.filter((t) => t.status === 'pending' && t.scheduledFor <= now);
}

export async function updateTaskStatus(
  taskId: string,
  status: ScheduledTask['status'],
  result?: string,
  error?: string
): Promise<void> {
  const state = await loadGrowthState();
  const task = state.scheduledTasks.find((t) => t.id === taskId);
  if (task) {
    task.status = status;
    if (result) task.result = result;
    if (error) task.error = error;
    await saveGrowthState(state);
  }
}

// ============================================================================
// METRICS
// ============================================================================

export async function recordMetrics(metrics: Omit<GrowthMetrics, 'date'>): Promise<void> {
  const state = await loadGrowthState();
  const today = new Date().toISOString().split('T')[0];

  // Update or add today's metrics
  const existingIndex = state.metrics.findIndex((m) => m.date === today);
  if (existingIndex >= 0) {
    state.metrics[existingIndex] = { ...state.metrics[existingIndex], ...metrics, date: today };
  } else {
    state.metrics.push({ ...metrics, date: today });
  }

  // Keep last 90 days
  state.metrics = state.metrics.slice(-90);
  await saveGrowthState(state);
}

export async function getMetrics(days = 30): Promise<GrowthMetrics[]> {
  const state = await loadGrowthState();
  return state.metrics.slice(-days);
}

// ============================================================================
// SETTINGS
// ============================================================================

export async function updateSettings(settings: Partial<GrowthState['settings']>): Promise<void> {
  const state = await loadGrowthState();
  state.settings = { ...state.settings, ...settings };
  await saveGrowthState(state);
}

export async function getSettings(): Promise<GrowthState['settings']> {
  const state = await loadGrowthState();
  return state.settings;
}

// ============================================================================
// CAMPAIGNS
// ============================================================================

export async function createCampaign(
  name: string,
  channel: GrowthCampaign['channel'],
  goals: GrowthCampaign['goals']
): Promise<GrowthCampaign> {
  const state = await loadGrowthState();
  const campaign: GrowthCampaign = {
    id: generateId(),
    name,
    channel,
    status: 'planning',
    startDate: new Date().toISOString(),
    goals,
    createdAt: new Date().toISOString(),
  };
  state.campaigns.push(campaign);
  await saveGrowthState(state);
  return campaign;
}

export async function getCampaigns(status?: GrowthCampaign['status']): Promise<GrowthCampaign[]> {
  const state = await loadGrowthState();
  if (status) {
    return state.campaigns.filter((c) => c.status === status);
  }
  return state.campaigns;
}

export async function updateCampaignStatus(campaignId: string, status: GrowthCampaign['status']): Promise<void> {
  const state = await loadGrowthState();
  const campaign = state.campaigns.find((c) => c.id === campaignId);
  if (campaign) {
    campaign.status = status;
    if (status === 'completed') {
      campaign.endDate = new Date().toISOString();
    }
    await saveGrowthState(state);
  }
}

// ============================================================================
// DASHBOARD DATA
// ============================================================================

export interface GrowthDashboard {
  overview: {
    totalContent: number;
    scheduledContent: number;
    postedContent: number;
    totalInfluencers: number;
    activePartnerships: number;
    totalArticles: number;
    publishedArticles: number;
  };
  todayTasks: ScheduledTask[];
  recentContent: ContentPiece[];
  activeCampaigns: GrowthCampaign[];
  weeklyMetrics: GrowthMetrics[];
}

export async function getDashboard(): Promise<GrowthDashboard> {
  const state = await loadGrowthState();

  return {
    overview: {
      totalContent: state.contentQueue.length,
      scheduledContent: state.contentQueue.filter((c) => c.status === 'scheduled').length,
      postedContent: state.contentQueue.filter((c) => c.status === 'posted').length,
      totalInfluencers: state.influencerLeads.length,
      activePartnerships: state.influencerLeads.filter(
        (l) => l.status === 'confirmed' || l.status === 'live'
      ).length,
      totalArticles: state.seoArticles.length,
      publishedArticles: state.seoArticles.filter((a) => a.status === 'published').length,
    },
    todayTasks: await getPendingTasks(),
    recentContent: state.contentQueue.slice(-10).reverse(),
    activeCampaigns: state.campaigns.filter((c) => c.status === 'active'),
    weeklyMetrics: state.metrics.slice(-7),
  };
}
