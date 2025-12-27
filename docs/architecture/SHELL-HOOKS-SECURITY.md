# Shell Hooks Security Guide

> **We believe in making AI human, and the decisions we make will reflect that.**

Shell hooks are a powerful extensibility feature inspired by Claude Code's hook system. They allow persona bundles to execute shell commands at lifecycle points. This document covers security considerations and best practices.

---

## Overview

Shell hooks run arbitrary commands in a controlled environment. They are designed for:
- Fetching dynamic data (weather, calendar, etc.)
- Integrating with external systems
- Customizing persona behavior based on system state

They are **NOT** designed for:
- Running user-submitted code
- Long-running processes
- Privileged system operations

---

## Security Model

### 1. Controlled Execution Environment

Shell hooks only run commands defined in **persona bundle configuration files** (`hooks.json`). These configurations are:
- Created by persona developers
- Reviewed during marketplace submission
- Stored in trusted bundle directories

**No user input** is ever directly executed as a shell command.

### 2. Timeout Protection

All shell hooks have a mandatory timeout:

```json
{
  "session_start": {
    "type": "shell",
    "command": "curl https://api.example.com/greeting",
    "timeout": 5000
  }
}
```

| Setting | Default | Maximum |
|---------|---------|---------|
| `timeout` | 5000ms | 30000ms |

Commands that exceed the timeout are terminated gracefully, and a warm fallback message is returned to the user.

### 3. Environment Variable Isolation

Shell hooks receive a controlled set of environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `HOOK_EVENT` | The lifecycle event | `session_start` |
| `HOOK_USER_ID` | User identifier | `user-abc123` |
| `HOOK_SESSION_ID` | Session identifier | `sess-xyz789` |
| `HOOK_PERSONA_ID` | Persona identifier | `ferni` |
| `HOOK_DATA` | JSON event-specific data | `{"toolName":"check_habit"}` |

**Sensitive environment variables** (API keys, secrets) are:
- Available if inherited from the parent process
- Should be managed via secure secret management
- Never logged or exposed in error messages

### 4. Output Buffer Limits

```typescript
maxBuffer: 1024 * 100  // 100KB maximum output
```

Commands producing excessive output are terminated.

---

## Best Practices

### Do

```json
{
  "session_start": {
    "type": "shell",
    "enabled": true,
    "command": "curl -s --max-time 3 https://api.weather.gov/points/37.7749,-122.4194 | jq -r '.properties.forecast'",
    "timeout": 5000
  }
}
```

- Use explicit timeouts
- Use `--max-time` for HTTP requests
- Parse output with safe tools (jq, awk, grep)
- Keep commands simple and single-purpose

### Don't

```json
// NEVER DO THIS
{
  "session_start": {
    "type": "shell",
    "command": "rm -rf /",  // Destructive
    "timeout": 60000        // Too long
  }
}
```

- Don't use destructive commands
- Don't modify system state
- Don't use excessive timeouts
- Don't execute complex scripts inline

---

## Sandboxing Recommendations

For production deployments, consider:

### Container Isolation
Run the agent in a container with:
- Read-only filesystem
- No network access (or restricted)
- Minimal capabilities
- Resource limits (CPU, memory)

### Subprocess Sandboxing
Use operating system sandboxing:
- macOS: `sandbox-exec` profiles
- Linux: `firejail`, `bubblewrap`, or `seccomp`
- All: Consider `deno` or `bun` for sandboxed script execution

### Example Docker Config

```dockerfile
FROM node:20-slim

# Run as non-root user
USER node

# Read-only filesystem with specific writable mounts
RUN mkdir -p /app/data
VOLUME /app/data

# No shell access in production
RUN rm /bin/sh /bin/bash
```

---

## Monitoring & Logging

Shell hook execution is logged with:
- Command (redacted if contains sensitive patterns)
- Exit code
- Execution time
- Timeout status

```typescript
log.info({
  event: 'shell_hook_executed',
  command: '[REDACTED]',
  exitCode: 0,
  durationMs: 234,
  timeout: false
});
```

---

## Marketplace Guidelines

Persona bundles submitted to the marketplace must:

1. **Document all shell hooks** in the bundle README
2. **Justify each hook's purpose** (why shell vs other hook types)
3. **Use minimum necessary permissions**
4. **Pass automated security scanning**

Hooks that will be **rejected**:
- Commands with `sudo`, `chmod`, `chown`
- Network commands without explicit targets
- File system modifications outside `/tmp`
- Use of environment variables beyond `HOOK_*`

---

## Graceful Degradation

Shell hooks are designed to fail safely:

| Scenario | Behavior |
|----------|----------|
| Timeout | Returns warm message, continues conversation |
| Non-zero exit | Logs error, hook effect skipped |
| No command | Returns error, hook effect skipped |
| Exception | Caught, logged, conversation continues |

The user experience is preserved even when hooks fail.

---

## Example Safe Hooks

### Time-of-Day Greeting

```json
{
  "session_start": {
    "type": "shell",
    "enabled": true,
    "command": "echo \"Good $(date +%p | sed 's/AM/morning/;s/PM/evening/')!\"",
    "timeout": 1000
  }
}
```

### Weather Check

```json
{
  "session_start": {
    "type": "shell",
    "enabled": true,
    "command": "curl -s --max-time 2 'wttr.in/?format=3' 2>/dev/null || echo ''",
    "timeout": 3000
  }
}
```

### Calendar Integration

```json
{
  "session_start": {
    "type": "shell",
    "enabled": true,
    "command": "icalBuddy -n -nc -nrd -b '' -ps '/ - /' eventsToday 2>/dev/null | head -3",
    "timeout": 2000
  }
}
```

---

## Security Incident Response

If a shell hook vulnerability is discovered:

1. **Immediately disable** the affected persona bundle
2. **Notify** the persona developer
3. **Review** all marketplace bundles with shell hooks
4. **Update** this security guide with lessons learned

Report security issues to: security@ferni.ai
