/**
 * Taste Match content and scoring: the question bank, and the pure functions
 * that score a finished session. No state. Moved out of multiplayer-games.ts.
 *
 * @module services/social/taste-match-questions
 */
import type {
  TasteMatchInsight,
  TasteMatchQuestion,
  TasteMatchSession,
} from './multiplayer-games.js';

// ============================================================================
// TASTE MATCH QUESTIONS DATABASE
// ============================================================================

export const TASTE_MATCH_QUESTIONS: TasteMatchQuestion[] = [
  // This or That
  {
    id: 'tot-1',
    type: 'this-or-that',
    prompt: 'Which would you rather have on repeat?',
    songA: { name: 'Bohemian Rhapsody', artist: 'Queen' },
    songB: { name: 'Stairway to Heaven', artist: 'Led Zeppelin' },
  },
  {
    id: 'tot-2',
    type: 'this-or-that',
    prompt: 'Road trip anthem?',
    songA: { name: "Don't Stop Believin'", artist: 'Journey' },
    songB: { name: 'Sweet Home Alabama', artist: 'Lynyrd Skynyrd' },
  },
  {
    id: 'tot-3',
    type: 'this-or-that',
    prompt: 'Getting ready to go out?',
    songA: { name: 'Uptown Funk', artist: 'Bruno Mars' },
    songB: { name: 'Single Ladies', artist: 'Beyoncé' },
  },
  {
    id: 'tot-4',
    type: 'this-or-that',
    prompt: 'Rainy day vibes?',
    songA: { name: 'The Sound of Silence', artist: 'Simon & Garfunkel' },
    songB: { name: 'Mad World', artist: 'Gary Jules' },
  },
  {
    id: 'tot-5',
    type: 'this-or-that',
    prompt: 'Workout motivation?',
    songA: { name: 'Eye of the Tiger', artist: 'Survivor' },
    songB: { name: 'Stronger', artist: 'Kanye West' },
  },

  // Rate Song (1-5)
  {
    id: 'rate-1',
    type: 'rate-song',
    prompt: 'How much do you love this classic?',
    songA: { name: 'Hotel California', artist: 'Eagles' },
    options: ['1', '2', '3', '4', '5'],
  },
  {
    id: 'rate-2',
    type: 'rate-song',
    prompt: 'Rate this pop anthem',
    songA: { name: 'Shape of You', artist: 'Ed Sheeran' },
    options: ['1', '2', '3', '4', '5'],
  },
  {
    id: 'rate-3',
    type: 'rate-song',
    prompt: 'How do you feel about this hit?',
    songA: { name: 'Smells Like Teen Spirit', artist: 'Nirvana' },
    options: ['1', '2', '3', '4', '5'],
  },

  // Guess Decade
  {
    id: 'decade-1',
    type: 'guess-decade',
    prompt: 'What decade is "Billie Jean" from?',
    options: ['1970s', '1980s', '1990s', '2000s'],
    correctAnswer: '1980s',
  },
  {
    id: 'decade-2',
    type: 'guess-decade',
    prompt: 'What decade is "Wonderwall" from?',
    options: ['1980s', '1990s', '2000s', '2010s'],
    correctAnswer: '1990s',
  },
];

// ============================================================================
// COMPATIBILITY CALCULATION
// ============================================================================

export function calculateCompatibility(session: TasteMatchSession): number {
  if (session.participants.length < 2) return 0;

  const p1 = session.participants[0];
  const p2 = session.participants[1];

  let matches = 0;
  let total = 0;

  for (const question of session.questions) {
    const a1 = p1.answers.find((a) => a.questionId === question.id);
    const a2 = p2.answers.find((a) => a.questionId === question.id);

    if (a1 && a2) {
      total++;
      if (question.type === 'this-or-that') {
        if (a1.answer === a2.answer) matches++;
      } else if (question.type === 'rate-song') {
        const r1 = parseInt(a1.answer);
        const r2 = parseInt(a2.answer);
        const diff = Math.abs(r1 - r2);
        matches += 1 - diff / 4; // 0-1 based on how close
      } else if (question.type === 'guess-decade') {
        if (a1.answer === a2.answer) matches++;
      }
    }
  }

  return total > 0 ? Math.round((matches / total) * 100) : 50;
}

export function generateTasteInsights(session: TasteMatchSession): TasteMatchInsight[] {
  const insights: TasteMatchInsight[] = [];

  if (session.participants.length < 2) return insights;

  const p1 = session.participants[0];
  const p2 = session.participants[1];
  const score = session.compatibilityScore || 50;

  // Overall compatibility insight
  if (score >= 80) {
    insights.push({
      type: 'match',
      title: 'Musical Soulmates! 🎵',
      description: `You and ${p2.displayName} have incredibly similar taste!`,
      emoji: '💕',
    });
  } else if (score >= 60) {
    insights.push({
      type: 'match',
      title: 'Great Taste Match',
      description: `You two would make a solid road trip playlist together.`,
      emoji: '🚗',
    });
  } else if (score >= 40) {
    insights.push({
      type: 'difference',
      title: 'Interesting Differences',
      description: `You might introduce each other to something new!`,
      emoji: '🎭',
    });
  } else {
    insights.push({
      type: 'surprise',
      title: 'Opposites Attract?',
      description: `Very different tastes - but that makes sharing music more fun!`,
      emoji: '🎲',
    });
  }

  // Find specific matches/differences
  for (const question of session.questions) {
    const a1 = p1.answers.find((a) => a.questionId === question.id);
    const a2 = p2.answers.find((a) => a.questionId === question.id);

    if (a1 && a2 && question.type === 'this-or-that') {
      if (a1.answer === a2.answer) {
        const song = a1.answer === 'A' ? question.songA : question.songB;
        if (song) {
          insights.push({
            type: 'match',
            title: `Both chose "${song.name}"`,
            description: `You both have great taste!`,
            emoji: '✨',
          });
          break; // Only add one specific match
        }
      }
    }
  }

  return insights.slice(0, 4); // Max 4 insights
}
