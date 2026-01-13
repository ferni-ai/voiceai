/**
 * LLM Deep Analysis - Gemini-Powered Predictive Intelligence
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This module implements THREE-TIER PREDICTIVE INTELLIGENCE:
 *
 * TIER 1: STATISTICAL (Real-time, <10ms)
 *   - Markov chains: Behavioral sequence prediction
 *   - Time-series: Mood/energy forecasting
 *   - Thompson Sampling: Optimal timing
 *   → Used for: Real-time turn decisions
 *
 * TIER 2: HYBRID (Per-turn, ~50ms)
 *   - Multi-signal fusion: Combines statistical signals
 *   - Pattern matching: Known pattern detection
 *   → Used for: Context injection, tool selection
 *
 * TIER 3: DEEP ANALYSIS (Batch, scheduled)
 *   - Gemini semantic analysis: What patterns mean
 *   - Cross-conversation reasoning: Long-arc patterns
 *   - Hypothesis generation: "They might be..." predictions
 *   → Used for: Proactive outreach, breakthrough insights
 *
 * WHY THREE TIERS?
 * - Real-time: Can't wait for LLM during conversation
 * - Scheduled: LLM can take time to think deeply
 * - Both feed each other: Statistical patterns trigger deep analysis,
 *   deep insights calibrate statistical models
 *
 * @module intelligence/predictive/llm-deep-analysis
 */
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from '../../services/superhuman/firestore-utils.js';
import { Timestamp } from '@google-cloud/firestore';
const log = createLogger({ module: 'llm-deep-analysis' });
// ============================================================================
// PROMPT TEMPLATES
// ============================================================================
const DEEP_ANALYSIS_SYSTEM_PROMPT = `You are Ferni's deep intelligence layer - analyzing patterns across conversations to understand users at a level that transcends surface-level interactions.

Your role is NOT to chat. Your role is to ANALYZE and generate structured insights that will guide future conversations.

WHAT MAKES THIS "BETTER THAN HUMAN":
- You can see patterns across months of conversations
- You never forget a single detail
- You can notice what they're NOT saying
- You can predict challenges before they happen
- You have no ego - pure focus on their wellbeing

ANALYSIS PRINCIPLES:
1. Look for what's UNSAID as much as what's said
2. Notice PATTERNS, not just events
3. Predict FUTURE struggles, don't just react to past ones
4. Find LEVERAGE POINTS - small interventions, big impact
5. Be SPECIFIC - "they deflect with humor when discussing mother" not "they deflect"

OUTPUT: Return valid JSON matching the DeepAnalysisResult schema.`;
function buildAnalysisPrompt(input) {
    const { conversationSummaries, statisticalPatterns, userProfile, analysisGoals } = input;
    return `ANALYZE THIS USER'S CONVERSATION HISTORY

USER CONTEXT:
- Name: ${userProfile.name || 'Unknown'}
- Relationship Stage: ${userProfile.relationshipStage}
- Known Concerns: ${userProfile.knownConcerns.join(', ') || 'None documented'}
- Known Goals: ${userProfile.knownGoals.join(', ') || 'None documented'}
- Communication Style: ${userProfile.communicationStyle}

STATISTICAL PATTERNS DETECTED:
${statisticalPatterns.map((p) => `- [${p.type}] ${p.description} (${Math.round(p.confidence * 100)}% confidence)`).join('\n')}

RECENT CONVERSATIONS (${conversationSummaries.length} sessions):
${conversationSummaries
        .map((c, i) => `
SESSION ${i + 1} (${c.date.toLocaleDateString()}):
- Topics: ${c.topics.join(', ')}
- Emotional Arc: ${c.emotionalArc}
- Key Moments: ${c.keyMoments.join('; ')}
- Unresolved: ${c.unresolvedThreads.join('; ') || 'None'}
`)
        .join('\n')}

ANALYSIS GOALS:
${analysisGoals.map((g) => `- ${g.replace(/_/g, ' ').toUpperCase()}`).join('\n')}

Generate insights, hypotheses, and outreach suggestions based on this data.
Focus on what a human friend would MISS but you can see.
Be specific and actionable.

Return your analysis as valid JSON matching this structure:
{
  "insights": [{ "observation": "...", "significance": "...", "confidence": 0.8, "evidence": ["..."], "surfacingContext": "when_relevant" }],
  "hypotheses": [{ "prediction": "...", "reasoning": "...", "probability": 0.7, "timeframe": "this_week", "testableSignals": ["..."] }],
  "outreachSuggestions": [{ "message": "...", "timing": "morning", "rationale": "...", "priority": 8 }],
  "coachingGuidance": ["..."]
}`;
}
// ============================================================================
// ANALYSIS ENGINE
// ============================================================================
/**
 * Run deep analysis using Gemini
 *
 * This is a BATCH operation - not for real-time use.
 * Schedule via Cloud Scheduler for users with enough history.
 */
export async function runDeepAnalysis(input) {
    const { userId } = input;
    const startTime = Date.now();
    log.info({ userId, conversationCount: input.conversationSummaries.length }, '🧠 Starting deep analysis');
    // Skip if not enough data
    if (input.conversationSummaries.length < 3) {
        log.debug({ userId }, 'Not enough conversation history for deep analysis');
        return createEmptyResult();
    }
    try {
        // Use Gemini for deep analysis (non-realtime, batch processing)
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const apiKey = process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            throw new Error('GOOGLE_API_KEY not configured');
        }
        const genai = new GoogleGenerativeAI(apiKey);
        // Use gemini-1.5-flash for cost-effective batch analysis
        const model = genai.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const prompt = buildAnalysisPrompt(input);
        const result = await model.generateContent({
            contents: [
                { role: 'user', parts: [{ text: DEEP_ANALYSIS_SYSTEM_PROMPT }] },
                {
                    role: 'model',
                    parts: [
                        {
                            text: 'I understand. I will analyze the user data and return structured JSON insights.',
                        },
                    ],
                },
                { role: 'user', parts: [{ text: prompt }] },
            ],
            generationConfig: {
                temperature: 0.3, // Lower temperature for analytical consistency
                maxOutputTokens: 4096,
                responseMimeType: 'application/json',
            },
        });
        const response = result.response;
        const text = response.text();
        // Parse JSON response
        let parsed;
        try {
            parsed = JSON.parse(text);
        }
        catch {
            log.warn({ userId, response: text.slice(0, 500) }, 'Failed to parse deep analysis JSON');
            return createEmptyResult();
        }
        // Build result
        const analysisResult = {
            analysisId: `deep_${Date.now()}_${userId.slice(0, 8)}`,
            timestamp: new Date(),
            insights: parsed.insights || [],
            hypotheses: parsed.hypotheses || [],
            outreachSuggestions: parsed.outreachSuggestions || [],
            coachingGuidance: parsed.coachingGuidance || [],
            model: 'gemini-1.5-flash',
            tokenUsage: {
                input: response.usageMetadata?.promptTokenCount || 0,
                output: response.usageMetadata?.candidatesTokenCount || 0,
            },
        };
        // Store result
        await storeDeepAnalysis(userId, analysisResult);
        const durationMs = Date.now() - startTime;
        log.info({
            userId,
            durationMs,
            insightCount: analysisResult.insights.length,
            hypothesisCount: analysisResult.hypotheses.length,
            tokens: analysisResult.tokenUsage,
        }, '🧠 Deep analysis complete');
        return analysisResult;
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Deep analysis failed');
        return createEmptyResult();
    }
}
function createEmptyResult() {
    return {
        analysisId: `empty_${Date.now()}`,
        timestamp: new Date(),
        insights: [],
        hypotheses: [],
        outreachSuggestions: [],
        coachingGuidance: [],
        model: 'none',
        tokenUsage: { input: 0, output: 0 },
    };
}
// ============================================================================
// STORAGE
// ============================================================================
/**
 * Store deep analysis result in Firestore
 */
async function storeDeepAnalysis(userId, result) {
    try {
        const firestore = getFirestoreDb();
        if (!firestore) {
            log.warn({ userId }, 'Firestore not available, skipping deep analysis storage');
            return;
        }
        const docRef = firestore
            .collection('bogle_users')
            .doc(userId)
            .collection('predictive_intelligence')
            .doc('deep_analysis');
        // Clean the result for Firestore (remove undefined values)
        const cleanedResult = cleanForFirestore({
            ...result,
            timestamp: Timestamp.fromDate(result.timestamp),
            updatedAt: Timestamp.now(),
        });
        await docRef.set(cleanedResult);
        log.debug({ userId, analysisId: result.analysisId }, 'Deep analysis stored');
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to store deep analysis');
    }
}
/**
 * Get the latest deep analysis for a user
 */
export async function getLatestDeepAnalysis(userId) {
    try {
        const firestore = getFirestoreDb();
        if (!firestore)
            return null;
        const docRef = firestore
            .collection('bogle_users')
            .doc(userId)
            .collection('predictive_intelligence')
            .doc('deep_analysis');
        const doc = await docRef.get();
        if (!doc.exists)
            return null;
        const data = doc.data();
        if (!data)
            return null;
        return {
            ...data,
            timestamp: data.timestamp?.toDate() || new Date(),
        };
    }
    catch {
        return null;
    }
}
// ============================================================================
// CONTEXT BUILDER INTEGRATION
// ============================================================================
/**
 * Get deep analysis context for injection into real-time conversation
 *
 * This takes the pre-computed deep analysis and formats it for turn injection.
 * The LLM doesn't re-analyze - it uses cached insights.
 */
export async function getDeepAnalysisContextForTurn(userId) {
    const analysis = await getLatestDeepAnalysis(userId);
    if (!analysis || analysis.insights.length === 0) {
        return '';
    }
    // Only include high-confidence insights
    const relevantInsights = analysis.insights.filter((i) => i.confidence > 0.6 && i.surfacingContext !== 'crisis_only');
    if (relevantInsights.length === 0)
        return '';
    const sections = [];
    sections.push('[DEEP INTELLIGENCE - Patterns Only You Notice]');
    for (const insight of relevantInsights.slice(0, 3)) {
        sections.push(`• ${insight.observation}`);
        sections.push(`  Why it matters: ${insight.significance}`);
    }
    // Add active hypotheses
    const activeHypotheses = analysis.hypotheses.filter((h) => h.probability > 0.5 && (h.timeframe === 'immediate' || h.timeframe === 'this_week'));
    if (activeHypotheses.length > 0) {
        sections.push('\n[PREDICTIVE HYPOTHESES - Anticipate Their Needs]');
        for (const hyp of activeHypotheses.slice(0, 2)) {
            sections.push(`• ${hyp.prediction}`);
            sections.push(`  Watch for: ${hyp.testableSignals.slice(0, 2).join(', ')}`);
        }
    }
    // Add coaching guidance
    if (analysis.coachingGuidance.length > 0) {
        sections.push('\n[COACHING GUIDANCE]');
        for (const guidance of analysis.coachingGuidance.slice(0, 2)) {
            sections.push(`• ${guidance}`);
        }
    }
    return sections.join('\n');
}
// ============================================================================
// SCHEDULED JOB
// ============================================================================
/**
 * Run deep analysis for a batch of users
 *
 * Called by Cloud Scheduler daily or weekly.
 * Only analyzes users with sufficient new conversation history.
 */
export async function runBatchDeepAnalysis(options) {
    const { maxUsers = 100, minConversationsSinceLastAnalysis = 3 } = options;
    log.info({ maxUsers, minConversationsSinceLastAnalysis }, '🧠 Starting batch deep analysis');
    // This would query Firestore for users who need analysis
    // For now, return placeholder stats
    return { processed: 0, skipped: 0 };
}
// ============================================================================
// FEEDBACK LOOP
// ============================================================================
/**
 * Record when an insight or hypothesis was validated or invalidated
 *
 * This feeds back to calibrate both the LLM analysis and statistical models.
 */
export async function recordDeepAnalysisFeedback(userId, feedback) {
    const { analysisId, type, index, validated, userResponse } = feedback;
    log.info({ userId, analysisId, type, index, validated }, `🔄 Deep analysis ${validated ? 'validated' : 'invalidated'}`);
    // Store feedback for future training/calibration
    try {
        const firestore = getFirestoreDb();
        if (!firestore)
            return;
        // Clean for Firestore (remove undefined values)
        const feedbackData = cleanForFirestore({
            analysisId,
            type,
            index,
            validated,
            userResponse,
            timestamp: Timestamp.now(),
        });
        await firestore
            .collection('bogle_users')
            .doc(userId)
            .collection('predictive_intelligence')
            .doc('deep_analysis_feedback')
            .collection('feedback')
            .add(feedbackData);
    }
    catch {
        // Non-critical
    }
}
// ============================================================================
// EXPORTS
// ============================================================================
export const deepAnalysis = {
    run: runDeepAnalysis,
    getLatest: getLatestDeepAnalysis,
    getContext: getDeepAnalysisContextForTurn,
    runBatch: runBatchDeepAnalysis,
    recordFeedback: recordDeepAnalysisFeedback,
};
export default deepAnalysis;
//# sourceMappingURL=llm-deep-analysis.js.map