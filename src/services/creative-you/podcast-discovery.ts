/**
 * 🎙️ Podcast Discovery Service
 *
 * Curated podcast recommendations for Creative You.
 * Based on conversations, mood, and learning goals.
 *
 * ✨ "MORE THAN HUMAN" FEATURES:
 * - Mood-based picks (not just topic-based)
 * - Episode summaries before committing
 * - Discussion prompts for each episode
 * - Learning tracks (curated series)
 */

import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface Podcast {
  id: string;
  title: string;
  author: string;
  description: string;
  imageUrl: string;
  feedUrl?: string;
  category: PodcastCategory;
  episodeCount: number;
  averageEpisodeDuration: number; // minutes
}

export interface PodcastEpisode {
  id: string;
  podcastId: string;
  podcastTitle: string;
  title: string;
  description: string;
  summary?: string; // AI-generated or curated summary
  duration: number; // seconds
  publishedAt: string;
  audioUrl?: string;
  imageUrl: string;
  topics: string[];
}

export type PodcastCategory =
  | 'self-improvement'
  | 'psychology'
  | 'science'
  | 'philosophy'
  | 'creativity'
  | 'business'
  | 'health'
  | 'mindfulness'
  | 'storytelling'
  | 'interview'
  | 'education'
  | 'technology';

export interface PodcastRecommendation {
  episode: PodcastEpisode;
  reason: string;
  discussionPrompts: string[];
  relevantTopic?: string;
  mood: 'learn' | 'chill' | 'inspire' | 'reflect';
  estimatedListenTime: string;
}

export interface LearningTrack {
  id: string;
  title: string;
  description: string;
  episodes: PodcastEpisode[];
  totalDuration: number; // minutes
  category: PodcastCategory;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}

// ============================================================================
// CURATED PODCASTS DATABASE
// ============================================================================

interface CuratedPodcast {
  id: string;
  title: string;
  author: string;
  description: string;
  imageUrl: string;
  category: PodcastCategory;
}

interface CuratedEpisode {
  id: string;
  podcastId: string;
  title: string;
  description: string;
  summary: string;
  durationMinutes: number;
  topics: string[];
  mood: 'learn' | 'chill' | 'inspire' | 'reflect';
  discussionPrompts: string[];
}

// Exported for use by intelligent curator
export const CURATED_PODCASTS: CuratedPodcast[] = [
  {
    id: 'huberman-lab',
    title: 'Huberman Lab',
    author: 'Dr. Andrew Huberman',
    description: 'Science-based tools for everyday life from a Stanford neuroscientist',
    imageUrl: 'https://example.com/huberman.jpg',
    category: 'science',
  },
  {
    id: 'tim-ferriss',
    title: 'The Tim Ferriss Show',
    author: 'Tim Ferriss',
    description: 'Deconstructing world-class performers to find tools you can use',
    imageUrl: 'https://example.com/ferriss.jpg',
    category: 'interview',
  },
  {
    id: 'on-purpose',
    title: 'On Purpose with Jay Shetty',
    author: 'Jay Shetty',
    description: 'Conversations about purpose, passion, and meaning',
    imageUrl: 'https://example.com/shetty.jpg',
    category: 'self-improvement',
  },
  {
    id: 'hidden-brain',
    title: 'Hidden Brain',
    author: 'Shankar Vedantam',
    description: 'Exploring the unconscious patterns that drive human behavior',
    imageUrl: 'https://example.com/hiddenbrain.jpg',
    category: 'psychology',
  },
  {
    id: 'ted-radio-hour',
    title: 'TED Radio Hour',
    author: 'NPR',
    description: 'A journey through fascinating ideas and stories',
    imageUrl: 'https://example.com/tedradio.jpg',
    category: 'education',
  },
  {
    id: 'philosophize-this',
    title: 'Philosophize This!',
    author: 'Stephen West',
    description: 'Making philosophy accessible and interesting',
    imageUrl: 'https://example.com/philosophize.jpg',
    category: 'philosophy',
  },
  {
    id: 'ten-percent-happier',
    title: 'Ten Percent Happier',
    author: 'Dan Harris',
    description: 'Meditation for skeptics and beginners',
    imageUrl: 'https://example.com/tenpercent.jpg',
    category: 'mindfulness',
  },
  {
    id: 'how-i-built-this',
    title: 'How I Built This',
    author: 'Guy Raz / NPR',
    description: 'Stories behind the movements and companies that shaped our world',
    imageUrl: 'https://example.com/hibt.jpg',
    category: 'business',
  },
];

// Exported for use by intelligent curator
export const CURATED_EPISODES: CuratedEpisode[] = [
  // Huberman Lab
  {
    id: 'huberman-sleep',
    podcastId: 'huberman-lab',
    title: 'Master Your Sleep & Be More Alert When Awake',
    description: 'Science-based tools to optimize your sleep and increase daytime alertness',
    summary:
      'Dr. Huberman explains the neuroscience of sleep, including how light exposure, temperature, and timing affect sleep quality. Key takeaways: get morning sunlight, avoid bright lights at night, and maintain consistent sleep times.',
    durationMinutes: 90,
    topics: ['sleep', 'health', 'neuroscience', 'productivity'],
    mood: 'learn',
    discussionPrompts: [
      'What time do you typically go to bed and wake up?',
      'How do you feel your sleep affects your mood?',
      'What one change could you make to improve your sleep?',
    ],
  },
  {
    id: 'huberman-focus',
    podcastId: 'huberman-lab',
    title: 'Focus Toolkit: Tools to Improve Your Focus & Concentration',
    description: 'Science-backed protocols for enhancing focus and concentration',
    summary:
      'A practical guide to improving focus using neuroscience. Covers visual focus, time-blocking, caffeine timing, and the role of dopamine in maintaining attention.',
    durationMinutes: 75,
    topics: ['focus', 'productivity', 'neuroscience', 'work'],
    mood: 'learn',
    discussionPrompts: [
      'When do you find it easiest to focus during the day?',
      'What typically distracts you most?',
      'How do you currently structure your work sessions?',
    ],
  },

  // Tim Ferriss
  {
    id: 'ferriss-habits',
    podcastId: 'tim-ferriss',
    title: 'The Most Common Habits of World-Class Performers',
    description: 'Patterns Tim has observed across hundreds of interviews',
    summary:
      'Tim shares the most common traits among high performers: morning routines, meditation practice, exercise habits, and approaches to failure. Most successful people share a willingness to experiment.',
    durationMinutes: 60,
    topics: ['habits', 'success', 'productivity', 'morning-routine'],
    mood: 'inspire',
    discussionPrompts: [
      'What does your morning routine look like?',
      'Which habit has had the biggest impact on your life?',
      'What habit would you like to build?',
    ],
  },

  // On Purpose
  {
    id: 'shetty-overthinking',
    podcastId: 'on-purpose',
    title: 'How to Stop Overthinking Everything',
    description: 'Practical strategies to quiet your anxious mind',
    summary:
      'Jay Shetty shares techniques for managing overthinking, including reframing negative thoughts, practicing present-moment awareness, and creating decision-making frameworks.',
    durationMinutes: 45,
    topics: ['anxiety', 'mental-health', 'mindfulness', 'overthinking'],
    mood: 'reflect',
    discussionPrompts: [
      'What situations tend to trigger your overthinking?',
      'How does overthinking affect your decision-making?',
      'What helps you quiet your mind?',
    ],
  },

  // Hidden Brain
  {
    id: 'hidden-brain-decisions',
    podcastId: 'hidden-brain',
    title: 'The Paradox of Choice',
    description: 'Why having more options can make us less happy',
    summary:
      'Explores research on decision-making and how too many choices can lead to paralysis and dissatisfaction. Introduces the concept of "satisficing" vs "maximizing" when making decisions.',
    durationMinutes: 50,
    topics: ['decisions', 'psychology', 'happiness', 'choice'],
    mood: 'learn',
    discussionPrompts: [
      'Do you consider yourself a "maximizer" or a "satisficer"?',
      'When has having too many options stressed you out?',
      'How do you make big decisions?',
    ],
  },

  // Philosophize This
  {
    id: 'philosophize-stoicism',
    podcastId: 'philosophize-this',
    title: 'Introduction to Stoicism',
    description: 'The ancient philosophy that helps us face modern challenges',
    summary:
      'An accessible introduction to Stoic philosophy, covering key concepts like the dichotomy of control, negative visualization, and viewing obstacles as opportunities.',
    durationMinutes: 35,
    topics: ['stoicism', 'philosophy', 'resilience', 'mindset'],
    mood: 'learn',
    discussionPrompts: [
      "What's something in your life you can't control but worry about?",
      'How do you typically respond to setbacks?',
      'What would a Stoic approach look like in your current challenges?',
    ],
  },

  // Ten Percent Happier
  {
    id: 'tenpercent-beginner',
    podcastId: 'ten-percent-happier',
    title: 'Meditation for Fidgety Skeptics',
    description: "A guide for people who think they can't meditate",
    summary:
      "Dan Harris addresses common objections to meditation and offers practical tips for beginners. Key insight: the goal isn't to stop thinking, it's to notice when you're thinking.",
    durationMinutes: 40,
    topics: ['meditation', 'mindfulness', 'beginners', 'stress'],
    mood: 'chill',
    discussionPrompts: [
      'Have you tried meditation before? What was your experience?',
      "What's your biggest obstacle to starting a meditation practice?",
      'How do you currently manage stress?',
    ],
  },

  // How I Built This
  {
    id: 'hibt-airbnb',
    podcastId: 'how-i-built-this',
    title: 'Airbnb: Brian Chesky',
    description: 'How a design school project became a $100B company',
    summary:
      "The story of Airbnb's founding, from selling cereal boxes to survive to building one of the most valuable companies in the world. Key theme: persistence through rejection.",
    durationMinutes: 55,
    topics: ['entrepreneurship', 'startup', 'persistence', 'creativity'],
    mood: 'inspire',
    discussionPrompts: [
      "What's a creative solution you've found to a problem?",
      'How do you handle rejection?',
      "What would you build if you knew you couldn't fail?",
    ],
  },
  {
    id: 'hibt-spanx',
    podcastId: 'how-i-built-this',
    title: 'Spanx: Sara Blakely',
    description: 'How $5,000 and a big idea became a billion-dollar business',
    summary:
      'Sara Blakely shares her journey from selling fax machines door-to-door to becoming the youngest self-made female billionaire. Key themes: embracing failure, trusting your gut.',
    durationMinutes: 50,
    topics: ['entrepreneurship', 'startup', 'failure', 'women-in-business'],
    mood: 'inspire',
    discussionPrompts: [
      'When has failure led to something better?',
      'Have you ever had an idea everyone said was crazy?',
      'What would you do if you embraced failure as a teacher?',
    ],
  },

  // More Huberman Lab
  {
    id: 'huberman-habits',
    podcastId: 'huberman-lab',
    title: 'The Science of Making & Breaking Habits',
    description: 'Neuroscience-based approach to building lasting habits',
    summary:
      'Dr. Huberman explains the neuroscience behind habit formation, including the role of dopamine, the importance of context, and the "linchpin habit" concept.',
    durationMinutes: 85,
    topics: ['habits', 'neuroscience', 'dopamine', 'behavior-change'],
    mood: 'learn',
    discussionPrompts: [
      'What habit are you currently trying to build or break?',
      'How does reward timing affect your motivation?',
      'What context triggers your unwanted habits?',
    ],
  },
  {
    id: 'huberman-dopamine',
    podcastId: 'huberman-lab',
    title: 'Controlling Your Dopamine For Motivation, Focus & Satisfaction',
    description: 'How dopamine really works and how to leverage it',
    summary:
      'A deep dive into dopamine and how it affects motivation, pleasure, and focus. Covers dopamine peaks, baselines, and how to avoid the dopamine deficit trap.',
    durationMinutes: 120,
    topics: ['dopamine', 'motivation', 'neuroscience', 'focus'],
    mood: 'learn',
    discussionPrompts: [
      'What gives you the biggest dopamine hits?',
      'Do you ever feel like your baseline motivation is low?',
      'How do you balance pleasure-seeking with discipline?',
    ],
  },
  {
    id: 'huberman-cold',
    podcastId: 'huberman-lab',
    title: 'Using Deliberate Cold Exposure for Health and Performance',
    description: 'The science behind cold showers, ice baths, and mental resilience',
    summary:
      'Explores the benefits of cold exposure including increased dopamine, improved mood, and enhanced resilience. Includes practical protocols for starting.',
    durationMinutes: 75,
    topics: ['cold-exposure', 'health', 'resilience', 'dopamine'],
    mood: 'learn',
    discussionPrompts: [
      'Have you ever tried cold exposure? What was it like?',
      'What mental barriers do you face with discomfort?',
      'How do you build resilience in other areas of life?',
    ],
  },

  // More On Purpose
  {
    id: 'shetty-attachment',
    podcastId: 'on-purpose',
    title: 'Understanding Your Attachment Style',
    description: 'How your early relationships shape your adult connections',
    summary:
      'Jay Shetty explains the four attachment styles and how understanding yours can transform your relationships. Includes practical tips for secure attachment.',
    durationMinutes: 50,
    topics: ['attachment', 'relationships', 'psychology', 'healing'],
    mood: 'reflect',
    discussionPrompts: [
      'Which attachment style do you most identify with?',
      'How did your childhood relationships shape you?',
      'What patterns do you notice in your relationships?',
    ],
  },
  {
    id: 'shetty-boundaries',
    podcastId: 'on-purpose',
    title: 'How to Set Boundaries Without Feeling Guilty',
    description: 'A guide to healthy boundaries in relationships and work',
    summary:
      'Practical strategies for setting and maintaining boundaries while managing guilt. Covers the difference between being kind and being a people-pleaser.',
    durationMinutes: 40,
    topics: ['boundaries', 'self-care', 'relationships', 'guilt'],
    mood: 'reflect',
    discussionPrompts: [
      'What boundary do you struggle to maintain?',
      'How do you feel when you say no to someone?',
      'What would change if you had stronger boundaries?',
    ],
  },

  // More Philosophy
  {
    id: 'philosophize-existentialism',
    podcastId: 'philosophize-this',
    title: 'Introduction to Existentialism',
    description: 'Creating meaning in a meaningless world',
    summary:
      'Explores existentialist thinkers like Sartre, Camus, and Kierkegaard. Covers concepts like radical freedom, authenticity, and creating meaning through choices.',
    durationMinutes: 40,
    topics: ['existentialism', 'philosophy', 'meaning', 'freedom'],
    mood: 'reflect',
    discussionPrompts: [
      'Does the idea of radical freedom excite or terrify you?',
      'How do you create meaning in your life?',
      'What does authenticity mean to you?',
    ],
  },
  {
    id: 'philosophize-nietzsche',
    podcastId: 'philosophize-this',
    title: 'Nietzsche: Beyond Good and Evil',
    description: 'Questioning morality and embracing life-affirmation',
    summary:
      "An exploration of Nietzsche's philosophy including the will to power, eternal recurrence, and the creation of new values. Key theme: becoming who you are.",
    durationMinutes: 45,
    topics: ['nietzsche', 'philosophy', 'morality', 'self-creation'],
    mood: 'reflect',
    discussionPrompts: [
      'Would you live your life exactly the same way again?',
      'What values have you adopted vs. created?',
      'What does "becoming who you are" mean to you?',
    ],
  },

  // Hidden Brain
  {
    id: 'hidden-brain-happiness',
    podcastId: 'hidden-brain',
    title: 'The Science of Happiness',
    description: 'Why our intuitions about happiness are often wrong',
    summary:
      'Research on what actually makes us happy vs. what we think will make us happy. Covers hedonic adaptation, the importance of experiences over things, and social connection.',
    durationMinutes: 45,
    topics: ['happiness', 'psychology', 'research', 'wellbeing'],
    mood: 'learn',
    discussionPrompts: [
      'What do you think would make you happier?',
      'Have you experienced hedonic adaptation after a big purchase?',
      'What brings you lasting satisfaction?',
    ],
  },
  {
    id: 'hidden-brain-relationships',
    podcastId: 'hidden-brain',
    title: 'The Lonely American Man',
    description: 'Why men struggle with friendship and what to do about it',
    summary:
      'Explores the friendship crisis among men and its impact on mental health. Discusses the barriers to male intimacy and strategies for building deeper connections.',
    durationMinutes: 50,
    topics: ['friendship', 'men', 'loneliness', 'mental-health'],
    mood: 'reflect',
    discussionPrompts: [
      'How easy is it for you to make close friends?',
      'What prevents deeper friendships in your life?',
      'How do you nurture your important relationships?',
    ],
  },

  // Wellness / Meditation
  {
    id: 'tenpercent-anxiety',
    podcastId: 'ten-percent-happier',
    title: 'Working with Anxiety',
    description: 'Mindfulness approaches to managing anxious thoughts',
    summary:
      'Practical meditation techniques for anxiety, including noting thoughts, body scans, and the RAIN technique (Recognize, Allow, Investigate, Non-identify).',
    durationMinutes: 35,
    topics: ['anxiety', 'meditation', 'mindfulness', 'mental-health'],
    mood: 'chill',
    discussionPrompts: [
      'Where do you feel anxiety in your body?',
      'What stories does your anxiety tell you?',
      'What helps you most when feeling anxious?',
    ],
  },
  {
    id: 'tenpercent-compassion',
    podcastId: 'ten-percent-happier',
    title: "Self-Compassion: The Skill That's Missing",
    description: 'Why being kind to yourself is the key to growth',
    summary:
      "The science of self-compassion and why it's more effective than self-criticism for motivation and growth. Includes practical self-compassion exercises.",
    durationMinutes: 40,
    topics: ['self-compassion', 'meditation', 'mental-health', 'growth'],
    mood: 'reflect',
    discussionPrompts: [
      'How do you talk to yourself when you make a mistake?',
      'What would you say to a friend in your situation?',
      'What does self-compassion look like for you?',
    ],
  },
];

// ============================================================================
// PODCAST SERVICE
// ============================================================================

/**
 * Get podcast recommendations based on user context
 */
export function getPodcastRecommendations(
  userId: string,
  options: {
    mood?: 'learn' | 'chill' | 'inspire' | 'reflect';
    topic?: string;
    maxResults?: number;
    recentTopics?: string[];
    maxDuration?: number; // minutes
  } = {}
): PodcastRecommendation[] {
  const { mood, topic, maxResults = 5, recentTopics = [], maxDuration } = options;

  let episodes = [...CURATED_EPISODES];

  // Filter by mood if specified
  if (mood) {
    episodes = episodes.filter((e) => e.mood === mood);
  }

  // Filter by topic if specified
  if (topic) {
    const topicLower = topic.toLowerCase();
    episodes = episodes.filter(
      (e) =>
        e.topics.some((t) => t.toLowerCase().includes(topicLower)) ||
        e.title.toLowerCase().includes(topicLower)
    );
  }

  // Filter by duration if specified
  if (maxDuration) {
    episodes = episodes.filter((e) => e.durationMinutes <= maxDuration);
  }

  // Prioritize episodes related to recent conversation topics
  if (recentTopics.length > 0) {
    episodes.sort((a, b) => {
      const aRelevance = recentTopics.filter((t) =>
        a.topics.some((at) => at.toLowerCase().includes(t.toLowerCase()))
      ).length;
      const bRelevance = recentTopics.filter((t) =>
        b.topics.some((bt) => bt.toLowerCase().includes(t.toLowerCase()))
      ).length;
      return bRelevance - aRelevance;
    });
  }

  // Shuffle top results for variety
  const topEpisodes = episodes.slice(0, Math.min(episodes.length, maxResults * 2));
  for (let i = topEpisodes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [topEpisodes[i], topEpisodes[j]] = [topEpisodes[j], topEpisodes[i]];
  }

  // Take final results
  const selected = topEpisodes.slice(0, maxResults);

  // Convert to recommendations
  return selected.map((episode) => {
    const podcast = CURATED_PODCASTS.find((p) => p.id === episode.podcastId);

    return {
      episode: curatedToEpisode(episode, podcast),
      reason: getRecommendationReason(episode, recentTopics),
      discussionPrompts: episode.discussionPrompts,
      relevantTopic: recentTopics.find((t) =>
        episode.topics.some((et) => et.toLowerCase().includes(t.toLowerCase()))
      ),
      mood: episode.mood,
      estimatedListenTime: formatListenTime(episode.durationMinutes),
    };
  });
}

/**
 * Get podcast by ID
 */
export function getPodcastById(podcastId: string): Podcast | null {
  const curated = CURATED_PODCASTS.find((p) => p.id === podcastId);
  if (!curated) return null;

  const episodes = CURATED_EPISODES.filter((e) => e.podcastId === podcastId);
  const avgDuration =
    episodes.length > 0
      ? Math.round(episodes.reduce((sum, e) => sum + e.durationMinutes, 0) / episodes.length)
      : 45;

  return {
    id: curated.id,
    title: curated.title,
    author: curated.author,
    description: curated.description,
    imageUrl: curated.imageUrl,
    category: curated.category,
    episodeCount: episodes.length,
    averageEpisodeDuration: avgDuration,
  };
}

/**
 * Get episode by ID
 */
export function getEpisodeById(episodeId: string): PodcastEpisode | null {
  const curated = CURATED_EPISODES.find((e) => e.id === episodeId);
  if (!curated) return null;

  const podcast = CURATED_PODCASTS.find((p) => p.id === curated.podcastId);
  return curatedToEpisode(curated, podcast);
}

/**
 * Get daily podcast pick
 */
export function getDailyPodcastPick(
  userId: string,
  userPreferences?: {
    favoriteTopics?: string[];
    preferredDuration?: number;
    mood?: 'learn' | 'chill' | 'inspire' | 'reflect';
  }
): PodcastRecommendation | null {
  const dayOfWeek = new Date().getDay();

  // Different moods for different days
  const dailyMoods: Record<number, 'learn' | 'chill' | 'inspire' | 'reflect'> = {
    0: 'reflect', // Sunday
    1: 'learn', // Monday
    2: 'inspire', // Tuesday
    3: 'learn', // Wednesday
    4: 'inspire', // Thursday
    5: 'chill', // Friday
    6: 'chill', // Saturday
  };

  const mood = userPreferences?.mood || dailyMoods[dayOfWeek];

  const recommendations = getPodcastRecommendations(userId, {
    mood,
    recentTopics: userPreferences?.favoriteTopics,
    maxDuration: userPreferences?.preferredDuration,
    maxResults: 1,
  });

  return recommendations[0] || null;
}

/**
 * Get podcasts by category
 */
export function getPodcastsByCategory(category: PodcastCategory): Podcast[] {
  return CURATED_PODCASTS.filter((p) => p.category === category).map((curated) => {
    const episodes = CURATED_EPISODES.filter((e) => e.podcastId === curated.id);
    const avgDuration =
      episodes.length > 0
        ? Math.round(episodes.reduce((sum, e) => sum + e.durationMinutes, 0) / episodes.length)
        : 45;

    return {
      id: curated.id,
      title: curated.title,
      author: curated.author,
      description: curated.description,
      imageUrl: curated.imageUrl,
      category: curated.category,
      episodeCount: episodes.length,
      averageEpisodeDuration: avgDuration,
    };
  });
}

// ============================================================================
// LEARNING TRACKS
// ============================================================================

/**
 * Get curated learning tracks
 */
export function getLearningTracks(): LearningTrack[] {
  return [
    {
      id: 'productivity-mastery',
      title: 'Getting Things Done (For Real)',
      description:
        "Not another productivity hack list. This is about understanding your brain—why focus fades, how sleep changes everything, and what actually sticks.",
      episodes: [
        CURATED_EPISODES.find((e) => e.id === 'huberman-sleep'),
        CURATED_EPISODES.find((e) => e.id === 'huberman-focus'),
        CURATED_EPISODES.find((e) => e.id === 'ferriss-habits'),
      ]
        .filter((e): e is CuratedEpisode => e !== undefined)
        .map((e) =>
          curatedToEpisode(
            e,
            CURATED_PODCASTS.find((p) => p.id === e.podcastId)
          )
        ),
      totalDuration: 225,
      category: 'self-improvement',
      difficulty: 'intermediate',
    },
    {
      id: 'mindfulness-journey',
      title: 'Starting to Slow Down',
      description:
        "If meditation feels intimidating or you've tried and it didn't stick—start here. Gentle, practical, no judgment.",
      episodes: [
        CURATED_EPISODES.find((e) => e.id === 'tenpercent-beginner'),
        CURATED_EPISODES.find((e) => e.id === 'shetty-overthinking'),
        CURATED_EPISODES.find((e) => e.id === 'philosophize-stoicism'),
      ]
        .filter((e): e is CuratedEpisode => e !== undefined)
        .map((e) =>
          curatedToEpisode(
            e,
            CURATED_PODCASTS.find((p) => p.id === e.podcastId)
          )
        ),
      totalDuration: 120,
      category: 'mindfulness',
      difficulty: 'beginner',
    },
    {
      id: 'understanding-yourself',
      title: 'Why You Do What You Do',
      description:
        "Ever wonder why you make certain choices? Why some patterns keep repeating? These episodes pull back the curtain.",
      episodes: [
        CURATED_EPISODES.find((e) => e.id === 'hidden-brain-decisions'),
        CURATED_EPISODES.find((e) => e.id === 'shetty-overthinking'),
      ]
        .filter((e): e is CuratedEpisode => e !== undefined)
        .map((e) =>
          curatedToEpisode(
            e,
            CURATED_PODCASTS.find((p) => p.id === e.podcastId)
          )
        ),
      totalDuration: 95,
      category: 'psychology',
      difficulty: 'beginner',
    },
    {
      id: 'relationships-connection',
      title: 'Love, Boundaries & Connection',
      description:
        "Why we attach the way we do, how to say no without guilt, and what loneliness teaches us. For anyone working on their relationships—including the one with themselves.",
      episodes: [
        CURATED_EPISODES.find((e) => e.id === 'shetty-attachment'),
        CURATED_EPISODES.find((e) => e.id === 'shetty-boundaries'),
        CURATED_EPISODES.find((e) => e.id === 'hidden-brain-relationships'),
      ]
        .filter((e): e is CuratedEpisode => e !== undefined)
        .map((e) =>
          curatedToEpisode(
            e,
            CURATED_PODCASTS.find((p) => p.id === e.podcastId)
          )
        ),
      totalDuration: 140,
      category: 'psychology',
      difficulty: 'intermediate',
    },
    {
      id: 'building-something',
      title: 'Building Something From Nothing',
      description:
        "Stories of people who started with an idea and made it real. Not hustle porn—just honest accounts of what it actually takes.",
      episodes: [
        CURATED_EPISODES.find((e) => e.id === 'hibt-airbnb'),
        CURATED_EPISODES.find((e) => e.id === 'hibt-spanx'),
      ]
        .filter((e): e is CuratedEpisode => e !== undefined)
        .map((e) =>
          curatedToEpisode(
            e,
            CURATED_PODCASTS.find((p) => p.id === e.podcastId)
          )
        ),
      totalDuration: 105,
      category: 'business',
      difficulty: 'beginner',
    },
    {
      id: 'big-questions',
      title: 'The Big Questions',
      description:
        "Meaning, freedom, mortality. The stuff that keeps you up at night. No answers here—just better questions.",
      episodes: [
        CURATED_EPISODES.find((e) => e.id === 'philosophize-existentialism'),
        CURATED_EPISODES.find((e) => e.id === 'philosophize-nietzsche'),
      ]
        .filter((e): e is CuratedEpisode => e !== undefined)
        .map((e) =>
          curatedToEpisode(
            e,
            CURATED_PODCASTS.find((p) => p.id === e.podcastId)
          )
        ),
      totalDuration: 85,
      category: 'philosophy',
      difficulty: 'intermediate',
    },
    {
      id: 'anxiety-toolkit',
      title: 'When Anxiety Hits',
      description:
        "Not about fixing yourself. About understanding what anxiety is trying to tell you, and finding some gentler ways through.",
      episodes: [
        CURATED_EPISODES.find((e) => e.id === 'tenpercent-anxiety'),
        CURATED_EPISODES.find((e) => e.id === 'tenpercent-compassion'),
        CURATED_EPISODES.find((e) => e.id === 'shetty-overthinking'),
      ]
        .filter((e): e is CuratedEpisode => e !== undefined)
        .map((e) =>
          curatedToEpisode(
            e,
            CURATED_PODCASTS.find((p) => p.id === e.podcastId)
          )
        ),
      totalDuration: 125,
      category: 'mindfulness',
      difficulty: 'beginner',
    },
    {
      id: 'dopamine-motivation',
      title: 'Understanding Your Brain\'s Reward System',
      description:
        "Why you can't stop scrolling, why cold showers work, and how dopamine actually controls motivation. Brain science that you can use.",
      episodes: [
        CURATED_EPISODES.find((e) => e.id === 'huberman-dopamine'),
        CURATED_EPISODES.find((e) => e.id === 'huberman-habits'),
        CURATED_EPISODES.find((e) => e.id === 'huberman-cold'),
      ]
        .filter((e): e is CuratedEpisode => e !== undefined)
        .map((e) =>
          curatedToEpisode(
            e,
            CURATED_PODCASTS.find((p) => p.id === e.podcastId)
          )
        ),
      totalDuration: 280,
      category: 'science',
      difficulty: 'advanced',
    },
  ];
}

/**
 * Get learning track by ID
 */
export function getLearningTrackById(trackId: string): LearningTrack | null {
  const tracks = getLearningTracks();
  return tracks.find((t) => t.id === trackId) || null;
}

// ============================================================================
// HELPERS
// ============================================================================

function curatedToEpisode(curated: CuratedEpisode, podcast?: CuratedPodcast): PodcastEpisode {
  return {
    id: curated.id,
    podcastId: curated.podcastId,
    podcastTitle: podcast?.title || '',
    title: curated.title,
    description: curated.description,
    summary: curated.summary,
    duration: curated.durationMinutes * 60,
    publishedAt: '', // Would come from API
    imageUrl: podcast?.imageUrl || '',
    topics: curated.topics,
  };
}

function formatListenTime(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/**
 * Generate podcast recommendation reasons that feel intentional
 *
 * BRAND PRINCIPLES:
 * - Never generic ("Good podcast", "Check it out")
 * - Always feels like Ferni picked this FOR you
 * - Warm but not performative
 */
function getRecommendationReason(episode: CuratedEpisode, recentTopics: string[]): string {
  // Find matching topic - use warm, friend-like language
  const matchingTopic = recentTopics.find((t) =>
    episode.topics.some((et) => et.toLowerCase().includes(t.toLowerCase()))
  );

  if (matchingTopic) {
    const topicPhrases = [
      `This came to mind when you mentioned ${matchingTopic}.`,
      `Remember when we talked about ${matchingTopic}? Give this a listen.`,
      `Something about ${matchingTopic} that might land with you.`,
      `I keep thinking about what you said about ${matchingTopic}. This connects.`,
    ];
    return topicPhrases[Math.floor(Math.random() * topicPhrases.length)];
  }

  // Mood-based reasons (intentional, not generic)
  const moodReasons: Record<string, string[]> = {
    learn: [
      'This one made me pause and think.',
      'Might shift how you see things.',
      'Worth your attention.',
    ],
    chill: [
      'For when you need to decompress.',
      'Gentle on the brain.',
      'Easy listen, but stays with you.',
    ],
    inspire: [
      'This one might spark something.',
      'Needed this today. Maybe you do too.',
      "For when you need a lift.",
    ],
    reflect: [
      'One to sit with.',
      'Take your time with this one.',
      'No easy answers here. Just good questions.',
    ],
  };

  const reasons = moodReasons[episode.mood];
  return reasons[Math.floor(Math.random() * reasons.length)];
}
