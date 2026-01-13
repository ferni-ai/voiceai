/**
 * Habit Coaching Constants
 *
 * All constant data for the habit coaching system.
 * Split from habit-coaching.ts for maintainability.
 *
 * NOTE: This file contains the core reference data.
 * The larger THIRTY_DAY_CHALLENGES and HABIT_TEMPLATES
 * are in separate files: challenges.ts and templates.ts
 */
import type { LifeDomain, GlidepathLevel } from './types.js';
export declare const LIFE_DOMAINS: {
    readonly health: {
        readonly name: "Health & Wellness";
        readonly icon: "💪";
        readonly description: "Physical health, fitness, nutrition, sleep";
        readonly subdomains: readonly ["exercise", "nutrition", "sleep", "hydration", "medical", "energy"];
    };
    readonly mind: {
        readonly name: "Mental & Emotional";
        readonly icon: "🧠";
        readonly description: "Mental health, stress, mindfulness, emotional wellbeing";
        readonly subdomains: readonly ["mindfulness", "stress", "therapy", "journaling", "gratitude", "meditation"];
    };
    readonly relationships: {
        readonly name: "Relationships";
        readonly icon: "❤️";
        readonly description: "Family, friends, romantic, community connections";
        readonly subdomains: readonly ["family", "friends", "romantic", "community", "networking", "communication"];
    };
    readonly career: {
        readonly name: "Career & Purpose";
        readonly icon: "💼";
        readonly description: "Work, professional development, purpose";
        readonly subdomains: readonly ["skills", "productivity", "leadership", "side_projects", "job_search", "mentorship"];
    };
    readonly learning: {
        readonly name: "Learning & Growth";
        readonly icon: "📚";
        readonly description: "Education, skills, personal development";
        readonly subdomains: readonly ["reading", "courses", "languages", "certifications", "hobbies", "creativity"];
    };
    readonly finance: {
        readonly name: "Financial Wellness";
        readonly icon: "💰";
        readonly description: "Money habits, saving, investing, spending";
        readonly subdomains: readonly ["saving", "budgeting", "investing", "debt", "income", "generosity"];
    };
    readonly home: {
        readonly name: "Home & Environment";
        readonly icon: "🏠";
        readonly description: "Living space, organization, sustainability";
        readonly subdomains: readonly ["cleaning", "organization", "maintenance", "sustainability", "cooking", "garden"];
    };
    readonly selfCare: {
        readonly name: "Self Care & Joy";
        readonly icon: "✨";
        readonly description: "Rest, hobbies, fun, personal time";
        readonly subdomains: readonly ["rest", "hobbies", "entertainment", "boundaries", "self_compassion", "adventure"];
    };
};
export declare const LIFE_STAGES: {
    readonly student: {
        readonly name: "Student";
        readonly priorities: LifeDomain[];
        readonly challenges: readonly ["time_management", "focus", "budget_constraints", "stress"];
        readonly opportunities: readonly ["habit_foundation", "learning_capacity", "flexibility"];
    };
    readonly early_career: {
        readonly name: "Early Career";
        readonly priorities: LifeDomain[];
        readonly challenges: readonly ["work_life_balance", "financial_foundation", "identity"];
        readonly opportunities: readonly ["income_growth", "skill_building", "networking"];
    };
    readonly new_parent: {
        readonly name: "New Parent";
        readonly priorities: LifeDomain[];
        readonly challenges: readonly ["sleep_deprivation", "time_scarcity", "identity_shift"];
        readonly opportunities: readonly ["family_bonding", "perspective_shift", "resilience"];
    };
    readonly mid_career: {
        readonly name: "Mid Career";
        readonly priorities: LifeDomain[];
        readonly challenges: readonly ["burnout", "stagnation", "sandwich_generation"];
        readonly opportunities: readonly ["peak_earning", "leadership", "mentoring"];
    };
    readonly empty_nester: {
        readonly name: "Empty Nester";
        readonly priorities: LifeDomain[];
        readonly challenges: readonly ["identity_redefinition", "relationship_renewal", "health_focus"];
        readonly opportunities: readonly ["freedom", "rediscovery", "travel", "purpose"];
    };
    readonly pre_retirement: {
        readonly name: "Pre-Retirement";
        readonly priorities: LifeDomain[];
        readonly challenges: readonly ["retirement_planning", "health_optimization", "meaning"];
        readonly opportunities: readonly ["wealth_building", "legacy", "bucket_list"];
    };
    readonly retirement: {
        readonly name: "Retirement";
        readonly priorities: LifeDomain[];
        readonly challenges: readonly ["structure", "purpose", "health_management", "social"];
        readonly opportunities: readonly ["freedom", "grandparenting", "giving_back", "travel"];
    };
    readonly transition: {
        readonly name: "Life Transition";
        readonly priorities: LifeDomain[];
        readonly challenges: readonly ["uncertainty", "stress", "identity", "planning"];
        readonly opportunities: readonly ["reinvention", "fresh_start", "clarity"];
    };
};
export declare const FOUR_TENDENCIES_STRATEGIES: {
    readonly upholder: {
        readonly name: "Upholder";
        readonly description: "You meet both outer expectations (from others) and inner expectations (from yourself). You love schedules, to-do lists, and clear rules.";
        readonly habitStrategies: readonly ["Set clear rules and schedules for yourself", "Create detailed to-do lists and check them off", "Use habit tracking apps religiously", "Set personal deadlines and honor them", "Create routines and stick to them"];
        readonly avoid: readonly ["Don't be too rigid - allow for flexibility", "Watch out for \"tightening\" - making rules stricter over time", "Remember that rest and fun are also \"productive\""];
        readonly motivationTip: "You respond to clear expectations. Put your habits on your calendar and treat them as non-negotiable appointments.";
    };
    readonly questioner: {
        readonly name: "Questioner";
        readonly description: "You question all expectations and only follow through if you have good reasons. You need to understand WHY before you commit.";
        readonly habitStrategies: readonly ["Research the science behind habits before starting", "Understand exactly WHY this habit matters", "Set your own goals based on your reasoning", "Question advice and customize to fit your logic", "Track data to prove the habit is working"];
        readonly avoid: readonly ["Analysis paralysis - at some point, just start", "Questioning to the point of decision fatigue", "Rejecting good advice just because you didn't come up with it"];
        readonly motivationTip: "You need to buy into the WHY. Once you truly believe a habit serves your goals, you'll follow through. Do the research first.";
    };
    readonly obliger: {
        readonly name: "Obliger";
        readonly description: "You meet outer expectations (for others) but struggle with inner expectations (for yourself). You need external accountability.";
        readonly habitStrategies: readonly ["Get an accountability partner or coach", "Join a group or class with attendance expectations", "Make appointments you can't cancel", "Tell others about your goals publicly", "Set up external consequences (like charitable donations if you miss)"];
        readonly avoid: readonly ["Obliger rebellion - pushing yourself too hard until you snap", "Saying yes to everyone else's needs before your own", "Feeling guilty for needing external accountability"];
        readonly motivationTip: "Your superpower is following through for others. Harness this by creating external accountability structures. This isn't weakness - it's self-knowledge.";
    };
    readonly rebel: {
        readonly name: "Rebel";
        readonly description: "You resist ALL expectations, both outer and inner. You want to act from freedom and choice, doing things your way.";
        readonly habitStrategies: readonly ["Frame habits as choices, not rules (\"I can\" not \"I must\")", "Connect habits to your identity (\"I'm someone who...\")", "Maintain freedom and options within the habit", "Challenge yourself to prove you CAN do it", "Make the habit feel like defiance of limitation"];
        readonly avoid: readonly ["Don't set rigid rules - they'll trigger resistance", "Avoid tracking streaks - they feel like obligations", "Don't let others tell you what to do"];
        readonly motivationTip: "Frame every habit as YOUR choice that expresses who you are. \"I'm the kind of person who...\" works better than any rule. You do things because you WANT to, not because you should.";
    };
};
export declare const GLIDEPATH_LEVELS: GlidepathLevel[];
export declare const SELF_COMPASSION_MESSAGES: Record<string, string>;
export declare const ACCOUNTABILITY_TIPS: Record<string, string[]>;
export declare const ENVIRONMENT_BUILD_STRATEGIES: string[];
export declare const ENVIRONMENT_BREAK_STRATEGIES: string[];
//# sourceMappingURL=constants.d.ts.map