/**
 * Persona Health Metrics
 *
 * Tracks persona-specific health indicators:
 * - Bundle load times
 * - Knowledge query performance
 * - Voice synthesis quality
 * - Handoff success rates
 * - Persona usage distribution
 */
import { getLogger } from '../../utils/safe-logger.js';
const log = getLogger();
// ============================================================================
// STATE
// ============================================================================
const loadEvents = [];
const knowledgeEvents = [];
const voiceEvents = [];
const usageEvents = [];
const MAX_EVENTS = 500;
// ============================================================================
// RECORDING
// ============================================================================
export function recordPersonaLoad(event) {
    loadEvents.push({
        ...event,
        id: `load_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
    });
    if (loadEvents.length > MAX_EVENTS)
        loadEvents.shift();
    if (!event.success) {
        log.warn({ personaId: event.personaId, error: event.error }, 'Persona load failed');
    }
}
export function recordKnowledgeQuery(event) {
    knowledgeEvents.push({
        ...event,
        id: `kq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
    });
    if (knowledgeEvents.length > MAX_EVENTS)
        knowledgeEvents.shift();
}
export function recordVoiceEvent(event) {
    voiceEvents.push({
        ...event,
        id: `voice_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
    });
    if (voiceEvents.length > MAX_EVENTS)
        voiceEvents.shift();
    if (event.quality === 'failed') {
        log.warn({ personaId: event.personaId, provider: event.provider }, 'Voice synthesis failed');
    }
}
export function recordPersonaUsage(event) {
    usageEvents.push({
        ...event,
        id: `usage_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
    });
    if (usageEvents.length > MAX_EVENTS)
        usageEvents.shift();
}
// ============================================================================
// SNAPSHOT
// ============================================================================
export function getSnapshot() {
    const now = Date.now();
    const recentLoads = loadEvents.filter((e) => e.timestamp > now - 60 * 60 * 1000);
    const recentKnowledge = knowledgeEvents.filter((e) => e.timestamp > now - 60 * 60 * 1000);
    const recentVoice = voiceEvents.filter((e) => e.timestamp > now - 60 * 60 * 1000);
    const recentUsage = usageEvents.filter((e) => e.timestamp > now - 60 * 60 * 1000);
    // Load performance
    const successfulLoads = recentLoads.filter((e) => e.success);
    const avgLoadTimeMs = successfulLoads.length > 0
        ? successfulLoads.reduce((sum, e) => sum + e.loadTimeMs, 0) / successfulLoads.length
        : 0;
    const loadSuccessRate = recentLoads.length > 0 ? successfulLoads.length / recentLoads.length : 1;
    const cacheHits = recentLoads.filter((e) => e.fromCache).length;
    const cacheHitRate = recentLoads.length > 0 ? cacheHits / recentLoads.length : 0;
    // Knowledge queries
    const successfulQueries = recentKnowledge.filter((e) => e.success);
    const avgKnowledgeLatencyMs = successfulQueries.length > 0
        ? successfulQueries.reduce((sum, e) => sum + e.latencyMs, 0) / successfulQueries.length
        : 0;
    const avgKnowledgeRelevance = successfulQueries.length > 0
        ? successfulQueries.reduce((sum, e) => sum + e.relevanceScore, 0) / successfulQueries.length
        : 0;
    const knowledgeQuerySuccessRate = recentKnowledge.length > 0 ? successfulQueries.length / recentKnowledge.length : 1;
    const queriesByPersona = {};
    for (const event of recentKnowledge) {
        queriesByPersona[event.personaId] = (queriesByPersona[event.personaId] || 0) + 1;
    }
    // Voice
    const avgVoiceLatencyMs = recentVoice.length > 0
        ? recentVoice.reduce((sum, e) => sum + e.latencyMs, 0) / recentVoice.length
        : 0;
    const goodVoice = recentVoice.filter((e) => e.quality === 'good').length;
    const voiceQualityRate = recentVoice.length > 0 ? goodVoice / recentVoice.length : 1;
    const failedVoice = recentVoice.filter((e) => e.quality === 'failed').length;
    const voiceFailureRate = recentVoice.length > 0 ? failedVoice / recentVoice.length : 0;
    // Usage distribution
    const usageByPersona = {};
    const sessionsPerPersona = {};
    const turnsByPersona = {};
    for (const event of recentUsage) {
        usageByPersona[event.personaId] = (usageByPersona[event.personaId] || 0) + event.durationMs;
        sessionsPerPersona[event.personaId] = (sessionsPerPersona[event.personaId] || 0) + 1;
        if (!turnsByPersona[event.personaId])
            turnsByPersona[event.personaId] = [];
        turnsByPersona[event.personaId].push(event.turnsCount);
    }
    const avgTurnsPerPersona = {};
    for (const [personaId, turns] of Object.entries(turnsByPersona)) {
        avgTurnsPerPersona[personaId] = turns.reduce((a, b) => a + b, 0) / turns.length;
    }
    // Health scores per persona (0-100)
    const allPersonas = new Set([
        ...recentLoads.map((e) => e.personaId),
        ...recentKnowledge.map((e) => e.personaId),
        ...recentVoice.map((e) => e.personaId),
        ...recentUsage.map((e) => e.personaId),
    ]);
    const personaHealthScores = {};
    const unhealthyPersonas = [];
    for (const personaId of allPersonas) {
        const pLoads = recentLoads.filter((e) => e.personaId === personaId);
        const pKnowledge = recentKnowledge.filter((e) => e.personaId === personaId);
        const pVoice = recentVoice.filter((e) => e.personaId === personaId);
        const loadScore = pLoads.length === 0 ? 100 : (pLoads.filter((e) => e.success).length / pLoads.length) * 100;
        const knowledgeScore = pKnowledge.length === 0
            ? 100
            : (pKnowledge.filter((e) => e.success).length / pKnowledge.length) * 100;
        const voiceScore = pVoice.length === 0
            ? 100
            : (pVoice.filter((e) => e.quality !== 'failed').length / pVoice.length) * 100;
        const healthScore = Math.round((loadScore + knowledgeScore + voiceScore) / 3);
        personaHealthScores[personaId] = healthScore;
        if (healthScore < 80) {
            unhealthyPersonas.push(personaId);
        }
    }
    return {
        avgLoadTimeMs,
        loadSuccessRate,
        cacheHitRate,
        avgKnowledgeLatencyMs,
        avgKnowledgeRelevance,
        knowledgeQuerySuccessRate,
        queriesByPersona,
        avgVoiceLatencyMs,
        voiceQualityRate,
        voiceFailureRate,
        usageByPersona,
        sessionsPerPersona,
        avgTurnsPerPersona,
        personaHealthScores,
        unhealthyPersonas,
    };
}
// ============================================================================
// EXPORT
// ============================================================================
export const personaMetrics = {
    recordPersonaLoad,
    recordKnowledgeQuery,
    recordVoiceEvent,
    recordPersonaUsage,
    getSnapshot,
};
//# sourceMappingURL=persona-health.js.map