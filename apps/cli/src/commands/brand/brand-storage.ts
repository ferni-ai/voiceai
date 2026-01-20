/**
 * Brand Automation Storage Client
 *
 * Stores brand evolution state: awards, stories, assets, audits.
 * Uses local JSON storage following the growth module pattern.
 */

import { homedir } from 'os';
import { join } from 'path';
import { promises as fs } from 'fs';
import { randomUUID } from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

export interface Award {
  id: string;
  name: string;
  organization: string;
  category: string;
  deadline: string;
  submissionUrl?: string;
  status: 'researching' | 'preparing' | 'submitted' | 'shortlisted' | 'won' | 'declined';
  fee?: number;
  requirements?: string[];
  materials?: {
    caseStudy?: boolean;
    video?: boolean;
    images?: boolean;
    metrics?: boolean;
  };
  notes?: string;
  submittedAt?: string;
  result?: string;
  createdAt: string;
}

export interface BrandStory {
  id: string;
  type: 'origin' | 'manifesto' | 'case_study' | 'testimonial' | 'behind_scenes';
  title: string;
  content: string;
  excerpt?: string;
  author?: string;
  platforms: {
    platform: 'medium' | 'linkedin' | 'blog' | 'press' | 'substack';
    status: 'draft' | 'scheduled' | 'published';
    url?: string;
    publishedAt?: string;
  }[];
  metrics?: {
    views?: number;
    claps?: number;
    shares?: number;
    comments?: number;
  };
  tags?: string[];
  createdAt: string;
}

export interface UserStory {
  id: string;
  userName: string;
  userEmail?: string;
  story: string;
  persona?: 'ferni' | 'maya' | 'peter' | 'jordan' | 'alex' | 'nayan';
  useCase?: string;
  quote?: string;
  approved: boolean;
  featured: boolean;
  consentGiven: boolean;
  submittedAt: string;
  approvedAt?: string;
  publishedAt?: string;
  publishedTo?: string[];
}

export interface BrandAsset {
  id: string;
  type: 'logo' | 'icon' | 'illustration' | 'photo' | 'video' | 'sound';
  name: string;
  path: string;
  format: string;
  size?: number;
  variants?: string[];
  usageGuidelines?: string;
  lastSynced?: string;
  platforms?: ('figma' | 'github' | 'drive' | 'notion')[];
}

export interface BrandAudit {
  id: string;
  type: 'consistency' | 'accessibility' | 'performance' | 'seo';
  platform: 'web' | 'mobile' | 'email' | 'social' | 'all';
  score: number;
  issues: {
    severity: 'critical' | 'warning' | 'info';
    category: string;
    description: string;
    location?: string;
    suggestion?: string;
    fixed?: boolean;
  }[];
  runAt: string;
  fixedAt?: string;
}

export interface Workstream {
  id: string;
  name: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  status: 'not_started' | 'in_progress' | 'blocked' | 'completed';
  owner?: string;
  document: string;
  tasks: {
    id: string;
    description: string;
    completed: boolean;
    completedAt?: string;
  }[];
  startedAt?: string;
  completedAt?: string;
  blockedReason?: string;
}

export interface BrandState {
  awards: Award[];
  stories: BrandStory[];
  userStories: UserStory[];
  assets: BrandAsset[];
  audits: BrandAudit[];
  workstreams: Workstream[];
  settings: {
    mediumToken?: string;
    linkedinToken?: string;
    figmaToken?: string;
    notionToken?: string;
    autoPublish: boolean;
    auditSchedule: 'daily' | 'weekly' | 'manual';
  };
  lastUpdated: string;
}

// ============================================================================
// STORAGE
// ============================================================================

const BRAND_STATE_FILE = join(homedir(), '.ferni', 'brand-state.json');

async function ensureDirectory(): Promise<void> {
  const dir = join(homedir(), '.ferni');
  await fs.mkdir(dir, { recursive: true });
}

async function loadState(): Promise<BrandState> {
  try {
    const data = await fs.readFile(BRAND_STATE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return getDefaultState();
  }
}

async function saveState(state: BrandState): Promise<void> {
  await ensureDirectory();
  state.lastUpdated = new Date().toISOString();
  await fs.writeFile(BRAND_STATE_FILE, JSON.stringify(state, null, 2));
}

function getDefaultState(): BrandState {
  return {
    awards: getDefaultAwards(),
    stories: [],
    userStories: [],
    assets: [],
    audits: [],
    workstreams: getDefaultWorkstreams(),
    settings: {
      autoPublish: false,
      auditSchedule: 'weekly',
    },
    lastUpdated: new Date().toISOString(),
  };
}

// Pre-populated award deadlines for 2026
function getDefaultAwards(): Award[] {
  return [
    {
      id: randomUUID(),
      name: 'Webby Awards',
      organization: 'International Academy of Digital Arts and Sciences',
      category: 'Apps, Mobile & Voice - Best User Experience',
      deadline: '2026-01-31',
      submissionUrl: 'https://www.webbyawards.com/',
      status: 'researching',
      fee: 375,
      requirements: ['Case study', 'Screenshots', 'Video demo'],
      materials: { caseStudy: false, video: false, images: false, metrics: false },
      createdAt: new Date().toISOString(),
    },
    {
      id: randomUUID(),
      name: 'Fast Company Innovation by Design',
      organization: 'Fast Company',
      category: 'AI & Data',
      deadline: '2026-03-15',
      submissionUrl: 'https://www.fastcompany.com/innovation-by-design',
      status: 'researching',
      fee: 500,
      requirements: ['Written entry', 'Images', 'Impact metrics'],
      materials: { caseStudy: false, video: false, images: false, metrics: false },
      createdAt: new Date().toISOString(),
    },
    {
      id: randomUUID(),
      name: 'Apple Design Awards',
      organization: 'Apple',
      category: 'Delight and Fun',
      deadline: '2026-04-01',
      submissionUrl: 'https://developer.apple.com/design/awards/',
      status: 'researching',
      fee: 0,
      requirements: ['App Store presence', 'Design excellence'],
      materials: { caseStudy: false, video: false, images: false, metrics: false },
      createdAt: new Date().toISOString(),
    },
    {
      id: randomUUID(),
      name: 'Google Play Best Apps',
      organization: 'Google',
      category: 'Best for Personal Growth',
      deadline: '2026-09-01',
      submissionUrl: 'https://play.google.com/console/',
      status: 'researching',
      fee: 0,
      requirements: ['Play Store presence', 'User ratings'],
      materials: { caseStudy: false, video: false, images: false, metrics: false },
      createdAt: new Date().toISOString(),
    },
    {
      id: randomUUID(),
      name: 'Communication Arts Interactive',
      organization: 'Communication Arts',
      category: 'Apps',
      deadline: '2026-03-31',
      submissionUrl: 'https://www.commarts.com/competitions',
      status: 'researching',
      fee: 45,
      requirements: ['Screenshots', 'Description'],
      materials: { caseStudy: false, video: false, images: false, metrics: false },
      createdAt: new Date().toISOString(),
    },
    {
      id: randomUUID(),
      name: 'Awwwards - Site of the Day',
      organization: 'Awwwards',
      category: 'Mobile Excellence',
      deadline: '2026-12-31',
      submissionUrl: 'https://www.awwwards.com/submit/',
      status: 'researching',
      fee: 75,
      requirements: ['Live URL', 'Screenshots'],
      materials: { caseStudy: false, video: false, images: false, metrics: false },
      createdAt: new Date().toISOString(),
    },
    {
      id: randomUUID(),
      name: 'UX Design Awards',
      organization: 'International Design Center Berlin',
      category: 'Product - Consumer',
      deadline: '2026-06-15',
      submissionUrl: 'https://ux-design-awards.com/',
      status: 'researching',
      fee: 290,
      requirements: ['Case study', 'UX documentation', 'User research'],
      materials: { caseStudy: false, video: false, images: false, metrics: false },
      createdAt: new Date().toISOString(),
    },
    {
      id: randomUUID(),
      name: 'Red Dot Design Award',
      organization: 'Red Dot',
      category: 'Brands & Communication Design',
      deadline: '2026-06-30',
      submissionUrl: 'https://www.red-dot.org/',
      status: 'researching',
      fee: 450,
      requirements: ['Physical or digital submission', 'Documentation'],
      materials: { caseStudy: false, video: false, images: false, metrics: false },
      createdAt: new Date().toISOString(),
    },
  ];
}

// Pre-populated 15 workstreams from BRAND-EVOLUTION-PLAN.md
function getDefaultWorkstreams(): Workstream[] {
  return [
    {
      id: '1',
      name: 'Public Origin Story',
      priority: 'P0',
      status: 'not_started',
      document: 'brand/evolution/PUBLIC-ORIGIN-STORY.md',
      tasks: [
        { id: '1-1', description: 'Interview founders for personal narrative', completed: false },
        { id: '1-2', description: 'Write compelling "Why Ferni Exists" piece', completed: false },
        { id: '1-3', description: 'Create video/podcast version of the story', completed: false },
        { id: '1-4', description: 'Publish on website + Medium + LinkedIn', completed: false },
        { id: '1-5', description: 'Prepare press kit with story assets', completed: false },
      ],
    },
    {
      id: '2',
      name: 'Thought Leadership (Manifesto)',
      priority: 'P0',
      status: 'not_started',
      document: 'brand/evolution/BETTER-THAN-HUMAN-MANIFESTO.md',
      tasks: [
        { id: '2-1', description: 'Refine internal doc for external publication', completed: false },
        { id: '2-2', description: 'Add research citations and data', completed: false },
        { id: '2-3', description: 'Create visual companion (infographic)', completed: false },
        { id: '2-4', description: 'Submit to design publications', completed: false },
        { id: '2-5', description: 'Prepare talk version for conferences', completed: false },
      ],
    },
    {
      id: '3',
      name: 'External Validation (Awards)',
      priority: 'P0',
      status: 'not_started',
      document: 'brand/evolution/AWARDS-SUBMISSION-TRACKER.md',
      tasks: [
        { id: '3-1', description: 'Research all applicable awards with deadlines', completed: false },
        { id: '3-2', description: 'Prepare case study materials', completed: false },
        { id: '3-3', description: 'Submit to Webby Awards', completed: false },
        { id: '3-4', description: 'Submit to Fast Company Innovation by Design', completed: false },
        { id: '3-5', description: 'Submit to Apple Design Awards', completed: false },
      ],
    },
    {
      id: '4',
      name: 'Community & Movement',
      priority: 'P1',
      status: 'not_started',
      document: 'brand/evolution/COMMUNITY-PLAYBOOK.md',
      tasks: [
        { id: '4-1', description: 'Launch Ferni Discord server', completed: false },
        { id: '4-2', description: 'Create "Ferni Stories" submission system', completed: false },
        { id: '4-3', description: 'Design Ambassador program structure', completed: false },
        { id: '4-4', description: 'Build first 100 superfans', completed: false },
        { id: '4-5', description: 'Create community guidelines and moderation', completed: false },
      ],
    },
    {
      id: '5',
      name: 'Physical Touchpoints',
      priority: 'P1',
      status: 'not_started',
      document: 'brand/evolution/MERCHANDISE-CONCEPTS.md',
      tasks: [
        { id: '5-1', description: 'Design Ferni plush toy prototype', completed: false },
        { id: '5-2', description: 'Create sticker pack designs', completed: false },
        { id: '5-3', description: 'Design branded notebooks/journals', completed: false },
      ],
    },
    {
      id: '6',
      name: 'Developer Ecosystem',
      priority: 'P1',
      status: 'not_started',
      document: 'brand/evolution/DEVELOPER-ECOSYSTEM.md',
      tasks: [
        { id: '6-1', description: 'Launch public API documentation', completed: false },
        { id: '6-2', description: 'Create SDK for common languages', completed: false },
        { id: '6-3', description: 'Build developer community Discord', completed: false },
      ],
    },
    {
      id: '7',
      name: 'Cultural Rituals',
      priority: 'P2',
      status: 'not_started',
      document: 'brand/evolution/CULTURAL-RITUALS.md',
      tasks: [
        { id: '7-1', description: 'Define morning ritual structure', completed: false },
        { id: '7-2', description: 'Create weekly reflection templates', completed: false },
        { id: '7-3', description: 'Design milestone celebrations', completed: false },
      ],
    },
    {
      id: '8',
      name: 'Pop Culture Integration',
      priority: 'P2',
      status: 'not_started',
      document: 'brand/evolution/POP-CULTURE-PLAYBOOK.md',
      tasks: [
        { id: '8-1', description: 'Monitor cultural moments for brand tie-ins', completed: false },
        { id: '8-2', description: 'Create reactive content calendar', completed: false },
        { id: '8-3', description: 'Build partnerships with cultural creators', completed: false },
      ],
    },
    {
      id: '9',
      name: 'Signature Moments',
      priority: 'P2',
      status: 'not_started',
      document: 'brand/evolution/SIGNATURE-MOMENTS.md',
      tasks: [
        { id: '9-1', description: 'Define 10 signature interaction moments', completed: false },
        { id: '9-2', description: 'Create animation specs for each moment', completed: false },
        { id: '9-3', description: 'Build micro-interaction library', completed: false },
      ],
    },
    {
      id: '10',
      name: 'Design Language (Open)',
      priority: 'P1',
      status: 'not_started',
      document: 'brand/evolution/FERNI-DESIGN-LANGUAGE.md',
      tasks: [
        { id: '10-1', description: 'Package design system for public release', completed: false },
        { id: '10-2', description: 'Create Figma community file', completed: false },
        { id: '10-3', description: 'Write design philosophy documentation', completed: false },
      ],
    },
    {
      id: '11',
      name: 'Social Responsibility',
      priority: 'P1',
      status: 'not_started',
      document: 'brand/evolution/ETHICAL-AI-PRINCIPLES.md',
      tasks: [
        { id: '11-1', description: 'Publish AI ethics stance', completed: false },
        { id: '11-2', description: 'Create transparency reports', completed: false },
        { id: '11-3', description: 'Establish ethics advisory board', completed: false },
      ],
    },
    {
      id: '12',
      name: 'Multi-Platform Brand',
      priority: 'P2',
      status: 'not_started',
      document: 'brand/evolution/MULTI-PLATFORM-BRAND.md',
      tasks: [
        { id: '12-1', description: 'Audit brand consistency across platforms', completed: false },
        { id: '12-2', description: 'Create platform-specific brand guides', completed: false },
        { id: '12-3', description: 'Build automated consistency checker', completed: false },
      ],
    },
    {
      id: '13',
      name: 'International Strategy',
      priority: 'P3',
      status: 'not_started',
      document: 'brand/evolution/INTERNATIONAL-STRATEGY.md',
      tasks: [
        { id: '13-1', description: 'Identify priority markets', completed: false },
        { id: '13-2', description: 'Create localization guidelines', completed: false },
        { id: '13-3', description: 'Build translation pipeline', completed: false },
      ],
    },
    {
      id: '14',
      name: 'Behind-the-Scenes',
      priority: 'P2',
      status: 'not_started',
      document: 'brand/evolution/BEHIND-THE-SCENES.md',
      tasks: [
        { id: '14-1', description: 'Create BTS content capture workflow', completed: false },
        { id: '14-2', description: 'Build team profile content', completed: false },
        { id: '14-3', description: 'Document product development journey', completed: false },
      ],
    },
    {
      id: '15',
      name: 'Easter Eggs & Superfans',
      priority: 'P2',
      status: 'not_started',
      document: 'brand/evolution/EASTER-EGGS-DEEP.md',
      tasks: [
        { id: '15-1', description: 'Design hidden features roadmap', completed: false },
        { id: '15-2', description: 'Create superfan recognition program', completed: false },
        { id: '15-3', description: 'Build easter egg discovery system', completed: false },
      ],
    },
  ];
}

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

// Awards
export async function getAwards(): Promise<Award[]> {
  const state = await loadState();
  return state.awards;
}

export async function getUpcomingAwards(days: number = 90): Promise<Award[]> {
  const state = await loadState();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + days);

  return state.awards
    .filter((a) => new Date(a.deadline) <= cutoff && a.status !== 'submitted' && a.status !== 'won')
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
}

export async function addAward(award: Omit<Award, 'id' | 'createdAt'>): Promise<Award> {
  const state = await loadState();
  const newAward: Award = {
    ...award,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };
  state.awards.push(newAward);
  await saveState(state);
  return newAward;
}

export async function updateAward(id: string, updates: Partial<Award>): Promise<Award | null> {
  const state = await loadState();
  const index = state.awards.findIndex((a) => a.id === id);
  if (index === -1) return null;

  state.awards[index] = { ...state.awards[index], ...updates };
  await saveState(state);
  return state.awards[index];
}

// Stories
export async function getStories(type?: BrandStory['type']): Promise<BrandStory[]> {
  const state = await loadState();
  return type ? state.stories.filter((s) => s.type === type) : state.stories;
}

export async function addStory(story: Omit<BrandStory, 'id' | 'createdAt'>): Promise<BrandStory> {
  const state = await loadState();
  const newStory: BrandStory = {
    ...story,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };
  state.stories.push(newStory);
  await saveState(state);
  return newStory;
}

export async function updateStory(id: string, updates: Partial<BrandStory>): Promise<BrandStory | null> {
  const state = await loadState();
  const index = state.stories.findIndex((s) => s.id === id);
  if (index === -1) return null;

  state.stories[index] = { ...state.stories[index], ...updates };
  await saveState(state);
  return state.stories[index];
}

// User Stories
export async function getUserStories(approved?: boolean): Promise<UserStory[]> {
  const state = await loadState();
  if (approved === undefined) return state.userStories;
  return state.userStories.filter((s) => s.approved === approved);
}

export async function addUserStory(story: Omit<UserStory, 'id' | 'submittedAt'>): Promise<UserStory> {
  const state = await loadState();
  const newStory: UserStory = {
    ...story,
    id: randomUUID(),
    submittedAt: new Date().toISOString(),
  };
  state.userStories.push(newStory);
  await saveState(state);
  return newStory;
}

export async function approveUserStory(id: string): Promise<UserStory | null> {
  const state = await loadState();
  const index = state.userStories.findIndex((s) => s.id === id);
  if (index === -1) return null;

  state.userStories[index].approved = true;
  state.userStories[index].approvedAt = new Date().toISOString();
  await saveState(state);
  return state.userStories[index];
}

// Workstreams
export async function getWorkstreams(priority?: Workstream['priority']): Promise<Workstream[]> {
  const state = await loadState();
  return priority ? state.workstreams.filter((w) => w.priority === priority) : state.workstreams;
}

export async function updateWorkstream(id: string, updates: Partial<Workstream>): Promise<Workstream | null> {
  const state = await loadState();
  const index = state.workstreams.findIndex((w) => w.id === id);
  if (index === -1) return null;

  state.workstreams[index] = { ...state.workstreams[index], ...updates };
  await saveState(state);
  return state.workstreams[index];
}

export async function completeWorkstreamTask(workstreamId: string, taskId: string): Promise<boolean> {
  const state = await loadState();
  const workstream = state.workstreams.find((w) => w.id === workstreamId);
  if (!workstream) return false;

  const task = workstream.tasks.find((t) => t.id === taskId);
  if (!task) return false;

  task.completed = true;
  task.completedAt = new Date().toISOString();

  // Update workstream status if all tasks done
  const allDone = workstream.tasks.every((t) => t.completed);
  if (allDone) {
    workstream.status = 'completed';
    workstream.completedAt = new Date().toISOString();
  } else if (workstream.status === 'not_started') {
    workstream.status = 'in_progress';
    workstream.startedAt = new Date().toISOString();
  }

  await saveState(state);
  return true;
}

// Audits
export async function getAudits(type?: BrandAudit['type']): Promise<BrandAudit[]> {
  const state = await loadState();
  return type ? state.audits.filter((a) => a.type === type) : state.audits;
}

export async function addAudit(audit: Omit<BrandAudit, 'id'>): Promise<BrandAudit> {
  const state = await loadState();
  const newAudit: BrandAudit = {
    ...audit,
    id: randomUUID(),
  };
  state.audits.push(newAudit);
  await saveState(state);
  return newAudit;
}

// Settings
export async function getSettings(): Promise<BrandState['settings']> {
  const state = await loadState();
  return state.settings;
}

export async function updateSettings(updates: Partial<BrandState['settings']>): Promise<BrandState['settings']> {
  const state = await loadState();
  state.settings = { ...state.settings, ...updates };
  await saveState(state);
  return state.settings;
}

// Dashboard
export async function getDashboard(): Promise<{
  awards: { total: number; upcoming: number; submitted: number; won: number };
  stories: { total: number; published: number };
  userStories: { total: number; pending: number; approved: number };
  workstreams: { total: number; notStarted: number; inProgress: number; completed: number };
  audits: { total: number; lastScore?: number };
}> {
  const state = await loadState();

  const upcomingAwards = await getUpcomingAwards(90);

  return {
    awards: {
      total: state.awards.length,
      upcoming: upcomingAwards.length,
      submitted: state.awards.filter((a) => a.status === 'submitted').length,
      won: state.awards.filter((a) => a.status === 'won').length,
    },
    stories: {
      total: state.stories.length,
      published: state.stories.filter((s) => s.platforms.some((p) => p.status === 'published')).length,
    },
    userStories: {
      total: state.userStories.length,
      pending: state.userStories.filter((s) => !s.approved).length,
      approved: state.userStories.filter((s) => s.approved).length,
    },
    workstreams: {
      total: state.workstreams.length,
      notStarted: state.workstreams.filter((w) => w.status === 'not_started').length,
      inProgress: state.workstreams.filter((w) => w.status === 'in_progress').length,
      completed: state.workstreams.filter((w) => w.status === 'completed').length,
    },
    audits: {
      total: state.audits.length,
      lastScore: state.audits.length > 0 ? state.audits[state.audits.length - 1].score : undefined,
    },
  };
}

// Reset (for testing)
export async function resetState(): Promise<void> {
  await saveState(getDefaultState());
}
