/**
 * JSON Function Executor
 *
 * General-purpose executor for JSON function calls from LLM output.
 *
 * WORKAROUND (Dec 2024): Gemini Live API's function calling is unreliable.
 * We instruct the LLM to output JSON like: {"fn":"playMusic","args":{"query":"jazz"}}
 * This module parses that JSON and executes the corresponding tool.
 *
 * Features:
 * - Robust JSON parsing (handles formatted/minified JSON)
 * - Dynamic tool routing
 * - Graceful error handling
 * - Execution result callbacks
 *
 * @module agents/shared/json-function-executor
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'json-function-executor' });

// ============================================================================
// TYPES
// ============================================================================

/** Parsed JSON function call */
export interface JsonFunctionCall {
  fn: string;
  args: Record<string, unknown>;
  raw: string;
}

/** Result of executing a function */
export interface FunctionExecutionResult {
  success: boolean;
  fn: string;
  args: Record<string, unknown>;
  result?: unknown;
  error?: string;
  durationMs: number;
}

/** Context for tool execution */
export interface ToolExecutionContext {
  userId?: string;
  sessionId?: string;
  personaId?: string;
  /** Callback when a tool starts executing */
  onToolStart?: (fn: string, args: Record<string, unknown>) => void;
  /** Callback when a tool finishes */
  onToolComplete?: (result: FunctionExecutionResult) => void;
  /** Callback for handoff requests */
  onHandoff?: (target: string, reason: string) => Promise<void>;
}

// ============================================================================
// JSON PARSING
// ============================================================================

/**
 * Parse JSON function call from text.
 * Handles both minified and formatted JSON.
 *
 * Formats supported:
 * - {"fn":"playMusic","args":{"query":"jazz"}}
 * - { "fn": "playMusic", "args": { "query": "jazz" } }
 * - Multi-line formatted JSON
 */
export function parseJsonFunctionCall(text: string): JsonFunctionCall | null {
  // Try to find JSON object in text
  const jsonPatterns = [
    // Minified: {"fn":"name","args":{...}}
    /(\{["\s]*"?fn"?\s*:\s*"(\w+)"["\s]*,\s*"?args"?\s*:\s*(\{[^}]*\})\s*\})/,
    // With potential nested objects - greedy match
    /(\{\s*"fn"\s*:\s*"(\w+)"\s*,\s*"args"\s*:\s*(\{[\s\S]*?\})\s*\})/,
  ];

  for (const pattern of jsonPatterns) {
    const match = text.match(pattern);
    if (match) {
      try {
        const fullJson = match[1];
        const fn = match[2];
        const argsStr = match[3];

        // Parse args - handle nested objects
        const args = JSON.parse(argsStr) as Record<string, unknown>;

        log.debug({ fn, args, rawLength: fullJson.length }, 'Parsed JSON function call');
        return { fn, args, raw: fullJson };
      } catch (parseErr) {
        log.debug({ error: String(parseErr), text: text.slice(0, 100) }, 'JSON parse failed, trying full parse');
      }
    }
  }

  // Fallback: Try parsing the entire text as JSON
  try {
    // Clean up potential markdown code blocks
    let cleanText = text.trim();
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.slice(7);
    }
    if (cleanText.startsWith('```')) {
      cleanText = cleanText.slice(3);
    }
    if (cleanText.endsWith('```')) {
      cleanText = cleanText.slice(0, -3);
    }
    cleanText = cleanText.trim();

    // Try to find JSON object boundaries
    const startIdx = cleanText.indexOf('{');
    const endIdx = cleanText.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      const jsonStr = cleanText.slice(startIdx, endIdx + 1);
      const parsed = JSON.parse(jsonStr) as { fn?: string; args?: Record<string, unknown> };

      if (parsed.fn && typeof parsed.fn === 'string') {
        const args = parsed.args || {};
        return { fn: parsed.fn, args, raw: jsonStr };
      }
    }
  } catch {
    // Not valid JSON
  }

  return null;
}

/**
 * Check if text contains a JSON function call
 */
export function containsJsonFunctionCall(text: string): boolean {
  return parseJsonFunctionCall(text) !== null;
}

/**
 * Extract all JSON function calls from text (for multi-tool calls)
 */
export function extractAllJsonFunctionCalls(text: string): JsonFunctionCall[] {
  const calls: JsonFunctionCall[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const call = parseJsonFunctionCall(line);
    if (call) {
      calls.push(call);
    }
  }

  // Also try the full text if no line-by-line matches
  if (calls.length === 0) {
    const call = parseJsonFunctionCall(text);
    if (call) {
      calls.push(call);
    }
  }

  return calls;
}

// ============================================================================
// TOOL EXECUTION
// ============================================================================

/**
 * Execute a JSON function call.
 * Routes to the appropriate tool based on function name.
 */
export async function executeJsonFunction(
  call: JsonFunctionCall,
  ctx: ToolExecutionContext = {}
): Promise<FunctionExecutionResult> {
  const { fn, args } = call;
  const startTime = Date.now();

  log.info({ fn, args }, '🔧 Executing JSON function call');
  ctx.onToolStart?.(fn, args);

  try {
    const result = await routeToTool(fn, args, ctx);
    const executionResult: FunctionExecutionResult = {
      success: true,
      fn,
      args,
      result,
      durationMs: Date.now() - startTime,
    };

    log.info({ fn, durationMs: executionResult.durationMs }, '✅ JSON function executed');
    ctx.onToolComplete?.(executionResult);
    return executionResult;
  } catch (err) {
    const executionResult: FunctionExecutionResult = {
      success: false,
      fn,
      args,
      error: String(err),
      durationMs: Date.now() - startTime,
    };

    log.error({ fn, args, error: String(err) }, '❌ JSON function execution failed');
    ctx.onToolComplete?.(executionResult);
    return executionResult;
  }
}

/**
 * Route function call to the appropriate tool.
 * This is the main dispatcher.
 */
async function routeToTool(
  fn: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<unknown> {
  const fnLower = fn.toLowerCase();

  // ========================================
  // MUSIC TOOLS (Primary use case)
  // ========================================
  if (fnLower === 'playmusic') {
    const { playMusicUnified } = await import('../../tools/domains/entertainment/music.js');
    const query = (args.query as string) || 'music';
    log.info({ query }, '🎵 Playing music');
    return playMusicUnified(query);
  }

  if (fnLower === 'musiccontrol') {
    // Music control actions - use the real music player
    const { getMusicPlayer } = await import('../../audio/music-player.js');
    const musicPlayer = getMusicPlayer();
    const action = (args.action as string)?.toLowerCase();
    
    log.info({ action }, '🎵 Music control requested');
    
    switch (action) {
      case 'pause':
        musicPlayer.pause();
        return 'Music paused.';
      case 'resume':
      case 'play':
        await musicPlayer.resume();
        return 'Resuming the music.';
      case 'stop':
        musicPlayer.stop();
        return 'Music stopped.';
      case 'skip':
      case 'next':
        await musicPlayer.skip();
        return 'Skipping to the next track.';
      case 'volume':
        const level = args.level as number;
        if (level !== undefined) {
          musicPlayer.setVolume(level / 100);
          return `Volume set to ${level} percent.`;
        }
        return 'Please specify a volume level.';
      default:
        return `I'm not sure how to ${action} the music. Try pause, play, stop, skip, or volume.`;
    }
  }

  if (fnLower === 'musicinfo') {
    const { getMusicPlayer } = await import('../../audio/music-player.js');
    const musicPlayer = getMusicPlayer();
    const action = (args.action as string)?.toLowerCase();
    
    if (action === 'playing' || !action) {
      const state = musicPlayer.getState();
      if (state.currentTrack) {
        return `Now playing "${state.currentTrack.name}" by ${state.currentTrack.artist}.`;
      }
      return 'Nothing is playing right now.';
    }
    
    if (action === 'suggest') {
      const { suggestAndPlayMusic } = await import('../../tools/domains/entertainment/music.js');
      const mood = args.mood as string;
      if (mood) {
        return suggestAndPlayMusic(mood);
      }
      return 'What kind of mood are you in? I can suggest something fitting.';
    }
    
    return 'What would you like to know about the music?';
  }

  if (fnLower === 'suggestmusic') {
    const { suggestAndPlayMusic } = await import('../../tools/domains/entertainment/music.js');
    const mood = args.mood as string;
    
    if (mood) {
      log.info({ mood }, '🎵 Suggesting music for mood');
      return suggestAndPlayMusic(mood);
    }
    return 'What mood are you in? I can suggest something fitting.';
  }

  // Legacy music tool name aliases (route to musicControl)
  if (fnLower === 'pausemusic' || fnLower === 'pausecallmusic') {
    const { getMusicPlayer } = await import('../../audio/music-player.js');
    const musicPlayer = getMusicPlayer();
    log.info({ fn }, '🎵 Legacy pause tool - routing to musicControl');
    musicPlayer.pause();
    return 'Music paused.';
  }

  if (fnLower === 'stopmusic' || fnLower === 'stopcallmusic') {
    const { getMusicPlayer } = await import('../../audio/music-player.js');
    const musicPlayer = getMusicPlayer();
    log.info({ fn }, '🎵 Legacy stop tool - routing to musicControl');
    musicPlayer.stop();
    return 'Music stopped.';
  }

  if (fnLower === 'resumemusic' || fnLower === 'resumecallmusic') {
    const { getMusicPlayer } = await import('../../audio/music-player.js');
    const musicPlayer = getMusicPlayer();
    log.info({ fn }, '🎵 Legacy resume tool - routing to musicControl');
    await musicPlayer.resume();
    return 'Resuming the music.';
  }

  // ========================================
  // MEMORY TOOLS (With real Firestore integration)
  // ========================================
  if (fnLower === 'rememberaboutuser') {
    const fact = args.fact as string;
    const category = (args.category as string) || 'personal';
    const importance = (args.importance as string) || 'medium';
    
    if (!fact) {
      return 'Please specify what you want me to remember.';
    }
    
    log.info({ fact, category, importance, userId: ctx.userId }, '💾 Remembering fact');
    
    // Try to persist to Firestore if we have a userId
    if (ctx.userId) {
      try {
        const { getFirestore } = await import('firebase-admin/firestore');
        const db = getFirestore();
        
        await db
          .collection('bogle_users')
          .doc(ctx.userId)
          .collection('extracted_facts')
          .add({
            fact,
            category,
            importance,
            confidence: importance === 'high' ? 0.9 : importance === 'medium' ? 0.7 : 0.5,
            extractedAt: new Date(),
            source: 'explicit_mention'
          });
        
        log.info({ userId: ctx.userId, fact }, '✅ Fact stored in Firestore');
        
        const acknowledgments = [
          `I'll remember that.`,
          `That's important. I'm keeping that in mind.`,
          `Thank you for sharing that. I won't forget.`,
          `Noted. That helps me understand you better.`,
        ];
        return acknowledgments[Math.floor(Math.random() * acknowledgments.length)];
      } catch (err) {
        log.warn({ error: String(err) }, 'Firestore storage failed, but captured locally');
      }
    }
    
    // Return success even without Firestore - it's still in session memory
    return { stored: true, fact, category, importance, message: "I'll remember that." };
  }

  if (fnLower === 'recallfrommemory') {
    const topic = args.topic as string;
    
    if (!topic) {
      return 'What would you like me to recall?';
    }
    
    log.info({ topic, userId: ctx.userId }, '🧠 Recalling from memory');
    
    // Try to search Firestore if we have a userId
    if (ctx.userId) {
      try {
        const { getFirestore } = await import('firebase-admin/firestore');
        const db = getFirestore();
        
        // Search extracted_facts collection
        const factsSnapshot = await db
          .collection('bogle_users')
          .doc(ctx.userId)
          .collection('extracted_facts')
          .orderBy('extractedAt', 'desc')
          .limit(10)
          .get();
        
        if (!factsSnapshot.empty) {
          const topicLower = topic.toLowerCase();
          const relevantFacts = factsSnapshot.docs
            .map(doc => doc.data())
            .filter(fact => {
              const factText = (fact.fact || fact.content || '').toLowerCase();
              return factText.includes(topicLower) || 
                     (fact.category && fact.category.toLowerCase().includes(topicLower));
            });
          
          if (relevantFacts.length > 0) {
            const factsSummary = relevantFacts
              .slice(0, 3)
              .map(f => f.fact || f.content)
              .join('; ');
            return `I remember: ${factsSummary}`;
          }
        }
        
        // Check conversation summaries
        const summariesSnapshot = await db
          .collection('bogle_users')
          .doc(ctx.userId)
          .collection('conversation_summaries')
          .orderBy('timestamp', 'desc')
          .limit(5)
          .get();
        
        if (!summariesSnapshot.empty) {
          const topicLower = topic.toLowerCase();
          const relevantSummary = summariesSnapshot.docs.find(doc => {
            const data = doc.data();
            const text = (data.summary || data.topics?.join(' ') || '').toLowerCase();
            return text.includes(topicLower);
          });
          
          if (relevantSummary) {
            const data = relevantSummary.data();
            return `From a past conversation: ${data.summary || data.topics?.join(', ')}`;
          }
        }
        
        log.info({ topic }, 'No relevant memories found');
        return `I don't have specific memories about "${topic}" yet. Tell me more?`;
      } catch (err) {
        log.warn({ error: String(err), topic }, 'Memory recall from Firestore failed');
      }
    }
    
    return `I don't have specific memories about that right now. Tell me more?`;
  }

  if (fnLower === 'updatememory') {
    const oldFact = args.oldFact as string;
    const newFact = args.newFact as string;
    
    if (!oldFact || !newFact) {
      return 'Please specify both the old memory and the updated information.';
    }
    
    log.info({ oldFact, newFact, userId: ctx.userId }, '✏️ Updating memory');
    
    // If we have userId, try to update in Firestore
    if (ctx.userId) {
      try {
        const { getFirestore } = await import('firebase-admin/firestore');
        const db = getFirestore();
        
        // Find and update the old fact
        const snapshot = await db
          .collection('bogle_users')
          .doc(ctx.userId)
          .collection('extracted_facts')
          .get();
        
        const oldFactLower = oldFact.toLowerCase();
        const docToUpdate = snapshot.docs.find(doc => {
          const data = doc.data();
          return (data.fact || data.content || '').toLowerCase().includes(oldFactLower);
        });
        
        if (docToUpdate) {
          await docToUpdate.ref.update({
            fact: newFact,
            updatedAt: new Date(),
            previousVersion: oldFact
          });
          log.info({ userId: ctx.userId }, '✅ Memory updated in Firestore');
        } else {
          // If no match found, store as new fact
          await db
            .collection('bogle_users')
            .doc(ctx.userId)
            .collection('extracted_facts')
            .add({
              fact: newFact,
              category: 'personal',
              importance: 'medium',
              confidence: 0.8,
              extractedAt: new Date(),
              source: 'explicit_update',
              previousVersion: oldFact
            });
        }
        
        return `Got it, I've updated my memory. ${newFact}`;
      } catch (err) {
        log.warn({ error: String(err) }, 'Memory update in Firestore failed');
      }
    }
    
    return { updated: true, oldFact, newFact, message: "Got it, I've updated that." };
  }

  if (fnLower === 'forgetmemory') {
    const topic = args.topic as string;
    const whatToForget = args.whatToForget as string;
    const target = topic || whatToForget;
    
    if (!target) {
      return 'What would you like me to forget?';
    }
    
    log.info({ target, userId: ctx.userId }, '🗑️ Forgetting memory');
    
    // If we have userId, try to remove from Firestore
    if (ctx.userId) {
      try {
        const { getFirestore } = await import('firebase-admin/firestore');
        const db = getFirestore();
        
        const snapshot = await db
          .collection('bogle_users')
          .doc(ctx.userId)
          .collection('extracted_facts')
          .get();
        
        const targetLower = target.toLowerCase();
        const docsToDelete = snapshot.docs.filter(doc => {
          const data = doc.data();
          return (data.fact || data.content || '').toLowerCase().includes(targetLower);
        });
        
        if (docsToDelete.length > 0) {
          const batch = db.batch();
          docsToDelete.forEach(doc => batch.delete(doc.ref));
          await batch.commit();
          
          log.info({ userId: ctx.userId, deleted: docsToDelete.length }, '✅ Memories deleted from Firestore');
          return `Done. I've forgotten about that. Your privacy matters.`;
        }
        
        return `I didn't find specific memories about "${target}" to remove.`;
      } catch (err) {
        log.warn({ error: String(err) }, 'Memory deletion from Firestore failed');
      }
    }
    
    return { forgotten: true, topic: target, message: `I'll forget about that.` };
  }

  if (fnLower === 'getrelationshipsummary') {
    log.info({ userId: ctx.userId }, '📊 Getting relationship summary');
    
    // If we have userId, try to get real relationship data
    if (ctx.userId) {
      try {
        const { getFirestore } = await import('firebase-admin/firestore');
        const db = getFirestore();
        
        // Get user profile
        const profileDoc = await db
          .collection('bogle_users')
          .doc(ctx.userId)
          .get();
        
        if (profileDoc.exists) {
          const profile = profileDoc.data() as Record<string, unknown> | undefined;
          if (profile) {
            const sections: string[] = [];
            
            if (profile.displayName || profile.name) {
              sections.push(`I know you as ${profile.displayName || profile.name}.`);
            }
            
            if (typeof profile.totalConversations === 'number' && profile.totalConversations > 1) {
              sections.push(`We've had ${profile.totalConversations} conversations together.`);
            }
            
            if (profile.relationshipStage) {
              sections.push(`Our relationship is in the "${profile.relationshipStage}" stage.`);
            }
            
            const topics = profile.preferredTopics as string[] | undefined;
            if (topics && topics.length > 0) {
              sections.push(`You tend to discuss: ${topics.slice(0, 3).join(', ')}.`);
            }
            
            if (sections.length > 0) {
              return sections.join(' ');
            }
          }
        }
        
        return "We're still getting to know each other. I'm here to listen and learn.";
      } catch (err) {
        log.warn({ error: String(err) }, 'Relationship summary from Firestore failed');
      }
    }
    
    return "This is a new conversation. I'm still getting to know you.";
  }

  // ========================================
  // HANDOFF TOOLS
  // ========================================
  if (fnLower.startsWith('handoffto')) {
    const target = fnLower.replace('handoffto', '');
    const reason = (args.reason as string) || 'User requested handoff';

    log.info({ target, reason }, '🤝 Handoff requested');
    
    if (ctx.onHandoff) {
      await ctx.onHandoff(target, reason);
      return { success: true, target, reason };
    }

    // Emit event for handoff
    return { 
      success: true, 
      target, 
      reason,
      action: 'handoff',
      note: 'Handoff event emitted - requires session handler'
    };
  }

  // ========================================
  // INFORMATION TOOLS
  // ========================================
  if (fnLower === 'getweather') {
    const { getCurrentWeather, getWeatherForecast } = await import('../../tools/weather.js');
    const location = (args.location as string) || 'current';
    const type = (args.type as string) || 'current';
    
    log.info({ location, type }, '🌤️ Getting weather');
    
    if (type === 'forecast') {
      return getWeatherForecast(location, 5);
    }
    return getCurrentWeather(location);
  }

  if (fnLower === 'getcurrenttime') {
    const timezone = (args.timezone as string) || 'local';
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone === 'local' ? undefined : timezone,
      hour: 'numeric',
      minute: '2-digit',
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    };
    const formatted = now.toLocaleString('en-US', options);
    return `It's ${formatted}.`;
  }

  if (fnLower === 'searchnews' || fnLower === 'getnews') {
    const { getFinancialNews, getStockNews, getGeneralNews, getTechNews } = await import('../../tools/news.js');
    const topic = (args.topic as string)?.toLowerCase() || 'general';
    const query = args.query as string;
    const category = args.category as string;
    
    log.info({ topic, query, category }, '📰 News search requested');
    
    // Route to appropriate news function based on topic
    if (topic === 'tech' || topic === 'technology') {
      return getTechNews();
    }
    if (topic === 'financial' || topic === 'finance' || topic === 'market' || topic === 'markets') {
      const newsCategory = (category as 'general' | 'forex' | 'crypto' | 'merger') || 'general';
      return getFinancialNews(newsCategory);
    }
    if (topic === 'stock' && query) {
      return getStockNews(query.toUpperCase());
    }
    // Default to general news
    return getGeneralNews();
  }

  if (fnLower === 'getfinancialsnews' || fnLower === 'getfinancialnews') {
    const { getFinancialNews } = await import('../../tools/news.js');
    const category = (args.category as 'general' | 'forex' | 'crypto' | 'merger') || 'general';
    log.info({ category }, '📰 Financial news requested');
    return getFinancialNews(category);
  }

  if (fnLower === 'gettechnews' || fnLower === 'gettechnews') {
    const { getTechNews } = await import('../../tools/news.js');
    log.info({}, '📰 Tech news requested');
    return getTechNews();
  }

  if (fnLower === 'getstocknews') {
    const { getStockNews } = await import('../../tools/news.js');
    const symbol = args.symbol as string;
    if (!symbol) {
      return 'Please specify a stock symbol (e.g., AAPL, TSLA).';
    }
    log.info({ symbol }, '📰 Stock news requested');
    return getStockNews(symbol.toUpperCase());
  }

  if (fnLower === 'getmarketsummary' || fnLower === 'getmarketoverview') {
    const { getMarketOverview } = await import('../../tools/domains/finance/market-data.js');
    log.info({}, '📈 Market summary requested');
    return getMarketOverview();
  }

  if (fnLower === 'getstockquote' || fnLower === 'getstockprice') {
    const { getStockQuote } = await import('../../tools/domains/finance/market-data.js');
    const symbol = args.symbol as string;
    if (!symbol) {
      return 'Please specify a stock symbol (e.g., AAPL, VTI, SPY).';
    }
    log.info({ symbol }, '📈 Stock quote requested');
    return getStockQuote(symbol);
  }

  // ========================================
  // PRODUCTIVITY TOOLS (Conversational Fallbacks)
  // These tools don't have full backend implementation yet, but provide
  // helpful conversational responses to keep the dialogue flowing naturally.
  // TODO: Connect to real task/goal tracking when available
  // ========================================
  if (fnLower === 'addtask') {
    const title = args.title as string;
    log.info({ title }, '📝 Task noted');
    return title ? `Got it, I'll remember you want to "${title}".` : "What task would you like me to note?";
  }

  if (fnLower === 'addgoal') {
    const title = args.title as string;
    log.info({ title }, '🎯 Goal noted');
    return title ? `Great goal! "${title}" - I'll keep that in mind as we talk.` : "What goal are you working toward?";
  }

  if (fnLower === 'settimer') {
    const duration = args.duration as string;
    const label = args.label as string;
    log.info({ duration, label }, '⏱️ Timer requested');
    return `Timer functionality isn't available yet, but I noted you wanted ${duration || 'a timer'}${label ? ` for "${label}"` : ''}.`;
  }

  if (fnLower === 'schedulereminder') {
    const message = args.message as string;
    const when = args.when as string;
    log.info({ message, when }, '🔔 Reminder requested');
    return `Reminder scheduling isn't available yet, but I noted: "${message || 'your reminder'}"${when ? ` for ${when}` : ''}.`;
  }

  // ========================================
  // HABITS TOOLS (Connected to Maya's Habit Coaching Domain)
  // Full habit tracking with behavior science backing.
  // ========================================
  if (fnLower === 'createhabit') {
    const name = args.name as string;
    const domain = (args.domain as string) || 'selfCare';
    const cue = args.cue as string;
    
    if (!name) {
      return "What habit would you like to develop?";
    }
    
    log.info({ name, domain, userId: ctx.userId }, '✅ Creating habit');
    
    // Store habit in Firestore with behavior science structure
    if (ctx.userId) {
      try {
        const { getFirestore } = await import('firebase-admin/firestore');
        const db = getFirestore();
        
        const habitId = `habit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await db
          .collection('bogle_users')
          .doc(ctx.userId)
          .collection('habits')
          .doc(habitId)
          .set({
            id: habitId,
            name,
            domain,
            cue: cue || null,
            currentLevel: 1, // Start at tiny habit level (Glidepath)
            targetLevel: 3,
            frequency: 'daily',
            currentStreak: 0,
            totalCompletions: 0,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        
        // Return behavior-science guided response
        const tinyHabitResponses = [
          `Starting "${name}" - smart choice. Let's make this so small you can't fail. What's the tiniest version of this habit? Something that takes less than 2 minutes.`,
          `I'm tracking "${name}" for you. Here's the key: start ridiculously small. When and where will you do this? Let's create a clear trigger.`,
          `"${name}" is now in your habit stack. The secret? Attach it to something you already do. After what existing habit could you do this?`,
        ];
        return tinyHabitResponses[Math.floor(Math.random() * tinyHabitResponses.length)];
      } catch (err) {
        log.warn({ error: String(err) }, 'Habit storage failed');
      }
    }
    
    return `Great habit to build: "${name}". Let's make it stick - what's the tiniest version you could start with?`;
  }

  if (fnLower === 'loghabitcompletion' || fnLower === 'loghabit') {
    const habitName = args.habitName as string || args.name as string;
    
    if (!habitName) {
      return "Which habit did you complete?";
    }
    
    log.info({ habitName, userId: ctx.userId }, '✅ Habit completion logged');
    
    // Update habit tracking in Firestore
    if (ctx.userId) {
      try {
        const { getFirestore } = await import('firebase-admin/firestore');
        const db = getFirestore();
        
        // Find the habit by name
        const habitsSnapshot = await db
          .collection('bogle_users')
          .doc(ctx.userId)
          .collection('habits')
          .where('isActive', '==', true)
          .get();
        
        const matchingHabit = habitsSnapshot.docs.find(doc => {
          const data = doc.data();
          return data.name.toLowerCase().includes(habitName.toLowerCase());
        });
        
        if (matchingHabit) {
          const habitData = matchingHabit.data();
          const newStreak = (habitData.currentStreak || 0) + 1;
          const newTotal = (habitData.totalCompletions || 0) + 1;
          
          await matchingHabit.ref.update({
            currentStreak: newStreak,
            totalCompletions: newTotal,
            lastCompleted: new Date(),
            updatedAt: new Date(),
          });
          
          // Log completion event
          await db
            .collection('bogle_users')
            .doc(ctx.userId)
            .collection('habit_completions')
            .add({
              habitId: matchingHabit.id,
              habitName: habitData.name,
              completedAt: new Date(),
              streak: newStreak,
            });
          
          // Generate streak-aware celebration
          if (newStreak === 7) {
            return `🔥 One week streak on "${habitData.name}"! That's real momentum. Your brain is starting to expect this now.`;
          } else if (newStreak === 21) {
            return `🎯 21 days of "${habitData.name}"! This is becoming automatic. You're rewiring your brain.`;
          } else if (newStreak === 30) {
            return `🏆 30 days! "${habitData.name}" is officially part of who you are now. That's identity change.`;
          } else if (newStreak >= 3 && newStreak % 7 === 0) {
            return `${newStreak} day streak on "${habitData.name}". You're building something real here.`;
          }
          
          const celebrations = [
            `Nice work on "${habitData.name}"! That's ${newStreak} ${newStreak === 1 ? 'day' : 'days'} in a row.`,
            `"${habitData.name}" - done! Every rep matters. Streak: ${newStreak}.`,
            `Logged! "${habitData.name}" - ${newTotal} total completions. You're showing up.`,
          ];
          return celebrations[Math.floor(Math.random() * celebrations.length)];
        }
      } catch (err) {
        log.warn({ error: String(err) }, 'Habit completion logging failed');
      }
    }
    
    return `Nice work completing "${habitName}"! Every step counts.`;
  }

  if (fnLower === 'gethabits') {
    log.info({ type: args.type, userId: ctx.userId }, '📋 Habits requested');
    
    if (ctx.userId) {
      try {
        const { getFirestore } = await import('firebase-admin/firestore');
        const db = getFirestore();
        
        const habitsSnapshot = await db
          .collection('bogle_users')
          .doc(ctx.userId)
          .collection('habits')
          .where('isActive', '==', true)
          .orderBy('createdAt', 'desc')
          .limit(10)
          .get();
        
        if (!habitsSnapshot.empty) {
          const habits = habitsSnapshot.docs.map(doc => {
            const data = doc.data();
            return `${data.name} (${data.currentStreak || 0} day streak)`;
          });
          return `Your active habits: ${habits.join(', ')}. Want to log a completion or add a new one?`;
        }
      } catch (err) {
        log.warn({ error: String(err) }, 'Habit retrieval failed');
      }
    }
    
    return "You don't have any tracked habits yet. Would you like to start one? I can help you design it using behavior science.";
  }
  
  if (fnLower === 'gethabitstats') {
    const habitName = args.habitName as string;
    log.info({ habitName, userId: ctx.userId }, '📊 Habit stats requested');
    
    if (ctx.userId) {
      try {
        const { getFirestore } = await import('firebase-admin/firestore');
        const db = getFirestore();
        
        const habitsSnapshot = await db
          .collection('bogle_users')
          .doc(ctx.userId)
          .collection('habits')
          .where('isActive', '==', true)
          .get();
        
        if (!habitsSnapshot.empty) {
          const stats = habitsSnapshot.docs.map(doc => {
            const data = doc.data();
            const successRate = data.totalCompletions > 0 
              ? Math.round((data.currentStreak / data.totalCompletions) * 100) 
              : 0;
            return `${data.name}: ${data.currentStreak} day streak, ${data.totalCompletions} total`;
          });
          return `Your habit progress:\n${stats.join('\n')}`;
        }
      } catch (err) {
        log.warn({ error: String(err) }, 'Habit stats failed');
      }
    }
    
    return "I don't have habit stats for you yet. Let's create a habit to track!";
  }

  // ========================================
  // WELLNESS TOOLS (Conversational Fallbacks)
  // These provide immediate helpful responses for wellness requests.
  // Crisis resources are real - always provide 988 hotline info.
  // ========================================
  if (fnLower === 'getcrisisresources') {
    log.info({ type: args.type }, '🆘 Crisis resources requested');
    return "If you're in crisis, please reach out: Call or text 988 for the Suicide and Crisis Lifeline, or text HOME to 741741 for the Crisis Text Line. You matter, and help is available 24/7.";
  }

  if (fnLower === 'groundingexercise') {
    log.info({ type: args.type }, '🧘 Grounding exercise requested');
    return "Let's do a quick grounding exercise. Take a slow breath with me. Now, name five things you can see around you. Take your time.";
  }

  if (fnLower === 'logmood') {
    const mood = args.mood as string;
    log.info({ mood, intensity: args.intensity }, '😊 Mood noted');
    return mood ? `I hear you're feeling ${mood}. Thank you for sharing that with me.` : "How are you feeling right now?";
  }

  // ========================================
  // WISDOM TOOLS (Conversational Fallbacks)
  // These provide actual wisdom content - not stubs!
  // Nayan's full wisdom tools are in tools/domains/wisdom.
  // ========================================
  if (fnLower === 'paradoxoftheday') {
    log.info({ action: args.action }, '🤔 Paradox requested');
    const paradoxes = [
      "Here's one to sit with: The more you try to control, the less control you have. What does that bring up for you?",
      "Consider this paradox: We must accept ourselves to change ourselves. How does that land?",
      "A paradox to ponder: The obstacle is often the way. What might that mean in your situation?",
    ];
    return paradoxes[Math.floor(Math.random() * paradoxes.length)];
  }

  if (fnLower === 'questionbeneath') {
    const question = args.initialQuestion as string;
    log.info({ question }, '❓ Question beneath requested');
    return question 
      ? `You asked: "${question}". But let me ask you - what's the deeper question underneath that one?`
      : "What question is on your mind? I'd like to explore what might be underneath it.";
  }

  if (fnLower === 'lifeportfolioreview') {
    const domain = args.domain as string;
    log.info({ domain }, '📊 Life portfolio review requested');
    return domain
      ? `Let's look at how ${domain} fits into your overall life. On a scale of 1-10, how satisfied are you with this area right now?`
      : "Let's review your life portfolio. Which area would you like to explore: career, relationships, health, purpose, or something else?";
  }

  // ========================================
  // GAMES (Conversational Fallbacks)
  // These initiate game conversations naturally.
  // Full game implementations are in tools/domains/games.
  // ========================================
  if (fnLower === 'startgame' || fnLower === 'starttextgame') {
    const game = args.game as string;
    log.info({ game }, '🎮 Game started');
    return game 
      ? `Let's play ${game}! I'll explain the rules as we go. Ready?`
      : "I'd love to play a game with you! What sounds fun - 20 questions, word association, or something else?";
  }

  if (fnLower === 'inboxzerochallenge') {
    log.info({ action: args.action }, '🎮 Inbox Zero Challenge');
    return "Inbox Zero Challenge! Let's tackle that email backlog together. Start by picking the 5 oldest unread emails. Ready to begin?";
  }
  
  if (fnLower === 'sundayprepgame') {
    log.info({ action: args.action }, '🎮 Sunday Prep Game');
    return "Sunday Prep Game! Let's set up your week for success. First question: What's the ONE thing that would make this week feel like a win?";
  }
  
  if (fnLower === 'compoundinterestgame') {
    log.info({ action: args.action }, '🎮 Compound Interest Game');
    return "Compound Interest Game! Let's explore how small consistent actions compound over time. What's one tiny habit you'd like to explore?";
  }

  // ========================================
  // COMMUNICATION TOOLS (Conversational Fallbacks)
  // Alex's full communication tools are in tools/domains/communication.
  // These fallbacks help draft/analyze messages conversationally.
  // TODO: Connect sendMessage to actual messaging when available
  // ========================================
  if (fnLower === 'sendmessage') {
    const recipient = args.recipient as string;
    log.warn({ recipient }, '📤 Send message requested');
    return `Message sending isn't available yet, but I can help you think through what you want to say to ${recipient || 'them'}.`;
  }

  if (fnLower === 'draftmessage') {
    const situation = args.situation as string;
    log.info({ situation }, '✍️ Draft message requested');
    return situation 
      ? `Let's draft a message for that situation. Who are you writing to, and what's the main thing you want to convey?`
      : "I'd be happy to help you draft a message. What's the situation?";
  }

  if (fnLower === 'analyzemessage') {
    const message = args.message as string;
    log.info({ hasMessage: !!message }, '🔍 Analyze message requested');
    return message 
      ? "Let's look at this together. What's your main concern - the tone, the clarity, or how it might be received?"
      : "I can help analyze a message. What did you receive or want to send?";
  }

  // ========================================
  // CALENDAR TOOLS (Conversational Fallbacks)
  // Jordan's full calendar tools require Google Calendar integration.
  // See: tools/domains/calendar for OAuth-connected implementation.
  // These fallbacks acknowledge requests when calendar isn't connected.
  // ========================================
  if (fnLower === 'createappointment') {
    const title = args.title as string;
    const date = args.date as string;
    log.info({ title, date }, '📅 Appointment requested');
    return `Calendar integration isn't available yet, but I noted your ${title || 'appointment'}${date ? ` for ${date}` : ''}. Don't forget to add it to your calendar!`;
  }

  if (fnLower === 'manageappointment') {
    const action = args.action as string;
    log.info({ action }, '📅 Appointment management requested');
    return `Calendar management isn't available yet. What would you like to ${action || 'do'} with your appointment?`;
  }

  // ========================================
  // UTILITIES
  // ========================================
  if (fnLower === 'calculatetip') {
    const amount = args.amount as number;
    const percentage = (args.percentage as number) || 20;
    const split = (args.split as number) || 1;
    
    if (!amount || amount <= 0) {
      return "What's the bill amount?";
    }
    
    const tip = amount * (percentage / 100);
    const total = amount + tip;
    const perPerson = total / split;
    
    if (split > 1) {
      return `On a $${amount.toFixed(2)} bill with ${percentage}% tip: The tip is $${tip.toFixed(2)}, total is $${total.toFixed(2)}. Split ${split} ways, that's $${perPerson.toFixed(2)} each.`;
    }
    return `On a $${amount.toFixed(2)} bill with ${percentage}% tip: The tip is $${tip.toFixed(2)}, making the total $${total.toFixed(2)}.`;
  }

  if (fnLower === 'wrapupconversation') {
    log.info({ reason: args.reason }, '👋 Wrap up conversation requested');
    // Return empty - the wrap up should be handled naturally, not spoken as a tool result
    return '';
  }

  // ========================================
  // BEHAVIOR SYSTEM TOOLS
  // These affect HOW the AI speaks, not WHAT it does
  // They return empty strings (silent) - behavior is handled internally
  // ========================================
  if (fnLower === 'shiftmode') {
    const mode = args.mode as string;
    log.info({ mode }, '🎭 Shifting presence mode');
    // Silent - mode shift is internal behavior
    return '';
  }

  if (fnLower === 'processing') {
    const type = (args.type as string) || 'thinking';
    log.info({ type }, '🤔 Processing...');
    // Return minimal vocal filler if needed
    if (type === 'tool_call') return 'Let me check...';
    if (type === 'thinking') return 'Hmm...';
    return '';
  }

  if (fnLower === 'holdspace') {
    const reason = args.reason as string;
    log.info({ reason }, '🕯️ Holding space');
    // Silent - intentional pause
    return '';
  }

  if (fnLower === 'expresspresence') {
    const type = (args.type as string) || 'breath';
    log.info({ type }, '✨ Expressing presence');
    // Minimal sounds for presence
    if (type === 'hum') return 'Mmm...';
    if (type === 'soft_sound') return 'Mm-hmm...';
    return '';
  }

  if (fnLower === 'adjustpacing') {
    log.info({ speed: args.speed, pauses: args.pauses }, '⏱️ Adjusting pacing');
    // Silent - pacing adjustment is internal
    return '';
  }

  // ========================================
  // UNKNOWN TOOL
  // ========================================
  log.warn({ fn, args }, '⚠️ Unknown function - no route defined');
  return { 
    tool: fn, 
    args, 
    success: false, 
    error: `Unknown function: ${fn}` 
  };
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Parse and execute all JSON function calls in text
 */
export async function parseAndExecuteAll(
  text: string,
  ctx: ToolExecutionContext = {}
): Promise<FunctionExecutionResult[]> {
  const calls = extractAllJsonFunctionCalls(text);
  const results: FunctionExecutionResult[] = [];

  for (const call of calls) {
    const result = await executeJsonFunction(call, ctx);
    results.push(result);
  }

  return results;
}

/**
 * Strip JSON function calls from text (for TTS)
 */
export function stripJsonFunctionCalls(text: string): string {
  const calls = extractAllJsonFunctionCalls(text);

  let cleaned = text;
  for (const call of calls) {
    cleaned = cleaned.replace(call.raw, '');
  }

  // Clean up whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

  return cleaned;
}
