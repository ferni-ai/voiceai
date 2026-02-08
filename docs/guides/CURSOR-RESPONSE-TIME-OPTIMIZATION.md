# Cursor / Claude Code Response Time Optimization

This doc summarizes what affects response times when using Cursor (and the Cursor IDE browser MCP) and what we can improve in this repo.

---

## 1. What We Don’t Control (Cursor / Browser MCP)

- **Cursor IDE browser plugin** (`cursor-ide-browser` MCP): Source is not in this repo. Tools like `browser_navigate`, `browser_snapshot`, `browser_click` are implemented by Cursor. Their latency depends on Cursor’s runtime and network.
- **Claude API TTFT (time to first token)**: Handled by Anthropic/Bedrock. We can reduce _how much_ we send and _which_ model/region we use (see below).

**Practical tips for browser MCP usage:**

- Prefer `browser_snapshot` over full-page screenshots when you only need structure.
- Use `browser_wait_for` with short, incremental waits (e.g. 1–2s) and re-check instead of one long wait.
- Lock once per sequence (`browser_lock` → actions → `browser_unlock`) to avoid redundant work.

---

## 2. What We Control

### 2.1 Claude API Latency (TTFT)

- **Prompt size**: Shorter system prompts and less context → faster first token. Avoid sending huge files or logs unless needed.
- **Model**: Haiku is fastest; Sonnet/Opus add quality but more latency.
- **Region**: Use the Bedrock region closest to you if you use Bedrock.
- **Prompt caching**: Reuse system prompts so the model can cache; can cut TTFT significantly (see SRE latency advisor).
- **Streaming**: Already default; keep it on for interactive use.

If you use **Bedrock**, enable latency-optimized inference and consider the `global.` model prefix for routing. See the latency-advisor skill or SRE latency plugin docs.

### 2.2 MCP Server Startup and Paths

- **Ferni MCP path**: `.mcp.json` must point at the real server entrypoint. It’s set to:
  - `./apps/cli/src/mcp/ferni-mcp-server.ts`
    A wrong path causes startup failure and retries, which add perceived latency.
- **Startup cost**: The server is run with `npx tsx`, so the first start compiles TypeScript. Subsequent runs in the same session reuse the process. To reduce cold start, you can:
  - Build the CLI and run the compiled JS with `node` instead of `tsx`, or
  - Keep the MCP server running in a long-lived session.

### 2.3 Ferni MCP Tool Handlers

- The Ferni MCP server (`apps/cli/src/mcp/ferni-mcp-server.ts`) uses **sync file I/O** (read/write state and narration queue under `.ferni-mcp/`). No network calls in the tool handlers, so tool execution is fast once the server process is up.

---

## 3. Checklist for Faster Response Times

| Area           | Action                                                                            |
| -------------- | --------------------------------------------------------------------------------- |
| Cursor/context | Keep relevant files and rules; avoid @-mentioning huge logs or build outputs.     |
| API            | Use prompt caching, appropriate model (Haiku for speed), and streaming.           |
| Bedrock        | Enable latency-optimized inference; consider `global.` prefix and nearest region. |
| MCP            | Ensure `.mcp.json` points to `./apps/cli/src/mcp/ferni-mcp-server.ts`.            |
| Browser MCP    | Use snapshots over screenshots where possible; short, incremental waits.          |

---

## 4. References

- **Latency advisor (SRE)**: Use when optimizing Claude API / Bedrock TTFT (e.g. “slow responses”, “TTFT”).
- **Ferni MCP**: `apps/cli/src/mcp/ferni-mcp-server.ts`; state under `.ferni-mcp/`.
- **Voice coding**: `docs/guides/VOICE-CODING.md`.
