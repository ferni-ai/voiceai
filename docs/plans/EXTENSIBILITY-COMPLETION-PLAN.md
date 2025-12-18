# Agent Extensibility System - Completion Plan

> **We believe in making AI human, and the decisions we make will reflect that.**

This plan ensures each extensibility feature is fully implemented, integrated, tested, and aligned with Ferni's brand language and design system.

---

## Executive Summary

The extensibility system allows marketplace agents to define custom commands, tools, hooks, themes, and MCP servers. Four features need completion:

| Feature | Backend Status | Frontend Status | Tests | Brand Alignment |
|---------|---------------|-----------------|-------|-----------------|
| **Slash Commands** | ✅ Voice-agent handles `/command` | ❌ No UI | ✅ Unit tests | ❌ Needs UI |
| **Shell Hooks** | ✅ Full implementation | N/A (backend) | ✅ 4 unit tests | ⚠️ Needs integration |
| **after_tool_call Hook** | ✅ Wired in tool-wrapper | N/A (backend) | ❌ Missing | ⚠️ Needs integration |
| **MCP Integration** | ✅ SDK client | ❌ No tool exposure | ❌ Missing | ❌ Needs full flow |

---

## Feature 1: Slash Commands

### Current State
- ✅ `voice-agent.ts:handleSlashCommand()` parses `/command-name key=value` syntax
- ✅ `extensibility-integration.ts:executeCommand()` runs command prompts
- ✅ `command-loader.ts` loads commands from persona bundles
- ❌ No frontend UI to discover/invoke commands
- ❌ No voice-friendly command invocation

### Implementation Plan

#### 1.1 Frontend Command Discovery UI
**File:** `apps/web/src/ui/commands-panel.ui.ts` (NEW)

```
┌─────────────────────────────────────────────┐
│  Commands                              [×]  │
├─────────────────────────────────────────────┤
│  ┌─────────────────────────────────────┐   │
│  │ /daily-check-in                     │   │
│  │ Start your morning reflection       │   │
│  └─────────────────────────────────────┘   │
│  ┌─────────────────────────────────────┐   │
│  │ /weekly-review                      │   │
│  │ Reflect on your week's progress     │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

Design System Requirements:
- Use `var(--color-bg-secondary)` for panel background
- Use `var(--space-md)` for padding
- Use `var(--z-dropdown)` for z-index
- Cards use `var(--radius-lg)` border radius
- Focus states with `var(--color-accent-primary)` outline
- Reduced motion: `@media (prefers-reduced-motion: reduce)`

#### 1.2 Voice-Friendly Command Triggers
**File:** `src/agents/voice-agent.ts`

Add natural language command detection:
```typescript
// "Let's do a daily check-in" → triggers /daily-check-in
// "Start my weekly review" → triggers /weekly-review
```

Brand Language:
- Ferni responds warmly: "Starting your daily check-in... I love these moments of reflection together."
- Never robotic: "Executing command daily-check-in" ❌

#### 1.3 API Endpoint
**File:** `ui-server.js`

```typescript
GET /api/personas/:personaId/commands
// Returns: { commands: BundleCommand[] }

POST /api/personas/:personaId/commands/:commandId/execute
// Body: { args: Record<string, string> }
// Returns: { prompt: string }
```

#### 1.4 Tests Required
**File:** `src/tests/extensibility-commands-integration.test.ts` (NEW)

```typescript
describe('Slash Commands Integration', () => {
  it('should load commands for persona from bundle')
  it('should execute command and return rendered prompt')
  it('should substitute variables in command prompt')
  it('should trigger on_command hook after execution')
  it('should handle command not found gracefully')
});
```

**File:** `apps/web/src/__tests__/commands-panel.test.ts` (NEW)

```typescript
describe('Commands Panel UI', () => {
  it('should display available commands')
  it('should have accessible keyboard navigation')
  it('should show loading state while fetching')
  it('should handle empty command list gracefully')
});
```

### Acceptance Criteria
- [ ] User can see available commands in UI
- [ ] User can invoke commands via voice naturally
- [ ] User can invoke commands via text input `/command`
- [ ] Commands render with persona's voice/style
- [ ] All tests pass
- [ ] UI follows design system tokens
- [ ] Reduced motion support verified

---

## Feature 2: Shell Hooks (Claude Code Style)

### Current State
- ✅ `hooks-loader.ts:executeShellHook()` runs shell commands
- ✅ Environment variables passed: `HOOK_EVENT`, `HOOK_USER_ID`, etc.
- ✅ 4 unit tests in `extensibility.test.ts`
- ❌ No integration test with voice-agent
- ❌ No security documentation
- ⚠️ Timeout handling could be more graceful

### Implementation Plan

#### 2.1 Enhanced Shell Hook Execution
**File:** `src/personas/bundles/hooks-loader.ts`

Add graceful timeout messaging:
```typescript
// On timeout, return warm message instead of error
return {
  success: true,
  prompt: "I took a moment to check something, but it's taking longer than expected. Let's continue our conversation.",
};
```

#### 2.2 Security Documentation
**File:** `docs/extensibility/SHELL-HOOKS-SECURITY.md` (NEW)

Document:
- Only runs in controlled environments (not user-submitted code)
- Command sandboxing recommendations
- Environment variable exposure limits
- Timeout protections

#### 2.3 Integration Testing
**File:** `src/tests/extensibility-hooks-integration.test.ts` (NEW)

```typescript
describe('Shell Hooks Integration', () => {
  describe('session_start shell hook', () => {
    it('should execute shell hook and inject prompt')
    it('should handle timeout gracefully')
    it('should pass environment variables correctly')
    it('should not block agent startup on failure')
  });

  describe('before_tool_call shell hook', () => {
    it('should execute before tool and inject context')
    it('should pass tool name in HOOK_TOOL_NAME env var')
  });
});
```

#### 2.4 Example Bundle
**File:** `src/personas/bundles/ferni/hooks.json`

```json
{
  "session_start": {
    "type": "shell",
    "enabled": true,
    "command": "echo \"Welcome back! It's $(date '+%A')\"",
    "timeout": 3000
  }
}
```

### Acceptance Criteria
- [ ] Shell hooks execute reliably at all lifecycle points
- [ ] Timeout produces warm, brand-aligned message
- [ ] Environment variables documented
- [ ] Integration tests pass
- [ ] Security documentation complete
- [ ] Example hook in Ferni bundle

---

## Feature 3: after_tool_call Hook

### Current State
- ✅ `tool-wrapper.ts` calls `onAfterToolCall()` (fire-and-forget)
- ✅ `extensibility-integration.ts:onAfterToolCall()` executes hook
- ❌ No tests for the integration
- ❌ No example usage in bundles

### Implementation Plan

#### 3.1 Enhanced Tool Result Passing
**File:** `src/tools/utils/tool-wrapper.ts`

Ensure tool result is properly serialized:
```typescript
void onAfterToolCall({
  personaId: ctx.agentId,
  userId: ctx.userId,
  sessionId: ctx.sessionId,
  toolName: toolId,
  toolResult: JSON.stringify(result), // Serialized for shell hooks
});
```

#### 3.2 Use Cases Documentation
**File:** `docs/extensibility/HOOKS.md` (UPDATE)

Add after_tool_call examples:
- Log tool usage for analytics
- Trigger celebration after milestone tool
- Update persona state after habit check-in

#### 3.3 Integration Tests
**File:** `src/tests/extensibility-hooks-integration.test.ts` (UPDATE)

```typescript
describe('after_tool_call hook', () => {
  it('should fire after successful tool execution')
  it('should include tool name and result')
  it('should not block tool response on hook failure')
  it('should execute shell hook with HOOK_TOOL_RESULT env var')
});
```

#### 3.4 Example Hook
**File:** `src/personas/bundles/ferni/hooks.json`

```json
{
  "after_tool_call": {
    "type": "prompt",
    "enabled": true,
    "prompt": "The user just used the {{toolName}} tool. If this represents progress, acknowledge it warmly."
  }
}
```

### Acceptance Criteria
- [ ] after_tool_call fires for all tool executions
- [ ] Tool result available in hook context
- [ ] Hook failure doesn't break tool response
- [ ] Integration tests pass
- [ ] Example in Ferni bundle
- [ ] Documentation updated

---

## Feature 4: MCP Integration

### Current State
- ✅ `@modelcontextprotocol/sdk` installed
- ✅ `mcp-loader.ts` connects to stdio/HTTP servers
- ✅ `listMCPTools()` and `callMCPTool()` implemented
- ❌ MCP tools not exposed to LLM
- ❌ No connection lifecycle management
- ❌ No tests
- ❌ No UI for MCP status

### Implementation Plan

#### 4.1 MCP Tools in Builder
**File:** `src/agents/builder.ts` (UPDATE)

```typescript
// In buildTools(), merge MCP tools
const mcpTools = await loadMCPToolsForPersona(personaId);
return [...registryTools, ...localTools, ...mcpTools];
```

**File:** `src/personas/bundles/mcp-integration.ts` (NEW)

```typescript
export async function loadMCPToolsForPersona(personaId: string): Promise<ToolDefinition[]> {
  const bundle = await loadBundleById(personaId);
  const mcpConfig = bundle?.mcpConfig;

  if (!mcpConfig) return [];

  const tools: ToolDefinition[] = [];
  for (const server of getAutoConnectServers(mcpConfig)) {
    const connection = await connectToMCPServer(server);
    if (connection.status === 'connected' && connection.tools) {
      for (const tool of connection.tools) {
        tools.push({
          name: `mcp_${server.id}_${tool.name}`,
          description: tool.description,
          parameters: tool.inputSchema,
          execute: async (params) => callMCPTool(server.id, tool.name, params),
        });
      }
    }
  }
  return tools;
}
```

#### 4.2 Connection Lifecycle
**File:** `src/personas/bundles/mcp-loader.ts` (UPDATE)

Add to voice-agent session lifecycle:
```typescript
// On session start: connect to autoConnect servers
// On session end: disconnect all servers
// On persona switch: reconnect for new persona
```

**File:** `src/agents/voice-agent.ts`

```typescript
// In session cleanup
await disconnectAllMCPServers();
```

#### 4.3 MCP Status API
**File:** `ui-server.js`

```typescript
GET /api/personas/:personaId/mcp/status
// Returns: { servers: [{ id, status, tools }] }

POST /api/personas/:personaId/mcp/connect/:serverId
// Connects to specific server

POST /api/personas/:personaId/mcp/disconnect/:serverId
// Disconnects from specific server
```

#### 4.4 Frontend MCP Status
**File:** `apps/web/src/ui/mcp-status.ui.ts` (NEW)

Subtle indicator showing MCP connection status:
```
┌────────────────────────┐
│ 🔌 Tools Connected: 3  │
└────────────────────────┘
```

Design System:
- Use `var(--color-semantic-success)` for connected
- Use `var(--color-semantic-error)` for disconnected
- Position in dev panel or settings

#### 4.5 Tests
**File:** `src/tests/extensibility-mcp-integration.test.ts` (NEW)

```typescript
describe('MCP Integration', () => {
  describe('Tool Loading', () => {
    it('should load MCP tools for persona with config')
    it('should skip personas without MCP config')
    it('should prefix tool names with server ID')
  });

  describe('Connection Lifecycle', () => {
    it('should auto-connect on session start')
    it('should disconnect on session end')
    it('should handle connection failures gracefully')
  });

  describe('Tool Execution', () => {
    it('should call MCP tool and return result')
    it('should handle tool execution errors')
  });
});
```

#### 4.6 Example MCP Config
**File:** `src/personas/bundles/ferni/mcp.json` (NEW)

```json
{
  "servers": [
    {
      "id": "local-tools",
      "name": "Ferni Extended Tools",
      "transport": "stdio",
      "command": "node",
      "args": ["./mcp-server.js"],
      "autoConnect": true
    }
  ]
}
```

### Acceptance Criteria
- [ ] MCP tools available to LLM via builder
- [ ] Auto-connect works on session start
- [ ] Disconnect works on session end
- [ ] Tool execution returns results to LLM
- [ ] Connection errors don't crash agent
- [ ] Status visible in dev panel
- [ ] All tests pass

---

## Brand Alignment Checklist

### Voice & Tone
- [ ] Error messages are warm, not technical
- [ ] Success confirmations feel personal
- [ ] Loading states show presence ("I'm getting that ready...")
- [ ] Failures express care ("I ran into a snag, but we can work around it")

### Ferni EQ Integration
For features with user-facing components:
- [ ] Consider micro-expression triggers on command success
- [ ] Active listening during command execution
- [ ] Anticipatory emotion when user types "/"

### Design System Compliance
- [ ] All colors use CSS variables from tokens
- [ ] Spacing uses MA scale (`--space-*`)
- [ ] Z-index uses semantic tokens (`--z-*`)
- [ ] Animations respect reduced motion
- [ ] Focus states on all interactive elements

---

## Testing Strategy

### Unit Tests (per feature)
Located in: `src/personas/bundles/__tests__/extensibility.test.ts`
- Test pure functions in isolation
- Mock external dependencies
- Fast execution (< 100ms each)

### Integration Tests
Located in: `src/tests/extensibility-*-integration.test.ts`
- Test feature with real dependencies
- Use test personas/bundles
- Verify end-to-end flows

### E2E Tests
Located in: `src/tests/extensibility-e2e.test.ts` (NEW)
- Test voice-agent with extensibility features
- Verify user-facing behavior
- Test error recovery

### Coverage Requirements
- Unit: 80% coverage on new code
- Integration: Key paths tested
- E2E: Happy path + error handling

---

## Implementation Order

1. **Phase 1: Shell Hooks Complete** (1-2 hours)
   - Add integration tests
   - Add graceful timeout messaging
   - Document security considerations

2. **Phase 2: after_tool_call Complete** (1 hour)
   - Add integration tests
   - Add example hook to Ferni
   - Update documentation

3. **Phase 3: MCP Full Flow** (3-4 hours)
   - Wire MCP tools into builder
   - Add connection lifecycle management
   - Add status API and dev panel indicator
   - Add integration tests

4. **Phase 4: Slash Commands UI** (3-4 hours)
   - Create commands panel UI
   - Add API endpoints
   - Add voice-friendly triggers
   - Add frontend tests

5. **Phase 5: E2E Testing & Polish** (2 hours)
   - Write E2E test suite
   - Verify brand alignment
   - Final design system audit

---

## Files to Create/Modify

### New Files
```
apps/web/src/ui/commands-panel.ui.ts
apps/web/src/ui/mcp-status.ui.ts
apps/web/src/__tests__/commands-panel.test.ts
src/personas/bundles/mcp-integration.ts
src/tests/extensibility-commands-integration.test.ts
src/tests/extensibility-hooks-integration.test.ts
src/tests/extensibility-mcp-integration.test.ts
src/tests/extensibility-e2e.test.ts
docs/extensibility/SHELL-HOOKS-SECURITY.md
docs/extensibility/HOOKS.md (update)
```

### Modified Files
```
src/agents/voice-agent.ts (session lifecycle)
src/agents/builder.ts (MCP tool loading)
src/personas/bundles/hooks-loader.ts (timeout messaging)
src/personas/bundles/mcp-loader.ts (lifecycle)
src/tools/utils/tool-wrapper.ts (result serialization)
ui-server.js (API endpoints)
src/personas/bundles/ferni/hooks.json (examples)
src/personas/bundles/ferni/mcp.json (example)
```

---

## Success Metrics

- [ ] All 4 features fully implemented
- [ ] 40+ new tests passing
- [ ] Zero TypeScript errors
- [ ] Zero ESLint errors
- [ ] Design system audit passes
- [ ] Documentation complete
- [ ] Example usage in Ferni bundle
