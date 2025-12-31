/**
 * Career & Professional Hooks
 *
 * Auto-indexing hooks for career and professional data.
 * Tracks goals, achievements, and professional growth.
 *
 * @module services/data-layer/hooks/career-hooks
 */

import { createDomainHook, formatField, joinNonEmpty, formatDate } from '../hook-generator.js';

// ============================================================================
// CAREER GOALS
// ============================================================================

interface CareerGoalEntity {
  goal: string;
  category: 'promotion' | 'skills' | 'transition' | 'leadership' | 'income' | 'balance';
  timeframe?: string;
  progress?: number;
  blockers?: string[];
  status?: 'active' | 'achieved' | 'deferred';
}

/**
 * Track career objectives
 */
export const onCareerGoalChange = createDomainHook<CareerGoalEntity>({
  storeType: 'career',
  entityType: 'career_goal',
  contentBuilder: (c) =>
    joinNonEmpty([
      `Career goal: ${c.goal}.`,
      `Category: ${c.category}.`,
      formatField('Timeframe', c.timeframe),
      c.progress !== undefined ? `Progress: ${c.progress}%.` : '',
      c.blockers?.length ? `Blockers: ${c.blockers.join(', ')}.` : '',
    ]),
  metadataExtractor: (c) => ({
    category: c.category,
    status: c.status,
    progress: c.progress,
  }),
  shouldSkip: (c) => c.status === 'achieved' || c.status === 'deferred',
});

// ============================================================================
// JOB SEARCH
// ============================================================================

interface JobSearchEntity {
  targetRole: string;
  targetCompanies?: string[];
  status: 'exploring' | 'active' | 'interviewing' | 'offer' | 'paused';
  applications?: number;
  interviews?: number;
  notes?: string;
}

/**
 * Track job search progress
 */
export const onJobSearchChange = createDomainHook<JobSearchEntity>({
  storeType: 'career',
  entityType: 'job_search',
  contentBuilder: (j) =>
    joinNonEmpty([
      `Job search: ${j.targetRole}.`,
      `Status: ${j.status}.`,
      j.targetCompanies?.length ? `Target companies: ${j.targetCompanies.join(', ')}.` : '',
      j.applications ? `Applications: ${j.applications}.` : '',
      j.interviews ? `Interviews: ${j.interviews}.` : '',
    ]),
  metadataExtractor: (j) => ({
    status: j.status,
    targetRole: j.targetRole,
  }),
  shouldSkip: (j) => j.status === 'paused',
});

// ============================================================================
// SKILL DEVELOPMENT
// ============================================================================

interface SkillDevelopmentEntity {
  skill: string;
  currentLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  targetLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  method?: string;
  resources?: string[];
  progress?: number;
}

/**
 * Track skills being developed
 */
export const onSkillDevelopmentChange = createDomainHook<SkillDevelopmentEntity>({
  storeType: 'career',
  entityType: 'skill_development',
  contentBuilder: (s) =>
    joinNonEmpty([
      `Skill: ${s.skill}.`,
      `Level: ${s.currentLevel} → ${s.targetLevel}.`,
      formatField('Method', s.method),
      s.progress !== undefined ? `Progress: ${s.progress}%.` : '',
    ]),
  metadataExtractor: (s) => ({
    skill: s.skill,
    currentLevel: s.currentLevel,
    targetLevel: s.targetLevel,
  }),
});

// ============================================================================
// PROFESSIONAL NETWORK
// ============================================================================

interface ProfessionalNetworkEntity {
  person: string;
  company?: string;
  role?: string;
  connectionType: 'mentor' | 'peer' | 'mentee' | 'contact' | 'recruiter';
  strength: 'weak' | 'moderate' | 'strong';
  lastContact?: string;
  notes?: string;
}

/**
 * Track professional network
 */
export const onProfessionalNetworkChange = createDomainHook<ProfessionalNetworkEntity>({
  storeType: 'career',
  entityType: 'professional_network',
  contentBuilder: (p) =>
    joinNonEmpty([
      `Professional contact: ${p.person}.`,
      formatField('Company', p.company),
      formatField('Role', p.role),
      `Connection: ${p.connectionType} (${p.strength}).`,
      formatField('Notes', p.notes),
    ]),
  metadataExtractor: (p) => ({
    connectionType: p.connectionType,
    strength: p.strength,
    company: p.company,
  }),
});

// ============================================================================
// WORK ACHIEVEMENTS
// ============================================================================

interface WorkAchievementEntity {
  achievement: string;
  impact: string;
  date?: string;
  recognized?: boolean;
  category?: 'project' | 'leadership' | 'innovation' | 'collaboration' | 'growth';
}

/**
 * Track work accomplishments
 */
export const onWorkAchievementChange = createDomainHook<WorkAchievementEntity>({
  storeType: 'career',
  entityType: 'work_achievement',
  contentBuilder: (w) =>
    joinNonEmpty([
      `Achievement: ${w.achievement}.`,
      `Impact: ${w.impact}.`,
      formatField('Date', w.date ? formatDate(w.date) : undefined),
      formatField('Category', w.category),
      w.recognized ? 'Recognized.' : '',
    ]),
  metadataExtractor: (w) => ({
    category: w.category,
    recognized: w.recognized,
    date: w.date,
  }),
});

// ============================================================================
// CAREER REFLECTIONS
// ============================================================================

interface CareerReflectionEntity {
  reflection: string;
  topic: string;
  insight?: string;
  actionItem?: string;
}

/**
 * Track career reflections
 */
export const onCareerReflectionChange = createDomainHook<CareerReflectionEntity>({
  storeType: 'career',
  entityType: 'career_reflection',
  contentBuilder: (c) =>
    joinNonEmpty([
      `Career reflection on ${c.topic}: ${c.reflection}.`,
      formatField('Insight', c.insight),
      formatField('Action item', c.actionItem),
    ]),
  metadataExtractor: (c) => ({
    topic: c.topic,
  }),
});

// ============================================================================
// WORK CHALLENGES
// ============================================================================

interface WorkChallengeEntity {
  challenge: string;
  context: string;
  status: 'active' | 'resolved' | 'ongoing';
  strategies?: string[];
  lessons?: string;
}

/**
 * Track current work challenges
 */
export const onWorkChallengeChange = createDomainHook<WorkChallengeEntity>({
  storeType: 'career',
  entityType: 'work_challenge',
  contentBuilder: (w) =>
    joinNonEmpty([
      `Work challenge: ${w.challenge}.`,
      `Context: ${w.context}.`,
      `Status: ${w.status}.`,
      w.strategies?.length ? `Strategies: ${w.strategies.join(', ')}.` : '',
    ]),
  metadataExtractor: (w) => ({
    status: w.status,
  }),
  shouldSkip: (w) => w.status === 'resolved',
});

// ============================================================================
// CAREER ASPIRATIONS
// ============================================================================

interface CareerAspirationEntity {
  aspiration: string;
  why: string;
  timeframe?: 'near' | 'medium' | 'long';
  blockers?: string[];
  firstSteps?: string[];
}

/**
 * Track long-term career dreams
 */
export const onCareerAspirationChange = createDomainHook<CareerAspirationEntity>({
  storeType: 'career',
  entityType: 'career_aspiration',
  contentBuilder: (c) =>
    joinNonEmpty([
      `Career aspiration: ${c.aspiration}.`,
      `Why: ${c.why}.`,
      formatField('Timeframe', c.timeframe),
      c.firstSteps?.length ? `First steps: ${c.firstSteps.join(', ')}.` : '',
    ]),
  metadataExtractor: (c) => ({
    timeframe: c.timeframe,
  }),
});

// ============================================================================
// EXPORTS
// ============================================================================

export const careerHooks = {
  onCareerGoalChange,
  onJobSearchChange,
  onSkillDevelopmentChange,
  onProfessionalNetworkChange,
  onWorkAchievementChange,
  onCareerReflectionChange,
  onWorkChallengeChange,
  onCareerAspirationChange,
};

export default careerHooks;
