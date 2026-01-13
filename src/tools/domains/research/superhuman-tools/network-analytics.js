/**
 * Network & Relationship Analytics Tools
 *
 * These tools analyze relationship patterns, communication health,
 * influence mapping, and network gaps. Understanding your social
 * network is crucial for life outcomes but nearly impossible to
 * do objectively yourself.
 *
 * "Better than Human" because: No friend can objectively analyze
 * your relationship patterns without their own biases.
 *
 * @module tools/domains/research/superhuman-tools/network-analytics
 */
import { z } from 'zod';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../../utils/safe-logger.js';
import { getUserIdFromContext, saveRelationship, saveInteraction, } from './firestore-persistence.js';
const log = getLogger();
const relationshipStore = new Map();
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function daysSince(date) {
    return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}
// ============================================================================
// RELATIONSHIP TRACKER
// ============================================================================
export const trackRelationship = llm.tool({
    description: "Track a relationship to analyze patterns over time. Build your relationship map.",
    parameters: z.object({
        name: z.string().describe('Name of the person'),
        relationship: z.enum(['family', 'friend', 'colleague', 'mentor', 'mentee', 'partner', 'acquaintance'])
            .describe('Type of relationship'),
        energyImpact: z.enum(['draining', 'neutral', 'energizing'])
            .describe('How do interactions with this person affect your energy?'),
        influenceDomains: z.array(z.string()).optional()
            .describe('What areas of life do they influence? (career, health, finances, etc.)'),
    }),
    execute: async (params, { ctx }) => {
        const userId = getUserIdFromContext(ctx);
        if (!userId)
            return 'I need to know who you are.';
        const userRelationships = relationshipStore.get(userId) || [];
        const existing = userRelationships.find(r => r.name.toLowerCase() === params.name.toLowerCase());
        if (existing) {
            existing.relationship = params.relationship;
            existing.energyImpact = params.energyImpact;
            existing.influenceDomains = params.influenceDomains || [];
            return `Updated relationship record for ${params.name}`;
        }
        const newRelationship = {
            id: `rel_${Date.now()}`,
            name: params.name,
            relationship: params.relationship,
            energyImpact: params.energyImpact,
            influenceDomains: params.influenceDomains || [],
            supportProvided: [],
            supportReceived: [],
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        userRelationships.push({
            name: params.name,
            relationship: params.relationship,
            lastInteraction: new Date(),
            interactionHistory: [],
            supportProvided: [],
            supportReceived: [],
            energyImpact: params.energyImpact,
            influenceDomains: params.influenceDomains || [],
        });
        relationshipStore.set(userId, userRelationships);
        // Persist to Firestore
        try {
            await saveRelationship(userId, newRelationship);
        }
        catch (err) {
            // Log error but don't fail the operation
        }
        return [
            `✅ Relationship tracked: ${params.name}`,
            '',
            `• Type: ${params.relationship}`,
            `• Energy impact: ${params.energyImpact}`,
            params.influenceDomains?.length ? `• Influences: ${params.influenceDomains.join(', ')}` : '',
            '',
            `Track interactions to build relationship health insights!`,
        ].filter(Boolean).join('\n');
    },
});
export const logInteraction = llm.tool({
    description: "Log an interaction with someone in your network. Build data for relationship health analysis.",
    parameters: z.object({
        name: z.string().describe('Name of the person'),
        type: z.enum(['in_person', 'call', 'video', 'text', 'email', 'social']).describe('Type of interaction'),
        quality: z.number().min(1).max(10).describe('Quality of interaction 1-10'),
        topic: z.string().optional().describe('What did you discuss?'),
    }),
    execute: async (params, { ctx }) => {
        const userId = getUserIdFromContext(ctx);
        if (!userId)
            return 'I need to know who you are.';
        const userRelationships = relationshipStore.get(userId) || [];
        let relationship = userRelationships.find(r => r.name.toLowerCase() === params.name.toLowerCase());
        if (!relationship) {
            relationship = {
                name: params.name,
                relationship: 'friend',
                lastInteraction: new Date(),
                interactionHistory: [],
                supportProvided: [],
                supportReceived: [],
                energyImpact: 'neutral',
                influenceDomains: [],
            };
            userRelationships.push(relationship);
            relationshipStore.set(userId, userRelationships);
        }
        relationship.lastInteraction = new Date();
        relationship.interactionHistory.push({
            date: new Date(),
            type: params.type,
            quality: params.quality,
            topic: params.topic || '',
        });
        // Persist interaction to Firestore
        try {
            await saveInteraction(userId, {
                id: `int_${Date.now()}`,
                relationshipId: relationship.name, // Use name as ID for now
                date: new Date(),
                type: params.type,
                quality: params.quality,
                topic: params.topic || '',
                duration: 0,
            });
        }
        catch (err) {
            // Log error but don't fail the operation
        }
        const avgQuality = relationship.interactionHistory.reduce((sum, i) => sum + i.quality, 0) /
            relationship.interactionHistory.length;
        return [
            `✅ Interaction logged with ${params.name}`,
            '',
            `• Type: ${params.type}`,
            `• Quality: ${params.quality}/10`,
            params.topic ? `• Topic: ${params.topic}` : '',
            '',
            `**${params.name} stats:**`,
            `• Total interactions tracked: ${relationship.interactionHistory.length}`,
            `• Average quality: ${avgQuality.toFixed(1)}/10`,
        ].filter(Boolean).join('\n');
    },
});
// ============================================================================
// COMMUNICATION PATTERN ANALYZER
// ============================================================================
export const analyzeCommunicationPatterns = llm.tool({
    description: "Analyze your communication patterns. See who you talk to when stressed, who you celebrate with, who drains vs energizes you.",
    parameters: z.object({}),
    execute: async (_params, { ctx }) => {
        const userId = getUserIdFromContext(ctx);
        if (!userId)
            return 'I need to know who you are.';
        const userRelationships = relationshipStore.get(userId) || [];
        if (userRelationships.length < 3) {
            return [
                `📊 **COMMUNICATION PATTERN ANALYSIS**`,
                '',
                `⚠️ **Need more data**`,
                '',
                `You have ${userRelationships.length} relationships tracked.`,
                `I need at least 3 with interaction history for meaningful analysis.`,
                '',
                `**To build your communication map:**`,
                `1. Track your key relationships`,
                `2. Log interactions (calls, texts, meetups)`,
                `3. Note the quality and topics discussed`,
                '',
                `Say "Track relationship: [name]" to start.`,
            ].join('\n');
        }
        // Categorize relationships
        const energizing = userRelationships.filter(r => r.energyImpact === 'energizing');
        const draining = userRelationships.filter(r => r.energyImpact === 'draining');
        const neutral = userRelationships.filter(r => r.energyImpact === 'neutral');
        // Find interaction patterns
        const frequentContacts = userRelationships
            .filter(r => r.interactionHistory.length > 0)
            .sort((a, b) => b.interactionHistory.length - a.interactionHistory.length)
            .slice(0, 5);
        const neglected = userRelationships
            .filter(r => daysSince(r.lastInteraction) > 30)
            .sort((a, b) => daysSince(b.lastInteraction) - daysSince(a.lastInteraction));
        const highQuality = userRelationships
            .filter(r => r.interactionHistory.length >= 2)
            .map(r => ({
            name: r.name,
            avgQuality: r.interactionHistory.reduce((sum, i) => sum + i.quality, 0) / r.interactionHistory.length,
        }))
            .sort((a, b) => b.avgQuality - a.avgQuality)
            .slice(0, 3);
        log.info({ userId, relationships: userRelationships.length }, '📊 Communication pattern analysis');
        return [
            `📊 **YOUR COMMUNICATION PATTERNS**`,
            '',
            `Based on ${userRelationships.length} tracked relationships`,
            '',
            `═══════════════════════════════════`,
            `⚡ **ENERGY MAP**`,
            `═══════════════════════════════════`,
            '',
            `**Energizing (${energizing.length}):**`,
            energizing.length > 0
                ? energizing.map(r => `• ${r.name} (${r.relationship})`).join('\n')
                : '• None tracked yet',
            '',
            `**Draining (${draining.length}):**`,
            draining.length > 0
                ? draining.map(r => `• ${r.name} (${r.relationship})`).join('\n')
                : '• None tracked',
            '',
            `**Neutral (${neutral.length}):**`,
            neutral.length > 0
                ? `• ${neutral.length} relationships`
                : '• None tracked',
            '',
            `═══════════════════════════════════`,
            `📞 **MOST FREQUENT CONTACTS**`,
            `═══════════════════════════════════`,
            '',
            frequentContacts.length > 0
                ? frequentContacts.map(r => `• ${r.name}: ${r.interactionHistory.length} interactions`).join('\n')
                : 'No interaction data yet',
            '',
            highQuality.length > 0 ? `═══════════════════════════════════` : '',
            highQuality.length > 0 ? `⭐ **HIGHEST QUALITY INTERACTIONS**` : '',
            highQuality.length > 0 ? `═══════════════════════════════════` : '',
            highQuality.length > 0 ? '' : '',
            highQuality.length > 0
                ? highQuality.map(r => `• ${r.name}: ${r.avgQuality.toFixed(1)}/10 avg`).join('\n')
                : '',
            '',
            neglected.length > 0 ? `═══════════════════════════════════` : '',
            neglected.length > 0 ? `⚠️ **NEGLECTED RELATIONSHIPS**` : '',
            neglected.length > 0 ? `═══════════════════════════════════` : '',
            neglected.length > 0 ? '' : '',
            ...neglected.slice(0, 5).map(r => `• ${r.name}: ${daysSince(r.lastInteraction)} days since contact`),
            '',
            `═══════════════════════════════════`,
            `💡 **INSIGHTS**`,
            `═══════════════════════════════════`,
            '',
            energizing.length < draining.length
                ? `⚠️ You have more draining than energizing relationships. Consider rebalancing.`
                : `✅ Good energy balance in your network.`,
            '',
            neglected.length > 3
                ? `⚠️ ${neglected.length} relationships need attention.`
                : `✅ Relationships generally well-maintained.`,
            '',
            `═══════════════════════════════════`,
            `🎯 **PETER'S TAKE**`,
            `═══════════════════════════════════`,
            '',
            `You become the average of the people you spend time with.`,
            ``,
            `Questions to consider:`,
            `• Are your most frequent contacts your highest quality ones?`,
            `• Are you investing in energizing relationships?`,
            `• Who should you reconnect with?`,
        ].filter(Boolean).join('\n');
    },
});
// ============================================================================
// RELATIONSHIP HEALTH SCORER
// ============================================================================
export const scoreRelationshipHealth = llm.tool({
    description: "Get a health score for a specific relationship. See trends, warning signs, and recommendations.",
    parameters: z.object({
        name: z.string().describe('Name of the person'),
    }),
    execute: async (params, { ctx }) => {
        const userId = getUserIdFromContext(ctx);
        if (!userId)
            return 'I need to know who you are.';
        const userRelationships = relationshipStore.get(userId) || [];
        const relationship = userRelationships.find(r => r.name.toLowerCase().includes(params.name.toLowerCase()));
        if (!relationship) {
            return [
                `I don't have data on "${params.name}".`,
                '',
                `Your tracked relationships:`,
                ...userRelationships.map(r => `• ${r.name}`),
                '',
                `Track this person first with "Track relationship: ${params.name}"`,
            ].join('\n');
        }
        // Calculate health metrics
        const interactions = relationship.interactionHistory;
        const daysSinceContact = daysSince(relationship.lastInteraction);
        const avgQuality = interactions.length > 0
            ? interactions.reduce((sum, i) => sum + i.quality, 0) / interactions.length
            : 5;
        // Trend analysis
        let trend = 'stable';
        if (interactions.length >= 4) {
            const recentAvg = interactions.slice(-2).reduce((sum, i) => sum + i.quality, 0) / 2;
            const olderAvg = interactions.slice(0, -2).reduce((sum, i) => sum + i.quality, 0) / (interactions.length - 2);
            if (recentAvg > olderAvg + 1)
                trend = 'improving';
            else if (recentAvg < olderAvg - 1)
                trend = 'declining';
        }
        // Calculate health score
        let healthScore = 50;
        // Recency factor
        if (daysSinceContact < 7)
            healthScore += 20;
        else if (daysSinceContact < 30)
            healthScore += 10;
        else if (daysSinceContact > 90)
            healthScore -= 20;
        else if (daysSinceContact > 60)
            healthScore -= 10;
        // Quality factor
        healthScore += (avgQuality - 5) * 5;
        // Frequency factor
        if (interactions.length >= 10)
            healthScore += 10;
        else if (interactions.length >= 5)
            healthScore += 5;
        // Energy factor
        if (relationship.energyImpact === 'energizing')
            healthScore += 10;
        else if (relationship.energyImpact === 'draining')
            healthScore -= 10;
        // Trend factor
        if (trend === 'improving')
            healthScore += 10;
        else if (trend === 'declining')
            healthScore -= 10;
        healthScore = Math.max(0, Math.min(100, healthScore));
        // Warning signs
        const warnings = [];
        if (daysSinceContact > 60)
            warnings.push('Extended period without contact');
        if (avgQuality < 5)
            warnings.push('Low interaction quality');
        if (trend === 'declining')
            warnings.push('Quality trending down');
        if (relationship.energyImpact === 'draining' && interactions.length > 5) {
            warnings.push('Consistently draining interactions');
        }
        // Strength factors
        const strengths = [];
        if (avgQuality >= 7)
            strengths.push('High quality interactions');
        if (daysSinceContact < 7)
            strengths.push('Recently connected');
        if (relationship.energyImpact === 'energizing')
            strengths.push('Energizing presence');
        if (trend === 'improving')
            strengths.push('Relationship improving');
        const scoreEmoji = healthScore >= 70 ? '🟢' : healthScore >= 40 ? '🟡' : '🔴';
        const scoreLabel = healthScore >= 70 ? 'HEALTHY' : healthScore >= 40 ? 'NEEDS ATTENTION' : 'AT RISK';
        return [
            `❤️ **RELATIONSHIP HEALTH: ${relationship.name.toUpperCase()}**`,
            '',
            `═══════════════════════════════════`,
            `${scoreEmoji} **HEALTH SCORE: ${healthScore}/100 (${scoreLabel})**`,
            `═══════════════════════════════════`,
            '',
            `**Overview:**`,
            `• Relationship type: ${relationship.relationship}`,
            `• Last contact: ${daysSinceContact} days ago`,
            `• Tracked interactions: ${interactions.length}`,
            `• Average quality: ${avgQuality.toFixed(1)}/10`,
            `• Energy impact: ${relationship.energyImpact}`,
            `• Trend: ${trend} ${trend === 'improving' ? '📈' : trend === 'declining' ? '📉' : '➡️'}`,
            '',
            strengths.length > 0 ? `═══════════════════════════════════` : '',
            strengths.length > 0 ? `✅ **STRENGTHS**` : '',
            strengths.length > 0 ? `═══════════════════════════════════` : '',
            strengths.length > 0 ? '' : '',
            ...strengths.map(s => `• ${s}`),
            '',
            warnings.length > 0 ? `═══════════════════════════════════` : '',
            warnings.length > 0 ? `⚠️ **WARNING SIGNS**` : '',
            warnings.length > 0 ? `═══════════════════════════════════` : '',
            warnings.length > 0 ? '' : '',
            ...warnings.map(w => `• ${w}`),
            '',
            `═══════════════════════════════════`,
            `💡 **RECOMMENDATIONS**`,
            `═══════════════════════════════════`,
            '',
            daysSinceContact > 14
                ? `• Reach out soon - it's been ${daysSinceContact} days`
                : `• Contact frequency is good`,
            avgQuality < 6
                ? `• Try a higher quality interaction (in-person, meaningful conversation)`
                : `• Keep doing what's working`,
            relationship.energyImpact === 'draining'
                ? `• Consider boundaries or reducing frequency`
                : '',
            trend === 'declining'
                ? `• Address the decline - what changed?`
                : '',
            '',
            `═══════════════════════════════════`,
            `🎯 **PETER'S TAKE**`,
            `═══════════════════════════════════`,
            '',
            healthScore >= 70
                ? `This is a healthy relationship. Maintain it intentionally.`
                : healthScore >= 40
                    ? `Some attention needed. The data shows specific areas to work on.`
                    : `This relationship needs intervention. Decide: invest or let go.`,
        ].filter(Boolean).join('\n');
    },
});
// ============================================================================
// INFLUENCE MAPPER
// ============================================================================
export const mapInfluence = llm.tool({
    description: "Map who influences your decisions in different areas of life. Understand where your ideas and behaviors come from.",
    parameters: z.object({}),
    execute: async (_params, { ctx }) => {
        const userId = getUserIdFromContext(ctx);
        if (!userId)
            return 'I need to know who you are.';
        const userRelationships = relationshipStore.get(userId) || [];
        const withInfluence = userRelationships.filter(r => r.influenceDomains.length > 0);
        if (withInfluence.length < 2) {
            return [
                `🎯 **INFLUENCE MAP**`,
                '',
                `⚠️ **Need more data**`,
                '',
                `Track relationships with influence domains to build your influence map.`,
                '',
                `When tracking, specify what areas they influence:`,
                `• Career decisions`,
                `• Financial choices`,
                `• Health behaviors`,
                `• Relationship advice`,
                `• Personal growth`,
                '',
                `Example: "Track relationship: [name], influences: career, finances"`,
            ].join('\n');
        }
        // Group by influence domain
        const byDomain = {};
        for (const r of withInfluence) {
            for (const domain of r.influenceDomains) {
                if (!byDomain[domain])
                    byDomain[domain] = [];
                byDomain[domain].push(r);
            }
        }
        // Analyze influence concentration
        const domains = Object.keys(byDomain);
        const influenceAnalysis = domains.map(domain => {
            const influencers = byDomain[domain];
            const energyBalance = influencers.filter(r => r.energyImpact === 'energizing').length -
                influencers.filter(r => r.energyImpact === 'draining').length;
            return {
                domain,
                influencerCount: influencers.length,
                energyBalance,
                influencers: influencers.map(r => r.name),
            };
        });
        // Find concentration risks
        const concentrationRisks = influenceAnalysis.filter(a => a.influencerCount === 1);
        const negativeInfluence = influenceAnalysis.filter(a => a.energyBalance < 0);
        log.info({ userId, domains: domains.length }, '🎯 Influence mapping');
        return [
            `🎯 **YOUR INFLUENCE MAP**`,
            '',
            `Based on ${withInfluence.length} relationships with tracked influence`,
            '',
            `═══════════════════════════════════`,
            `📊 **INFLUENCE BY DOMAIN**`,
            `═══════════════════════════════════`,
            '',
            ...influenceAnalysis.map(a => [
                `**${a.domain.toUpperCase()}**`,
                `• Influencers: ${a.influencers.join(', ')}`,
                `• Diversity: ${a.influencerCount === 1 ? '⚠️ Single source' : `✅ ${a.influencerCount} sources`}`,
                `• Energy balance: ${a.energyBalance > 0 ? '✅ Positive' : a.energyBalance < 0 ? '⚠️ Negative' : '➡️ Neutral'}`,
                '',
            ].join('\n')),
            concentrationRisks.length > 0 ? `═══════════════════════════════════` : '',
            concentrationRisks.length > 0 ? `⚠️ **CONCENTRATION RISKS**` : '',
            concentrationRisks.length > 0 ? `═══════════════════════════════════` : '',
            concentrationRisks.length > 0 ? '' : '',
            ...concentrationRisks.map(r => `• ${r.domain}: Only influenced by ${r.influencers[0]}`),
            '',
            negativeInfluence.length > 0 ? `═══════════════════════════════════` : '',
            negativeInfluence.length > 0 ? `🔴 **NEGATIVE INFLUENCE ZONES**` : '',
            negativeInfluence.length > 0 ? `═══════════════════════════════════` : '',
            negativeInfluence.length > 0 ? '' : '',
            ...negativeInfluence.map(r => `• ${r.domain}: Dominated by draining influences`),
            '',
            `═══════════════════════════════════`,
            `💡 **INSIGHTS**`,
            `═══════════════════════════════════`,
            '',
            concentrationRisks.length > 0
                ? `⚠️ Single-source influence is risky. Seek diverse perspectives in: ${concentrationRisks.map(r => r.domain).join(', ')}`
                : `✅ Good diversity of influence across domains.`,
            '',
            negativeInfluence.length > 0
                ? `⚠️ Negative energy in ${negativeInfluence.map(r => r.domain).join(', ')}. Consider who you take advice from.`
                : '',
            '',
            `═══════════════════════════════════`,
            `🎯 **PETER'S TAKE**`,
            `═══════════════════════════════════`,
            '',
            `Your life reflects the advice you follow.`,
            ``,
            `Questions to ask:`,
            `• Are your influencers living the life you want?`,
            `• Do you have diverse perspectives or an echo chamber?`,
            `• Are draining people influencing important decisions?`,
        ].filter(Boolean).join('\n');
    },
});
// ============================================================================
// NETWORK GAP ANALYZER
// ============================================================================
export const analyzeNetworkGaps = llm.tool({
    description: "Identify gaps in your network. What types of relationships or connections are you missing for your goals?",
    parameters: z.object({
        goals: z.array(z.string()).describe('Your current life goals'),
    }),
    execute: async (params, { ctx }) => {
        const userId = getUserIdFromContext(ctx);
        if (!userId)
            return 'I need to know who you are.';
        const userRelationships = relationshipStore.get(userId) || [];
        // Analyze current network composition
        const byType = {};
        for (const r of userRelationships) {
            byType[r.relationship] = (byType[r.relationship] || 0) + 1;
        }
        // Covered influence domains
        const coveredDomains = new Set();
        for (const r of userRelationships) {
            for (const domain of r.influenceDomains) {
                coveredDomains.add(domain.toLowerCase());
            }
        }
        // Goal-based gap analysis
        const goalKeywords = {
            career: ['career', 'job', 'promotion', 'work', 'professional', 'business', 'startup'],
            financial: ['money', 'invest', 'wealth', 'retire', 'financial', 'savings', 'income'],
            health: ['health', 'fitness', 'weight', 'exercise', 'diet', 'wellness', 'mental'],
            relationship: ['relationship', 'dating', 'marriage', 'family', 'social', 'friends'],
            learning: ['learn', 'skill', 'education', 'degree', 'course', 'read', 'study'],
            creative: ['creative', 'art', 'music', 'write', 'create', 'build', 'design'],
        };
        // Identify gaps based on goals
        const gaps = [];
        for (const goal of params.goals) {
            const goalLower = goal.toLowerCase();
            for (const [area, keywords] of Object.entries(goalKeywords)) {
                if (keywords.some(k => goalLower.includes(k)) && !coveredDomains.has(area)) {
                    const existing = gaps.find(g => g.area === area);
                    if (existing) {
                        existing.impactedGoals.push(goal);
                    }
                    else {
                        gaps.push({
                            area,
                            importance: 'important',
                            impactedGoals: [goal],
                            suggestions: getNetworkSuggestions(area),
                        });
                    }
                }
            }
        }
        // Check for missing relationship types
        if (!byType['mentor']) {
            gaps.push({
                area: 'Mentorship',
                importance: 'critical',
                impactedGoals: params.goals.slice(0, 2),
                suggestions: [
                    'Find someone 10 years ahead on your path',
                    'Look within your industry or adjacent ones',
                    'Offer value before asking for mentorship',
                ],
            });
        }
        // Network diversity score
        const diversityDimensions = [
            { dimension: 'Relationship types', coverage: Object.keys(byType).length / 7 },
            { dimension: 'Influence domains', coverage: coveredDomains.size / 6 },
            { dimension: 'Energy balance', coverage: userRelationships.filter(r => r.energyImpact === 'energizing').length / Math.max(userRelationships.length, 1) },
        ];
        const diversityScore = Math.round(diversityDimensions.reduce((sum, d) => sum + d.coverage, 0) / diversityDimensions.length * 100);
        log.info({ userId, gaps: gaps.length, diversityScore }, '🔍 Network gap analysis');
        return [
            `🔍 **NETWORK GAP ANALYSIS**`,
            '',
            `Based on your goals: ${params.goals.join(', ')}`,
            '',
            `═══════════════════════════════════`,
            `📊 **CURRENT NETWORK COMPOSITION**`,
            `═══════════════════════════════════`,
            '',
            `Total relationships tracked: ${userRelationships.length}`,
            '',
            `**By type:**`,
            ...Object.entries(byType).map(([type, count]) => `• ${type}: ${count}`),
            '',
            `**Influence domains covered:**`,
            coveredDomains.size > 0
                ? `• ${Array.from(coveredDomains).join(', ')}`
                : '• None specified',
            '',
            `═══════════════════════════════════`,
            `📈 **NETWORK DIVERSITY SCORE: ${diversityScore}/100**`,
            `═══════════════════════════════════`,
            '',
            ...diversityDimensions.map(d => `• ${d.dimension}: ${Math.round(d.coverage * 100)}%`),
            '',
            gaps.length > 0 ? `═══════════════════════════════════` : '',
            gaps.length > 0 ? `🔴 **IDENTIFIED GAPS**` : '',
            gaps.length > 0 ? `═══════════════════════════════════` : '',
            gaps.length > 0 ? '' : '',
            ...gaps.map(g => [
                `**${g.area.toUpperCase()}** (${g.importance})`,
                `Impacts: ${g.impactedGoals.join(', ')}`,
                '',
                `Suggestions:`,
                ...g.suggestions.map(s => `• ${s}`),
                '',
            ].join('\n')),
            gaps.length === 0 ? `✅ **No critical gaps identified for your stated goals**` : '',
            '',
            `═══════════════════════════════════`,
            `💡 **RECOMMENDATIONS**`,
            `═══════════════════════════════════`,
            '',
            diversityScore < 50
                ? `• LOW DIVERSITY: Your network may be an echo chamber. Seek different perspectives.`
                : '',
            !byType['mentor']
                ? `• MISSING MENTORS: Find people ahead of you on your path.`
                : '',
            userRelationships.filter(r => r.energyImpact === 'energizing').length < 3
                ? `• LOW ENERGY: Add more energizing relationships to your inner circle.`
                : '',
            '',
            `═══════════════════════════════════`,
            `🎯 **PETER'S TAKE**`,
            `═══════════════════════════════════`,
            '',
            `Your network is your net worth - in opportunities, not just money.`,
            ``,
            `The gaps in your network predict the gaps in your outcomes.`,
            `Fill them intentionally, not randomly.`,
        ].filter(Boolean).join('\n');
    },
});
function getNetworkSuggestions(area) {
    const suggestions = {
        career: [
            'Join industry associations or professional groups',
            'Attend conferences or virtual events',
            'Connect with people in roles you aspire to',
        ],
        financial: [
            'Find a financially successful peer or mentor',
            'Join investment clubs or financial communities',
            'Connect with a fee-only financial advisor',
        ],
        health: [
            'Find a workout buddy or accountability partner',
            'Join fitness communities or classes',
            'Connect with health professionals as trusted advisors',
        ],
        relationship: [
            'Strengthen existing friendships before seeking new ones',
            'Join activity-based groups where connection happens naturally',
            'Reconnect with old friends who knew the real you',
        ],
        learning: [
            'Find a learning partner for accountability',
            'Join cohort-based courses for built-in community',
            'Connect with experts in your area of interest',
        ],
        creative: [
            'Join creative communities or workshops',
            'Find a creative collaborator or accountability partner',
            'Connect with people whose work inspires you',
        ],
    };
    return suggestions[area] || [
        'Identify people who have achieved what you want',
        'Look for communities aligned with this goal',
        'Consider hiring an expert or coach',
    ];
}
// ============================================================================
// EXPORT
// ============================================================================
export const networkAnalyticsTools = {
    trackRelationship,
    logInteraction,
    analyzeCommunicationPatterns,
    scoreRelationshipHealth,
    mapInfluence,
    analyzeNetworkGaps,
};
export default networkAnalyticsTools;
//# sourceMappingURL=network-analytics.js.map