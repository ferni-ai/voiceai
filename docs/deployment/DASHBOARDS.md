# Ferni AI Dashboards

> Internal monitoring dashboards for developers and operators.

## Quick Access

| Dashboard | Local URL | Purpose |
|-----------|-----------|---------|
| **Cognitive Intelligence** | [localhost:5173/cognitive-dashboard.html](http://localhost:5173/cognitive-dashboard.html) | AI reasoning & adaptation monitoring |
| **Persistence Metrics** | [localhost:5173/metrics-dashboard.html](http://localhost:5173/metrics-dashboard.html) | Memory system & Firestore health |
| **Tools Analytics** | [localhost:5173/tools-dashboard.html](http://localhost:5173/tools-dashboard.html) | Tool usage & optimization |

> **Note:** Port depends on your frontend server. Default Vite is 5173, production may differ.

## Dashboard Details

### 1. Cognitive Intelligence Dashboard

**Purpose:** Monitor how the AI thinks and adapts in real-time.

**What it shows:**
- Current reasoning mode (narrative, analytical, empathetic, etc.)
- Detected user cognitive style
- Voice emotion detection + trends
- Response confidence levels
- Performance metrics (latency budgets)
- Active persona quirks

**When to use:**
- Debugging why a persona responded a certain way
- Monitoring cognitive overhead (target: <50ms)
- Testing cognitive adaptation features
- Verifying user style detection accuracy

**Data source:** WebSocket (`ws://localhost:8080/ws/cognitive`) or HTTP polling

---

### 2. Persistence Metrics Dashboard

**Purpose:** Monitor memory system health and session state.

**What it shows:**
- System uptime
- Active sessions count
- Firestore read/write operations
- Memory sync status
- User profile load times
- Error rates

**When to use:**
- Debugging memory issues ("why didn't it remember X?")
- Monitoring Firestore quota usage
- Verifying session persistence
- Tracking performance regressions

**Data source:** HTTP API (`/api/metrics`)

---

### 3. Tools Analytics Dashboard

**Purpose:** Monitor tool usage and optimization.

**What it shows:**
- Total tools available
- Active domains
- Tool invocation frequency
- Optimization status
- Execution times

**When to use:**
- Understanding tool usage patterns
- Debugging tool failures
- Planning tool optimizations
- Capacity planning

**Data source:** HTTP API (`/api/tools`)

---

## API Endpoints

All dashboards connect to the health server (default port 8080):

```bash
# Cognitive state (current snapshot)
curl http://localhost:8080/api/cognitive/state

# Cognitive history (recent events)
curl http://localhost:8080/api/cognitive/history

# Full metrics snapshot
curl http://localhost:8080/api/metrics

# Metrics summary
curl http://localhost:8080/api/metrics/summary

# Active sessions only
curl http://localhost:8080/api/metrics/sessions
```

### WebSocket (Real-time)

```javascript
const ws = new WebSocket('ws://localhost:8080/ws/cognitive');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // data.type: 'initial_state' | 'event' | 'history' | 'heartbeat'
  console.log(data);
};
```

---

## Audience

### These Dashboards Are For:
- **Developers** - Debugging, testing, feature development
- **Operators** - Production monitoring, performance tracking
- **QA** - Verifying persona behavior, regression testing

### These Dashboards Are NOT For:
- **End users** - Too technical, breaks conversational immersion
- **Marketing** - Internal metrics, not user-facing features

---

## User-Facing Cognitive Features

Instead of dashboards, users experience cognitive intelligence through:

1. **Natural Adaptation** - Personas adjust their communication style without announcing it
2. **Memory References** - "Last time we talked about X..." 
3. **Uncertainty Expression** - "I'm not entirely sure, but..."
4. **Relationship Depth** - More personal interactions over time

These are embedded in persona behavior, not separate UI.

---

## Production Deployment

In production, dashboards should be:
- **Protected** - Behind authentication (admin only)
- **Separate** - Not bundled with user-facing frontend
- **Monitored** - Feeding into observability stack (Grafana, DataDog, etc.)

Recommended setup:
```
User Frontend:  https://app.ferni.ai/
Admin Dashboards: https://admin.ferni.ai/dashboards/ (auth required)
```

---

## Local Development

```bash
# Start the backend (health server on port 8080)
npm run dev:agent

# Start the frontend (Vite on port 5173)
cd frontend-typescript && npm run dev

# Open dashboards
open http://localhost:5173/cognitive-dashboard.html
open http://localhost:5173/metrics-dashboard.html
open http://localhost:5173/tools-dashboard.html
```

---

## Troubleshooting

**Dashboard shows "Disconnected":**
1. Ensure backend is running (`npm run dev:agent`)
2. Check health endpoint: `curl http://localhost:8080/health`
3. Check console for WebSocket errors

**No data appearing:**
1. Start a conversation to generate events
2. Use Ctrl+D for demo mode (simulated data)
3. Check API directly: `curl http://localhost:8080/api/cognitive/state`

**WebSocket keeps reconnecting:**
1. Backend may be restarting (normal during dev)
2. Dashboard falls back to HTTP polling after 5 attempts

