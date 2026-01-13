/**
 * Career & Professional Hooks
 *
 * Auto-indexing hooks for career and professional data.
 * Tracks goals, achievements, and professional growth.
 *
 * @module services/data-layer/hooks/career-hooks
 */
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
export declare const onCareerGoalChange: import("../hook-generator.js").DomainHook<CareerGoalEntity>;
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
export declare const onJobSearchChange: import("../hook-generator.js").DomainHook<JobSearchEntity>;
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
export declare const onSkillDevelopmentChange: import("../hook-generator.js").DomainHook<SkillDevelopmentEntity>;
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
export declare const onProfessionalNetworkChange: import("../hook-generator.js").DomainHook<ProfessionalNetworkEntity>;
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
export declare const onWorkAchievementChange: import("../hook-generator.js").DomainHook<WorkAchievementEntity>;
interface CareerReflectionEntity {
    reflection: string;
    topic: string;
    insight?: string;
    actionItem?: string;
}
/**
 * Track career reflections
 */
export declare const onCareerReflectionChange: import("../hook-generator.js").DomainHook<CareerReflectionEntity>;
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
export declare const onWorkChallengeChange: import("../hook-generator.js").DomainHook<WorkChallengeEntity>;
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
export declare const onCareerAspirationChange: import("../hook-generator.js").DomainHook<CareerAspirationEntity>;
export declare const careerHooks: {
    onCareerGoalChange: import("../hook-generator.js").DomainHook<CareerGoalEntity>;
    onJobSearchChange: import("../hook-generator.js").DomainHook<JobSearchEntity>;
    onSkillDevelopmentChange: import("../hook-generator.js").DomainHook<SkillDevelopmentEntity>;
    onProfessionalNetworkChange: import("../hook-generator.js").DomainHook<ProfessionalNetworkEntity>;
    onWorkAchievementChange: import("../hook-generator.js").DomainHook<WorkAchievementEntity>;
    onCareerReflectionChange: import("../hook-generator.js").DomainHook<CareerReflectionEntity>;
    onWorkChallengeChange: import("../hook-generator.js").DomainHook<WorkChallengeEntity>;
    onCareerAspirationChange: import("../hook-generator.js").DomainHook<CareerAspirationEntity>;
};
export default careerHooks;
//# sourceMappingURL=career-hooks.d.ts.map