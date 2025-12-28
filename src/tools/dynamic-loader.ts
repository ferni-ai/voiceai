/**
 * Dynamic Tool Loader
 *
 * Intelligently loads and unloads tool domains based on conversation context.
 * This keeps the active tool count low while ensuring relevant tools are available.
 *
 * Features:
 * - Topic detection → domain mapping
 * - Automatic loading when topic detected
 * - Automatic unloading after inactivity
 * - Priority-based loading (essential domains always loaded)
 */

import { getLogger } from '../utils/safe-logger.js';
import { toolRegistry } from './registry/index.js';
import { loadToolDomain } from './registry/loader.js';
import type { ToolDomain, ToolContext, Tool } from './registry/types.js';

// ============================================================================
// TYPES
// ============================================================================

export interface DynamicLoaderConfig {
  /** Domains that are always loaded (never unloaded) */
  essentialDomains: ToolDomain[];
  /** How long (ms) before unloading inactive domains */
  unloadAfterMs: number;
  /** Maximum domains to have loaded at once (excluding essential) */
  maxLoadedDomains: number;
  /** Enable automatic unloading */
  enableAutoUnload: boolean;
}

export interface LoadedDomainState {
  domain: ToolDomain;
  loadedAt: Date;
  lastUsedAt: Date;
  toolCount: number;
  isEssential: boolean;
}

export interface TopicDetectionResult {
  detectedTopics: string[];
  suggestedDomains: ToolDomain[];
  confidence: number;
}

// ============================================================================
// TOPIC TO DOMAIN MAPPING
// ============================================================================

/**
 * Maps conversation topics/keywords to relevant tool domains.
 * This enables intelligent domain loading based on what the user is discussing.
 *
 * EXPANDED: Now covers 150+ topics across all life domains.
 */
const TOPIC_TO_DOMAINS: Record<string, ToolDomain[]> = {
  // =========================================================================
  // FINANCIAL TOPICS
  // =========================================================================
  money: ['finance'],
  budget: ['finance'],
  budgeting: ['finance'],
  savings: ['finance'],
  saving: ['finance'],
  investment: ['finance', 'research'],
  investing: ['finance', 'research'],
  stocks: ['research', 'finance'],
  stock: ['research', 'finance'],
  retirement: ['finance', 'life-planning'],
  debt: ['finance'],
  loan: ['finance'],
  mortgage: ['finance'],
  taxes: ['finance'],
  tax: ['finance'],
  income: ['finance'],
  expenses: ['finance'],
  spending: ['finance'],
  credit: ['finance'],
  bank: ['finance'],
  banking: ['finance'],
  salary: ['finance'],
  paycheck: ['finance'],
  portfolio: ['finance', 'research'],
  dividend: ['finance', 'research'],
  etf: ['finance', 'research'],
  crypto: ['finance', 'research'],
  bitcoin: ['finance', 'research'],
  '401k': ['finance'],
  ira: ['finance'],

  // =========================================================================
  // PRODUCTIVITY & WORK TOPICS
  // =========================================================================
  task: ['productivity'],
  tasks: ['productivity'],
  todo: ['productivity'],
  schedule: ['calendar', 'productivity', 'scheduling'],
  scheduling: ['calendar', 'productivity', 'scheduling'],
  meeting: ['calendar', 'communication'],
  meetings: ['calendar', 'communication'],
  appointment: ['calendar'],
  appointments: ['calendar'],
  deadline: ['calendar', 'productivity'],
  deadlines: ['calendar', 'productivity'],
  project: ['productivity'],
  projects: ['productivity'],
  reminder: ['calendar', 'communication', 'scheduling'],
  reminders: ['calendar', 'communication', 'scheduling'],
  organize: ['productivity'],
  organized: ['productivity'],
  planning: ['productivity', 'life-planning'],
  plan: ['productivity', 'life-planning'],
  routine: ['habits', 'productivity'],
  routines: ['habits', 'productivity'],
  morning: ['habits', 'awareness'],
  evening: ['habits', 'awareness'],
  work: ['productivity'],
  working: ['productivity'],
  office: ['productivity'],
  email: ['communication', 'productivity', 'scheduling'],
  emails: ['communication', 'productivity', 'scheduling'],
  call: ['telephony', 'communication', 'scheduling'],
  calls: ['telephony', 'communication', 'scheduling'],
  'call me': ['telephony', 'scheduling'],
  'call my': ['telephony', 'communication'], // "call my mom", "call my doctor"
  'call her': ['telephony', 'communication'],
  'call him': ['telephony', 'communication'],
  'call them': ['telephony', 'communication'],
  'make a call': ['telephony'],
  'place a call': ['telephony'],
  'phone call': ['telephony'],
  phone: ['telephony', 'communication', 'scheduling'],
  dial: ['telephony'],
  ring: ['telephony'],

  // =========================================================================
  // WELLNESS & HEALTH TOPICS
  // =========================================================================
  health: ['wellness'],
  healthy: ['wellness', 'habits'],
  medication: ['wellness'],
  medications: ['wellness'],
  medicine: ['wellness'],
  doctor: ['wellness', 'calendar'],
  sleep: ['wellness', 'habits'],
  sleeping: ['wellness', 'habits'],
  insomnia: ['wellness'],
  tired: ['wellness', 'self-compassion'],
  exhausted: ['wellness', 'self-compassion'],
  exercise: ['wellness', 'habits'],
  exercising: ['wellness', 'habits'],
  workout: ['wellness', 'habits'],
  gym: ['wellness', 'habits'],
  fitness: ['wellness', 'habits'],
  diet: ['wellness', 'habits'],
  eating: ['wellness', 'habits'],
  nutrition: ['wellness'],
  weight: ['wellness', 'habits'],
  stress: ['wellness', 'presence'],
  stressed: ['wellness', 'presence'],
  stressful: ['wellness', 'presence'],
  anxiety: ['wellness', 'presence', 'self-compassion'],
  anxious: ['wellness', 'presence', 'self-compassion'],
  depression: ['wellness', 'self-compassion'],
  depressed: ['wellness', 'self-compassion'],
  meditation: ['presence'],
  meditate: ['presence'],
  mindfulness: ['presence'],
  mindful: ['presence'],
  breathe: ['presence'],
  breathing: ['presence'],
  relax: ['presence', 'wellness'],
  relaxing: ['presence', 'wellness'],
  calm: ['presence'],
  peace: ['presence', 'meaning'],
  therapy: ['wellness', 'self-compassion'],
  therapist: ['wellness'],

  // =========================================================================
  // RELATIONSHIP TOPICS
  // =========================================================================
  relationship: ['relationships'],
  relationships: ['relationships'],
  family: ['relationships'],
  friend: ['relationships'],
  friends: ['relationships'],
  friendship: ['relationships'],
  partner: ['relationships'],
  spouse: ['relationships'],
  husband: ['relationships'],
  wife: ['relationships'],
  boyfriend: ['relationships'],
  girlfriend: ['relationships'],
  dating: ['relationships'],
  marriage: ['relationships'],
  married: ['relationships'],
  wedding: ['relationships', 'life-planning'],
  divorce: ['relationships', 'grief'],
  parent: ['relationships'],
  parents: ['relationships'],
  mom: ['relationships'],
  dad: ['relationships'],
  mother: ['relationships'],
  father: ['relationships'],
  kids: ['relationships'],
  children: ['relationships'],
  son: ['relationships'],
  daughter: ['relationships'],
  sibling: ['relationships'],
  brother: ['relationships'],
  sister: ['relationships'],
  conflict: ['relationships', 'communication'],
  argument: ['relationships', 'communication'],
  fight: ['relationships', 'communication'],
  boundary: ['relationships', 'self-compassion'],
  boundaries: ['relationships', 'self-compassion'],
  communication: ['communication', 'relationships'],
  apologize: ['relationships', 'communication'],
  apology: ['relationships', 'communication'],
  forgive: ['relationships', 'self-compassion'],
  forgiveness: ['relationships', 'self-compassion'],
  trust: ['relationships'],
  love: ['relationships', 'meaning'],
  loving: ['relationships'],

  // =========================================================================
  // LIFE PLANNING & GOALS
  // =========================================================================
  goal: ['life-planning', 'habits'],
  goals: ['life-planning', 'habits'],
  dream: ['dreams', 'life-planning'],
  dreams: ['dreams', 'life-planning'],
  aspiration: ['life-planning', 'meaning'],
  career: ['life-planning'],
  job: ['life-planning', 'productivity'],
  promotion: ['life-planning'],
  purpose: ['meaning'],
  values: ['meaning'],
  value: ['meaning'],
  milestone: ['life-planning'],
  milestones: ['life-planning'],
  achievement: ['life-planning'],
  success: ['life-planning'],
  future: ['life-planning', 'dreams'],
  bucket: ['life-planning', 'dreams'], // bucket list
  legacy: ['meaning', 'life-planning'],
  travel: ['life-planning', 'entertainment'],
  vacation: ['life-planning', 'entertainment'],
  trip: ['life-planning', 'calendar'],
  moving: ['life-planning'],
  move: ['life-planning'],
  house: ['life-planning', 'finance'],
  home: ['life-planning'],
  baby: ['life-planning', 'relationships'],
  pregnant: ['life-planning', 'wellness'],
  college: ['life-planning', 'finance'],
  graduation: ['life-planning'],
  retire: ['life-planning', 'finance'],

  // =========================================================================
  // ENTERTAINMENT & LEISURE
  // =========================================================================
  music: ['entertainment'],
  song: ['entertainment'],
  songs: ['entertainment'],
  spotify: ['entertainment'],
  playlist: ['entertainment'],
  play: ['entertainment', 'play'],
  playing: ['entertainment', 'play'],
  fun: ['play', 'entertainment'],
  game: ['play', 'entertainment'],
  games: ['play', 'entertainment'],
  movie: ['entertainment'],
  movies: ['entertainment'],
  show: ['entertainment'],
  shows: ['entertainment'],
  watch: ['video', 'entertainment'],
  watching: ['video', 'entertainment'],
  book: ['books', 'entertainment', 'wisdom'],
  books: ['books', 'entertainment', 'wisdom'],
  read: ['books', 'entertainment', 'wisdom'],
  reading: ['books', 'entertainment', 'wisdom'],
  podcast: ['podcasts', 'entertainment', 'information'],
  podcasts: ['podcasts', 'entertainment', 'information'],
  episode: ['podcasts', 'entertainment'],
  episodes: ['podcasts', 'entertainment'],
  video: ['video', 'entertainment'],
  videos: ['video', 'entertainment'],
  youtube: ['video', 'entertainment'],
  tutorial: ['video', 'entertainment', 'learning'],
  tutorials: ['video', 'entertainment', 'learning'],
  hobby: ['play', 'entertainment'],
  hobbies: ['play', 'entertainment'],
  creative: ['play'],
  art: ['play'],
  dance: ['entertainment', 'wellness'],
  dancing: ['entertainment', 'wellness'],
  laugh: ['play'],
  laughing: ['play'],
  joke: ['play'],
  jokes: ['play'],
  funny: ['play'],

  // =========================================================================
  // INFORMATION & NEWS
  // =========================================================================
  news: ['information'],
  weather: ['information', 'awareness'],
  forecast: ['information', 'awareness'],
  sports: ['information'],
  score: ['information'],
  scores: ['information'],
  search: ['information'],
  find: ['information'],
  lookup: ['information'],
  google: ['information'],
  learn: ['curiosity', 'information'],
  learning: ['curiosity', 'information'],
  research: ['research', 'information'],
  study: ['curiosity', 'information'],
  question: ['curiosity'],
  curious: ['curiosity'],
  wonder: ['curiosity'],
  wondering: ['curiosity'],

  // =========================================================================
  // EMOTIONAL & SPIRITUAL TOPICS
  // =========================================================================
  sad: ['grief', 'self-compassion'],
  sadness: ['grief', 'self-compassion'],
  loss: ['grief'],
  grieving: ['grief'],
  grief: ['grief'],
  death: ['grief'],
  died: ['grief'],
  passed: ['grief'],
  mourning: ['grief'],
  lonely: ['relationships', 'self-compassion'],
  loneliness: ['relationships', 'self-compassion'],
  alone: ['self-compassion', 'relationships'],
  overwhelmed: ['presence', 'self-compassion'],
  grateful: ['presence', 'meaning'],
  gratitude: ['presence', 'meaning'],
  thankful: ['presence', 'meaning'],
  happy: ['presence', 'play'],
  happiness: ['meaning', 'presence'],
  joy: ['meaning', 'presence'],
  hopeful: ['meaning'],
  hope: ['meaning'],
  afraid: ['self-compassion', 'vulnerability'],
  fear: ['vulnerability', 'self-compassion'],
  scared: ['self-compassion', 'vulnerability'],
  worried: ['self-compassion', 'presence'],
  worry: ['self-compassion', 'presence'],
  angry: ['self-compassion', 'relationships'],
  anger: ['self-compassion', 'relationships'],
  frustrated: ['self-compassion'],
  frustration: ['self-compassion'],
  shame: ['self-compassion', 'vulnerability'],
  guilt: ['self-compassion'],
  regret: ['self-compassion', 'meaning'],
  spiritual: ['meaning'],
  spirituality: ['meaning'],
  faith: ['meaning'],
  god: ['meaning'],
  pray: ['meaning'],
  prayer: ['meaning'],
  soul: ['meaning'],
  meaning: ['meaning'],
  life: ['meaning', 'life-planning'],
  exist: ['meaning'],
  existence: ['meaning'],

  // =========================================================================
  // HABITS & SELF-IMPROVEMENT
  // =========================================================================
  habit: ['habits'],
  habits: ['habits'],
  discipline: ['habits'],
  motivation: ['habits', 'meaning'],
  motivated: ['habits', 'meaning'],
  procrastinate: ['habits', 'self-compassion'],
  procrastinating: ['habits', 'self-compassion'],
  focus: ['presence', 'productivity'],
  focused: ['presence', 'productivity'],
  distracted: ['presence', 'habits'],
  addiction: ['habits', 'self-compassion'],
  quit: ['habits'],
  quitting: ['habits'],
  smoking: ['habits', 'wellness'],
  drinking: ['habits', 'wellness'],
  alcohol: ['habits', 'wellness'],

  // =========================================================================
  // COMMUNICATION & SOCIAL
  // =========================================================================
  text: ['communication', 'scheduling'],
  'text me': ['scheduling', 'communication'],
  sms: ['communication', 'scheduling'],
  message: ['communication', 'scheduling'],
  'send text': ['scheduling', 'communication'],
  'schedule text': ['scheduling'],
  'schedule call': ['scheduling', 'telephony'],
  'schedule email': ['scheduling', 'communication'],
  talk: ['communication'],
  talking: ['communication'],
  conversation: ['communication'],
  speaking: ['communication'],
  present: ['communication', 'presence'],
  presentation: ['communication'],
  interview: ['communication', 'life-planning'],
  networking: ['communication', 'life-planning'],
  social: ['relationships', 'communication'],

  // =========================================================================
  // TIME & AWARENESS
  // =========================================================================
  today: ['awareness', 'calendar'],
  tomorrow: ['awareness', 'calendar'],
  yesterday: ['awareness'],
  weekend: ['awareness', 'calendar'],
  week: ['awareness', 'calendar'],
  month: ['awareness', 'calendar'],
  year: ['awareness', 'life-planning'],
  birthday: ['awareness', 'relationships'],
  anniversary: ['awareness', 'relationships'],
  holiday: ['awareness', 'calendar'],
  christmas: ['awareness'],
  thanksgiving: ['awareness'],
  time: ['awareness', 'presence'],
};

/**
 * Priority scores for domains (higher = more likely to stay loaded)
 */
const DOMAIN_PRIORITY: Partial<Record<ToolDomain, number>> = {
  memory: 100, // Always essential
  handoff: 100, // Always essential
  awareness: 90, // World awareness is important
  information: 70, // Frequently used
  entertainment: 60, // Common request
  productivity: 50,
  calendar: 50,
  habits: 40,
  finance: 40,
  wellness: 40,
  relationships: 40,
  presence: 35,
  meaning: 35,
  communication: 30,
  research: 30,
  'life-planning': 25,
  grief: 20,
  dreams: 20,
  play: 20,
  'self-compassion': 20,
  stories: 15,
  curiosity: 15,
  vulnerability: 15,
  wisdom: 15,
  telephony: 85, // Phone calls are high-value actions - must not be cut off
  proactive: 10,
};

// ============================================================================
// DYNAMIC LOADER CLASS
// ============================================================================

export class DynamicToolLoader {
  private config: DynamicLoaderConfig;
  private loadedDomains = new Map<ToolDomain, LoadedDomainState>();
  private toolContext: ToolContext | null = null;
  private unloadTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<DynamicLoaderConfig> = {}) {
    this.config = {
      // Essential domains are pre-loaded at startup (no race conditions)
      // telephony is essential because "call my mom" should work immediately
      essentialDomains: ['memory', 'handoff', 'awareness', 'entertainment', 'information', 'telephony', 'communication'],
      unloadAfterMs: 5 * 60 * 1000, // 5 minutes
      maxLoadedDomains: 10, // Increased to accommodate essential domains
      enableAutoUnload: true,
      ...config,
    };
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  /**
   * Initialize with tool context and load essential domains
   */
  async initialize(ctx: ToolContext): Promise<void> {
    this.toolContext = ctx;

    // Load essential domains
    for (const domain of this.config.essentialDomains) {
      await this.loadDomain(domain, true);
    }

    // Start auto-unload timer if enabled
    if (this.config.enableAutoUnload) {
      this.startUnloadTimer();
    }

    getLogger().info(
      {
        essentialDomains: this.config.essentialDomains,
        maxLoadedDomains: this.config.maxLoadedDomains,
      },
      '🔄 Dynamic tool loader initialized'
    );
  }

  /**
   * Shutdown and cleanup
   */
  shutdown(): void {
    if (this.unloadTimer) {
      clearInterval(this.unloadTimer);
      this.unloadTimer = null;
    }
    this.loadedDomains.clear();
    getLogger().info('🔄 Dynamic tool loader shut down');
  }

  // ==========================================================================
  // TOPIC DETECTION
  // ==========================================================================

  /**
   * Detect topics from user message and suggest domains
   */
  detectTopics(message: string): TopicDetectionResult {
    const lowerMessage = message.toLowerCase();
    const detectedTopics: string[] = [];
    const domainScores = new Map<ToolDomain, number>();

    // Check each topic keyword
    for (const [topic, domains] of Object.entries(TOPIC_TO_DOMAINS)) {
      if (lowerMessage.includes(topic)) {
        detectedTopics.push(topic);
        for (const domain of domains) {
          const currentScore = domainScores.get(domain) || 0;
          const priority = DOMAIN_PRIORITY[domain] || 10;
          domainScores.set(domain, currentScore + priority);
        }
      }
    }

    // Sort domains by score
    const suggestedDomains = Array.from(domainScores.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([domain]) => domain)
      .slice(0, 5); // Top 5 domains - ensures action domains like telephony aren't cut off

    // Calculate confidence based on matches
    const confidence = Math.min(detectedTopics.length / 3, 1);

    return {
      detectedTopics,
      suggestedDomains,
      confidence,
    };
  }

  // ==========================================================================
  // DOMAIN LOADING
  // ==========================================================================

  /**
   * Load a domain's tools
   */
  async loadDomain(domain: ToolDomain, isEssential = false): Promise<boolean> {
    // Already loaded?
    if (this.loadedDomains.has(domain)) {
      // Update last used time
      const state = this.loadedDomains.get(domain)!;
      state.lastUsedAt = new Date();
      return true;
    }

    // Check max loaded domains
    if (!isEssential && this.loadedDomains.size >= this.config.maxLoadedDomains) {
      // Unload least recently used non-essential domain
      await this.unloadLeastUsed();
    }

    try {
      const toolCount = await loadToolDomain(domain);

      this.loadedDomains.set(domain, {
        domain,
        loadedAt: new Date(),
        lastUsedAt: new Date(),
        toolCount,
        isEssential,
      });

      getLogger().info({ domain, toolCount, isEssential }, '🔄 Domain loaded dynamically');
      return true;
    } catch (error) {
      getLogger().warn({ domain, error }, '🔄 Failed to load domain');
      return false;
    }
  }

  /**
   * Unload a domain's tools (if not essential)
   */
  async unloadDomain(domain: ToolDomain): Promise<boolean> {
    const state = this.loadedDomains.get(domain);
    if (!state) return false;
    if (state.isEssential) {
      getLogger().debug({ domain }, '🔄 Cannot unload essential domain');
      return false;
    }

    // Get all tools for this domain from the registry
    const domainTools = toolRegistry.getByDomain(domain);
    let unloadedCount = 0;

    // Unregister each tool from the registry
    for (const tool of domainTools) {
      // Only unregister if this is the tool's primary domain
      // (to avoid breaking tools that have multiple domains)
      if (tool.domain === domain) {
        const success = toolRegistry.unregister(tool.id);
        if (success) {
          unloadedCount++;
        }
      }
    }

    // Update local tracking
    this.loadedDomains.delete(domain);

    getLogger().info(
      { domain, unloadedCount, totalInDomain: domainTools.length },
      '🔄 Domain unloaded from registry'
    );
    return true;
  }

  /**
   * Unload the least recently used non-essential domain
   */
  private async unloadLeastUsed(): Promise<void> {
    let oldest: LoadedDomainState | null = null;

    for (const state of this.loadedDomains.values()) {
      if (state.isEssential) continue;
      if (!oldest || state.lastUsedAt < oldest.lastUsedAt) {
        oldest = state;
      }
    }

    if (oldest) {
      await this.unloadDomain(oldest.domain);
    }
  }

  // ==========================================================================
  // AUTO-LOADING FROM CONTEXT
  // ==========================================================================

  /**
   * Process a user message and load relevant domains
   */
  async processMessage(message: string): Promise<ToolDomain[]> {
    const detection = this.detectTopics(message);

    if (detection.confidence < 0.3 || detection.suggestedDomains.length === 0) {
      return [];
    }

    const loadedDomains: ToolDomain[] = [];

    for (const domain of detection.suggestedDomains) {
      if (!this.loadedDomains.has(domain)) {
        const success = await this.loadDomain(domain);
        if (success) {
          loadedDomains.push(domain);
        }
      } else {
        // Update last used
        const state = this.loadedDomains.get(domain)!;
        state.lastUsedAt = new Date();
      }
    }

    if (loadedDomains.length > 0) {
      getLogger().info(
        {
          message: message.slice(0, 50),
          topics: detection.detectedTopics,
          loadedDomains,
        },
        '🔄 Auto-loaded domains based on context'
      );
    }

    return loadedDomains;
  }

  /**
   * Get tools for the current context
   */
  getCurrentTools(): Record<string, Tool> {
    if (!this.toolContext) {
      throw new Error('DynamicToolLoader not initialized');
    }

    const tools: Record<string, Tool> = {};
    const loadedDomainList = Array.from(this.loadedDomains.keys());

    // Build tools from loaded domains
    const result = toolRegistry.buildToolSet({ domains: loadedDomainList }, this.toolContext);

    return result.tools;
  }

  // ==========================================================================
  // AUTO-UNLOAD TIMER
  // ==========================================================================

  private startUnloadTimer(): void {
    this.unloadTimer = setInterval(() => {
      this.checkForUnload();
    }, 60000); // Check every minute
  }

  private checkForUnload(): void {
    const now = Date.now();

    for (const [domain, state] of this.loadedDomains) {
      if (state.isEssential) continue;

      const idleTime = now - state.lastUsedAt.getTime();
      if (idleTime > this.config.unloadAfterMs) {
        // FIX: Don't fire-and-forget - catch errors to prevent unhandled rejections
        this.unloadDomain(domain).catch((err) => {
          getLogger().warn({ domain, error: String(err) }, '🔄 Error during auto-unload');
        });
      }
    }
  }

  // ==========================================================================
  // STATUS
  // ==========================================================================

  /**
   * Get current loader status
   */
  getStatus(): {
    loadedDomains: LoadedDomainState[];
    totalTools: number;
    config: DynamicLoaderConfig;
  } {
    return {
      loadedDomains: Array.from(this.loadedDomains.values()),
      totalTools: Array.from(this.loadedDomains.values()).reduce((sum, s) => sum + s.toolCount, 0),
      config: this.config,
    };
  }

  /**
   * Check if a domain is currently loaded
   */
  isDomainLoaded(domain: ToolDomain): boolean {
    return this.loadedDomains.has(domain);
  }

  /**
   * Get list of loaded domains
   */
  getLoadedDomains(): ToolDomain[] {
    return Array.from(this.loadedDomains.keys());
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

export const dynamicToolLoader = new DynamicToolLoader();

export default dynamicToolLoader;
