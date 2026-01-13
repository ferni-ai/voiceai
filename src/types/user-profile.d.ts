/**
 * User Profile Types
 *
 * Comprehensive type definitions for persistent user memory,
 * preferences, relationship history, and financial context.
 */
import type { HumanMemory } from './human-memory.js';
import type { PersonalJourneyData } from './personal-journey.js';
import type { SubscriptionData } from './subscription.js';
/**
 * Voice sketch - compact representation of voice characteristics
 * Used for "Your voice sounds familiar" recognition across devices
 */
export interface VoiceSketch {
    pitchMean: number;
    pitchMin: number;
    pitchMax: number;
    pitchStdDev: number;
    speakingRateMean: number;
    pauseFrequency: number;
    avgPauseDuration: number;
    spectralCentroidMean: number;
    spectralCentroidStdDev: number;
    spectralRolloffMean: number;
    energyMean: number;
    energyStdDev: number;
    samplesAnalyzed: number;
    totalDurationMs: number;
    confidence: number;
    createdAt: Date;
    updatedAt: Date;
}
/**
 * Communication style learned from user interactions
 */
export type CommunicationStyle = 'formal' | 'casual' | 'playful' | 'mixed';
/**
 * User's preferred speaking pace (words per minute buckets)
 */
export type SpeakingPace = 'slow' | 'moderate' | 'fast';
/**
 * Emotional patterns observed over time
 */
export interface EmotionalPattern {
    timestamp: Date;
    emotion: string;
    intensity: number;
    context?: string;
    trigger?: string;
}
/**
 * Important moments from conversations
 */
export interface KeyMoment {
    id: string;
    timestamp: Date;
    type: 'shared_vulnerability' | 'breakthrough' | 'milestone' | 'concern' | 'celebration' | 'decision';
    summary: string;
    emotionalWeight: 'light' | 'medium' | 'heavy';
    topics: string[];
    followUpNeeded?: boolean;
    followUpDate?: Date;
}
/**
 * Story that Jack has shared with this user
 */
export interface SharedStory {
    storyId: string;
    theme: string;
    sharedAt: Date;
    userReaction?: 'positive' | 'neutral' | 'moved' | 'curious';
    context: string;
}
/**
 * Conversation summary for long-term memory
 */
export interface ConversationSummary {
    id: string;
    sessionId: string;
    timestamp: Date;
    duration: number;
    turnCount: number;
    mainTopics: string[];
    keyPoints: string[];
    emotionalArc: string;
    decisionsReached?: string[];
    questionsRemaining?: string[];
    followUpItems?: string[];
    embedding?: number[];
}
/**
 * User's risk tolerance profile
 */
export interface RiskProfile {
    tolerance: 'conservative' | 'moderate' | 'aggressive' | 'unknown';
    confidence: number;
    assessedAt: Date;
    factors: string[];
}
/**
 * Financial goal with progress tracking
 */
export interface FinancialGoal {
    id: string;
    name: string;
    type: 'retirement' | 'education' | 'home' | 'emergency' | 'travel' | 'other';
    targetAmount?: number;
    targetDate?: Date;
    timeHorizon: 'short' | 'medium' | 'long' | 'unknown';
    currentProgress?: number;
    progressPercent?: number;
    status: 'planning' | 'active' | 'on_track' | 'behind' | 'achieved' | 'abandoned';
    priority: 'high' | 'medium' | 'low';
    createdAt: Date;
    updatedAt: Date;
    milestones?: Array<{
        date: Date;
        note: string;
    }>;
    jackNotes?: string;
}
/**
 * Significant investment-related event
 */
export interface InvestmentEvent {
    id: string;
    timestamp: Date;
    type: 'started_investing' | 'major_contribution' | 'withdrawal' | 'rebalance' | 'market_concern' | 'goal_reached' | 'strategy_change' | 'question_asked';
    description: string;
    emotionalContext?: string;
    outcome?: string;
}
/**
 * Primary financial concern
 */
export type PrimaryConcern = 'retirement' | 'savings' | 'debt' | 'education' | 'market_volatility' | 'inflation' | 'job_security' | 'healthcare' | 'legacy' | 'general' | 'none';
/**
 * Life stage of the user
 */
export type LifeStage = 'young_adult' | 'early_career' | 'mid_career' | 'pre_retirement' | 'retirement';
/**
 * Significant life event (for Jordan's Life's Firsts coordination)
 */
export interface LifeEvent {
    id: string;
    type: 'wedding' | 'baby' | 'first_home' | 'graduation' | 'retirement_start' | 'milestone_birthday' | 'career_change' | 'relocation' | 'loss' | 'celebration' | 'other';
    title: string;
    description?: string;
    date?: Date;
    status: 'planning' | 'upcoming' | 'in_progress' | 'completed' | 'ongoing';
    budget?: number;
    checklist?: Array<{
        id: string;
        task: string;
        completed: boolean;
        dueDate?: Date;
        assignee?: 'jordan' | 'maya' | 'alex' | 'user';
    }>;
    teamInvolved?: Array<'jordan' | 'maya' | 'alex' | 'jack' | 'peter'>;
    emotionalSignificance: 'routine' | 'meaningful' | 'major' | 'life_changing';
    userSentiment?: 'excited' | 'anxious' | 'neutral' | 'mixed' | 'stressed';
    createdAt: Date;
    updatedAt: Date;
    completedAt?: Date;
    notes?: Array<{
        from: string;
        content: string;
        timestamp: Date;
    }>;
}
/**
 * Verbosity preference
 */
export type VerbosityPreference = 'concise' | 'balanced' | 'storytelling';
/**
 * Investment account types
 */
export interface InvestmentAccount {
    type: '401k' | 'IRA' | 'Roth IRA' | 'Brokerage' | 'HSA' | 'Other';
    hasAccount: boolean;
}
/**
 * User's current financial situation
 */
export interface FinancialSituation {
    hasEmergencyFund: boolean;
    hasDebt: boolean;
    debtTypes?: string[];
    investmentAccounts: InvestmentAccount[];
    monthlyIncome?: number;
    monthlyExpenses?: number;
}
/**
 * User preferences for personalization
 */
export interface UserPreferences {
    verbosity: VerbosityPreference;
    topicsToAvoid: string[];
    preferredGreeting?: string;
    wantsProactiveAdvice: boolean;
    financialPrivacyLevel: 'open' | 'moderate' | 'private';
    /** Preferred English accent for TTS (american, british, australian, indian) */
    preferredAccent?: 'american' | 'british' | 'australian' | 'indian';
    /** Primary language code (e.g., 'en-US', 'en-GB') - auto-detected or manually set */
    locale?: string;
    /** All detected/preferred languages (from browser Accept-Language) */
    locales?: string[];
    /** Whether the accent was auto-detected or manually set by user */
    accentAutoDetected?: boolean;
    /** Settings for important date reminders (birthdays, anniversaries, etc.) */
    reminderSettings?: {
        enabled: boolean;
        daysBefore: number;
        channels: {
            voice: boolean;
            push: boolean;
            email: boolean;
        };
        includeGiftSuggestions: boolean;
        includeMessageDrafts: boolean;
    };
    /** Cached upcoming important dates to remind about */
    upcomingReminders?: Array<{
        type: string;
        date: string;
        contactName?: string;
    }>;
}
/**
 * 🎧 Music preferences learned across sessions
 */
export interface MusicMemory {
    /** Artists they've requested or enjoyed */
    favoriteArtists: string[];
    /** Genres they gravitate toward */
    favoriteGenres: string[];
    /** Artists/genres they've skipped or disliked */
    dislikedArtists: string[];
    /** Total tracks played across all sessions */
    totalTracksPlayed: number;
    /** Last artist played */
    lastPlayedArtist?: string;
    /** Last track played */
    lastPlayedTrack?: string;
    /** Time of day they usually listen */
    preferredMusicTimes?: Array<'morning' | 'afternoon' | 'evening' | 'night'>;
    /** Moods when they tend to want music */
    musicMoods?: string[];
    /** Music preferences by mood (mood -> list of artists/genres) */
    moodMusicPreferences?: Record<string, string[]>;
    /** Special music moments shared with the user */
    sharedMoments?: Array<{
        description: string;
        artist: string;
        timestamp: number;
    }>;
    /** Last updated */
    updatedAt?: Date;
}
/** Stats for a specific game type */
export interface GameTypeStats {
    /** Total games played */
    gamesPlayed: number;
    /** All-time high score */
    highScore: number;
    /** Total points earned across all games */
    totalScore: number;
    /** Average score */
    averageScore: number;
    /** Last time this game was played */
    lastPlayed: Date;
    /** Win rate (for games with win/lose) */
    winRate?: number;
}
/** A single game session record */
export interface GameSessionRecord {
    /** Which game was played */
    gameType: string;
    /** Score achieved */
    score: number;
    /** Rounds played */
    roundsPlayed: number;
    /** Duration in seconds */
    durationSeconds: number;
    /** When it was played */
    playedAt: Date;
    /** Which persona played with them */
    personaId: string;
    /** Notable moments (e.g., "guessed Bohemian Rhapsody in 2 seconds!") */
    highlights?: string[];
}
/** Affinity score for a genre or decade */
export interface AffinityScore {
    /** The category (genre or decade) */
    category: string;
    /** How many times they've guessed correctly in this category */
    correctGuesses: number;
    /** How many times they've been tested in this category */
    totalAttempts: number;
    /** Average guess time in milliseconds (lower = stronger affinity) */
    avgGuessTimeMs: number;
    /** Success rate (0-1) */
    successRate: number;
    /** Overall affinity score (0-100) combining speed and accuracy */
    affinityScore: number;
}
/** Milestone achievement */
export interface GameMilestone {
    /** Milestone type */
    type: 'first_game' | 'first_perfect_round' | 'ten_games' | 'fifty_games' | 'fastest_guess' | 'high_score_beaten' | 'genre_master' | 'decade_specialist' | 'streak_five' | 'streak_ten' | 'music_savant';
    /** When it was achieved */
    achievedAt: Date;
    /** Game it was achieved in */
    gameType: string;
    /** Additional context */
    context?: string;
    /** Has it been celebrated? */
    celebrated: boolean;
}
/** Musical personality trait */
export interface MusicalPersonalityTrait {
    /** The trait */
    trait: 'nostalgic' | 'eclectic' | 'genre_loyal' | 'decade_specialist' | 'quick_ear' | 'thoughtful' | 'adventurous' | 'classic_lover' | 'deep_cuts_fan' | 'lyric_focused' | 'vibe_chaser';
    /** Confidence in this trait (0-1) */
    confidence: number;
    /** Evidence for this trait */
    evidence: string[];
    /** When this was last updated */
    updatedAt: Date;
}
/** Guess timing record */
export interface GuessTimingRecord {
    /** Song or item guessed */
    item: string;
    /** Time to guess in milliseconds */
    guessTimeMs: number;
    /** Was it correct */
    correct: boolean;
    /** Genre if known */
    genre?: string;
    /** Decade if known */
    decade?: string;
    /** When this happened */
    timestamp: Date;
}
/** Complete game memory for a user */
export interface GameMemory {
    /** Stats by game type */
    gameStats: Record<string, GameTypeStats>;
    /** Recent game sessions (last 20) */
    recentGames: GameSessionRecord[];
    /** Favorite games (most played) */
    favoriteGames: string[];
    /** Total games played across all types */
    totalGamesPlayed: number;
    /** Last game played */
    lastGamePlayed?: {
        gameType: string;
        playedAt: Date;
        score: number;
    };
    /** Songs they've correctly guessed in Name That Tune */
    songsGuessedCorrectly?: string[];
    /** Their Desert Island picks (memorable!) */
    desertIslandPicks?: string[];
    /** Genre affinity scores */
    genreAffinities?: Record<string, AffinityScore>;
    /** Decade affinity scores */
    decadeAffinities?: Record<string, AffinityScore>;
    /** Recent guess timing records (for calculating averages) */
    recentGuessTimings?: GuessTimingRecord[];
    /** Fastest guess ever (milliseconds) */
    fastestGuessMs?: number;
    /** Fastest guess song */
    fastestGuessSong?: string;
    /** Current correct streak */
    currentStreak?: number;
    /** Best streak ever */
    bestStreak?: number;
    /** Milestones achieved */
    milestones?: GameMilestone[];
    /** Musical personality traits detected */
    musicalPersonality?: MusicalPersonalityTrait[];
    /** Difficulty preference (auto-adjusted) */
    preferredDifficulty?: 'easy' | 'medium' | 'hard' | 'adaptive';
    /** Current adaptive difficulty multiplier (0.5-2.0) */
    adaptiveDifficultyMultiplier?: number;
    /** Topics/themes mentioned in conversation that relate to music */
    conversationMusicHints?: Array<{
        topic: string;
        relatedArtists?: string[];
        relatedGenres?: string[];
        mentionedAt: Date;
    }>;
    /** Last updated */
    updatedAt: Date;
}
/**
 * Relationship stage with Jack
 */
export type RelationshipStage = 'new_acquaintance' | 'getting_to_know' | 'trusted_advisor' | 'old_friend';
/**
 * Family member mentioned by user
 */
export interface FamilyMember {
    relationship: string;
    name?: string;
    mentionedTopics?: string[];
    lastMentioned?: Date;
}
/**
 * Relationship stages with a specific persona
 * Different from global relationship - tracks depth with EACH team member
 */
export type PersonaRelationshipStage = 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
/**
 * Detailed relationship data for a specific persona
 */
export interface PerPersonaRelationshipData {
    /** Total conversation count with this persona */
    conversationCount: number;
    /** Total minutes talked (estimated) */
    totalMinutes: number;
    /** Key moments shared with this persona */
    keyMoments: Array<{
        type: 'breakthrough' | 'vulnerability' | 'celebration' | 'support' | 'humor';
        summary: string;
        timestamp: Date;
    }>;
    /** Stories this persona has told the user */
    storiesTold: string[];
    /** Vulnerability moments shared with this persona */
    vulnerabilityCount: number;
    /** Topics frequently discussed with this persona */
    frequentTopics: string[];
    /** Last interaction timestamp */
    lastInteraction?: Date;
    /** First interaction timestamp */
    firstInteraction?: Date;
}
/**
 * Complete user profile with all persistent data
 */
export interface UserProfile {
    id: string;
    name?: string;
    preferredName?: string;
    linkedIdentifiers?: string[];
    voiceSketch?: VoiceSketch;
    onboarding?: {
        /** Steps completed */
        completedSteps: Array<'welcome' | 'name' | 'preferences' | 'first_conversation'>;
        /** User's name captured during onboarding */
        userName?: string;
        /** When onboarding started */
        startedAt?: string;
        /** When onboarding completed */
        completedAt?: string;
        /** Whether user has had their first conversation */
        hasHadFirstConversation?: boolean;
    };
    contactInfo?: {
        phone?: string;
        email?: string;
        preferredContactMethod?: 'sms' | 'email' | 'call' | 'voice_message';
        timezone?: string;
        quietHoursStart?: number;
        quietHoursEnd?: number;
    };
    location?: {
        city?: string;
        regionCode?: string;
        countryCode?: string;
        latitude?: number;
        longitude?: number;
        source: 'browser-gps' | 'manual' | 'ip-geo' | 'timezone' | 'accept-language' | 'default';
        confidence: 'high' | 'medium' | 'low';
        lastUpdated: string;
    };
    firstContact: Date;
    lastContact: Date;
    totalConversations: number;
    totalMinutesTalked: number;
    communicationStyle: CommunicationStyle;
    speakingPace: SpeakingPace;
    averageWPM?: number;
    preferredTopics: string[];
    avoidTopics: string[];
    humorAppreciation: 'high' | 'medium' | 'low';
    relationshipStage: RelationshipStage;
    familyMembers: FamilyMember[];
    keyMoments: KeyMoment[];
    sharedStories: SharedStory[];
    emotionalPatterns: EmotionalPattern[];
    riskProfile: RiskProfile;
    goals: FinancialGoal[];
    primaryConcerns: PrimaryConcern[];
    investmentEvents: InvestmentEvent[];
    hasInvestments: boolean;
    investmentExperience: 'beginner' | 'intermediate' | 'experienced' | 'unknown';
    financialSituation?: FinancialSituation;
    financialAnxietyTriggers?: string[];
    lifeStage?: LifeStage;
    lifeEvents?: LifeEvent[];
    preferences: UserPreferences;
    musicMemory?: MusicMemory;
    /** 🎮 Game history and stats across sessions */
    gameMemory?: GameMemory;
    conversationSummaries: ConversationSummary[];
    lastConversationSummary?: string;
    openQuestions: string[];
    pendingFollowUps: Array<{
        topic: string;
        targetDate: Date;
        reason: string;
    }>;
    currentSessionId?: string;
    currentMood?: string;
    currentEnergyLevel?: 'low' | 'medium' | 'high';
    customData?: Record<string, unknown>;
    /**
     * Small details extracted from conversations (names, places, pets, etc.)
     * Persisted in real-time to prevent data loss on unexpected disconnects.
     * "Better than Human" - We remember every little thing you share.
     */
    extractedDetails?: Array<{
        type: 'person_name' | 'pet_name' | 'place' | 'company' | 'date' | 'amount' | 'user_name' | 'other';
        value: string;
    }>;
    /**
     * Humanizing state persisted across sessions.
     * Enables the AI to remember mood patterns, spontaneous shares,
     * and build genuine relationship depth over time.
     */
    humanizingState?: {
        /** Tags from spontaneous shares already used (to avoid repetition) */
        usedShareTags: string[];
        /** Total spontaneous shares across all sessions */
        totalSpontaneousShares: number;
        /** Last persona mood (for continuity) */
        lastMood?: 'energized' | 'reflective' | 'playful' | 'grounded' | 'tired_but_present' | 'philosophical' | 'nostalgic';
        /** Mood history (last 10 moods for pattern detection) */
        moodHistory?: Array<{
            mood: string;
            timestamp: Date;
            sessionId: string;
        }>;
        /** Stories/micro-stories told to this user */
        storiesTold?: string[];
        /** Hot takes shared with this user */
        hotTakesShared?: string[];
        /** Inner world content revealed */
        innerWorldRevealed?: Array<{
            type: string;
            content: string;
            sharedAt: Date;
        }>;
        /** Relationship transition moments */
        relationshipMilestones?: Array<{
            from: string;
            to: string;
            timestamp: Date;
            acknowledgmentGiven: boolean;
        }>;
        /** Vulnerability moments shared by persona */
        vulnerabilityMoments?: number;
        /** Greetings used (hashes to prevent repetition) */
        usedGreetings?: string[];
        /** Last greeting timestamp */
        lastGreetingAt?: Date;
        /** Last updated */
        updatedAt: Date;
        /** Per-persona meeting counts (for self-aware entrances) */
        perPersonaMeetingCounts?: Record<string, number>;
        /** Last topic discussed with each persona (for memory callbacks) */
        perPersonaLastTopic?: Record<string, string>;
        /** Per-persona relationship stage (stranger -> acquaintance -> friend -> trusted_advisor) */
        perPersonaRelationshipStage?: Record<string, PersonaRelationshipStage>;
        /** Per-persona relationship depth data */
        perPersonaRelationshipData?: Record<string, PerPersonaRelationshipData>;
    };
    responseQuality?: {
        signals: Array<{
            id: string;
            timestamp: Date;
            responseType: string;
            responseLength: string;
            topic: string;
            userReaction: string;
            engagementScore: number;
        }>;
        preferences?: {
            likesStories: boolean;
            likesHumor: boolean;
            likesQuestions: boolean;
            prefersDirectAdvice: boolean;
            preferredResponseLength: 'brief' | 'moderate' | 'lengthy';
            highEngagementTopics: string[];
            lowEngagementTopics: string[];
        };
    };
    conversationPatterns?: {
        sessions: Array<{
            id: string;
            startedAt: Date;
            endedAt: Date;
            dayOfWeek: string;
            timeOfDay: string;
            durationMinutes: number;
            openingStyle: string;
            topicSequence: string[];
        }>;
        preferences?: {
            preferredTimes: string[];
            preferredDays: string[];
            avgDuration: number;
            likesSmallTalkFirst: boolean;
            prefersQuickConversations: boolean;
        };
    };
    proactiveInsights?: Array<{
        id: string;
        type: string;
        priority: string;
        title: string;
        message: string;
        generatedAt: Date;
        delivered: boolean;
        deliveredAt?: Date;
        userReaction?: string;
    }>;
    /**
     * Recent topics discussed across sessions (for proactive insight generation)
     * Tracks frequency and sentiment to detect patterns worth surfacing
     */
    recentTopics?: Array<{
        /** The topic discussed */
        topic: string;
        /** How many times this topic has come up */
        frequency: number;
        /** When this topic was last mentioned */
        lastMentioned: Date;
        /** Overall sentiment when discussing this topic */
        sentiment?: 'positive' | 'negative' | 'neutral';
        /** Which personas this topic came up with */
        personaIds?: string[];
    }>;
    /**
     * Emotional trend over recent sessions (for predictive emotional state)
     * Enables anticipating user's emotional needs
     */
    emotionalTrend?: {
        /** Overall direction of emotional state */
        direction: 'improving' | 'declining' | 'stable';
        /** Rate of change (-1 to 1, negative = declining) */
        velocity: number;
        /** Most frequent emotion in recent sessions */
        dominantEmotion: string;
        /** When this trend was calculated */
        calculatedAt: Date;
        /** Number of sessions used to calculate trend */
        sampleSize: number;
        /** Secondary emotions observed */
        secondaryEmotions?: string[];
    };
    /**
     * Open commitments user has made (for commitment tracking)
     * Ferni can gently remind and support follow-through
     */
    openCommitments?: Array<{
        /** Unique identifier */
        id: string;
        /** What the user committed to */
        description: string;
        /** When the commitment was made */
        madeAt: Date;
        /** Optional deadline */
        dueDate?: Date;
        /** Current status */
        status: 'open' | 'in_progress' | 'completed' | 'missed' | 'abandoned';
        /** Which persona was told about this commitment */
        personaId?: string;
        /** How important this commitment seems */
        priority?: 'low' | 'medium' | 'high';
        /** Context about why this matters to the user */
        context?: string;
        /** Number of times we've followed up */
        followUpCount?: number;
        /** Last time we checked in about this */
        lastFollowUp?: Date;
    }>;
    financialJourney?: {
        startedAt: Date;
        snapshots: Array<{
            id: string;
            date: Date;
            type: string;
            emergencyFundStatus: string;
            hasDebt: boolean;
            hasInvestments: boolean;
            goalsAchieved: number;
            financialConfidence: string;
        }>;
        milestones: Array<{
            id: string;
            date: Date;
            type: string;
            title: string;
            description: string;
            celebrationGiven: boolean;
        }>;
    };
    openThreads?: Array<{
        id: string;
        topic: string;
        reason: string;
        priority: string;
        suggestedResumption: string;
        status: 'open' | 'resumed' | 'closed';
        createdAt: Date;
    }>;
    promisedFollowUps?: Array<{
        id: string;
        type: string;
        description: string;
        delivered: boolean;
        createdAt: Date;
    }>;
    voicePace?: {
        observations: Array<{
            timestamp: Date;
            userWPM: number;
            userMessageLength: number;
            userResponseTime: number;
        }>;
        preferences?: {
            avgWPM: number;
            preferredPauseLength: number;
            preferredTempo: string;
            recommendedJackWPM: number;
            recommendedResponseLength: 'brief' | 'moderate' | 'detailed';
        };
    };
    personaMemories?: {
        jackie?: Array<{
            id: string;
            type: 'preference' | 'win' | 'topic' | 'style' | 'music' | 'inside_joke';
            name: string;
            details?: string;
            sentiment?: 'positive' | 'negative' | 'neutral';
            tags: string[];
            createdAt: Date;
            timesReferenced: number;
        }>;
        bogle?: Array<{
            id: string;
            type: 'fund' | 'philosophy' | 'allocation' | 'wisdom' | 'avoid';
            name: string;
            ticker?: string;
            category?: 'index' | 'bond' | 'international' | 'balanced' | 'sector';
            expenseRatio?: number;
            sentiment?: 'positive' | 'negative' | 'neutral';
            tags: string[];
            createdAt: Date;
            timesReferenced: number;
        }>;
        peter?: Array<{
            id: string;
            type: 'stock' | 'company' | 'watchlist' | 'story' | 'ten_bagger' | 'avoid';
            name: string;
            ticker?: string;
            sector?: string;
            reason?: string;
            priceWhenAdded?: number;
            targetPrice?: number;
            sentiment?: 'positive' | 'negative' | 'neutral' | 'watchful';
            tags: string[];
            createdAt: Date;
            timesReferenced: number;
        }>;
        maya?: Array<{
            id: string;
            type: 'merchant' | 'bill' | 'subscription' | 'savings_goal' | 'trigger' | 'category' | 'win';
            name: string;
            merchantCategory?: string;
            averageSpend?: number;
            dueDate?: number;
            amount?: number;
            targetAmount?: number;
            currentAmount?: number;
            isAutoPay?: boolean;
            sentiment?: 'positive' | 'negative' | 'neutral';
            notes?: string;
            tags: string[];
            createdAt: Date;
            timesReferenced: number;
        }>;
        jordan?: Array<{
            id: string;
            type: 'date' | 'venue' | 'vendor' | 'destination' | 'milestone' | 'preference';
            name: string;
            date?: string;
            recurring?: 'yearly' | 'monthly' | 'once';
            person?: string;
            location?: string;
            priceRange?: string;
            rating?: number;
            sentiment?: 'positive' | 'negative' | 'neutral';
            notes?: string;
            tags: string[];
            createdAt: Date;
            timesReferenced: number;
        }>;
        alex?: Array<{
            id: string;
            type: 'communication_preference' | 'scheduling_note' | 'contact_note';
            name: string;
            details?: string;
            tags: string[];
            createdAt: Date;
            timesReferenced: number;
        }>;
    };
    /**
     * Productivity data for daily tools (tasks, bills, habits, etc.)
     * Stored as a nested object for efficient persistence.
     */
    productivityData?: {
        userId: string;
        lastUpdated: Date;
        tasks?: unknown[];
        bills?: unknown[];
        billPayments?: unknown[];
        routines?: unknown[];
        routineCompletions?: unknown[];
        notes?: unknown[];
        journalEntries?: unknown[];
        habits?: unknown[];
        habitLogs?: unknown[];
        shoppingLists?: unknown[];
        medications?: unknown[];
        doseLogs?: unknown[];
        packages?: unknown[];
        savedTrips?: unknown[];
        flightSearches?: unknown[];
        hotelSearches?: unknown[];
    };
    /**
     * Background tasks, workflows, and scheduled jobs.
     * Enables async operations and multi-step processes.
     */
    backgroundData?: {
        userId: string;
        tasks?: unknown[];
        workflows?: unknown[];
        pendingActions?: unknown[];
        scheduledJobs?: unknown[];
        delegations?: unknown[];
        lastUpdated: Date;
    };
    /**
     * Cognitive intelligence data for personalized thinking adaptation.
     * Tracks how the user thinks, what approaches work, and cognitive learning.
     */
    cognitiveIntelligence?: {
        /** User's detected cognitive style */
        detectedStyle: 'analytical' | 'emotional' | 'practical' | 'narrative' | 'systematic' | 'intuitive' | 'unknown';
        /** Confidence in style detection (0-1) */
        styleConfidence: number;
        /** When style was last updated */
        styleUpdatedAt: Date;
        /** Effectiveness scores by approach per persona */
        approachEffectiveness: Record<string, Array<{
            approach: 'analytical' | 'empathetic' | 'narrative' | 'systematic' | 'pragmatic' | 'intuitive';
            totalScore: number;
            sampleCount: number;
            lastUsed: Date;
        }>>;
        /** Topics user has demonstrated expertise in */
        expertiseAreas: string[];
        /** Topics user is learning */
        noviceAreas: string[];
        /** Topics that have been explained (don't re-explain) */
        explainedTopics: Record<string, {
            personaId: string;
            level: 'introduced' | 'explained' | 'deep_dive';
            lastExplained: Date;
            revisits: number;
        }>;
        /** Concepts user has demonstrated understanding of */
        demonstratedUnderstanding: string[];
        /** Cognitive approach preferences by topic */
        topicPreferences: Record<string, {
            preferredApproach: string;
            confidence: number;
        }>;
        /** Total cognitive interactions tracked */
        totalInteractions: number;
        /** Per-persona cognitive relationship data */
        perPersonaCognitiveData?: Record<string, {
            /** Effective approaches with this persona */
            effectiveApproaches: string[];
            /** Ineffective approaches with this persona */
            ineffectiveApproaches: string[];
            /** Topics explained by this persona */
            explainedTopics: string[];
            /** Relationship cognitive growth stage */
            cognitiveGrowthStage: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
        }>;
        /** Last updated */
        updatedAt: Date;
    };
    /** Subscription tier and usage tracking */
    subscription?: SubscriptionData;
    /**
     * Human-centric memory capturing the texture of the relationship:
     * - Important dates (birthdays, anniversaries)
     * - Emotional signature (what comforts them, their tells)
     * - Inside jokes and running themes
     * - Values, dreams, fears
     * - Growth arc ("look how far you've come")
     * - The unspoken (avoidances, patterns)
     */
    humanMemory?: Partial<HumanMemory>;
    /**
     * Personal journey awareness data for celebrating user milestones,
     * tracking rhythm patterns, seasonal memories, and life chapters.
     * This makes Ferni "superhuman" at remembering and honoring
     * each user's unique journey.
     */
    personalJourney?: Partial<PersonalJourneyData>;
    createdAt: Date;
    updatedAt: Date;
    version: number;
}
/**
 * Create a new user profile with defaults
 */
export declare function createUserProfile(id: string, name?: string): UserProfile;
/**
 * Update relationship stage based on interaction count and depth
 */
export declare function calculateRelationshipStage(profile: UserProfile): RelationshipStage;
/**
 * Merge new session data into existing profile
 */
export declare function updateProfileFromSession(profile: UserProfile, sessionData: Partial<{
    name: string;
    mood: string;
    energyLevel: 'low' | 'medium' | 'high';
    topicsDiscussed: string[];
    emotionalMoments: EmotionalPattern[];
    questionsAsked: string[];
    sessionDurationMinutes: number;
}>): UserProfile;
export default UserProfile;
//# sourceMappingURL=user-profile.d.ts.map