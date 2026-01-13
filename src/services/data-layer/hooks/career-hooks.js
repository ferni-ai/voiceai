/**
 * Career & Professional Hooks
 *
 * Auto-indexing hooks for career and professional data.
 * Tracks goals, achievements, and professional growth.
 *
 * @module services/data-layer/hooks/career-hooks
 */
import { createDomainHook, formatField, joinNonEmpty, formatDate } from '../hook-generator.js';
/**
 * Track career objectives
 */
export const onCareerGoalChange = createDomainHook({
    storeType: 'career',
    entityType: 'career_goal',
    contentBuilder: (c) => joinNonEmpty([
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
/**
 * Track job search progress
 */
export const onJobSearchChange = createDomainHook({
    storeType: 'career',
    entityType: 'job_search',
    contentBuilder: (j) => joinNonEmpty([
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
/**
 * Track skills being developed
 */
export const onSkillDevelopmentChange = createDomainHook({
    storeType: 'career',
    entityType: 'skill_development',
    contentBuilder: (s) => joinNonEmpty([
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
/**
 * Track professional network
 */
export const onProfessionalNetworkChange = createDomainHook({
    storeType: 'career',
    entityType: 'professional_network',
    contentBuilder: (p) => joinNonEmpty([
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
/**
 * Track work accomplishments
 */
export const onWorkAchievementChange = createDomainHook({
    storeType: 'career',
    entityType: 'work_achievement',
    contentBuilder: (w) => joinNonEmpty([
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
/**
 * Track career reflections
 */
export const onCareerReflectionChange = createDomainHook({
    storeType: 'career',
    entityType: 'career_reflection',
    contentBuilder: (c) => joinNonEmpty([
        `Career reflection on ${c.topic}: ${c.reflection}.`,
        formatField('Insight', c.insight),
        formatField('Action item', c.actionItem),
    ]),
    metadataExtractor: (c) => ({
        topic: c.topic,
    }),
});
/**
 * Track current work challenges
 */
export const onWorkChallengeChange = createDomainHook({
    storeType: 'career',
    entityType: 'work_challenge',
    contentBuilder: (w) => joinNonEmpty([
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
/**
 * Track long-term career dreams
 */
export const onCareerAspirationChange = createDomainHook({
    storeType: 'career',
    entityType: 'career_aspiration',
    contentBuilder: (c) => joinNonEmpty([
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
//# sourceMappingURL=career-hooks.js.map