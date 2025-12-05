/**
 * Interaction Pattern Analyzer
 *
 * Analyzes user interaction patterns to discover:
 * - Tool co-occurrence (which tools are used together)
 * - User journeys (common sequences of tool usage)
 * - Gaps (what users try to do but can't)
 * - Consolidation opportunities (tools that should be merged)
 * - User segments (different usage patterns by user type)
 *
 * This powers the automated recommendation and experimentation system.
 */
// ============================================================================
// PATTERN ANALYZER
// ============================================================================
export class PatternAnalyzer {
    // Store session data for analysis
    sessions = new Map();
    completedSessions = [];
    // Cached analysis results
    coOccurrenceMatrix = new Map();
    sequenceCache = [];
    lastAnalysisTime = 0;
    ANALYSIS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    // ==========================================================================
    // DATA COLLECTION
    // ==========================================================================
    /**
     * Start tracking a session
     */
    startSession(sessionId, userId, agentId) {
        this.sessions.set(sessionId, {
            sessionId,
            userId,
            agentId,
            startTime: new Date(),
            toolCalls: [],
            feedback: [],
        });
    }
    /**
     * Record a tool call in a session
     */
    recordToolCall(sessionId, toolId, success, latencyMs) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return;
        session.toolCalls.push({
            toolId,
            timestamp: new Date(),
            success,
            latencyMs,
        });
        // Update co-occurrence matrix
        this.updateCoOccurrence(session);
    }
    /**
     * Add feedback to a session
     */
    addFeedback(sessionId, feedback) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.feedback.push(feedback);
        }
    }
    /**
     * End a session
     */
    endSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.endTime = new Date();
            this.completedSessions.push(session);
            this.sessions.delete(sessionId);
            // Persist session to Firestore (async, fire-and-forget)
            import('../services/optimization-persistence.js')
                .then(({ optimizationPersistence }) => {
                optimizationPersistence.bufferSession(session);
            })
                .catch(() => {
                // Persistence failure is non-critical
            });
            // Keep only last 1000 sessions in memory
            if (this.completedSessions.length > 1000) {
                this.completedSessions = this.completedSessions.slice(-1000);
            }
        }
    }
    // ==========================================================================
    // CO-OCCURRENCE ANALYSIS
    // ==========================================================================
    /**
     * Update co-occurrence matrix when tools are used in same session
     */
    updateCoOccurrence(session) {
        const tools = session.toolCalls.map(tc => tc.toolId);
        const uniqueTools = [...new Set(tools)];
        for (let i = 0; i < uniqueTools.length; i++) {
            for (let j = i + 1; j < uniqueTools.length; j++) {
                const toolA = uniqueTools[i];
                const toolB = uniqueTools[j];
                if (!this.coOccurrenceMatrix.has(toolA)) {
                    this.coOccurrenceMatrix.set(toolA, new Map());
                }
                if (!this.coOccurrenceMatrix.has(toolB)) {
                    this.coOccurrenceMatrix.set(toolB, new Map());
                }
                const countAB = (this.coOccurrenceMatrix.get(toolA)?.get(toolB) || 0) + 1;
                this.coOccurrenceMatrix.get(toolA).set(toolB, countAB);
                this.coOccurrenceMatrix.get(toolB).set(toolA, countAB);
            }
        }
    }
    /**
     * Get tool co-occurrences above threshold
     */
    getCoOccurrences(minCount = 5) {
        const results = [];
        const seen = new Set();
        for (const [toolA, innerMap] of this.coOccurrenceMatrix) {
            for (const [toolB, count] of innerMap) {
                const key = [toolA, toolB].sort().join('|');
                if (seen.has(key) || count < minCount)
                    continue;
                seen.add(key);
                results.push({
                    toolA,
                    toolB,
                    count,
                    avgGap: this.calculateAvgGap(toolA, toolB),
                    correlation: this.calculateCorrelation(toolA, toolB),
                });
            }
        }
        return results.sort((a, b) => b.count - a.count);
    }
    calculateAvgGap(toolA, toolB) {
        let totalGap = 0;
        let gapCount = 0;
        for (const session of this.completedSessions) {
            const calls = session.toolCalls;
            let lastA = -1;
            let lastB = -1;
            for (let i = 0; i < calls.length; i++) {
                if (calls[i].toolId === toolA)
                    lastA = i;
                if (calls[i].toolId === toolB)
                    lastB = i;
                if (lastA >= 0 && lastB >= 0 && lastA !== lastB) {
                    totalGap += Math.abs(lastA - lastB);
                    gapCount++;
                }
            }
        }
        return gapCount > 0 ? totalGap / gapCount : 0;
    }
    calculateCorrelation(toolA, toolB) {
        let bothPresent = 0;
        let onlyA = 0;
        let onlyB = 0;
        let neither = 0;
        for (const session of this.completedSessions) {
            const tools = new Set(session.toolCalls.map(tc => tc.toolId));
            const hasA = tools.has(toolA);
            const hasB = tools.has(toolB);
            if (hasA && hasB)
                bothPresent++;
            else if (hasA)
                onlyA++;
            else if (hasB)
                onlyB++;
            else
                neither++;
        }
        const total = bothPresent + onlyA + onlyB + neither;
        if (total === 0)
            return 0;
        // Phi coefficient
        const ad = bothPresent * neither;
        const bc = onlyA * onlyB;
        const denom = Math.sqrt((bothPresent + onlyA) * (bothPresent + onlyB) * (neither + onlyA) * (neither + onlyB));
        return denom > 0 ? (ad - bc) / denom : 0;
    }
    // ==========================================================================
    // SEQUENCE ANALYSIS
    // ==========================================================================
    /**
     * Discover common tool sequences
     */
    discoverSequences(minLength = 2, maxLength = 5, minCount = 3) {
        // Check cache
        if (Date.now() - this.lastAnalysisTime < this.ANALYSIS_CACHE_TTL && this.sequenceCache.length > 0) {
            return this.sequenceCache;
        }
        const sequenceCounts = new Map();
        for (const session of this.completedSessions) {
            const tools = session.toolCalls;
            // Extract all subsequences
            for (let start = 0; start < tools.length; start++) {
                for (let len = minLength; len <= Math.min(maxLength, tools.length - start); len++) {
                    const subseq = tools.slice(start, start + len);
                    const key = subseq.map(tc => tc.toolId).join('→');
                    const existing = sequenceCounts.get(key) || { count: 0, durations: [], successes: [] };
                    existing.count++;
                    existing.durations.push(len);
                    existing.successes.push(subseq.every(tc => tc.success));
                    sequenceCounts.set(key, existing);
                }
            }
        }
        // Convert to results
        const results = [];
        for (const [key, data] of sequenceCounts) {
            if (data.count < minCount)
                continue;
            const avgDuration = data.durations.reduce((a, b) => a + b, 0) / data.durations.length;
            const successRate = data.successes.filter(s => s).length / data.successes.length;
            results.push({
                sequence: key.split('→'),
                count: data.count,
                avgDuration,
                successRate,
            });
        }
        this.sequenceCache = results.sort((a, b) => b.count - a.count);
        this.lastAnalysisTime = Date.now();
        return this.sequenceCache;
    }
    // ==========================================================================
    // JOURNEY ANALYSIS
    // ==========================================================================
    /**
     * Identify common user journeys
     */
    identifyJourneys() {
        const sequences = this.discoverSequences(3, 6, 5);
        const journeys = [];
        // Cluster sequences into journeys
        const clusters = this.clusterSequences(sequences);
        for (const cluster of clusters) {
            const representativeSeq = cluster[0];
            journeys.push({
                name: this.generateJourneyName(representativeSeq.sequence),
                description: `Common journey involving ${representativeSeq.sequence.length} tools`,
                tools: representativeSeq.sequence,
                frequency: cluster.reduce((sum, s) => sum + s.count, 0),
                avgSuccess: cluster.reduce((sum, s) => sum + s.successRate, 0) / cluster.length,
            });
        }
        return journeys.sort((a, b) => b.frequency - a.frequency);
    }
    clusterSequences(sequences) {
        // Simple clustering by shared tools
        const clusters = [];
        const assigned = new Set();
        for (const seq of sequences) {
            if (assigned.has(seq))
                continue;
            const cluster = [seq];
            assigned.add(seq);
            for (const other of sequences) {
                if (assigned.has(other))
                    continue;
                // Check overlap
                const overlap = seq.sequence.filter(t => other.sequence.includes(t)).length;
                const similarity = overlap / Math.max(seq.sequence.length, other.sequence.length);
                if (similarity > 0.5) {
                    cluster.push(other);
                    assigned.add(other);
                }
            }
            clusters.push(cluster);
        }
        return clusters.filter(c => c.length > 0);
    }
    generateJourneyName(tools) {
        // Simple heuristic based on tool names
        const domains = new Set();
        for (const tool of tools) {
            if (tool.includes('budget') || tool.includes('finance'))
                domains.add('Financial');
            if (tool.includes('calendar') || tool.includes('schedule'))
                domains.add('Planning');
            if (tool.includes('music') || tool.includes('play'))
                domains.add('Entertainment');
            if (tool.includes('memory') || tool.includes('recall'))
                domains.add('Memory');
            if (tool.includes('wellness') || tool.includes('health'))
                domains.add('Wellness');
            if (tool.includes('goal') || tool.includes('habit'))
                domains.add('Growth');
        }
        if (domains.size === 0)
            return `${tools.length}-Step Journey`;
        return `${Array.from(domains).join(' + ')} Journey`;
    }
    // ==========================================================================
    // GAP ANALYSIS
    // ==========================================================================
    /**
     * Identify gaps in tool coverage
     */
    analyzeGaps(featureRequests) {
        const gaps = [];
        for (const request of featureRequests) {
            if (request.count < 3)
                continue;
            const gap = this.categorizeGap(request);
            if (gap)
                gaps.push(gap);
        }
        return gaps.sort((a, b) => {
            const priorityOrder = { high: 0, medium: 1, low: 2 };
            if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
                return priorityOrder[a.priority] - priorityOrder[b.priority];
            }
            return b.requestCount - a.requestCount;
        });
    }
    categorizeGap(request) {
        const capability = request.capability.toLowerCase();
        // Financial gaps
        if (capability.includes('invest') || capability.includes('stock') || capability.includes('portfolio')) {
            return {
                description: `Users want: ${request.capability}`,
                requestCount: request.count,
                examples: request.examples,
                suggestedDomain: 'finance',
                suggestedToolName: this.suggestToolName(capability),
                priority: request.count > 10 ? 'high' : request.count > 5 ? 'medium' : 'low',
            };
        }
        // Calendar/scheduling gaps
        if (capability.includes('schedule') || capability.includes('appointment') || capability.includes('remind')) {
            return {
                description: `Users want: ${request.capability}`,
                requestCount: request.count,
                examples: request.examples,
                suggestedDomain: 'calendar',
                suggestedToolName: this.suggestToolName(capability),
                priority: request.count > 10 ? 'high' : request.count > 5 ? 'medium' : 'low',
            };
        }
        // Communication gaps
        if (capability.includes('email') || capability.includes('message') || capability.includes('text') || capability.includes('call')) {
            return {
                description: `Users want: ${request.capability}`,
                requestCount: request.count,
                examples: request.examples,
                suggestedDomain: 'communication',
                suggestedToolName: this.suggestToolName(capability),
                priority: request.count > 10 ? 'high' : request.count > 5 ? 'medium' : 'low',
            };
        }
        // Generic gap
        return {
            description: `Users want: ${request.capability}`,
            requestCount: request.count,
            examples: request.examples,
            suggestedDomain: 'productivity',
            suggestedToolName: this.suggestToolName(capability),
            priority: request.count > 10 ? 'high' : 'medium',
        };
    }
    suggestToolName(capability) {
        // Extract key action/noun
        const words = capability.split(/\s+/);
        const verbs = ['manage', 'track', 'create', 'get', 'analyze', 'send', 'find'];
        const verb = words.find(w => verbs.some(v => w.startsWith(v))) || 'manage';
        const noun = words.filter(w => !verbs.some(v => w.startsWith(v))).slice(0, 2).join('');
        return `${verb}${noun.charAt(0).toUpperCase()}${noun.slice(1)}`;
    }
    // ==========================================================================
    // CONSOLIDATION OPPORTUNITIES
    // ==========================================================================
    /**
     * Find tools that should be consolidated
     */
    findConsolidationOpportunities() {
        const opportunities = [];
        const coOccurrences = this.getCoOccurrences(10);
        // High correlation = consolidation candidate
        for (const coOcc of coOccurrences) {
            if (coOcc.correlation > 0.6 && coOcc.avgGap < 2) {
                opportunities.push({
                    tools: [coOcc.toolA, coOcc.toolB],
                    reason: `High correlation (${(coOcc.correlation * 100).toFixed(0)}%) and typically used together (${coOcc.avgGap.toFixed(1)} turns apart)`,
                    suggestedName: this.suggestConsolidatedName(coOcc.toolA, coOcc.toolB),
                    expectedBenefit: 'Reduced tool count, simpler UX',
                    confidence: coOcc.correlation,
                });
            }
        }
        return opportunities.sort((a, b) => b.confidence - a.confidence);
    }
    suggestConsolidatedName(toolA, toolB) {
        // Find common prefix
        let i = 0;
        while (i < toolA.length && i < toolB.length && toolA[i] === toolB[i])
            i++;
        if (i > 3) {
            return toolA.slice(0, i) + 'Manager';
        }
        // Combine key parts
        const partA = toolA.replace(/^(manage|get|create|track)/, '');
        const partB = toolB.replace(/^(manage|get|create|track)/, '');
        return `manage${partA}And${partB.charAt(0).toUpperCase()}${partB.slice(1)}`;
    }
    // ==========================================================================
    // REPORTING
    // ==========================================================================
    /**
     * Generate comprehensive pattern report
     */
    generateReport() {
        let report = '═══════════════════════════════════════════════════════════════\n';
        report += '                  INTERACTION PATTERN ANALYSIS                   \n';
        report += '═══════════════════════════════════════════════════════════════\n\n';
        // Summary
        report += '📊 DATA SUMMARY\n';
        report += '─────────────────────────────────────────────────────────────────\n';
        report += `  Active Sessions:    ${this.sessions.size}\n`;
        report += `  Completed Sessions: ${this.completedSessions.length}\n`;
        report += `  Tools Tracked:      ${this.coOccurrenceMatrix.size}\n\n`;
        // Top co-occurrences
        const coOccs = this.getCoOccurrences(5).slice(0, 5);
        if (coOccs.length > 0) {
            report += '🔗 TOP TOOL CO-OCCURRENCES\n';
            report += '─────────────────────────────────────────────────────────────────\n';
            for (const co of coOccs) {
                report += `  ${co.toolA} ↔ ${co.toolB}\n`;
                report += `    Count: ${co.count}, Correlation: ${(co.correlation * 100).toFixed(0)}%\n`;
            }
            report += '\n';
        }
        // Top sequences
        const seqs = this.discoverSequences().slice(0, 5);
        if (seqs.length > 0) {
            report += '📍 COMMON TOOL SEQUENCES\n';
            report += '─────────────────────────────────────────────────────────────────\n';
            for (const seq of seqs) {
                report += `  ${seq.sequence.join(' → ')}\n`;
                report += `    Used ${seq.count} times, ${(seq.successRate * 100).toFixed(0)}% success\n`;
            }
            report += '\n';
        }
        // Journeys
        const journeys = this.identifyJourneys().slice(0, 3);
        if (journeys.length > 0) {
            report += '🚀 USER JOURNEYS\n';
            report += '─────────────────────────────────────────────────────────────────\n';
            for (const journey of journeys) {
                report += `  ${journey.name}\n`;
                report += `    Tools: ${journey.tools.join(' → ')}\n`;
                report += `    Frequency: ${journey.frequency}, Success: ${(journey.avgSuccess * 100).toFixed(0)}%\n`;
            }
            report += '\n';
        }
        // Consolidation opportunities
        const consolidations = this.findConsolidationOpportunities().slice(0, 3);
        if (consolidations.length > 0) {
            report += '🔧 CONSOLIDATION OPPORTUNITIES\n';
            report += '─────────────────────────────────────────────────────────────────\n';
            for (const opp of consolidations) {
                report += `  ${opp.tools.join(' + ')} → ${opp.suggestedName}\n`;
                report += `    ${opp.reason}\n`;
            }
        }
        report += '\n═══════════════════════════════════════════════════════════════\n';
        return report;
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
export const patternAnalyzer = new PatternAnalyzer();
export default patternAnalyzer;
