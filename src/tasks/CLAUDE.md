# Tasks Module

> **We believe in making AI human, and the decisions we make will reflect that.**

The tasks module provides intelligent, emotion-aware task handling (~9,300 lines) - from micro-tasks (quick natural moments) to domain-specific tasks (advice, finance, habits).

---

## Architecture Level

```
Level 70: tasks/               ← THIS LAYER (Domain)
         ↓ imports from
Level 60: services/
Level 30: memory/
Level 10: config/, utils/, types/
```

**Import rules:** Tasks can import from services, memory, config, utils. It CANNOT import from agents/ or api/.

---

## Directory Structure

```
tasks/
├── index.ts                    # Main exports
├── constants.ts                # Task type constants
├── utils.ts                    # Shared utilities
│
├── task-manager.ts             # 🎯 Central task orchestration
├── task-persistence.ts         # Firestore persistence
├── task-metrics-service.ts     # Task analytics
│
├── agent-task.ts               # Base agent task class
├── intelligent-task.ts         # 🧠 Emotion-aware task wrapper
├── micro-tasks.ts              # Quick natural moments
├── transitions.ts              # Task transition handling
│
├── Domain Tasks                # 📋 Domain-specific tasks
│   ├── advice-tasks.ts         # Advice and guidance
│   ├── communications-tasks.ts # Email/messaging help
│   ├── events-tasks.ts         # Calendar events
│   ├── finance-tasks.ts        # Financial tasks
│   ├── habits-tasks.ts         # Habit coaching tasks
│   ├── relationship-tasks.ts   # Relationship support
│   ├── research-tasks.ts       # Research assistance
│   ├── support-tasks.ts        # Emotional support
│   └── life-events.ts          # Major life events (grief, milestones)
│
├── onboarding.ts               # New user onboarding
│
├── scheduled/                  # ⏰ Scheduled task system
│   └── (recurring tasks, reminders)
│
├── wisdom/                     # 💡 Wisdom database
│   └── (insights, reflections)
│
└── __tests__/                  # Unit tests
```

---

## Key Components

| Component | File | Purpose |
|-----------|------|---------|
| **Task Manager** | `task-manager.ts` | Central orchestration |
| **Intelligent Task** | `intelligent-task.ts` | Emotion-aware wrapper |
| **Micro Tasks** | `micro-tasks.ts` | Quick natural moments |
| **Task Persistence** | `task-persistence.ts` | Firestore storage |
| **Life Events** | `life-events.ts` | Grief, milestones, panic |

---

## Task Hierarchy

```
AgentTask (base)
    ↓
IntelligentTask (emotion-aware)
    ↓
Domain Tasks (advice, finance, habits, etc.)
```

---

## Integration Pattern

```typescript
// ✅ CORRECT - Use task manager
import { getTaskManager } from './tasks/task-manager.js';

const manager = getTaskManager(sessionId);

// Execute with emotional context
const result = await manager.execute({
  taskType: 'advice',
  input: userRequest,
  emotionalContext: {
    mood: 'anxious',
    energyLevel: 0.4,
  },
});
```

```typescript
// ✅ CORRECT - Use intelligent task wrapper
import { IntelligentTask } from './tasks/intelligent-task.js';

const task = new IntelligentTask({
  baseTask: myDomainTask,
  emotionAware: true,
  adaptToMood: true,
});

const result = await task.execute(context);
```

---

## Micro Tasks

Quick, natural moments that feel human:

```typescript
import { getMicroTaskRunner } from './tasks/micro-tasks.js';

const runner = getMicroTaskRunner(sessionId);

// Execute quick moment
await runner.runMicroTask({
  type: 'acknowledge',
  context: 'user shared good news',
});
```

Examples:
- Acknowledgments ("That's wonderful!")
- Quick reflections ("I hear you")
- Natural transitions ("Speaking of which...")

---

## Domain Task Pattern

All domain tasks follow the same pattern:

```typescript
// Example: advice-tasks.ts
export async function executeAdviceTask(
  input: AdviceInput,
  context: TaskContext
): Promise<TaskResult> {
  // 1. Validate input
  // 2. Apply emotional context
  // 3. Execute core logic
  // 4. Format response
  // 5. Persist if needed
}
```

---

## Emotional Context

Tasks adapt to emotional state:

```typescript
const context: TaskContext = {
  userId,
  sessionId,
  emotional: {
    mood: 'anxious',
    energyLevel: 0.4,
    recentEmotions: ['worried', 'uncertain'],
  },
};

// Task adjusts tone, pacing, and content
const result = await financeTask.execute(context);
```

---

## Persistence

Tasks can persist state to Firestore:

```typescript
import { getTaskPersistence } from './tasks/task-persistence.js';

const persistence = getTaskPersistence(userId);

// Save scheduled task
await persistence.scheduleTask({
  type: 'reminder',
  scheduledFor: tomorrow,
  payload: { message: 'Check in about goal' },
});

// Retrieve pending tasks
const pending = await persistence.getPendingTasks();
```

---

## Testing

```bash
# Run all task tests
pnpm vitest run src/tasks/__tests__/

# Test specific domain
pnpm vitest run src/tasks/__tests__/advice-tasks.test.ts
```

---

## Rules

| ✅ Do | ❌ Don't |
|-------|---------|
| Use `IntelligentTask` wrapper | Execute raw tasks without context |
| Pass emotional context | Ignore user's emotional state |
| Use `TaskResult` return type | Return raw data |
| Persist important outcomes | Keep everything in memory |
| Feel conversational | Be formulaic or robotic |

---

## Life Events (Special Handling)

Major life events get special treatment:

| Event | File | Handling |
|-------|------|----------|
| Grief | `life-events.ts` | Extended support, gentle pacing |
| Panic | `life-events.ts` | Grounding exercises, calm tone |
| Milestones | `life-events.ts` | Celebration, reflection |

```typescript
import { handleLifeEvent } from './tasks/life-events.js';

await handleLifeEvent({
  type: 'grief',
  context: {
    loss: 'parent',
    recency: 'recent',
  },
  sessionId,
});
```

---

## Related Docs

- `src/intelligence/CLAUDE.md` - Context builders
- `src/services/superhuman/README.md` - Superhuman capabilities
- `docs/architecture/INTELLIGENT-AGENT-ARCHITECTURE.md`

---

*Last updated: January 2026*
