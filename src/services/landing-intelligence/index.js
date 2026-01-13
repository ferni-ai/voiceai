/**
 * Landing Intelligence Services
 *
 * Gemini-powered real-time landing page optimization:
 * - Intent detection from visitor behavior
 * - Dynamic variant generation
 * - Time-aware content adaptation
 * - Returning visitor personalization
 * - Adaptive section ordering
 * - Proactive chat widget greetings
 *
 * @module services/landing-intelligence
 */
export { detectVisitorIntent, } from './intent-detector.js';
export { generatePersonalizedVariant, generateHeadlineVariant, generateCTAVariant, } from './variant-generator.js';
export { getTimeAwareContent, getTimeMode, } from './time-aware.js';
export { getReturningVisitorContext, getReturningVisitorExperience, recordVisitorSession, generateVisitorId, } from './returning-visitor.js';
export { generateDemoConversation, } from './demo-generator.js';
export { getOptimalSectionOrder, } from './layout-optimizer.js';
export { generateChatGreeting } from './chat-greeter.js';
export { optimizeLandingPage, } from './orchestrator.js';
export { initLandingIntelligence, shutdownLandingIntelligence } from './lifecycle.js';
// AI Interactions (Live Chat, Persona Preview, Smart FAQ, etc.)
export { sendDemoChatMessage, generatePersonaPreview, answerSmartFAQ, generatePersonalizedHero, generateSocialProof, generateHoverPreview, generateSentimentReactiveCopy, } from './ai-interactions.js';
// Optimization Agent
export { collectLandingMetrics, generateOptimizationReport, runAutomatedOptimization, dailyOptimizationCheck, weeklyOptimizationReport, } from './optimization-agent.js';
// Gemini client (low-level)
export { generateText, generateJSON, checkGeminiHealth } from './gemini-client.js';
// Content cache (pre-generation)
export { getCachedHero, getCachedSocialProof, getCachedMemoryStories, getCachedLateNightScenarios, runBatchGeneration, getCacheControlHeader, } from './content-cache.js';
//# sourceMappingURL=index.js.map