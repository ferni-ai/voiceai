/**
 * CEO Coaching Storage Client for CLI
 *
 * Connects CLI commands to the same Firestore backend as the voice agent.
 * This enables cross-device sync: track wins via CLI, Jordan celebrates via voice.
 *
 * Uses the CEO coaching storage functions from src/tools/domains/ceo-coaching/storage.ts
 */

import { homedir } from 'os';
import { join } from 'path';
import { promises as fs } from 'fs';

// Types are inlined here to avoid complex path resolution in CLI context
export interface CEOWin {
  id: string;
  text: string;
  date: string;
  category?: string;
  createdAt: string;
}

export interface CEOEnergy {
  id: string;
  level: number;
  timestamp: string;
  note?: string;
}

export interface CEOGratitude {
  id: string;
  text: string;
  timestamp: string;
}

export interface CEOJournalEntry {
  id: string;
  content: string;
  timestamp: string;
  mood?: string;
}

export interface CEODecision {
  id: string;
  description: string;
  status: 'pending' | 'decided' | 'implemented';
  options?: string[];
  choice?: string;
  outcome?: string;
  deadline?: string;
  createdAt: string;
  decidedAt?: string;
}

export interface CEOPriority {
  id: string;
  text: string;
  order: number;
  status: 'active' | 'completed' | 'dropped';
  createdAt: string;
  completedAt?: string;
}

export interface CEOBlocker {
  id: string;
  text: string;
  status: 'active' | 'resolved';
  resolution?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface CEOIdea {
  id: string;
  text: string;
  tags?: string[];
  createdAt: string;
}

export interface CEOFocusSession {
  id: string;
  startTime: string;
  endTime?: string;
  durationMinutes: number;
  label?: string;
  completed: boolean;
}

export interface CEOReflection {
  id: string;
  date: string;
  bestMoment?: string;
  learned?: string;
  gratitude?: string;
  tomorrowFocus?: string;
  createdAt: string;
}

export interface CEOWeeklyReview {
  id: string;
  weekStart: string;
  accomplishments: string[];
  challenges: string[];
  learnings: string[];
  nextWeekFocus: string[];
  energyAverage?: number;
  winCount?: number;
  createdAt: string;
}

export interface CEOCoachingState {
  recentWins: CEOWin[];
  currentPriorities: CEOPriority[];
  activeBlockers: CEOBlocker[];
  pendingDecisions: CEODecision[];
  energyTrend?: {
    current?: number;
    weekAverage?: number;
    trend: 'up' | 'down' | 'stable';
  };
  recentGratitude: CEOGratitude[];
  activeFocusSession?: CEOFocusSession;
}

// ============================================================================
// USER ID MANAGEMENT
// ============================================================================

const CONFIG_DIR = join(homedir(), '.ferni');
const USER_FILE = join(CONFIG_DIR, 'user.json');

interface UserConfig {
  userId: string;
  email?: string;
  lastSync?: string;
}

async function ensureConfigDir(): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
}

export async function getUserId(): Promise<string | null> {
  try {
    const data = await fs.readFile(USER_FILE, 'utf-8');
    const config: UserConfig = JSON.parse(data);
    return config.userId || null;
  } catch {
    return null;
  }
}

export async function setUserId(userId: string, email?: string): Promise<void> {
  await ensureConfigDir();
  const config: UserConfig = { userId, email, lastSync: new Date().toISOString() };
  await fs.writeFile(USER_FILE, JSON.stringify(config, null, 2));
}

// ============================================================================
// FIRESTORE CONNECTION
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let storageModule: any = null;

async function getStorage() {
  if (!storageModule) {
    try {
      // Dynamic import from project root - works in both dev and built modes
      const projectRoot = process.env.FERNI_PROJECT_ROOT || process.cwd();
      const storagePath = `${projectRoot}/dist/tools/domains/ceo-coaching/storage.js`;
      storageModule = await import(storagePath);
    } catch (e) {
      console.error('Failed to load CEO coaching storage:', e);
      throw new Error('Could not connect to CEO coaching storage. Run: pnpm build:fast');
    }
  }
  return storageModule;
}

// ============================================================================
// WRAPPER FUNCTIONS - Call Firestore storage with CLI user ID
// ============================================================================

// --- WINS ---
export async function saveWin(text: string, category?: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const storage = await getStorage();
  await storage.saveWin(userId, {
    text,
    date: new Date().toISOString().split('T')[0],
    category,
  });
}

export async function getRecentWins(days = 7) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const storage = await getStorage();
  return storage.getRecentWins(userId, days);
}

// --- ENERGY ---
export async function logEnergy(level: number, note?: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const storage = await getStorage();
  await storage.logEnergy(userId, level, note);
}

export async function getEnergyTrend() {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const storage = await getStorage();
  return storage.getEnergyTrend(userId);
}

export async function getRecentEnergyEntries(days = 7) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const storage = await getStorage();
  return storage.getRecentEnergyEntries(userId, days);
}

// --- GRATITUDE ---
export async function logGratitude(text: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const storage = await getStorage();
  await storage.logGratitude(userId, text);
}

export async function getRecentGratitude(limit = 10) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const storage = await getStorage();
  return storage.getRecentGratitude(userId, limit);
}

// --- JOURNAL ---
export async function saveJournalEntry(content: string, mood?: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const storage = await getStorage();
  await storage.saveJournalEntry(userId, content, mood);
}

// --- DECISIONS ---
export async function trackDecision(description: string, options?: string[], deadline?: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const storage = await getStorage();
  await storage.trackDecision(userId, description, options, deadline);
}

export async function getPendingDecisions() {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const storage = await getStorage();
  return storage.getPendingDecisions(userId);
}

// --- PRIORITIES ---
export async function addPriority(text: string) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const storage = await getStorage();
  return storage.addPriority(userId, text);
}

export async function getPriorities() {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const storage = await getStorage();
  return storage.getPriorities(userId);
}

export async function completePriority(priorityId: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const storage = await getStorage();
  await storage.completePriority(userId, priorityId);
}

// --- BLOCKERS ---
export async function addBlocker(text: string) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const storage = await getStorage();
  return storage.addBlocker(userId, text);
}

export async function getActiveBlockers() {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const storage = await getStorage();
  return storage.getActiveBlockers(userId);
}

export async function resolveBlocker(blockerId: string, resolution?: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const storage = await getStorage();
  await storage.resolveBlocker(userId, blockerId, resolution);
}

// --- IDEAS ---
export async function captureIdea(text: string, tags?: string[]) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const storage = await getStorage();
  return storage.captureIdea(userId, text, tags);
}

export async function getRecentIdeas(limit = 20) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const storage = await getStorage();
  return storage.getRecentIdeas(userId, limit);
}

// --- FOCUS SESSIONS ---
export async function startFocusSession(durationMinutes: number, label?: string) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const storage = await getStorage();
  return storage.startFocusSession(userId, durationMinutes, label);
}

export async function endFocusSession(completed: boolean): Promise<void> {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const storage = await getStorage();
  await storage.endFocusSession(userId, completed);
}

export async function getActiveFocusSession() {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const storage = await getStorage();
  return storage.getActiveFocusSession(userId);
}

// --- REFLECTIONS ---
export async function saveDailyReflection(reflection: {
  bestMoment?: string;
  learned?: string;
  gratitude?: string;
  tomorrowFocus?: string;
}): Promise<void> {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const storage = await getStorage();
  await storage.saveDailyReflection(userId, reflection);
}

// --- WEEKLY REVIEWS ---
export async function saveWeeklyReview(review: {
  accomplishments: string[];
  challenges: string[];
  learnings: string[];
  nextWeekFocus: string[];
  energyAverage?: number;
  winCount?: number;
}): Promise<void> {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const storage = await getStorage();
  await storage.saveWeeklyReview(userId, review);
}

// --- FULL STATE ---
export async function getCEOCoachingState() {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const storage = await getStorage();
  return storage.getCEOCoachingState(userId);
}
