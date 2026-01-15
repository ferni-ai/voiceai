/**
 * LLM-Powered Synthetic Conversation Generator
 *
 * Uses Gemini to generate diverse, realistic conversations that stress-test
 * the memory pipeline, corrections, handoffs, and emotional intelligence.
 *
 * Run: npx tsx src/tests/e2e/synthetic-conversations/conversation-generator.ts
 *
 * @module tests/e2e/synthetic-conversations/conversation-generator
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config();

// ============================================================================
// TYPES
// ============================================================================

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  metadata?: {
    emotion?: string;
    intent?: string;
    shouldTrigger?: string[];
  };
}

export interface SyntheticConversation {
  id: string;
  scenario: string;
  category: ConversationCategory;
  difficulty: 'easy' | 'medium' | 'hard' | 'edge-case';
  turns: ConversationTurn[];
  expectedExtractions: ExpectedExtraction[];
  validationChecks: ValidationCheck[];
  generatedAt: string;
}

export interface ExpectedExtraction {
  type: 'user_name' | 'person_name' | 'location' | 'emotion' | 'correction' | 'relationship';
  value: string;
  turnIndex: number;
}

export interface ValidationCheck {
  check: string;
  expectation: 'should_pass' | 'should_fail' | 'should_detect';
  description: string;
}

export type ConversationCategory =
  | 'name_capture'
  | 'correction_handling'
  | 'emotional_support'
  | 'handoff_trigger'
  | 'relationship_building'
  | 'stress_test'
  | 'edge_cases'
  | 'multi_topic'
  // Better Than Human capabilities
  | 'perfect_memory'
  | 'pattern_recognition'
  | 'commitment_tracking'
  | 'relationship_network'
  | 'emotional_anticipation';

// ============================================================================
// SCENARIO PROMPTS
// ============================================================================

const SCENARIO_PROMPTS: Record<ConversationCategory, string> = {
  name_capture: `Generate a realistic conversation where the user naturally reveals their name.
Include variations like:
- "My name is X"
- "I'm X"
- "Call me X"
- "Everyone calls me X"
Also include mentions of other people (family, friends, coworkers) with their names.
The assistant should acknowledge and use the name naturally.`,

  correction_handling: `Generate a conversation where the user corrects the assistant's misunderstanding.
Include scenarios like:
- Correcting a name ("No, I said Sarah, not Sara")
- Correcting a fact ("Actually, I meant next Tuesday")
- Clarifying intent ("Let me clarify, I was talking about...")
- Contradicting assumptions ("I didn't say I was stressed, I said I was stressed about the deadline specifically")
The correction should feel natural, not forced.`,

  emotional_support: `Generate an emotionally charged conversation where the user shares something difficult.
Include scenarios like:
- Anxiety about work/life
- Grief or loss
- Relationship struggles
- Self-doubt
- Overwhelm
The assistant should respond with empathy, validate feelings, and show emotional intelligence.
Include moments of silence/pauses indicated by "..." in user speech.`,

  handoff_trigger: `Generate a conversation that naturally leads to needing a different team member.
Include scenarios like:
- User mentions needing help with habits (→ Maya)
- User wants investment advice (→ Peter)
- User needs help with communication/email (→ Alex)
- User asks deep philosophical questions (→ Nayan)
The handoff should feel organic, not forced.`,

  relationship_building: `Generate a conversation that deepens the relationship between user and Ferni.
Include:
- Callbacks to previous conversations (imagined)
- Inside jokes or shared references
- Vulnerability from both sides
- Moments of genuine connection
- The assistant showing they remember small details`,

  stress_test: `Generate a challenging conversation that tests multiple systems:
- Rapid topic changes
- Emotional volatility
- Multiple names mentioned
- Corrections mid-sentence
- Interrupted thoughts
- Sarcasm and humor
- Ambiguous statements`,

  edge_cases: `Generate edge case conversations:
- Very short responses ("yes", "no", "okay")
- Non-sequiturs
- Speech recognition likely errors (homophones: "their/there", "hear/here")
- Names that could be common words ("Hope", "Grace", "Will")
- Unclear referents ("he said she said they would...")
- Code-switching or non-English words`,

  multi_topic: `Generate a conversation that naturally covers multiple topics:
- Starts with one topic
- Branches to related topics
- Returns to original topic
- Includes personal details scattered throughout
- Has emotional undertones that evolve`,

  // ============================================================================
  // BETTER THAN HUMAN CAPABILITIES
  // ============================================================================

  perfect_memory: `Generate a conversation testing PERFECT MEMORY - Ferni never forgets.
Include:
- User mentions multiple specific details: dates, names, numbers, preferences
- Details scattered across multiple turns (not clumped together)
- Obscure details that humans would forget (pet's birthday, favorite coffee order, coworker names)
- User mentions things that happened "6 months ago" or "last year"
- Complex relationships: "my boss's wife's sister"
- The assistant should demonstrate recalling these details naturally
Example details to include:
- Anniversary dates, kid birthdays
- Allergies, dietary preferences
- Coworker drama and office politics
- Financial goals and amounts
- Medical appointments and concerns`,

  pattern_recognition: `Generate a conversation testing PATTERN RECOGNITION - seeing what humans miss.
Include:
- User describes a recurring problem without realizing the pattern
- User mentions the same issue in different contexts
- Emotional patterns (user always stressed on Mondays, anxious before family events)
- Behavioral patterns (procrastination, avoidance, people-pleasing)
- Relationship patterns (always attracts same type of partner, same conflict with different people)
- The assistant should gently surface these patterns with "I've noticed..."
Examples:
- "Every time you talk about your mom, you mention feeling drained"
- "You've mentioned feeling overwhelmed before big presentations three times now"
- "I notice you tend to minimize your achievements"`,

  commitment_tracking: `Generate a conversation testing COMMITMENT TRACKING - promises never forgotten.
Include:
- User makes commitments: "I'll do X by Friday", "I promise to call my mom"
- Smaller micro-commitments that humans forget
- Commitments made to themselves and to others
- Time-based promises
- The assistant should acknowledge and track these commitments
Examples:
- "I'll start exercising next week"
- "I need to apologize to Sarah"
- "I promised my kids I'd take them to the park"
- "I should really call my dentist"
- "I told my boss I'd have the report done by Thursday"`,

  relationship_network: `Generate a conversation testing RELATIONSHIP NETWORK tracking.
Include MANY relationships with specific details:
- Family: spouse name, children names and ages, parents, siblings, in-laws
- Work: boss name, coworkers (2-3), mentor, direct reports
- Friends: best friend, friend groups, old friends
- Others: therapist, doctor, neighbors, kids' teachers
Each person should have at least 1-2 specific details:
- "My sister Maria, she lives in Denver with her two cats"
- "Tom from accounting, the one who's always late"
- "Dr. Patel, my cardiologist, not my therapist Dr. Wilson"
Include complex references later: "He said..." (who?), "They want to..." (who?)`,

  emotional_anticipation: `Generate a conversation testing EMOTIONAL ANTICIPATION - knowing before they say it.
Include:
- User building up to something emotional (assistant should sense it)
- Hesitation patterns ("well...", "I guess...", "it's just that...")
- Deflection patterns (changing subject, making jokes when uncomfortable)
- Subtle distress signals (short responses, passive voice)
- The assistant should show anticipatory empathy BEFORE the user fully expresses
Examples of user building up:
- "So... remember my mom? Well... she..."
- "I'm fine. I mean. Work is work, you know?"
- "Ha ha, anyway, totally unrelated, but have you ever felt like..."
- User talks about surface topic but tone suggests deeper issue`,
};

// ============================================================================
// GENERATOR CLASS
// ============================================================================

export class ConversationGenerator {
  private genAI: GoogleGenerativeAI;
  private model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.GOOGLE_API_KEY;
    if (!key) {
      throw new Error('GOOGLE_API_KEY required for conversation generation');
    }
    this.genAI = new GoogleGenerativeAI(key);
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp',
      generationConfig: {
        temperature: 0.9, // Higher for more creative conversations
        topP: 0.95,
        maxOutputTokens: 4000,
      },
    });
  }

  async generateConversation(
    category: ConversationCategory,
    difficulty: SyntheticConversation['difficulty'] = 'medium'
  ): Promise<SyntheticConversation> {
    const scenarioPrompt = SCENARIO_PROMPTS[category];

    const prompt = `You are generating synthetic test data for a voice AI assistant called Ferni.
Ferni is a warm, empathetic AI life coach with superhuman emotional intelligence.

${scenarioPrompt}

Difficulty: ${difficulty}
${difficulty === 'hard' ? 'Make the conversation complex with subtle nuances.' : ''}
${difficulty === 'edge-case' ? 'Include unusual patterns that might break naive parsers.' : ''}

Generate a ${difficulty === 'easy' ? '3-5' : difficulty === 'medium' ? '5-8' : '8-12'} turn conversation.

IMPORTANT: Respond ONLY with valid JSON in this exact format:
{
  "scenario": "brief description of what this conversation tests",
  "turns": [
    {
      "role": "user",
      "content": "what the user says",
      "metadata": {
        "emotion": "detected emotion if relevant",
        "intent": "what the user wants"
      }
    },
    {
      "role": "assistant", 
      "content": "what Ferni says (can include SSML tags like <break time='200ms'/>)",
      "metadata": {
        "emotion": "emotional tone of response"
      }
    }
  ],
  "expectedExtractions": [
    {
      "type": "user_name|person_name|location|emotion|correction|relationship",
      "value": "the extracted value",
      "turnIndex": 0
    }
  ],
  "validationChecks": [
    {
      "check": "name_captured|correction_detected|emotion_recognized|handoff_triggered|ssml_stripped",
      "expectation": "should_pass",
      "description": "what this validates"
    }
  ]
}`;

    try {
      const result = await this.model.generateContent(prompt);
      const responseText = result.response.text();

      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) ||
        responseText.match(/```\s*([\s\S]*?)\s*```/) || [null, responseText];

      const jsonStr = jsonMatch[1] || responseText;
      const parsed = JSON.parse(jsonStr.trim());

      return {
        id: `synth-${category}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        scenario: parsed.scenario,
        category,
        difficulty,
        turns: parsed.turns,
        expectedExtractions: parsed.expectedExtractions || [],
        validationChecks: parsed.validationChecks || [],
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error(`Failed to generate ${category} conversation:`, error);
      throw error;
    }
  }

  async generateTestSuite(count: number = 20): Promise<SyntheticConversation[]> {
    const conversations: SyntheticConversation[] = [];
    const categories = Object.keys(SCENARIO_PROMPTS) as ConversationCategory[];
    const difficulties: SyntheticConversation['difficulty'][] = [
      'easy',
      'medium',
      'hard',
      'edge-case',
    ];

    console.log(`\n🧪 Generating ${count} synthetic conversations...\n`);

    for (let i = 0; i < count; i++) {
      const category = categories[i % categories.length];
      const difficulty = difficulties[Math.floor(i / categories.length) % difficulties.length];

      try {
        console.log(`  [${i + 1}/${count}] Generating ${difficulty} ${category} conversation...`);
        const conv = await this.generateConversation(category, difficulty);
        conversations.push(conv);
        console.log(`    ✓ Generated: ${conv.scenario.slice(0, 60)}...`);

        // Rate limiting - be nice to the API
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`    ✗ Failed: ${error}`);
      }
    }

    return conversations;
  }

  async saveTestSuite(conversations: SyntheticConversation[], filename?: string): Promise<string> {
    const outputDir = path.join(process.cwd(), 'src/tests/e2e/synthetic-conversations/generated');

    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputFile = filename || `conversations-${Date.now()}.json`;
    const outputPath = path.join(outputDir, outputFile);

    const report = {
      generatedAt: new Date().toISOString(),
      totalConversations: conversations.length,
      byCategory: {} as Record<string, number>,
      byDifficulty: {} as Record<string, number>,
      conversations,
    };

    // Count by category and difficulty
    for (const conv of conversations) {
      report.byCategory[conv.category] = (report.byCategory[conv.category] || 0) + 1;
      report.byDifficulty[conv.difficulty] = (report.byDifficulty[conv.difficulty] || 0) + 1;
    }

    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`\n📁 Saved ${conversations.length} conversations to ${outputPath}`);

    return outputPath;
  }
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   LLM-Powered Synthetic Conversation Generator             ║');
  console.log("║   Stress-testing Ferni's memory pipeline                   ║");
  console.log('╚════════════════════════════════════════════════════════════╝');

  const generator = new ConversationGenerator();

  // Generate a diverse test suite
  const conversations = await generator.generateTestSuite(24); // 3 per category × 8 categories

  // Save to file
  const outputPath = await generator.saveTestSuite(conversations, 'test-suite-latest.json');

  // Print summary
  console.log('\n📊 Generation Summary:');
  console.log('═══════════════════════');

  const byCategory: Record<string, number> = {};
  const byDifficulty: Record<string, number> = {};

  for (const conv of conversations) {
    byCategory[conv.category] = (byCategory[conv.category] || 0) + 1;
    byDifficulty[conv.difficulty] = (byDifficulty[conv.difficulty] || 0) + 1;
  }

  console.log('\nBy Category:');
  for (const [cat, count] of Object.entries(byCategory)) {
    console.log(`  ${cat}: ${count}`);
  }

  console.log('\nBy Difficulty:');
  for (const [diff, count] of Object.entries(byDifficulty)) {
    console.log(`  ${diff}: ${count}`);
  }

  console.log(`\n✅ Test suite ready at: ${outputPath}`);
  console.log(
    'Run: npx vitest run src/tests/e2e/synthetic-conversations/run-synthetic-tests.test.ts'
  );
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
