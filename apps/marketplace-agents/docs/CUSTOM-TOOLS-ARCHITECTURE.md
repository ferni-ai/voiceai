# Custom Tools Architecture for Marketplace Agents

> **Status:** Draft / Thinking Out Loud  
> **Date:** December 5, 2025

## Overview

This document explores how marketplace agents could define and use custom tools (like stock trading, calendar management, smart home control) while maintaining security and user trust.

---

## Goals

1. **Enable powerful agents** — Agents should be able to do real things (trade stocks, book appointments, control devices)
2. **Maintain security** — Users must explicitly authorize tools, credentials must be secure
3. **Simple for agent creators** — Defining custom tools should be declarative, not require code
4. **Portable** — Tools should work across different brokerages, calendars, etc.

---

## Proposed Architecture

### 1. Tool Definitions in Agent Bundles

Agents can define custom tools in their bundle:

```
agent-bundle/
├── persona.manifest.json
├── tools/
│   ├── _manifest.json         # Tool registry & metadata
│   ├── schemas/
│   │   ├── place-trade.json   # JSON Schema for tool
│   │   └── get-portfolio.json
│   └── prompts/
│       ├── place-trade.md     # How agent should use this tool
│       └── get-portfolio.md
```

### 2. Tool Manifest Structure

```json
{
  "$schema": "https://ferni.ai/schemas/tool-manifest.v1.json",
  "version": "1.0.0",
  "tools": [
    {
      "id": "place-trade",
      "name": "Place Stock Trade",
      "description": "Execute a buy or sell order for stocks",
      
      "category": "trading",
      "risk_level": "high",
      
      "requires": {
        "integration": "broker",
        "permissions": ["trading:execute"],
        "user_confirmation": true
      },
      
      "parameters": {
        "type": "object",
        "properties": {
          "symbol": {
            "type": "string",
            "description": "Stock ticker symbol (e.g., AAPL, GOOGL)"
          },
          "action": {
            "type": "string",
            "enum": ["buy", "sell"],
            "description": "Whether to buy or sell"
          },
          "quantity": {
            "type": "integer",
            "minimum": 1,
            "description": "Number of shares"
          },
          "order_type": {
            "type": "string",
            "enum": ["market", "limit", "stop"],
            "default": "market"
          },
          "limit_price": {
            "type": "number",
            "description": "Price for limit orders"
          }
        },
        "required": ["symbol", "action", "quantity"]
      },
      
      "confirmation": {
        "required": true,
        "prompt": "I'm about to place a {order_type} order to {action} {quantity} shares of {symbol}. Should I proceed?",
        "timeout_seconds": 30
      },
      
      "response": {
        "type": "object",
        "properties": {
          "order_id": { "type": "string" },
          "status": { "type": "string" },
          "filled_price": { "type": "number" },
          "filled_quantity": { "type": "integer" }
        }
      }
    }
  ]
}
```

### 3. Integration System

Tools connect to external services through "integrations":

```json
{
  "integrations": {
    "broker": {
      "display_name": "Stock Broker",
      "description": "Connect your brokerage account to enable trading",
      "providers": [
        {
          "id": "schwab",
          "name": "Charles Schwab",
          "auth_type": "oauth2",
          "oauth_config": {
            "authorization_url": "https://api.schwab.com/oauth/authorize",
            "token_url": "https://api.schwab.com/oauth/token",
            "scopes": ["trading", "account-read"]
          }
        },
        {
          "id": "alpaca",
          "name": "Alpaca",
          "auth_type": "api_key",
          "fields": [
            { "key": "api_key", "label": "API Key", "type": "secret" },
            { "key": "api_secret", "label": "API Secret", "type": "secret" },
            { "key": "paper_trading", "label": "Paper Trading Mode", "type": "boolean", "default": true }
          ]
        },
        {
          "id": "robinhood",
          "name": "Robinhood",
          "auth_type": "oauth2",
          "status": "coming_soon"
        }
      ]
    }
  }
}
```

### 4. Permission Model

```
User
 └── Agent (e.g., "Peter Lynch Stock Picker")
      └── Integration (e.g., "Schwab")
           └── Tool Permissions
                ├── trading:read ✓
                ├── trading:execute ✓ (with confirmation)
                ├── account:read ✓
                └── account:transfer ✗ (not granted)
```

**Permission Levels:**
- `read` — Can view data (portfolio, quotes)
- `execute` — Can take actions (place trades)
- `execute_confirmed` — Can take actions with user confirmation
- `admin` — Can modify settings (rare, highly restricted)

### 5. Confirmation Flow

For high-risk tools, the platform enforces confirmation:

```
Agent: "Based on your strategy, I'd recommend buying 50 shares of AAPL."

[System intercepts tool call]

Moxie (or platform voice): "Just to confirm—you want to buy 50 shares of 
Apple at the current market price of $189.50. That's about $9,475. 
Say 'yes' to confirm or 'no' to cancel."

User: "Yes"

[Platform executes tool with user consent logged]

Agent: "Done! I've placed a market order for 50 shares of AAPL. 
Order ID is #12345. I'll let you know when it fills."
```

### 6. Audit Logging

Every tool invocation is logged:

```json
{
  "event_id": "uuid",
  "timestamp": "2025-12-05T14:30:00Z",
  "user_id": "user_123",
  "agent_id": "peter-lynch-picker",
  "tool_id": "place-trade",
  "integration": "schwab",
  
  "request": {
    "symbol": "AAPL",
    "action": "buy",
    "quantity": 50,
    "order_type": "market"
  },
  
  "confirmation": {
    "required": true,
    "prompted_at": "2025-12-05T14:29:55Z",
    "confirmed_at": "2025-12-05T14:30:00Z",
    "method": "voice"
  },
  
  "response": {
    "order_id": "12345",
    "status": "filled",
    "filled_price": 189.47,
    "filled_quantity": 50
  },
  
  "metadata": {
    "session_id": "session_456",
    "conversation_context": "User asked about tech stocks"
  }
}
```

---

## Security Model

### Credential Storage

```
┌─────────────────────────────────────────────────────────┐
│                    Ferni Platform                        │
│  ┌─────────────────────────────────────────────────┐   │
│  │              Secret Manager (Vault)              │   │
│  │  ┌─────────────┐  ┌─────────────────────────┐  │   │
│  │  │ User Keys   │  │ Integration Tokens      │  │   │
│  │  │ (encrypted) │  │ (encrypted, scoped)     │  │   │
│  │  └─────────────┘  └─────────────────────────┘  │   │
│  └─────────────────────────────────────────────────┘   │
│                          ▲                              │
│                          │ (secure access)              │
│  ┌─────────────────────────────────────────────────┐   │
│  │              Tool Execution Engine               │   │
│  │  - Validates permissions                         │   │
│  │  - Enforces rate limits                          │   │
│  │  - Logs all actions                              │   │
│  │  - Handles confirmations                         │   │
│  └─────────────────────────────────────────────────┘   │
│                          ▲                              │
│                          │                              │
│  ┌─────────────────────────────────────────────────┐   │
│  │                Agent Runtime                     │   │
│  │  (NO direct access to credentials)              │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Key Principles:**
1. Agents NEVER see raw credentials
2. Platform proxies all authenticated requests
3. All tool calls go through permission checks
4. Users can revoke access instantly
5. Audit logs are immutable

### Rate Limiting

```json
{
  "rate_limits": {
    "trading:execute": {
      "per_minute": 5,
      "per_hour": 20,
      "per_day": 50,
      "requires_confirmation_above": 10
    },
    "trading:read": {
      "per_minute": 60,
      "per_hour": 500
    }
  }
}
```

### Risk Controls

```json
{
  "risk_controls": {
    "max_order_value": 10000,
    "max_single_position_percent": 25,
    "allowed_asset_types": ["stocks", "etfs"],
    "blocked_symbols": ["UVXY", "SQQQ"],
    "require_confirmation_above": 1000
  }
}
```

---

## User Experience

### Connecting an Integration

1. User installs agent (e.g., "Peter Lynch Stock Picker")
2. Agent says: "To help you trade, I'll need access to your brokerage. Would you like to connect one?"
3. User: "Yes, connect Schwab"
4. Platform opens Schwab OAuth flow
5. User authorizes in Schwab
6. Platform stores tokens securely
7. Agent: "Perfect! I'm connected to your Schwab account. I can see your portfolio and help you trade."

### Using a Tool

1. User: "Buy some Apple stock"
2. Agent: "I'd suggest 10 shares of AAPL at the current price of $189. Want me to place that order?"
3. User: "Yes"
4. Platform: "Confirming: Buy 10 shares of Apple for approximately $1,890. Say 'yes' to proceed."
5. User: "Yes"
6. Platform executes trade
7. Agent: "Done! Bought 10 shares of AAPL at $189.23. Your order ID is #67890."

### Revoking Access

1. User: "Disconnect my brokerage" or goes to Settings
2. Platform immediately revokes tokens
3. Agent can no longer access trading tools
4. Agent: "I've disconnected your brokerage. I can no longer trade on your behalf."

---

## Implementation Phases

### Phase 1: Read-Only Tools
- Portfolio viewing
- Market data
- News and research
- No financial risk

### Phase 2: Confirmed Write Tools
- Trading with confirmation
- Calendar events with confirmation
- Purchases with confirmation
- All actions require explicit user consent

### Phase 3: Autonomous Tools (Careful!)
- Pre-authorized recurring actions
- Rule-based automation
- Still subject to limits and logging

---

## Agent Creator Guidelines

### DO:
- Define clear tool schemas
- Explain why each tool is needed
- Provide helpful prompts for the agent
- Set appropriate risk levels
- Test thoroughly with paper trading first

### DON'T:
- Request more permissions than needed
- Store credentials in the bundle
- Skip confirmation for financial actions
- Ignore rate limits
- Hide what tools do from users

---

## Example: Trading Agent Bundle

```
peter-lynch-picker/
├── persona.manifest.json
├── identity/
│   ├── biography.md
│   └── system-prompt.md
├── content/
│   ├── behaviors/
│   ├── knowledge/
│   │   ├── stock-picking-philosophy.md
│   │   ├── fundamental-analysis.md
│   │   └── when-to-sell.md
│   └── stories/
├── tools/
│   ├── _manifest.json
│   ├── schemas/
│   │   ├── place-trade.json
│   │   ├── get-portfolio.json
│   │   ├── get-quote.json
│   │   └── screen-stocks.json
│   └── prompts/
│       ├── trading-guidelines.md    # When/how to suggest trades
│       └── risk-management.md       # Position sizing, diversification
└── integrations/
    └── broker.json                  # Broker integration config
```

---

## Open Questions

1. **Who builds the integration adapters?** Platform team? Community? Both?
2. **How do we handle integration failures?** Retry logic, fallbacks?
3. **Should agents be able to define their own risk controls?**
4. **How do we handle different regions/regulations?**
5. **What's the liability model?** Disclaimers, terms of service?

---

## Implementation Phases

See the detailed phase documents:

| Phase | Document | Timeline |
|-------|----------|----------|
| **Phase 0** | [Foundation & Schemas](./phases/PHASE-0-FOUNDATION.md) | 1 week |
| **Phase 1** | [Read-Only Tools](./phases/PHASE-1-READ-ONLY-TOOLS.md) | 2-3 weeks |
| **Phase 2** | [Write Tools + Confirmation](./phases/PHASE-2-WRITE-TOOLS-WITH-CONFIRMATION.md) | 3-4 weeks |
| **Phase 3** | [Full Integration System](./phases/PHASE-3-FULL-INTEGRATION-SYSTEM.md) | 4-6 weeks |

**[→ View Full Roadmap](./phases/README.md)**

---

## Next Steps

1. [ ] Review and approve Phase 0 schemas
2. [ ] Prioritize broker integrations (Alpaca? Schwab?)
3. [ ] Security review of credential storage approach
4. [ ] Define MVP scope (Phase 1 or Phase 2?)
5. [ ] Allocate engineering resources

---

*This is a living document. Feedback welcome!*

