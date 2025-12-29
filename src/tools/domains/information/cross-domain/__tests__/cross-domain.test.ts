/**
 * Cross-Domain Connection Tools Tests
 * Run with: npx vitest run src/tools/domains/information/cross-domain/__tests__/cross-domain.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('../../../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
}));

// Mock LiveKit
vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({
      description: config.description,
      parameters: config.parameters,
      execute: config.execute,
    })),
  },
}));

// Mock weather APIs
vi.mock('../../weather.js', () => ({
  getCurrentWeather: vi
    .fn()
    .mockResolvedValue('Right now in Philadelphia: 55°F and rainy. Feels like 52°F.'),
  getWeatherForecast: vi.fn().mockResolvedValue('Tomorrow: Sunny, high of 65°F'),
}));

// Mock environmental APIs
vi.mock('../../environmental/air-quality.js', () => ({
  getAirQuality: vi
    .fn()
    .mockResolvedValue('Air Quality Index (AQI): 45 - Good. Safe for outdoor activities.'),
}));

vi.mock('../../environmental/pollen.js', () => ({
  getPollenForecast: vi
    .fn()
    .mockResolvedValue('Pollen levels: Moderate tree pollen. Take precautions if sensitive.'),
}));

vi.mock('../../environmental/uv-index.js', () => ({
  getUVIndex: vi
    .fn()
    .mockResolvedValue('UV Index: 4 - Moderate. Sunscreen recommended for extended exposure.'),
}));

// Mock habits module
vi.mock('../../../habits/habits.js', () => ({
  getUserHabits: vi.fn().mockReturnValue([
    { id: '1', userId: 'test-user', name: 'Morning Run', category: 'fitness', isActive: true },
    { id: '2', userId: 'test-user', name: 'Meditation', category: 'mindfulness', isActive: true },
  ]),
  getDueHabits: vi
    .fn()
    .mockReturnValue([
      { id: '1', userId: 'test-user', name: 'Morning Run', category: 'fitness', isActive: true },
    ]),
}));

// Import after mocks
import {
  createWeatherHabitsTools,
  getWeatherHabitInsights,
  getHabitRecommendation,
} from '../weather-habits.js';
import { createNewsMoodTools, analyzeNewsMoodImpact, filterPositiveNews } from '../news-mood.js';
import {
  createTrafficProductivityTools,
  generateCommuteSuggestions,
} from '../traffic-productivity.js';
import { getCrossDomainToolDefinitions } from '../index.js';

describe('Cross-Domain Connection Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Tool Loading', () => {
    it('should load all cross-domain tool definitions', async () => {
      const definitions = getCrossDomainToolDefinitions();
      expect(definitions).toBeDefined();
      expect(Array.isArray(definitions)).toBe(true);
      expect(definitions.length).toBeGreaterThan(0);
    });

    it('should have correct domain for all tools', () => {
      const definitions = getCrossDomainToolDefinitions();
      for (const tool of definitions) {
        expect(tool.domain).toBe('information');
      }
    });

    it('should include cross-domain tag in all tools', () => {
      const definitions = getCrossDomainToolDefinitions();
      for (const tool of definitions) {
        expect(tool.tags).toContain('cross-domain');
      }
    });
  });

  describe('Weather-Habits Connection', () => {
    describe('getWeatherHabitInsights', () => {
      it('should generate insights for rainy weather', async () => {
        const insights = await getWeatherHabitInsights('Philadelphia');
        expect(insights).toBeDefined();
        expect(Array.isArray(insights)).toBe(true);
        // Should have at least one insight about rainy conditions
        const rainyInsight = insights.find(
          (i) => i.context?.weatherCondition === 'rainy' || i.message.toLowerCase().includes('rain')
        );
        expect(rainyInsight).toBeDefined();
      });

      it('should accept userId to fetch real habits', async () => {
        const insights = await getWeatherHabitInsights('Philadelphia', 'test-user');
        expect(insights).toBeDefined();
      });

      it('should accept habit names array', async () => {
        const insights = await getWeatherHabitInsights('Philadelphia', ['running', 'yoga']);
        expect(insights).toBeDefined();
      });

      it('should return insights with required fields', async () => {
        const insights = await getWeatherHabitInsights('Philadelphia');
        if (insights.length > 0) {
          const insight = insights[0];
          expect(insight.id).toBeDefined();
          expect(insight.sourceDomain).toBeDefined();
          expect(insight.targetDomain).toBeDefined();
          expect(insight.message).toBeDefined();
          expect(insight.confidence).toBeGreaterThanOrEqual(0);
          expect(insight.confidence).toBeLessThanOrEqual(1);
        }
      });
    });

    describe('getHabitRecommendation', () => {
      it('should return recommendation for outdoor habit', async () => {
        const recommendation = await getHabitRecommendation('Philadelphia', 'running', 'outdoor');
        expect(recommendation).toBeDefined();
        expect(typeof recommendation).toBe('string');
        expect(recommendation.length).toBeGreaterThan(0);
      });

      it('should return recommendation for indoor habit', async () => {
        const recommendation = await getHabitRecommendation('Philadelphia', 'yoga', 'indoor');
        expect(recommendation).toBeDefined();
        expect(typeof recommendation).toBe('string');
      });
    });

    describe('Tool Creation', () => {
      it('should create weather habits tools', () => {
        const tools = createWeatherHabitsTools();
        expect(tools.getWeatherHabitInsights).toBeDefined();
        expect(tools.getHabitRecommendation).toBeDefined();
      });
    });
  });

  describe('News-Mood Connection', () => {
    describe('analyzeNewsMoodImpact', () => {
      it('should analyze heavy news as negative', async () => {
        const headlines = [
          'War continues in conflict zone',
          'Earthquake devastates region',
          'Market crash affects millions',
        ];
        const analysis = await analyzeNewsMoodImpact(headlines);
        expect(analysis.overallSentiment).toBe('heavy');
        expect(analysis.recommendation).not.toBe('proceed');
      });

      it('should analyze positive news correctly', async () => {
        const headlines = [
          'Scientists achieve breakthrough in cancer research',
          'Local hero saves family from fire',
          'Economy shows recovery signs',
        ];
        const analysis = await analyzeNewsMoodImpact(headlines);
        expect(['positive', 'neutral']).toContain(analysis.overallSentiment);
      });

      it('should recommend skipping news when user is stressed', async () => {
        const headlines = ['Tragedy strikes downtown'];
        const analysis = await analyzeNewsMoodImpact(headlines, {
          currentMood: 'stressed',
          confidence: 0.8,
          trend: 'stable',
          energyLevel: 'low',
          stressIndicators: ['work deadline'],
          assessedAt: new Date(),
        });
        expect(['skip', 'summarize', 'offer_break']).toContain(analysis.recommendation);
      });
    });

    describe('filterPositiveNews', () => {
      it('should filter out negative headlines', () => {
        const headlines = [
          'War continues',
          'Scientists celebrate breakthrough discovery',
          'Disaster strikes',
          'Local team wins championship',
        ];
        const positive = filterPositiveNews(headlines);
        expect(positive).not.toContain('War continues');
        expect(positive).not.toContain('Disaster strikes');
      });

      it('should keep positive headlines', () => {
        const headlines = [
          'Breakthrough in medical research',
          'Victory for local team',
          'Innovation award winner announced',
        ];
        const positive = filterPositiveNews(headlines);
        expect(positive.length).toBeGreaterThan(0);
      });
    });

    describe('Tool Creation', () => {
      it('should create news mood tools', () => {
        const tools = createNewsMoodTools();
        expect(tools.analyzeNewsMoodImpact).toBeDefined();
        expect(tools.getPositiveNewsOnly).toBeDefined();
        expect(tools.shouldSkipNews).toBeDefined();
      });
    });
  });

  describe('Traffic-Productivity Connection', () => {
    describe('generateCommuteSuggestions', () => {
      it('should suggest podcast for long commute', () => {
        const suggestions = generateCommuteSuggestions(45, 'heavy', false);
        expect(suggestions.length).toBeGreaterThan(0);
        const hasPodcastOrAudiobook = suggestions.some(
          (s) => s.type === 'podcast' || s.type === 'audiobook'
        );
        expect(hasPodcastOrAudiobook).toBe(true);
      });

      it('should suggest pep talk before meeting', () => {
        const suggestions = generateCommuteSuggestions(20, 'moderate', true);
        expect(suggestions.length).toBeGreaterThan(0);
        const hasPepTalk = suggestions.some((s) => s.type === 'pep_talk');
        expect(hasPepTalk).toBe(true);
      });

      it('should return fewer suggestions for short commute', () => {
        const shortCommute = generateCommuteSuggestions(5, 'light', false);
        const longCommute = generateCommuteSuggestions(60, 'heavy', false);
        expect(shortCommute.length).toBeLessThanOrEqual(longCommute.length);
      });
    });

    describe('Tool Creation', () => {
      it('should create traffic productivity tools', () => {
        const tools = createTrafficProductivityTools();
        expect(tools.getCommuteSuggestions).toBeDefined();
        expect(tools.getTrafficProductivityInsights).toBeDefined();
        expect(tools.suggestPreMeetingPepTalk).toBeDefined();
      });
    });
  });
});
