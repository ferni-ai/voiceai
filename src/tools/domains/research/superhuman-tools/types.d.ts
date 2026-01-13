/**
 * Types for Peter's Superhuman Quantitative Tools
 *
 * These types support tools that give Peter capabilities
 * beyond what any human advisor could provide.
 *
 * @module tools/domains/research/superhuman-tools/types
 */
export interface DecisionRecord {
    id: string;
    userId: string;
    timestamp: Date;
    decision: string;
    domain: 'financial' | 'career' | 'health' | 'relationship' | 'habit' | 'purchase' | 'other';
    context: {
        timeOfDay: number;
        dayOfWeek: number;
        sleepHours?: number;
        stressLevel?: number;
        energyLevel?: number;
        calendarLoad?: 'light' | 'moderate' | 'heavy' | 'overloaded';
    };
    outcome?: {
        wasReversed: boolean;
        reversedWithin?: number;
        satisfaction?: number;
        recordedAt?: Date;
    };
    tags: string[];
}
export interface DecisionQualityAnalysis {
    totalDecisions: number;
    reversalRate: number;
    satisfactionAverage: number;
    patterns: {
        bestTimeOfDay: {
            hour: number;
            quality: number;
        };
        worstTimeOfDay: {
            hour: number;
            quality: number;
        };
        bestDayOfWeek: {
            day: string;
            quality: number;
        };
        worstDayOfWeek: {
            day: string;
            quality: number;
        };
        sleepImpact: {
            correlation: number;
            threshold: number;
        };
        stressImpact: {
            correlation: number;
            threshold: number;
        };
    };
    insights: string[];
    recommendations: string[];
}
export interface SleepBehaviorCorrelation {
    userId: string;
    period: 'week' | 'month' | 'quarter' | 'year';
    correlations: {
        spendingCorrelation: number;
        productivityCorrelation: number;
        moodCorrelation: number;
        decisionQualityCorrelation: number;
        exerciseCorrelation: number;
    };
    optimalSleepHours: number;
    insights: string[];
}
export interface EnergyPrediction {
    predictedLevel: number;
    confidence: number;
    factors: {
        factor: string;
        impact: number;
        weight: number;
    }[];
    recommendations: string[];
    peakHours: {
        start: number;
        end: number;
    }[];
    lowHours: {
        start: number;
        end: number;
    }[];
}
export interface PeakPerformanceProfile {
    userId: string;
    creativeWork: {
        bestHours: number[];
        bestDays: string[];
        optimalConditions: string[];
    };
    analyticalWork: {
        bestHours: number[];
        bestDays: string[];
        optimalConditions: string[];
    };
    decisionMaking: {
        bestHours: number[];
        bestDays: string[];
        avoidConditions: string[];
    };
    communication: {
        bestHours: number[];
        bestDays: string[];
    };
    dataPoints: number;
    confidence: number;
}
export interface LifestyleImpactPrediction {
    change: string;
    predictedImpacts: {
        domain: string;
        direction: 'positive' | 'negative' | 'neutral';
        magnitude: number;
        confidence: number;
        timeToEffect: string;
    }[];
    rippleEffects: string[];
    netImpactScore: number;
    recommendation: string;
}
export interface EvidenceQuality {
    claim: string;
    overallScore: number;
    studyCount: number;
    totalParticipants: number;
    studyTypes: {
        rcts: number;
        observational: number;
        metaAnalyses: number;
        caseStudies: number;
    };
    effectSize: {
        value: number;
        interpretation: 'small' | 'medium' | 'large';
    };
    consistency: 'consistent' | 'mixed' | 'inconsistent';
    limitations: string[];
    bottomLine: string;
}
export interface ResearchSynthesis {
    topic: string;
    summary: string;
    keyFindings: string[];
    consensusLevel: 'strong' | 'moderate' | 'weak' | 'contested';
    practicalImplications: string[];
    caveats: string[];
    sources: {
        title: string;
        year: number;
        type: string;
        finding: string;
    }[];
}
export interface CounterArgument {
    originalClaim: string;
    counterPoints: {
        argument: string;
        strength: 'strong' | 'moderate' | 'weak';
        evidence: string;
    }[];
    bestCounterArgument: string;
    balancedView: string;
}
export interface BaseRateContext {
    claim: string;
    userEstimate?: number;
    actualBaseRate: number;
    context: string;
    comparisonRates: {
        category: string;
        rate: number;
    }[];
    insight: string;
}
export interface GoalPrediction {
    goalId: string;
    goalName: string;
    successProbability: number;
    predictedCompletionDate: Date | null;
    confidenceInterval: {
        lower: Date | null;
        upper: Date | null;
    };
    riskFactors: {
        factor: string;
        impact: number;
        mitigable: boolean;
    }[];
    successFactors: string[];
    recommendedAdjustments: string[];
}
export interface BehavioralTrajectory {
    domain: string;
    currentState: number;
    projections: {
        month1: number;
        month3: number;
        month6: number;
        month12: number;
    };
    trendDirection: 'improving' | 'stable' | 'declining';
    inflectionPoints: {
        date: Date;
        event: string;
        impact: string;
    }[];
    interventionOpportunities: string[];
}
export interface HabitSurvivalAnalysis {
    habitType: string;
    userSurvivalRate: number;
    averageSurvivalRate: number;
    survivalCurve: {
        day: number;
        probability: number;
    }[];
    riskPeriods: {
        period: string;
        risk: 'high' | 'medium' | 'low';
        reason: string;
    }[];
    survivalFactors: string[];
    modificationSuggestions: string[];
}
export interface CounterfactualAnalysis {
    decision: string;
    actualOutcome: string;
    alternativeScenarios: {
        alternative: string;
        predictedOutcome: string;
        difference: string;
        confidence: number;
    }[];
    keyInsight: string;
    lessonsLearned: string[];
}
export interface LifeEventImpact {
    eventType: string;
    predictedImpacts: {
        area: string;
        impact: 'major' | 'moderate' | 'minor';
        duration: string;
        peakTime: string;
    }[];
    preparationSteps: string[];
    warningSignals: string[];
    recoveryTimeline: string;
}
export interface SECFilingAnalysis {
    symbol: string;
    filingType: '10-K' | '10-Q' | '8-K' | 'DEF 14A';
    filingDate: Date;
    keyChanges: {
        section: string;
        change: string;
        significance: 'high' | 'medium' | 'low';
    }[];
    riskFactors: string[];
    managementDiscussion: string;
    redFlags: string[];
    opportunities: string[];
}
export interface InsiderTradingActivity {
    symbol: string;
    period: string;
    transactions: {
        date: Date;
        insiderName: string;
        title: string;
        transactionType: 'buy' | 'sell' | 'option_exercise';
        shares: number;
        pricePerShare: number;
        totalValue: number;
    }[];
    netInsiderSentiment: 'bullish' | 'bearish' | 'neutral';
    clusterBuying: boolean;
    interpretation: string;
}
export interface OptionsFlowAnalysis {
    symbol: string;
    unusualActivity: {
        timestamp: Date;
        type: 'call' | 'put';
        strike: number;
        expiration: Date;
        volume: number;
        openInterest: number;
        premium: number;
        sentiment: 'bullish' | 'bearish';
    }[];
    putCallRatio: number;
    smartMoneyIndicator: 'bullish' | 'bearish' | 'neutral';
    interpretation: string;
}
export interface MacroPersonalBridge {
    macroEvent: string;
    personalImpacts: {
        area: string;
        impact: string;
        actionItem: string;
        urgency: 'immediate' | 'soon' | 'monitor';
    }[];
    opportunitiesCreated: string[];
    risksToMonitor: string[];
}
export interface PersonalExperiment {
    id: string;
    userId: string;
    hypothesis: string;
    variable: string;
    controlCondition: string;
    treatmentCondition: string;
    metric: string;
    startDate: Date;
    endDate?: Date;
    status: 'designing' | 'running' | 'analyzing' | 'complete';
    dataPoints: {
        date: Date;
        condition: 'control' | 'treatment';
        value: number;
    }[];
    result?: {
        effectSize: number;
        significant: boolean;
        confidence: number;
        conclusion: string;
    };
}
export interface BayesianBelief {
    beliefId: string;
    statement: string;
    priorProbability: number;
    posteriorProbability: number;
    evidenceHistory: {
        date: Date;
        evidence: string;
        likelihoodRatio: number;
        newProbability: number;
    }[];
    currentConfidence: 'very_low' | 'low' | 'moderate' | 'high' | 'very_high';
}
export interface HypothesisTracker {
    userId: string;
    hypotheses: {
        id: string;
        hypothesis: string;
        domain: string;
        status: 'untested' | 'testing' | 'confirmed' | 'refuted' | 'inconclusive';
        evidence: string[];
        testCount: number;
        lastTested?: Date;
    }[];
    summary: {
        total: number;
        confirmed: number;
        refuted: number;
        inconclusive: number;
        untested: number;
    };
}
export interface ConfoundAnalysis {
    correlation: string;
    potentialConfounds: {
        variable: string;
        likelihood: 'high' | 'medium' | 'low';
        explanation: string;
        howToControl: string;
    }[];
    recommendation: string;
    trueRelationshipLikelihood: number;
}
export interface EffectSizeAnalysis {
    intervention: string;
    rawChange: number;
    standardDeviation: number;
    effectSize: number;
    interpretation: 'negligible' | 'small' | 'medium' | 'large' | 'very_large';
    practicalSignificance: string;
    comparison: string;
}
export interface LocalEconomicIndicators {
    location: string;
    indicators: {
        name: string;
        value: number;
        trend: 'up' | 'down' | 'stable';
        comparison: string;
    }[];
    housingMarket: {
        medianPrice: number;
        priceChange: number;
        inventory: number;
        daysOnMarket: number;
    };
    jobMarket: {
        unemploymentRate: number;
        jobGrowth: number;
        topIndustries: string[];
    };
    insights: string[];
}
export interface IndustryTrendSynthesis {
    industry: string;
    overallSentiment: 'bullish' | 'bearish' | 'neutral';
    keyTrends: string[];
    disruptionRisks: string[];
    opportunities: string[];
    topCompanies: {
        name: string;
        ticker?: string;
        position: string;
    }[];
    outlook: string;
}
export interface NewsSentiment {
    topic: string;
    period: string;
    sentimentScore: number;
    sentimentTrend: 'improving' | 'stable' | 'declining';
    volumeTrend: 'increasing' | 'stable' | 'decreasing';
    keyNarratives: string[];
    sentimentDrivers: string[];
}
export interface PersonalInflationRate {
    userId: string;
    period: string;
    personalInflation: number;
    officialCPI: number;
    difference: number;
    categoryBreakdown: {
        category: string;
        weight: number;
        inflation: number;
        contribution: number;
    }[];
    biggestDrivers: string[];
    hedgingStrategies: string[];
}
export interface CommunicationPattern {
    userId: string;
    patterns: {
        person: string;
        relationship: string;
        frequency: number;
        emotionalContexts: string[];
        topicAffinity: string[];
    }[];
    insights: {
        stressContacts: string[];
        celebrationContacts: string[];
        adviceContacts: string[];
        energyDrains: string[];
        energyBoosts: string[];
    };
}
export interface RelationshipHealthScore {
    userId: string;
    relationships: {
        person: string;
        healthScore: number;
        trend: 'improving' | 'stable' | 'declining';
        lastInteraction: Date;
        warningSignals: string[];
        strengthFactors: string[];
    }[];
    atRiskRelationships: string[];
    neglectedRelationships: string[];
    recommendations: string[];
}
export interface InfluenceMap {
    userId: string;
    influencers: {
        person: string;
        influenceScore: number;
        domains: string[];
        influenceType: 'positive' | 'negative' | 'mixed';
    }[];
    decisionPatterns: {
        decisionType: string;
        primaryInfluencer: string;
        influenceStrength: number;
    }[];
    insights: string[];
    diversificationNeeds: string[];
}
export interface NetworkGapAnalysis {
    userId: string;
    currentNetworkStrengths: string[];
    identifiedGaps: {
        area: string;
        importance: 'critical' | 'important' | 'nice_to_have';
        impactedGoals: string[];
        suggestions: string[];
    }[];
    networkDiversity: {
        score: number;
        dimensions: {
            dimension: string;
            coverage: number;
        }[];
    };
    recommendations: string[];
}
export interface GoalProgress {
    goalId: string;
    userId: string;
    name: string;
    type: string;
    startDate: Date;
    targetDate?: Date;
    currentProgress: number;
    milestones: {
        date: Date;
        progress: number;
    }[];
    status: 'active' | 'completed' | 'abandoned';
    predictions?: {
        successProbability: number;
        projectedCompletionDate?: Date;
        lastPrediction: Date;
    };
}
export interface SpendingRecord {
    id: string;
    category: string;
    amount: number;
    date: Date;
    description?: string;
    vendor?: string;
}
export interface Relationship {
    id: string;
    name: string;
    relationship: 'family' | 'friend' | 'colleague' | 'mentor' | 'mentee' | 'partner' | 'acquaintance';
    energyImpact: 'draining' | 'neutral' | 'energizing';
    influenceDomains: string[];
    lastInteraction?: Date;
    supportProvided: string[];
    supportReceived: string[];
    createdAt: Date;
    updatedAt: Date;
}
export interface Interaction {
    id: string;
    relationshipId: string;
    date: Date;
    type: 'call' | 'message' | 'meeting' | 'email' | 'social' | 'support' | 'other';
    quality: number;
    topic: string;
    notes?: string;
    duration?: number;
}
export interface BeliefTracker {
    beliefId: string;
    userId?: string;
    statement: string;
    priorProbability: number;
    posteriorProbability: number;
    currentConfidence: 'very_low' | 'low' | 'moderate' | 'high' | 'very_high';
    evidenceHistory: {
        date: Date;
        evidence: string;
        likelihoodRatio: number;
        newProbability: number;
    }[];
    createdAt?: Date;
    updatedAt?: Date;
}
export interface Hypothesis {
    id: string;
    userId: string;
    hypothesis: string;
    domain: string;
    status: 'untested' | 'testing' | 'confirmed' | 'refuted' | 'inconclusive';
    evidence: string[];
    testCount: number;
    lastTested?: Date;
    createdAt: Date;
    updatedAt: Date;
}
//# sourceMappingURL=types.d.ts.map