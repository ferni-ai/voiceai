/**
 * Podcast Domain Tools
 *
 * Tools for podcast discovery and exploration.
 * Uses iTunes Podcast API (free, no auth required).
 *
 * DOMAIN: podcasts
 * TOOLS:
 *   Discovery: searchPodcasts, getPodcastRecommendations
 *   Episodes: getPodcastEpisodes
 *   Trending: getTopPodcasts
 */
import { z } from 'zod';
import { llm } from '@livekit/agents';
import { createDomainExport } from '../../registry/loader.js';
import { getLogger } from '../../../utils/safe-logger.js';
// Import podcast services
import { searchPodcasts, getPodcastEpisodes, getTopPodcasts, getPodcastRecommendations, } from '../../../services/podcasts/index.js';
const log = getLogger();
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function formatPodcastForSpeech(show) {
    const episodeInfo = show.totalEpisodes ? ` with ${show.totalEpisodes} episodes` : '';
    const explicitNote = show.explicit ? ' (explicit content)' : '';
    return `"${show.name}" by ${show.publisher}${episodeInfo}${explicitNote}`;
}
function formatEpisodeForSpeech(episode) {
    const duration = episode.durationMs ? ` (${Math.round(episode.durationMs / 60000)} minutes)` : '';
    return `"${episode.title}"${duration}`;
}
function formatPodcastList(shows, limit = 5) {
    const limited = shows.slice(0, limit);
    if (limited.length === 0)
        return 'No podcasts found.';
    if (limited.length === 1) {
        return `I found ${formatPodcastForSpeech(limited[0])}.`;
    }
    const formatted = limited.map((show, i) => `${i + 1}. ${formatPodcastForSpeech(show)}`);
    return `Here are some podcasts:\n${formatted.join('\n')}`;
}
function formatEpisodeList(episodes, limit = 5) {
    const limited = episodes.slice(0, limit);
    if (limited.length === 0)
        return 'No episodes found.';
    const formatted = limited.map((ep, i) => `${i + 1}. ${formatEpisodeForSpeech(ep)}`);
    return `Recent episodes:\n${formatted.join('\n')}`;
}
// ============================================================================
// TOOL DEFINITIONS
// ============================================================================
const searchPodcastsTool = {
    id: 'searchPodcasts',
    name: 'Search Podcasts',
    description: 'Search for podcasts by topic, name, or keyword',
    domain: 'podcasts',
    tags: ['podcasts', 'discovery', 'search', 'entertainment'],
    create: (_ctx) => {
        return llm.tool({
            description: 'Search for podcasts by topic, name, guest, or keyword. Returns podcast shows with descriptions and episode counts.',
            parameters: z.object({
                query: z.string().describe('Search query (topic, podcast name, or keyword)'),
                limit: z
                    .number()
                    .min(1)
                    .max(10)
                    .optional()
                    .describe('Maximum number of results (default: 5)'),
            }),
            execute: async ({ query, limit = 5 }) => {
                log.info({ query, limit }, 'Searching podcasts');
                try {
                    const result = await searchPodcasts(query, limit);
                    if (!result.found || result.shows.length === 0) {
                        return `Couldn't find podcasts matching "${query}". Try a different search term?`;
                    }
                    return formatPodcastList(result.shows, limit);
                }
                catch (error) {
                    log.error({ error: String(error), query }, 'Podcast search failed');
                    return "Sorry, I couldn't search for podcasts right now. Try again in a moment?";
                }
            },
        });
    },
};
const getPodcastRecommendationsTool = {
    id: 'getPodcastRecommendations',
    name: 'Get Podcast Recommendations',
    description: 'Get podcast recommendations based on interests or mood',
    domain: 'podcasts',
    tags: ['podcasts', 'recommendations', 'discovery', 'entertainment'],
    create: (_ctx) => {
        return llm.tool({
            description: 'Get podcast recommendations based on user interests or mood. Great for discovering new shows.',
            parameters: z.object({
                interests: z
                    .array(z.string())
                    .describe('List of interests or topics (e.g., ["technology", "startups"])'),
                mood: z
                    .string()
                    .optional()
                    .describe('Current mood or preference (e.g., "educational", "entertaining", "relaxing")'),
                limit: z
                    .number()
                    .min(1)
                    .max(10)
                    .optional()
                    .describe('Maximum number of results (default: 5)'),
            }),
            execute: async ({ interests, mood, limit = 5 }) => {
                log.info({ interests, mood, limit }, 'Getting podcast recommendations');
                try {
                    const result = await getPodcastRecommendations(interests, mood, limit);
                    if (!result.found || result.shows.length === 0) {
                        const interestText = interests.join(', ');
                        return `Couldn't find podcasts matching your interests (${interestText}). Try different topics?`;
                    }
                    const intro = mood
                        ? `Based on your interest in ${interests.join(', ')} and ${mood} mood:`
                        : `Based on your interest in ${interests.join(', ')}:`;
                    return `${intro}\n${formatPodcastList(result.shows, limit)}`;
                }
                catch (error) {
                    log.error({ error: String(error), interests }, 'Podcast recommendations failed');
                    return "Sorry, I couldn't get recommendations right now. Try again?";
                }
            },
        });
    },
};
const getPodcastEpisodesTool = {
    id: 'getPodcastEpisodes',
    name: 'Get Podcast Episodes',
    description: 'Get recent episodes from a podcast',
    domain: 'podcasts',
    tags: ['podcasts', 'episodes', 'discovery'],
    create: (_ctx) => {
        return llm.tool({
            description: 'Get recent episodes from a specific podcast. Use after finding a podcast with searchPodcasts.',
            parameters: z.object({
                podcastId: z.string().describe('The podcast ID (from search results)'),
                limit: z
                    .number()
                    .min(1)
                    .max(20)
                    .optional()
                    .describe('Maximum number of episodes (default: 5)'),
            }),
            execute: async ({ podcastId, limit = 5 }) => {
                log.info({ podcastId, limit }, 'Getting podcast episodes');
                try {
                    const result = await getPodcastEpisodes(podcastId, limit);
                    if (!result.found || result.episodes.length === 0) {
                        return "Couldn't find episodes for this podcast. It might be unavailable.";
                    }
                    return formatEpisodeList(result.episodes, limit);
                }
                catch (error) {
                    log.error({ error: String(error), podcastId }, 'Episode fetch failed');
                    return "Sorry, I couldn't fetch episodes right now. Try again?";
                }
            },
        });
    },
};
const getTopPodcastsTool = {
    id: 'getTopPodcasts',
    name: 'Get Top Podcasts',
    description: 'Get popular/trending podcasts, optionally by genre',
    domain: 'podcasts',
    tags: ['podcasts', 'trending', 'discovery', 'popular'],
    create: (_ctx) => {
        return llm.tool({
            description: 'Get popular and trending podcasts. Optionally filter by genre like comedy, news, true_crime, business, health, technology, education, sports, or music.',
            parameters: z.object({
                genre: z
                    .string()
                    .optional()
                    .describe('Genre to filter by (comedy, news, true_crime, business, health, technology, education, sports, music)'),
                limit: z
                    .number()
                    .min(1)
                    .max(10)
                    .optional()
                    .describe('Maximum number of results (default: 5)'),
            }),
            execute: async ({ genre, limit = 5 }) => {
                log.info({ genre, limit }, 'Getting top podcasts');
                try {
                    const result = await getTopPodcasts(genre, limit);
                    if (!result.found || result.shows.length === 0) {
                        return genre
                            ? `Couldn't find popular ${genre} podcasts. Try a different genre?`
                            : "Couldn't find popular podcasts right now.";
                    }
                    const intro = genre ? `Popular ${genre} podcasts:` : 'Popular podcasts right now:';
                    return `${intro}\n${formatPodcastList(result.shows, limit)}`;
                }
                catch (error) {
                    log.error({ error: String(error), genre }, 'Top podcasts fetch failed');
                    return "Sorry, I couldn't get trending podcasts. Try again?";
                }
            },
        });
    },
};
// ============================================================================
// DOMAIN EXPORT
// ============================================================================
const podcastTools = [
    searchPodcastsTool,
    getPodcastRecommendationsTool,
    getPodcastEpisodesTool,
    getTopPodcastsTool,
];
export const { getToolDefinitions, domain, definitions } = createDomainExport('podcasts', podcastTools);
export default getToolDefinitions;
//# sourceMappingURL=index.js.map