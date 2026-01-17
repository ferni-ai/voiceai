# Agent Architecture Diagrams

> **Mermaid diagrams for documentation and presentations.**

---

## 1. Developer Workflow

```mermaid
flowchart LR
    subgraph "Developer Machine"
        A[ferni agent init] --> B[Agent Bundle]
        B --> C[ferni agent preview]
        C --> D[Local Testing]
        D --> E[ferni agent publish]
    end
    
    subgraph "Ferni Cloud"
        E --> F[Build Container]
        F --> G[Deploy Cloud Run]
        G --> H[Configure DNS]
        H --> I[Live Agent!]
    end
    
    style A fill:#3d5a45,color:#fff
    style C fill:#3d5a45,color:#fff
    style E fill:#3d5a45,color:#fff
    style I fill:#2980b9,color:#fff
```

---

## 2. Agent Bundle Structure

```mermaid
graph TD
    subgraph "Agent Bundle"
        A[persona.manifest.json] --> B[Configuration]
        
        subgraph "identity/"
            C[system-prompt.md]
            D[biography.md]
        end
        
        subgraph "content/"
            E[behaviors/greetings.json]
            F[behaviors/catchphrases.json]
            G[knowledge/*.md]
        end
        
        subgraph "brand/"
            H[brand.json]
            I[logo.svg]
        end
    end
    
    A --> C
    A --> D
    A --> E
    A --> F
    A --> G
    A --> H
    
    style A fill:#c0392b,color:#fff
    style C fill:#27ae60,color:#fff
    style H fill:#2980b9,color:#fff
```

---

## 3. Voice Conversation Flow

```mermaid
sequenceDiagram
    participant User
    participant Browser
    participant LiveKit
    participant Agent
    participant LLM
    participant TTS

    User->>Browser: Speaks
    Browser->>LiveKit: Audio Stream (WebRTC)
    LiveKit->>Agent: Audio Frames
    Agent->>Agent: Speech-to-Text
    Agent->>LLM: User message + context
    LLM->>Agent: Response text
    Agent->>TTS: Generate speech
    TTS->>Agent: Audio stream
    Agent->>LiveKit: Audio Frames
    LiveKit->>Browser: Audio Stream
    Browser->>User: Plays audio
    
    Note over User,TTS: < 200ms end-to-end latency
```

---

## 4. System Architecture

```mermaid
flowchart TB
    subgraph "User"
        A[Browser]
    end
    
    subgraph "Edge"
        B[CDN / Firebase Hosting]
        C[LiveKit Edge]
    end
    
    subgraph "Ferni Cloud"
        D[API Gateway]
        E[Token Server]
        F[Agent Runtime]
        G[Agent Registry]
    end
    
    subgraph "Services"
        H[LLM Provider]
        I[TTS Provider]
        J[Memory Store]
    end
    
    A -->|Static Assets| B
    A <-->|WebRTC| C
    C <-->|Audio| F
    A -->|REST| D
    D --> E
    D --> G
    F --> H
    F --> I
    F --> J
    
    style F fill:#3d5a45,color:#fff
    style H fill:#9b59b6,color:#fff
    style I fill:#e67e22,color:#fff
```

---

## 5. Local Development

```mermaid
flowchart LR
    subgraph "Your Machine"
        A[Agent Bundle] --> B[Hot Reload Watcher]
        B --> C[Token Server :3001]
        B --> D[Agent Runtime :8080]
        B --> E[Preview Page :3333]
    end
    
    F[Browser] --> E
    F <--> D
    
    style A fill:#27ae60,color:#fff
    style F fill:#3498db,color:#fff
```

---

## 6. Deployment Pipeline

```mermaid
flowchart TD
    A[ferni agent publish] --> B{Validate}
    B -->|Pass| C[Generate Landing Page]
    B -->|Fail| X[Show Errors]
    C --> D[Build Docker Image]
    D --> E[Push to Registry]
    E --> F[Deploy Cloud Run]
    F --> G[Health Check]
    G -->|Pass| H[Configure DNS]
    G -->|Fail| I[Rollback]
    H --> J[Live! 🚀]
    
    style A fill:#3d5a45,color:#fff
    style J fill:#27ae60,color:#fff
    style X fill:#c0392b,color:#fff
    style I fill:#e67e22,color:#fff
```

---

## 7. Multi-Agent Hosting

```mermaid
flowchart TB
    subgraph "Ferni Platform"
        A[agents.ferni.ai]
        
        subgraph "Cloud Run"
            B[career-coach]
            C[wellness-guide]
            D[tutor-bot]
        end
        
        subgraph "Shared Services"
            E[Token Server]
            F[Agent Registry]
            G[Analytics]
        end
    end
    
    H[career-coach.agents.ferni.ai] --> A
    I[wellness-guide.agents.ferni.ai] --> A
    J[tutor-bot.agents.ferni.ai] --> A
    
    A --> B
    A --> C
    A --> D
    
    B --> E
    C --> E
    D --> E
    
    style A fill:#2980b9,color:#fff
    style E fill:#8e44ad,color:#fff
```

---

## 8. Authentication Flow

```mermaid
sequenceDiagram
    participant User
    participant Browser
    participant TokenServer
    participant LiveKit
    participant Agent

    User->>Browser: Visit agent URL
    Browser->>TokenServer: Request token
    TokenServer->>TokenServer: Generate JWT
    TokenServer->>Browser: Return token
    Browser->>LiveKit: Connect with token
    LiveKit->>Agent: Session started
    Agent->>Browser: Ready for conversation
    
    Note over TokenServer: Token includes:<br/>- Room name<br/>- User identity<br/>- Permissions
```

---

## 9. Cost Architecture

```mermaid
flowchart LR
    subgraph "Pay Per Use"
        A[Idle: $0]
        B[Active: ~$0.05/min]
    end
    
    subgraph "Components"
        C[Cloud Run<br/>$0.00002/vCPU-sec]
        D[LiveKit<br/>$0.004/min]
        E[LLM<br/>$0.03/1K tokens]
        F[TTS<br/>$0.01/1K chars]
    end
    
    B --> C
    B --> D
    B --> E
    B --> F
    
    style A fill:#27ae60,color:#fff
    style B fill:#e67e22,color:#fff
```

---

## 10. Scaling Behavior

```mermaid
graph LR
    subgraph "Auto-Scaling"
        A[0 users] --> B[0 instances<br/>$0/hour]
        C[1-5 users] --> D[1 instance<br/>~$0.10/hour]
        E[50 users] --> F[5 instances<br/>~$0.50/hour]
        G[500 users] --> H[50 instances<br/>~$5/hour]
    end
    
    style B fill:#27ae60,color:#fff
    style D fill:#3498db,color:#fff
    style F fill:#e67e22,color:#fff
    style H fill:#c0392b,color:#fff
```

---

## Usage

### In Markdown Docs
```markdown
```mermaid
flowchart LR
    A --> B --> C
```
```

### In GitHub
GitHub renders Mermaid natively in markdown files.

### In Notion
Use the Mermaid embed block.

### Export to PNG/SVG
Use [Mermaid Live Editor](https://mermaid.live/) to export.

---

## Color Palette

| Color | Hex | Use |
|-------|-----|-----|
| Ferni Green | `#3d5a45` | Primary actions, CLI commands |
| Success | `#27ae60` | Completed, success states |
| Info | `#3498db` | Informational nodes |
| Warning | `#e67e22` | Caution, in-progress |
| Error | `#c0392b` | Errors, critical |
| Purple | `#8e44ad` | Services, infrastructure |

---

*Use these diagrams in docs, presentations, and landing pages.*
