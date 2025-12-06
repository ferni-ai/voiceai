/**
 * Engagement API Routes
 * 
 * REST endpoints for:
 * - Conversations history
 * - User analytics
 * - Predictions
 * - Cognitive memories  
 * - Rituals
 * - Team huddles
 * - Data export
 * - Relationship progress
 */

// Helper to get userId from request
function getUserId(req, parsedUrl) {
  return parsedUrl.searchParams.get('userId') || 
         req.headers['x-user-id'] || 
         'demo-user';
}

// Milestone messages for streak celebrations
function getMilestoneMessage(streak) {
  const messages = {
    3: "Three days in a row. You're building something real.",
    7: "One whole week. The habit is taking root.",
    14: "Two weeks strong. This is becoming part of who you are.",
    21: "Three weeks. Scientists say habits form around now.",
    30: "One month! You've proven you can stick with this.",
    60: "Two months of consistency. Remarkable.",
    90: "90 days. This isn't a habit anymore—it's you.",
    100: "Triple digits! 100 days of showing up for yourself.",
    365: "One year. 365 days. Extraordinary commitment."
  };
  return messages[streak] || `${streak} days and counting!`;
}

// Parse JSON body from request
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

/**
 * Handle engagement API routes
 * @returns {boolean} true if route was handled
 */
export async function handleEngagementRoutes(req, res, pathname, parsedUrl) {
  
  // GET /api/conversations - Get conversation history
  if (pathname === '/api/conversations' && req.method === 'GET') {
    try {
      const userId = getUserId(req, parsedUrl);
      const limit = parseInt(parsedUrl.searchParams.get('limit') || '50');
      
      const { getConversationHistoryService } = await import('../services/conversation-history.js');
      const historyService = getConversationHistoryService();
      const data = await historyService.getHistory(userId, limit);
      
      res.writeHead(200, { 
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=60'
      });
      res.end(JSON.stringify(data));
    } catch (err) {
      console.error('❌ Failed to get conversations:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Failed to get conversations',
        message: err.message,
        sessions: [],
        totalSessions: 0,
        totalMinutes: 0,
        insightCount: 0
      }));
    }
    return true;
  }
  
  // GET /api/analytics/user - Get user progress analytics
  // Returns data in format expected by AnalyticsDashboardData interface (frontend-typescript/src/ui/analytics-dashboard.ui.ts)
  if (pathname === '/api/analytics/user' && req.method === 'GET') {
    try {
      const userId = getUserId(req, parsedUrl);
      
      const { getEngagementStore } = await import('../services/engagement-store.js');
      const store = await getEngagementStore();
      const profile = await store.getProfile(userId);
      const streaks = await store.getAllStreaks(userId);
      const weatherHistory = await store.getWeatherHistory(userId, 30);
      const predictions = await store.getRecentPredictions(userId, 20);
      
      // Calculate analytics
      const completedPredictions = predictions.filter(p => p.accuracy !== undefined);
      const averageAccuracy = completedPredictions.length > 0
        ? Math.round(completedPredictions.reduce((sum, p) => sum + (p.accuracy || 0), 0) / completedPredictions.length)
        : null;
      
      // Find best day from completion patterns
      const dayCompletions = {};
      streaks.forEach(s => {
        if (s.lastCompletedAt) {
          const day = new Date(s.lastCompletedAt).toLocaleDateString('en-US', { weekday: 'long' });
          dayCompletions[day] = (dayCompletions[day] || 0) + 1;
        }
      });
      const bestDay = Object.entries(dayCompletions).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
      
      // Mood trends - format for UI: { date, mood: 'sunny'|'cloudy'|..., energy: 'high'|'medium'|'low' }
      // weatherHistory entries have: { date, weather: { primary, energy, note }, ritualId }
      const moodTrends = weatherHistory.slice(0, 14).map(w => {
        // Handle both old format (w.weather is string) and new format (w.weather is object)
        const weather = typeof w.weather === 'object' ? w.weather : { primary: w.weather, energy: 'medium' };
        return {
          date: w.date,
          mood: weather.primary || 'cloudy',
          energy: weather.energy || 'medium',
        };
      });
      
      // Calculate average mood as numeric for stats
      const moodMap = { sunny: 5, 'partly-cloudy': 4, cloudy: 3, rainy: 2, stormy: 1, foggy: 2, rainbow: 5 };
      const moodValues = moodTrends.map(m => moodMap[m.mood] || 3);
      const averageMood = moodValues.length > 0
        ? moodValues.reduce((sum, v) => sum + v, 0) / moodValues.length
        : 3;
      
      // Streak trends - format for UI: { date, count, ritualId, personaId }
      // Build from streak history and recent completions
      const streakTrends = [];
      const last14Days = Array.from({ length: 14 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (13 - i));
        return d.toISOString().split('T')[0];
      });
      
      for (const streak of streaks) {
        if (streak.lastCompletedAt) {
          const lastDate = streak.lastCompletedAt.split('T')[0];
          // Add entries for the streak period
          for (let i = 0; i < Math.min(streak.currentStreak, 14); i++) {
            const d = new Date(streak.lastCompletedAt);
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            if (last14Days.includes(dateStr)) {
              streakTrends.push({
                date: dateStr,
                count: 1,
                ritualId: streak.ritualId,
                personaId: streak.personaId,
              });
            }
          }
        }
      }
      
      // Prediction trends - format for UI: { date, accuracy, totalPredictions }
      const predictionTrends = predictions
        .filter(p => p.completedAt && p.accuracy !== undefined)
        .slice(0, 10)
        .map(p => ({
          date: p.completedAt || p.createdAt,
          accuracy: p.accuracy,
          totalPredictions: Object.keys(p.predictions || {}).length,
        }));
      
      // Calculate improvement areas based on data
      const improvementAreas = [];
      
      // Check for inconsistent rituals
      const inconsistentRituals = streaks.filter(s => s.currentStreak === 0 && s.totalCompletions > 0);
      if (inconsistentRituals.length > 0) {
        improvementAreas.push('Some rituals could use more consistency');
      }
      
      // Check for low energy trend
      const lowEnergyDays = moodTrends.filter(m => m.energy === 'low').length;
      if (lowEnergyDays > moodTrends.length / 2) {
        improvementAreas.push('Energy levels have been low - consider reviewing sleep or exercise habits');
      }
      
      // Check for pending predictions
      const pendingPredictions = predictions.filter(p => !p.completedAt).length;
      if (pendingPredictions > 3) {
        improvementAreas.push('Try predictions in new categories');
      }
      
      // Find most consistent ritual (highest streak)
      const sortedStreaks = [...streaks].sort((a, b) => b.longestStreak - a.longestStreak);
      const mostConsistentRitual = sortedStreaks[0]?.ritualId || null;
      
      // Map ritual IDs to friendly names
      const ritualNames = {
        'ferni-sky-check': 'Morning Sky Check',
        'alex-inbox-pulse': 'Inbox Pulse',
        'maya-habit-heartbeat': 'Habit Heartbeat',
        'jordan-todays-chapter': "Today's Chapter",
        'nayan-morning-stillness': 'Morning Stillness',
        'peter-pattern-pulse': 'Pattern Pulse',
      };
      
      /**
       * Get friendly name for a ritual (handles custom rituals)
       * Custom rituals have IDs like "ritual_1234567890_abc123"
       */
      function getRitualFriendlyName(ritualId) {
        if (!ritualId) return null;
        // Check built-in rituals first
        if (ritualNames[ritualId]) return ritualNames[ritualId];
        // Custom rituals - try to extract a better name or use generic
        if (ritualId.startsWith('ritual_') || ritualId.startsWith('ritual-')) {
          return 'Custom Practice';
        }
        // Fallback: Title case the ID
        return ritualId.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      }
      
      const analytics = {
        // Overview stats
        totalDays: profile.totalRitualDays || 0,
        totalRituals: streaks.reduce((sum, s) => sum + (s.totalCompletions || 0), 0),
        currentLongestStreak: Math.max(...streaks.map(s => s.currentStreak || 0), 0),
        averageMood: Math.round(averageMood * 10) / 10,
        predictionAccuracy: averageAccuracy,
        
        // Trends (for charts)
        streakTrends,
        moodTrends,
        predictionTrends,
        
        // Insights
        bestDay,
        mostConsistentRitual: getRitualFriendlyName(mostConsistentRitual),
        improvementAreas,
      };
      
      res.writeHead(200, { 
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=60'
      });
      res.end(JSON.stringify(analytics));
    } catch (err) {
      console.error('❌ Failed to get user analytics:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Failed to get analytics',
        totalDays: 0,
        totalRituals: 0,
        currentLongestStreak: 0,
        averageMood: 0,
        predictionAccuracy: null,
        streakTrends: [],
        moodTrends: [],
        predictionTrends: [],
        bestDay: null,
        mostConsistentRitual: null,
        improvementAreas: [],
      }));
    }
    return true;
  }
  
  // GET /api/predictions - Get user predictions
  if (pathname === '/api/predictions' && req.method === 'GET') {
    try {
      const userId = getUserId(req, parsedUrl);
      const limit = parseInt(parsedUrl.searchParams.get('limit') || '20');
      
      const { getEngagementStore } = await import('../services/engagement-store.js');
      const store = await getEngagementStore();
      let predictions = await store.getRecentPredictions(userId, limit);
      const profile = await store.getProfile(userId);
      
      // Auto-expire predictions older than 7 days that haven't been resolved
      const EXPIRY_DAYS = 7;
      const now = Date.now();
      const expiryThreshold = now - (EXPIRY_DAYS * 24 * 60 * 60 * 1000);
      
      predictions = predictions.map(p => {
        if (!p.completedAt && new Date(p.createdAt).getTime() < expiryThreshold) {
          return { ...p, status: 'expired', expiredAt: new Date().toISOString() };
        }
        return p;
      });
      
      // Calculate stats from non-expired predictions
      const validPredictions = predictions.filter(p => p.status !== 'expired');
      const completedPredictions = validPredictions.filter(p => p.accuracy !== undefined);
      const avgAccuracy = completedPredictions.length > 0
        ? Math.round(completedPredictions.reduce((sum, p) => sum + (p.accuracy || 0), 0) / completedPredictions.length)
        : profile.stats?.predictionAccuracy || 0;
      
      res.writeHead(200, { 
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=60'
      });
      res.end(JSON.stringify({
        predictions,
        stats: {
          totalPredictions: profile.stats?.totalPredictions || 0,
          averageAccuracy: avgAccuracy,
          pendingCount: validPredictions.filter(p => !p.completedAt).length,
          expiredCount: predictions.filter(p => p.status === 'expired').length
        }
      }));
    } catch (err) {
      console.error('❌ Failed to get predictions:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Failed to get predictions',
        predictions: [],
        stats: { totalPredictions: 0, averageAccuracy: 0 }
      }));
    }
    return true;
  }
  
  // POST /api/predictions/:id/actuals
  if (pathname.match(/^\/api\/predictions\/[^/]+\/actuals$/) && req.method === 'POST') {
    const predictionId = pathname.split('/')[3];
    try {
      const { actuals, userId } = await parseBody(req);
      const uid = userId || getUserId(req, parsedUrl);
      
      const { getEngagementStore } = await import('../services/engagement-store.js');
      const store = await getEngagementStore();
      const result = await store.updatePredictionActuals(uid, predictionId, actuals);
      
      if (!result) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Prediction not found' }));
        return true;
      }
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      console.error('❌ Failed to update prediction:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return true;
  }
  
  // GET /api/cognitive/memories - What I've Learned
  if (pathname === '/api/cognitive/memories' && req.method === 'GET') {
    try {
      const userId = getUserId(req, parsedUrl);
      
      // Get real persona memories (facts, preferences, goals learned about user)
      const { getAllUserMemories } = await import('../services/persona-memories.js');
      const { getDefaultStore } = await import('../memory/index.js');
      const { extractLearnedMemories } = await import('../services/learned-memories.js');
      
      const rawMemories = await getAllUserMemories(userId);
      const store = getDefaultStore();
      const userProfile = await store.getProfile(userId);
      
      // Transform persona memories to UI format
      const personaMemories = rawMemories.map(m => ({
        id: m.id,
        type: mapMemoryTypeToUIType(m.type, m.personaId),
        content: formatMemoryContent(m),
        confidence: calculateConfidence(m),
        source: getPersonaName(m.personaId),
        learnedAt: m.createdAt?.toISOString?.() || new Date().toISOString(),
        personaId: m.personaId,
        sourceType: 'persona_memory',
      }));
      
      // Also extract memories from user profile (key moments, relationships, etc.)
      let profileMemories = [];
      let profilePatterns = [];
      if (userProfile) {
        const profileData = extractLearnedMemories(userProfile);
        profileMemories = profileData.memories;
        profilePatterns = profileData.patterns;
      }
      
      // Combine and deduplicate (prefer more specific persona memories)
      const seenContent = new Set(personaMemories.map(m => m.content.toLowerCase()));
      const uniqueProfileMemories = profileMemories.filter(m => !seenContent.has(m.content.toLowerCase()));
      
      const allMemories = [...personaMemories, ...uniqueProfileMemories];
      
      // Sort by confidence and recency
      allMemories.sort((a, b) => {
        if (b.confidence !== a.confidence) return b.confidence - a.confidence;
        return new Date(b.learnedAt).getTime() - new Date(a.learnedAt).getTime();
      });
      
      // Extract patterns - combine from persona patterns and profile patterns
      const patterns = [...extractPatternsFromProfile(userProfile), ...profilePatterns];
      
      // Deduplicate patterns
      const seenPatterns = new Set();
      const uniquePatterns = patterns.filter(p => {
        if (seenPatterns.has(p.pattern)) return false;
        seenPatterns.add(p.pattern);
        return true;
      });
      
      // Calculate total interactions and knowledge score
      const totalInteractions = userProfile?.totalConversations || 0;
      const knowledgeScore = Math.min(100, Math.round((allMemories.length * 3) + (totalInteractions * 2) + (uniquePatterns.length * 5)));
      
      res.writeHead(200, { 
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=60'
      });
      res.end(JSON.stringify({
        memories: allMemories,
        patterns: uniquePatterns,
        totalInteractions,
        knowledgeScore,
      }));
    } catch (err) {
      console.error('❌ Failed to get cognitive memories:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        memories: [],
        patterns: [],
        totalInteractions: 0,
        knowledgeScore: 0,
      }));
    }
    return true;
  }
  
  // DELETE /api/cognitive/memories/:id - Forget a specific memory
  if (pathname.match(/^\/api\/cognitive\/memories\/[^/]+$/) && req.method === 'DELETE') {
    const memoryId = decodeURIComponent(pathname.split('/')[4]);
    try {
      const userId = getUserId(req, parsedUrl);
      
      let deleted = false;
      let deleteSource = '';
      
      // Try to delete from persona memories first
      const { forget } = await import('../services/persona-memories.js');
      const personaDeleted = await forget(memoryId);
      if (personaDeleted) {
        deleted = true;
        deleteSource = 'persona_memory';
      }
      
      // If not found in persona memories, try profile-based memories
      if (!deleted) {
        const { deleteMemoryFromProfile } = await import('../services/learned-memories.js');
        const { getDefaultStore } = await import('../memory/index.js');
        
        const store = getDefaultStore();
        const profile = await store.getProfile(userId);
        
        if (profile) {
          const result = deleteMemoryFromProfile(profile, memoryId);
          if (result.success) {
            await store.saveProfile(result.profile);
            deleted = true;
            deleteSource = result.deletedType || 'profile';
          }
        }
      }
      
      if (deleted) {
        console.log(`🗑️ Memory deleted: ${memoryId} (source: ${deleteSource}) for user ${userId}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, memoryId, source: deleteSource }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Memory not found', memoryId }));
      }
    } catch (err) {
      console.error('❌ Failed to delete memory:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return true;
  }
  
  // GET /api/rituals
  if (pathname === '/api/rituals' && req.method === 'GET') {
    try {
      const userId = getUserId(req, parsedUrl);
      
      const { getEngagementStore } = await import('../services/engagement-store.js');
      const store = await getEngagementStore();
      const profile = await store.getProfile(userId);
      const streaks = await store.getAllStreaks(userId);
      const weatherHistory = await store.getWeatherHistory(userId, 30);
      
      res.writeHead(200, { 
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=60'
      });
      res.end(JSON.stringify({
        activeRituals: profile.activeRituals || [],
        streaks,
        weatherHistory,
        preferences: profile.preferences,
        stats: {
          totalRitualDays: profile.totalRitualDays,
          longestOverallStreak: profile.longestOverallStreak,
          totalSkyChecks: profile.stats?.totalSkyChecks || 0
        }
      }));
    } catch (err) {
      console.error('❌ Failed to get rituals:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Failed to get rituals',
        activeRituals: [],
        streaks: [],
        weatherHistory: []
      }));
    }
    return true;
  }
  
  // POST /api/rituals - Create ritual
  if (pathname === '/api/rituals' && req.method === 'POST') {
    try {
      const { userId, ritual } = await parseBody(req);
      const uid = userId || getUserId(req, parsedUrl);
      
      const { getEngagementStore } = await import('../services/engagement-store.js');
      const store = await getEngagementStore();
      const profile = await store.getProfile(uid);
      
      const ritualId = `ritual-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      profile.activeRituals = profile.activeRituals || [];
      profile.activeRituals.push(ritualId);
      await store.saveProfile(profile);
      
      await store.saveRitualStreak(uid, {
        ritualId,
        personaId: ritual?.personaId || 'ferni',
        currentStreak: 0,
        longestStreak: 0,
        lastCompletedAt: null, // Don't set on creation - only on actual completion
        totalCompletions: 0,
        streakHistory: []
      });
      
      console.log(`✨ Ritual created: ${ritualId} for user ${uid}`);
      
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, ritualId }));
    } catch (err) {
      console.error('❌ Failed to create ritual:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return true;
  }
  
  // DELETE /api/rituals/:id - Delete a ritual
  if (pathname.match(/^\/api\/rituals\/[^/]+$/) && req.method === 'DELETE') {
    const ritualId = pathname.split('/')[3];
    try {
      const userId = getUserId(req, parsedUrl);
      
      const { getEngagementStore } = await import('../services/engagement-store.js');
      const store = await getEngagementStore();
      
      const profile = await store.getProfile(userId);
      
      // Remove from active rituals
      if (profile.activeRituals) {
        profile.activeRituals = profile.activeRituals.filter(id => id !== ritualId);
        await store.saveProfile(profile);
      }
      
      console.log(`🗑️ Ritual deleted: ${ritualId} for user ${userId}`);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, ritualId }));
    } catch (err) {
      console.error('❌ Failed to delete ritual:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return true;
  }
  
  // POST /api/rituals/:id/complete
  if (pathname.match(/^\/api\/rituals\/[^/]+\/complete$/) && req.method === 'POST') {
    const ritualId = pathname.split('/')[3];
    try {
      const { userId, weather } = await parseBody(req);
      const uid = userId || getUserId(req, parsedUrl);
      
      const { getEngagementStore } = await import('../services/engagement-store.js');
      const store = await getEngagementStore();
      
      let streak = await store.getRitualStreak(uid, ritualId);
      if (!streak) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Ritual not found' }));
        return true;
      }
      
      const today = new Date().toISOString().split('T')[0];
      const lastCompleted = streak.lastCompletedAt?.split('T')[0];
      
      if (lastCompleted === today) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Already completed today', streak: streak.currentStreak }));
        return true;
      }
      
      // Check if streak should continue or reset
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const wasConsecutive = lastCompleted === yesterday;
      const wasNeverCompleted = !lastCompleted;
      
      // Continue streak if completed yesterday, start fresh otherwise
      if (wasConsecutive) {
        streak.currentStreak = streak.currentStreak + 1;
      } else {
        // Streak broken - save the old streak to history if it was meaningful
        if (streak.currentStreak > 0 && !wasNeverCompleted) {
          streak.streakHistory = streak.streakHistory || [];
          streak.streakHistory.push({
            endedAt: streak.lastCompletedAt,
            length: streak.currentStreak,
            reason: 'missed_day'
          });
        }
        streak.currentStreak = 1; // Start new streak
      }
      streak.longestStreak = Math.max(streak.longestStreak, streak.currentStreak);
      streak.totalCompletions++;
      streak.lastCompletedAt = new Date().toISOString();
      
      await store.saveRitualStreak(uid, streak);
      
      if (weather) {
        await store.recordWeather(uid, { date: new Date().toISOString(), weather, ritualId });
      }
      
      const profile = await store.getProfile(uid);
      profile.totalRitualDays++;
      profile.longestOverallStreak = Math.max(profile.longestOverallStreak, streak.currentStreak);
      profile.lastEngagementAt = new Date().toISOString();
      await store.saveProfile(profile);
      
      console.log(`🔥 Ritual completed: ${ritualId} - streak: ${streak.currentStreak}`);
      
      // Check if this is a milestone (celebration-worthy)
      const milestones = [3, 7, 14, 21, 30, 60, 90, 100, 365];
      const isMilestone = milestones.includes(streak.currentStreak);
      const isPersonalBest = streak.currentStreak === streak.longestStreak && streak.currentStreak > 1;
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: true,
        streak: streak.currentStreak,
        longestStreak: streak.longestStreak,
        totalCompletions: streak.totalCompletions,
        celebration: isMilestone || isPersonalBest ? {
          type: isMilestone ? 'milestone' : 'personal_best',
          milestone: streak.currentStreak,
          message: isMilestone 
            ? getMilestoneMessage(streak.currentStreak)
            : `New personal best: ${streak.currentStreak} days!`
        } : null
      }));
    } catch (err) {
      console.error('❌ Failed to complete ritual:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return true;
  }
  
  // GET /api/huddles
  if (pathname === '/api/huddles' && req.method === 'GET') {
    try {
      const userId = getUserId(req, parsedUrl);
      
      const { getEngagementStore } = await import('../services/engagement-store.js');
      const store = await getEngagementStore();
      const profile = await store.getProfile(userId);
      
      res.writeHead(200, { 
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=60'
      });
      res.end(JSON.stringify({
        totalHuddles: profile.stats?.teamHuddlesAttended || 0,
        lastHuddleAt: profile.lastEngagementAt,
        recentHuddles: []
      }));
    } catch (err) {
      console.error('❌ Failed to get huddles:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to get huddles', totalHuddles: 0, recentHuddles: [] }));
    }
    return true;
  }
  
  // GET /api/export/categories
  if (pathname === '/api/export/categories' && req.method === 'GET') {
    try {
      const userId = getUserId(req, parsedUrl);
      
      const { getDataExportService } = await import('../services/data-export.js');
      const exportService = getDataExportService();
      const categories = await exportService.getExportableCategories(userId);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ categories }));
    } catch (err) {
      console.error('❌ Failed to get export categories:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to get categories', categories: [] }));
    }
    return true;
  }
  
  // POST /api/export
  if (pathname === '/api/export' && req.method === 'POST') {
    try {
      const { userId, format, categories } = await parseBody(req);
      const uid = userId || getUserId(req, parsedUrl);
      
      const { getDataExportService } = await import('../services/data-export.js');
      const exportService = getDataExportService();
      const data = await exportService.exportData(uid, format || 'json', categories || []);
      
      const contentType = format === 'csv' ? 'text/csv' : 'application/json';
      const filename = `ferni-export-${new Date().toISOString().split('T')[0]}.${format || 'json'}`;
      
      res.writeHead(200, { 
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`
      });
      res.end(data);
    } catch (err) {
      console.error('❌ Failed to export data:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return true;
  }
  
  // DELETE /api/export/all - GDPR data deletion
  if (pathname === '/api/export/all' && req.method === 'DELETE') {
    try {
      const { userId, confirmDelete } = await parseBody(req);
      const uid = userId || getUserId(req, parsedUrl);
      
      if (confirmDelete !== true) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Must confirm deletion with confirmDelete: true' }));
        return true;
      }
      
      const { getDataExportService } = await import('../services/data-export.js');
      const exportService = getDataExportService();
      await exportService.deleteAllData(uid);
      
      console.log(`🗑️ All data deleted for user: ${uid}`);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'All data deleted' }));
    } catch (err) {
      console.error('❌ Failed to delete data:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return true;
  }
  
  // GET /api/relationship/progress
  if (pathname === '/api/relationship/progress' && req.method === 'GET') {
    try {
      const userId = getUserId(req, parsedUrl);
      
      const { getEngagementStore } = await import('../services/engagement-store.js');
      const { getConversationHistoryService } = await import('../services/conversation-history.js');
      
      const store = await getEngagementStore();
      const historyService = getConversationHistoryService();
      
      const profile = await store.getProfile(userId);
      const history = await historyService.getHistory(userId, 100);
      
      const totalConversations = history.totalSessions;
      const totalRitualDays = profile.totalRitualDays || 0;
      const engagementScore = totalConversations + (totalRitualDays * 2);
      
      let stage = 'stranger';
      let stageNumber = 1;
      let nextStageAt = 5;
      
      if (engagementScore >= 100) {
        stage = 'family'; stageNumber = 6; nextStageAt = null;
      } else if (engagementScore >= 50) {
        stage = 'confidant'; stageNumber = 5; nextStageAt = 100;
      } else if (engagementScore >= 25) {
        stage = 'friend'; stageNumber = 4; nextStageAt = 50;
      } else if (engagementScore >= 10) {
        stage = 'acquaintance'; stageNumber = 3; nextStageAt = 25;
      } else if (engagementScore >= 5) {
        stage = 'familiar'; stageNumber = 2; nextStageAt = 10;
      }
      
      res.writeHead(200, { 
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=60'
      });
      res.end(JSON.stringify({
        stage,
        stageNumber,
        engagementScore,
        nextStageAt,
        progress: nextStageAt ? Math.min(100, Math.round((engagementScore / nextStageAt) * 100)) : 100,
        stats: {
          totalConversations,
          totalRitualDays,
          lastEngagement: profile.lastEngagementAt
        }
      }));
    } catch (err) {
      console.error('❌ Failed to get relationship progress:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Failed to get progress',
        stage: 'stranger',
        stageNumber: 1,
        engagementScore: 0
      }));
    }
    return true;
  }
  
  // Route not handled
  return false;
}

// ============================================================================
// HELPER FUNCTIONS - What I've Learned data transformation
// ============================================================================

/**
 * Map persona memory types to UI display types
 */
function mapMemoryTypeToUIType(memType, personaId) {
  // Type mapping based on persona and memory type
  const typeMap = {
    // Facts: concrete information about user
    'fund': 'fact',
    'stock': 'fact',
    'company': 'fact',
    'merchant': 'fact',
    'bill': 'fact',
    'date': 'fact',
    'venue': 'fact',
    'contact_note': 'fact',
    
    // Preferences: what user likes/dislikes
    'preference': 'preference',
    'philosophy': 'preference',
    'style': 'preference',
    'music': 'preference',
    'communication_preference': 'preference',
    'destination': 'preference',
    
    // Goals: what user wants to achieve
    'savings_goal': 'goal',
    'watchlist': 'goal',
    'win': 'goal',
    
    // Patterns: behavioral observations
    'trigger': 'pattern',
    'category': 'pattern',
    'allocation': 'pattern',
    'scheduling_note': 'pattern',
    
    // Relationships: connections to people/things
    'milestone': 'relationship',
    'inside_joke': 'relationship',
    'story': 'relationship',
    'vendor': 'relationship',
  };
  
  return typeMap[memType] || 'fact';
}

/**
 * Format memory content for human-readable display
 */
function formatMemoryContent(memory) {
  let content = memory.name;
  
  if (memory.details) {
    content += `: ${memory.details}`;
  }
  
  // Add persona-specific context
  if (memory.ticker) {
    content = `${memory.name} (${memory.ticker})`;
  }
  if (memory.reason) {
    content += ` - ${memory.reason}`;
  }
  if (memory.amount) {
    content += ` ($${memory.amount})`;
  }
  if (memory.targetAmount) {
    content += ` - Goal: $${memory.targetAmount}`;
  }
  if (memory.date && memory.type === 'date') {
    content += ` on ${memory.date}`;
  }
  if (memory.person) {
    content += ` (${memory.person})`;
  }
  
  return content;
}

/**
 * Calculate confidence score based on memory usage
 */
function calculateConfidence(memory) {
  // Base confidence from how often referenced
  const referenceBoost = Math.min(0.3, (memory.timesReferenced || 0) * 0.05);
  const baseConfidence = 0.7 + referenceBoost;
  
  // Sentiment affects confidence - explicit sentiments more confident
  const sentimentBoost = memory.sentiment && memory.sentiment !== 'neutral' ? 0.05 : 0;
  
  return Math.min(0.99, baseConfidence + sentimentBoost);
}

/**
 * Get human-readable persona name
 */
function getPersonaName(personaId) {
  const names = {
    'jack-b': 'Ferni',
    'nayan-patel': 'Jack Bogle',
    'peter-john': 'Peter',
    'spend-save': 'Maya',
    'event-planner': 'Jordan',
    'comm-specialist': 'Alex',
  };
  return names[personaId] || 'conversation';
}

/**
 * Extract behavioral patterns from user profile
 * Pulls from multiple data sources to create rich insights
 */
function extractPatternsFromProfile(profile) {
  const patterns = [];
  
  if (!profile) return patterns;
  
  const totalConvos = profile.totalConversations || 1;
  
  // ============================================================================
  // EMOTIONAL PATTERNS - How they tend to feel during conversations
  // ============================================================================
  if (profile.emotionalPatterns?.length > 0) {
    for (const ep of profile.emotionalPatterns.slice(0, 3)) {
      if (ep.pattern) {
        patterns.push({
          id: `ep_${ep.pattern.slice(0, 10)}`,
          pattern: ep.pattern,
          frequency: ep.occurrences || 1,
          examples: ep.examples || [],
          category: 'emotional',
        });
      }
    }
  }
  
  // ============================================================================
  // COMMUNICATION STYLE - How they prefer to communicate
  // ============================================================================
  if (profile.communicationStyle && profile.communicationStyle !== 'unknown') {
    const styleDescriptions = {
      'direct': 'You prefer direct, to-the-point communication',
      'analytical': 'You like detailed analysis and data-driven discussions',
      'warm': 'You appreciate warm, personable conversation',
      'reflective': 'You value thoughtful, reflective exchanges',
      'casual': 'You enjoy casual, relaxed conversations',
      'formal': 'You prefer professional, structured discussions',
    };
    patterns.push({
      id: 'comm_style',
      pattern: styleDescriptions[profile.communicationStyle] || `Prefers ${profile.communicationStyle} communication`,
      frequency: totalConvos,
      examples: [],
      category: 'communication',
    });
  }
  
  // ============================================================================
  // SPEAKING PACE - How fast they like conversations to move
  // ============================================================================
  if (profile.speakingPace && profile.speakingPace !== 'medium') {
    const paceMessages = {
      'fast': 'You think quickly and prefer fast-paced exchanges',
      'slow': 'You appreciate taking time to think things through',
      'variable': 'Your pace varies depending on the topic',
    };
    patterns.push({
      id: 'speaking_pace',
      pattern: paceMessages[profile.speakingPace] || `Prefers ${profile.speakingPace} speaking pace`,
      frequency: totalConvos,
      examples: [],
      category: 'communication',
    });
  }
  
  // ============================================================================
  // HUMOR APPRECIATION - Do they like jokes?
  // ============================================================================
  if (profile.humorAppreciation && profile.humorAppreciation !== 'medium') {
    patterns.push({
      id: 'humor',
      pattern: profile.humorAppreciation === 'high' 
        ? 'You enjoy humor and lighter moments in our conversations' 
        : 'You prefer to keep conversations focused and serious',
      frequency: totalConvos,
      examples: [],
      category: 'communication',
    });
  }
  
  // ============================================================================
  // PREFERRED TOPICS - What they love talking about
  // ============================================================================
  if (profile.preferredTopics?.length > 0) {
    const topTopics = profile.preferredTopics.slice(0, 5);
    patterns.push({
      id: 'preferred_topics',
      pattern: `Topics you love: ${topTopics.join(', ')}`,
      frequency: topTopics.length,
      examples: topTopics,
      category: 'interests',
    });
  }
  
  // ============================================================================
  // AVOID TOPICS - What they don't want to discuss
  // ============================================================================
  if (profile.avoidTopics?.length > 0) {
    patterns.push({
      id: 'avoid_topics',
      pattern: `I know to be careful around certain topics`,
      frequency: profile.avoidTopics.length,
      examples: [], // Don't expose the actual topics
      category: 'boundaries',
    });
  }
  
  // ============================================================================
  // RESPONSE PREFERENCES - What kind of responses work best
  // ============================================================================
  if (profile.responseQuality?.preferences) {
    const prefs = profile.responseQuality.preferences;
    
    if (prefs.likesStories) {
      patterns.push({
        id: 'likes_stories',
        pattern: 'You engage well when I share stories and examples',
        frequency: totalConvos,
        examples: [],
        category: 'engagement',
      });
    }
    
    if (prefs.likesQuestions) {
      patterns.push({
        id: 'likes_questions',
        pattern: 'You appreciate when I ask thoughtful questions',
        frequency: totalConvos,
        examples: [],
        category: 'engagement',
      });
    }
    
    if (prefs.prefersDirectAdvice) {
      patterns.push({
        id: 'direct_advice',
        pattern: 'You prefer direct advice over open-ended exploration',
        frequency: totalConvos,
        examples: [],
        category: 'engagement',
      });
    }
    
    if (prefs.preferredResponseLength) {
      const lengthMessages = {
        'brief': 'You prefer concise, to-the-point responses',
        'moderate': 'You like balanced responses with good detail',
        'lengthy': 'You appreciate thorough, detailed explanations',
      };
      patterns.push({
        id: 'response_length',
        pattern: lengthMessages[prefs.preferredResponseLength],
        frequency: totalConvos,
        examples: [],
        category: 'communication',
      });
    }
    
    if (prefs.highEngagementTopics?.length > 0) {
      patterns.push({
        id: 'high_engagement_topics',
        pattern: `You light up when we discuss: ${prefs.highEngagementTopics.slice(0, 3).join(', ')}`,
        frequency: prefs.highEngagementTopics.length,
        examples: prefs.highEngagementTopics,
        category: 'interests',
      });
    }
  }
  
  // ============================================================================
  // CONVERSATION TIMING - When they prefer to chat
  // ============================================================================
  if (profile.conversationPatterns?.preferences) {
    const convPrefs = profile.conversationPatterns.preferences;
    
    if (convPrefs.preferredTimes?.length > 0) {
      const timeLabel = convPrefs.preferredTimes.includes('morning') ? 'morning' :
                       convPrefs.preferredTimes.includes('evening') ? 'evening' : 
                       convPrefs.preferredTimes[0];
      patterns.push({
        id: 'preferred_time',
        pattern: `You tend to chat most in the ${timeLabel}`,
        frequency: convPrefs.preferredTimes.length,
        examples: [],
        category: 'timing',
      });
    }
    
    if (convPrefs.likesSmallTalkFirst) {
      patterns.push({
        id: 'small_talk',
        pattern: 'You appreciate warming up with small talk before diving in',
        frequency: totalConvos,
        examples: [],
        category: 'communication',
      });
    }
    
    if (convPrefs.prefersQuickConversations) {
      patterns.push({
        id: 'quick_convos',
        pattern: 'You tend to prefer focused, shorter conversations',
        frequency: totalConvos,
        examples: [],
        category: 'timing',
      });
    }
    
    if (convPrefs.avgDuration) {
      const avgMins = Math.round(convPrefs.avgDuration);
      if (avgMins > 0) {
        patterns.push({
          id: 'avg_duration',
          pattern: `Our conversations typically last around ${avgMins} minutes`,
          frequency: totalConvos,
          examples: [],
          category: 'timing',
        });
      }
    }
  }
  
  // ============================================================================
  // VOICE PREFERENCES - Speaking rhythm and tempo
  // ============================================================================
  if (profile.voicePace?.preferences) {
    const vp = profile.voicePace.preferences;
    
    if (vp.preferredTempo) {
      patterns.push({
        id: 'voice_tempo',
        pattern: `You respond best when I match your ${vp.preferredTempo} speaking rhythm`,
        frequency: totalConvos,
        examples: [],
        category: 'voice',
      });
    }
    
    if (vp.recommendedResponseLength) {
      const lengthMsg = {
        'brief': 'I keep my spoken responses short and punchy for you',
        'moderate': 'I aim for balanced responses when we talk',
        'detailed': 'I know you appreciate when I elaborate verbally',
      };
      if (lengthMsg[vp.recommendedResponseLength]) {
        patterns.push({
          id: 'voice_length',
          pattern: lengthMsg[vp.recommendedResponseLength],
          frequency: totalConvos,
          examples: [],
          category: 'voice',
        });
      }
    }
  }
  
  // ============================================================================
  // LIFE STAGE - Where they are in life
  // ============================================================================
  if (profile.lifeStage && profile.lifeStage !== 'unknown') {
    const stageMessages = {
      'student': 'You\'re in a learning and exploration phase of life',
      'early_career': 'You\'re building your career and establishing foundations',
      'mid_career': 'You\'re in a phase of career growth and family building',
      'established': 'You\'re in an established phase with different priorities',
      'pre_retirement': 'You\'re thinking ahead to retirement transitions',
      'retired': 'You\'re in a new chapter focused on what matters most',
      'young_adult': 'You\'re navigating the exciting transition to independence',
      'new_parent': 'Parenthood has added wonderful new dimensions to your life',
    };
    if (stageMessages[profile.lifeStage]) {
      patterns.push({
        id: 'life_stage',
        pattern: stageMessages[profile.lifeStage],
        frequency: 1,
        examples: [],
        category: 'life',
      });
    }
  }
  
  // ============================================================================
  // RELATIONSHIP DEPTH - How well we know each other
  // ============================================================================
  if (profile.relationshipStage) {
    const stageMessages = {
      'stranger': 'We\'re just getting to know each other',
      'getting-started': 'We\'re building the foundation of our relationship',
      'building-trust': 'Trust is growing between us',
      'established': 'We have a solid, established relationship',
      'deep': 'We\'ve developed a deep connection',
    };
    if (stageMessages[profile.relationshipStage]) {
      patterns.push({
        id: 'relationship_stage',
        pattern: stageMessages[profile.relationshipStage],
        frequency: totalConvos,
        examples: [],
        category: 'relationship',
      });
    }
  }
  
  // ============================================================================
  // KEY MOMENTS - Significant interactions we've shared
  // ============================================================================
  if (profile.keyMoments?.length > 0) {
    patterns.push({
      id: 'key_moments',
      pattern: `We've shared ${profile.keyMoments.length} meaningful moment${profile.keyMoments.length > 1 ? 's' : ''} together`,
      frequency: profile.keyMoments.length,
      examples: profile.keyMoments.slice(0, 3).map(m => m.description || m.type),
      category: 'relationship',
    });
  }
  
  // ============================================================================
  // FAMILY CONNECTIONS - People important to them
  // ============================================================================
  if (profile.familyMembers?.length > 0) {
    patterns.push({
      id: 'family_mentioned',
      pattern: `I know about ${profile.familyMembers.length} important ${profile.familyMembers.length === 1 ? 'person' : 'people'} in your life`,
      frequency: profile.familyMembers.length,
      examples: profile.familyMembers.slice(0, 3).map(f => f.name || f.relationship),
      category: 'relationships',
    });
  }
  
  // ============================================================================
  // OPEN THREADS - Topics we need to continue
  // ============================================================================
  if (profile.openThreads?.length > 0) {
    const openCount = profile.openThreads.filter(t => t.status === 'open').length;
    if (openCount > 0) {
      patterns.push({
        id: 'open_threads',
        pattern: `We have ${openCount} conversation${openCount > 1 ? 's' : ''} to continue`,
        frequency: openCount,
        examples: profile.openThreads.slice(0, 3).map(t => t.topic),
        category: 'continuity',
      });
    }
  }
  
  // ============================================================================
  // HUMANIZING STATE - Persona relationship depth
  // ============================================================================
  if (profile.humanizingState) {
    const hs = profile.humanizingState;
    
    // Vulnerability moments shared
    if (hs.vulnerabilityMoments > 0) {
      patterns.push({
        id: 'vulnerability',
        pattern: `I've opened up to you ${hs.vulnerabilityMoments} time${hs.vulnerabilityMoments > 1 ? 's' : ''}`,
        frequency: hs.vulnerabilityMoments,
        examples: [],
        category: 'relationship',
      });
    }
    
    // Stories we've shared
    if (hs.storiesTold?.length > 0) {
      patterns.push({
        id: 'stories_told',
        pattern: `I've shared ${hs.storiesTold.length} personal stor${hs.storiesTold.length === 1 ? 'y' : 'ies'} with you`,
        frequency: hs.storiesTold.length,
        examples: [],
        category: 'relationship',
      });
    }
    
    // Per-persona relationship depth
    if (hs.perPersonaRelationshipStage) {
      const deepRelationships = Object.entries(hs.perPersonaRelationshipStage)
        .filter(([_, stage]) => stage === 'trusted_advisor' || stage === 'friend')
        .map(([persona]) => getPersonaName(persona));
      
      if (deepRelationships.length > 0) {
        patterns.push({
          id: 'deep_persona_bonds',
          pattern: `You have strong bonds with: ${deepRelationships.join(', ')}`,
          frequency: deepRelationships.length,
          examples: deepRelationships,
          category: 'relationship',
        });
      }
    }
  }
  
  // ============================================================================
  // FINANCIAL CONTEXT - Investment experience and concerns
  // ============================================================================
  if (profile.investmentExperience && profile.investmentExperience !== 'unknown') {
    const expMessages = {
      'beginner': 'You\'re newer to investing - I focus on fundamentals',
      'intermediate': 'You have solid investment knowledge',
      'experienced': 'You\'re an experienced investor',
    };
    if (expMessages[profile.investmentExperience]) {
      patterns.push({
        id: 'investment_exp',
        pattern: expMessages[profile.investmentExperience],
        frequency: 1,
        examples: [],
        category: 'knowledge',
      });
    }
  }
  
  if (profile.riskProfile && profile.riskProfile !== 'unknown') {
    const riskMessages = {
      'conservative': 'You prefer stability and lower-risk approaches',
      'moderate': 'You balance growth with reasonable risk management',
      'aggressive': 'You\'re comfortable with higher risk for potential growth',
    };
    if (riskMessages[profile.riskProfile]) {
      patterns.push({
        id: 'risk_profile',
        pattern: riskMessages[profile.riskProfile],
        frequency: 1,
        examples: [],
        category: 'preferences',
      });
    }
  }
  
  // Financial anxiety triggers (be careful not to expose specifics)
  if (profile.financialAnxietyTriggers?.length > 0) {
    patterns.push({
      id: 'financial_sensitivity',
      pattern: 'I\'m mindful of certain financial topics that can feel stressful',
      frequency: profile.financialAnxietyTriggers.length,
      examples: [],
      category: 'boundaries',
    });
  }
  
  // ============================================================================
  // GOALS - What they're working toward
  // ============================================================================
  if (profile.goals?.length > 0) {
    const activeGoals = profile.goals.filter(g => g.status !== 'completed' && g.status !== 'abandoned');
    if (activeGoals.length > 0) {
      patterns.push({
        id: 'active_goals',
        pattern: `You're working toward ${activeGoals.length} goal${activeGoals.length > 1 ? 's' : ''}`,
        frequency: activeGoals.length,
        examples: activeGoals.slice(0, 3).map(g => g.name || g.type),
        category: 'goals',
      });
    }
    
    const completedGoals = profile.goals.filter(g => g.status === 'completed');
    if (completedGoals.length > 0) {
      patterns.push({
        id: 'completed_goals',
        pattern: `You've achieved ${completedGoals.length} goal${completedGoals.length > 1 ? 's' : ''} we discussed`,
        frequency: completedGoals.length,
        examples: completedGoals.slice(0, 3).map(g => g.name || g.type),
        category: 'achievements',
      });
    }
  }
  
  // ============================================================================
  // TOTAL TIME TOGETHER
  // ============================================================================
  if (profile.totalMinutesTalked && profile.totalMinutesTalked > 10) {
    const hours = Math.floor(profile.totalMinutesTalked / 60);
    const mins = profile.totalMinutesTalked % 60;
    const timeStr = hours > 0 ? `${hours} hour${hours > 1 ? 's' : ''}${mins > 0 ? ` and ${mins} minutes` : ''}` : `${mins} minutes`;
    patterns.push({
      id: 'time_together',
      pattern: `We've spent about ${timeStr} in conversation`,
      frequency: totalConvos,
      examples: [],
      category: 'relationship',
    });
  }
  
  return patterns;
}

