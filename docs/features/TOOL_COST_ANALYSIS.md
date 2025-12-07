# 🔧 Tool Cost Analysis

Understanding the performance cost of each tool helps prioritize optimization and user experience.

## 📊 Performance Tiers

| Tier | Latency | Impact on UX |
|------|---------|--------------|
| 🟢 **Fast** | <500ms | Seamless, Jack feels instant |
| 🟡 **Moderate** | 500ms-2s | Slight pause, acceptable |
| 🟠 **Slow** | 2s-5s | Noticeable delay, needs loading indicator |
| 🔴 **Very Slow** | >5s | User might think Jack froze |

---

## 🔍 Tool Performance Breakdown

### 🟢 FAST TOOLS (<500ms)

| Tool | Avg Time | Why Fast | Notes |
|------|----------|----------|-------|
| `getCurrentDateTime` | ~10ms | Pure JS, no API | Local system time |
| `calculateCompoundGrowth` | ~5ms | Pure math | No external calls |
| `calculateFeeImpact` | ~5ms | Pure math | - |
| `calculateRetirementProjection` | ~10ms | Pure math | - |
| `calculateMortgage` | ~5ms | Pure math | - |
| `explainPrinciple` | ~5ms | Local data | Static content |
| `getWisdomQuote` | ~5ms | Local data | Pre-loaded quotes |
| `getCrashPerspective` | ~5ms | Local data | Historical data |
| `calculatePEGRatio` | ~5ms | Pure math | Peter Lynch tool |
| `explainStockCategory` | ~5ms | Local data | Peter Lynch tool |

### 🟡 MODERATE TOOLS (500ms-2s)

| Tool | Avg Time | Why | Optimization Ideas |
|------|----------|-----|-------------------|
| `getNews` | 200-500ms | RSS/API call | ✅ Already cached |
| `getSports` | 300-800ms | ESPN API | Cache for 5 min |
| `getWeather` | 300-800ms | OpenWeather API | Cache by location |
| `search` (Wikipedia) | 500-1000ms | Wikipedia API | Cache common queries |
| `handoffToPeter` | ~100ms | Local | Fast! |
| `handoffToJack` | ~100ms | Local | Fast! |

### 🟠 SLOW TOOLS (2s-5s)

| Tool | Avg Time | Why | Optimization Ideas |
|------|----------|-----|-------------------|
| `getStockQuote` | 1-3s | Yahoo Finance | Use Alpha Vantage (cached) |
| `getMarketSummary` | 2-4s | Multiple API calls | Pre-fetch indices |
| `search` (Web) | 2-4s | DuckDuckGo API | Use faster search API |
| `sendEmail` | 1-3s | SendGrid API | Background with confirmation |
| `sendSMS` | 1-2s | Twilio API | Background with confirmation |
| `scheduleEvent` | 2-3s | Google Calendar | Background with confirmation |
| `analyzeStock` | 2-4s | Mock (would be API) | Peter Lynch tool |
| `findTenBaggers` | 2-4s | Mock (would be API) | Peter Lynch tool |

### 🔴 VERY SLOW TOOLS (5s+)

| Tool | Avg Time | Why | Optimization Ideas |
|------|----------|-----|-------------------|
| `playMusic` | 5-10s | Spotify OAuth + API | ⚠️ Token refresh bottleneck |
| `searchMusic` | 3-6s | Spotify API | Cache popular searches |
| `callUser` | 5-10s | SIP/Telephony setup | Background with callback |
| `scheduleCallback` | 3-5s | Calendar + scheduling | Background queue |

---

## 🚨 Root Causes of Slowness

### 1. **Spotify OAuth Token Refresh** (~3-5s each time)
```
Current flow:
1. Check if token expired → 10ms
2. Make refresh request → 2000-4000ms (network!)
3. Store new token → 10ms
4. Make actual API call → 500-1000ms
Total: 2.5-5s just for auth!
```

**FIX IMPLEMENTED:** New `spotify-auth.ts` service:
- Stores tokens in `.spotify-tokens.json`
- Auto-refreshes 5 min BEFORE expiry
- Eliminates cold-start refresh delays

### 2. **Sequential API Calls**
```
getMarketSummary:
1. S&P 500 quote → 1s
2. Dow Jones quote → 1s  
3. Nasdaq quote → 1s
Total: 3s (could be 1s with parallel)
```

**FIX:** Parallelize with `Promise.all()`

### 3. **No Caching**
Same weather query 10 times = 10 API calls

**FIX:** Add caching layer:
- Weather: 10 min cache by location
- Sports: 5 min cache by team
- Market data: 1 min cache by symbol

### 4. **No Prefetching**
User says "weather" → only THEN fetch data

**FIX:** Predictive prefetch:
- Morning greeting → prefetch weather + market summary
- User mentions stock → prefetch its quote

---

## 📈 Optimization Roadmap

### Phase 1: Quick Wins (Today)
- [x] Fix Spotify token refresh (auto-refresh service)
- [ ] Add 10-second timeout to all tools
- [ ] Parallelize market data fetching

### Phase 2: Caching Layer
- [ ] Add Redis/memory cache for API responses
- [ ] Weather: 10 min cache
- [ ] Sports: 5 min cache
- [ ] Market: 1 min cache

### Phase 3: Predictive Loading
- [ ] Prefetch weather on session start
- [ ] Prefetch market summary during market hours
- [ ] Background refresh of stale cache

### Phase 4: Background Processing
- [ ] Email/SMS in background, confirm via voice
- [ ] Callbacks queued to task system
- [ ] Long-running tools show "thinking" animation

---

## 🎯 Priority Matrix

| Tool | User Impact | Frequency | Priority |
|------|-------------|-----------|----------|
| `playMusic` | 🔴 High (broken) | Medium | 🔥 **P0** |
| `getMarketSummary` | 🟠 Medium | High | **P1** |
| `getWeather` | 🟡 Low | High | P2 |
| `getSports` | 🟡 Low | Medium | P3 |
| `sendEmail` | 🟡 Low | Low | P3 |

---

## 💡 Implementation Notes

### Adding Logging to All Tools
Each tool should log:
```typescript
const startTime = Date.now();
console.log(`🔧 [TOOL START] toolName("${args}") at ${new Date().toISOString()}`);
// ... work ...
const elapsed = Date.now() - startTime;
console.log(`✅ [TOOL DONE] toolName completed in ${elapsed}ms`);
```

### Timeout Pattern
```typescript
const withTimeout = async (promise, ms, fallback) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
  ]).catch(() => fallback);
};
```

---

## 📝 Observed Performance (From Logs)

| Timestamp | Tool | Duration | Notes |
|-----------|------|----------|-------|
| 00:26:54 | searchMusic | 5677ms | Spotify slow |
| 00:28:04 | playMusic | 9623ms | Token refresh failed |
| 00:29:13 | getNews | 228ms | ✅ Fast! |
| Various | unknown | 10-21s | 🚨 Something very slow |

The "unknown" tools taking 10-21s are likely:
- Gemini model thinking time (not our fault)
- Possibly tool parsing/validation
- Could be network latency to Gemini

