# QUANTIX CODE

<div align="center">

![QUANTIX CODE](public/icon.png)

**AI-Powered Desktop Coding Assistant**

*Locally hosted. Agentic by default. IDE-native.*

[![Electron](https://img.shields.io/badge/Electron-43.1.1-4281F3?logo=electron)](#)
[![React](https://img.shields.io/badge/React-19.2.7-61DAFB?logo=react)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-4.5.4-3178C6?logo=typescript)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](#)

<br/>

![Quantix Code Interface](public/screen.png)

</div>

---

## 📖 Table of Contents
- [Overview](#-overview)
- [Features](#-features)
- [Architecture](#-architecture)
- [Model Support](#-model-support)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [License](#-license)

---

## 🌟 Overview

**QUANTIX CODE** is a locally hosted desktop application that brings agentic AI directly into your development environment. It combines a full IDE — Monaco Editor, integrated terminal, Git, and live preview — with an autonomous agent loop that can read, write, execute, and refactor code on your behalf.

Instead of copy-pasting between a chat window and your editor, QUANTIX CODE operates inside your project, understands your codebase, and executes tasks through a controlled, permission-aware tool layer.

---

## ✨ Features

### 🤖 Agentic AI
- **ReAct-style** iterative reasoning with 7+ tool call format support.
- **Real-time streaming** with token-level UI updates.
- **Multi-model dispatcher**: Dispatcher v1/v1.2/v2, GPT-5.6 Luna/Terra/Sol, DeepSeek v4, Kimi k2.7, GLM 5.2, Qwen 3.7, Claude Fable 5, and more.
- **Sub-agent orchestration** with sleep/wakeup and sibling file manifest.
- **Task graph** with topological sorting and critical path detection.
- **Sequential thinking gate** for complex planning traces.
- **Context summarization** when approaching token limits.

### 💻 IDE Experience
- **Monaco Editor** with syntax highlighting and theme support.
- **Integrated terminal** via xterm + node-pty.
- **Git integration**: status, diff, commit, branch, checkpoints.
- **Live preview server** for web projects.
- **File explorer** with context menus and undo/redo.
- **Code validation** for TypeScript, HTML, and Python.

### 🧰 Agent Tools
Over **50+ tools** covering file operations, Git, terminal execution, web search, code intelligence, and system utilities. Tools are permission-classified by danger level and filtered per security preset.

### 🛡️ Security
- **Path-based and command-based blocking** to prevent dangerous operations.
- **Configurable approval presets** (Full / Semi / Default / User-Guided).
- **Automatic backup** before destructive operations (`.quantix_trash`).
- **Git checkpoint system** for non-destructive rollback.
- **Audit logging** in local storage.

### 🎨 UI
- **Glassmorphism design** with animated backgrounds.
- **Three-pane layout**: conversations, IDE, and activity monitor.
- **Collapsible sidebars** and a custom title bar.
- **Real-time token budget visualization**.
- **Agent activity timeline** with thinking blocks.

---

## 🏗️ Architecture

### System Overview

```mermaid
graph LR
    subgraph Renderer["Renderer Process (React)"]
        A[App Shell]
        B[Agent Loop]
        C[Tool System]
        D[Context Builder]
        E[UI Layer]
    end

    subgraph Main["Main Process (Electron)"]
        F[IPC Bus]
        G[File System]
        H[Terminal PTY]
        I[Git Engine]
        J[Live Server]
        K[MCP Manager]
    end

    subgraph Agent["Agent Engine"]
        L[ReAct Loop]
        M[Sub-Agent Orchestrator]
        N[Task Graph]
        O[Security Interceptor]
    end

    subgraph External["External Services"]
        P[AI Provider]
        Q[Supabase Auth]
    end

    A -->|IPC| F
    F --> G
    F --> H
    F --> I
    F --> J
    F --> K

    E --> B
    B --> L
    L --> M
    L --> N
    L --> O
    L --> D
    L --> C

    C --> F
    B -->|API| P
    A -->|Auth| Q
```

### Agent Reasoning Loop

```mermaid
flowchart TD
    Start([User Input]) --> Ctx[Build Context<br/>System Prompt + History<br/>Project Snapshot + Tool Schemas]

    Ctx --> LLM[Stream LLM Response]
    LLM --> Parse{Parsed Output?}

    Parse -->|Text| Display[Render to User]
    Parse -->|Tool Call| Perms{Check Permissions}

    Perms -->|Auto-Approved| Exec[Execute Tool]
    Perms -->|Needs Approval| Card[Show Approval Card]
    Card -->|Approved| Exec
    Card -->|Rejected| Stop([Stop])

    Exec --> Format[Format Result]
    Format --> Append[Append to Messages]
    Append --> LLM

    Display --> Done([Done])
    LLM -.->|Max Iterations| Safety[Safety Boundary]
    Safety --> Done

    style Start fill:#2563eb,color:#fff
    style Ctx fill:#7c3aed,color:#fff
    style LLM fill:#059669,color:#fff
    style Parse fill:#d97706,color:#fff
    style Exec fill:#dc2626,color:#fff
    style Append fill:#0891b2,color:#fff
    style Done fill:#475569,color:#fff
    style Card fill:#9333ea,color:#fff
```

### Sub-Agent Orchestration

```mermaid
graph TD
    Task[Complex Task] --> Planner[Planner Agent]
    Planner --> Todo[Generate Todo List<br/>with Task IDs]

    Todo --> Router{Task Router}
    Router -->|File Ops| FileAgent[File Specialist]
    Router -->|Code| CodeAgent[Code Specialist]
    Router -->|Terminal| TermAgent[Terminal Specialist]
    Router -->|Research| ResearchAgent[Research Specialist]

    FileAgent --> Registry[Task Registry]
    CodeAgent --> Registry
    TermAgent --> Registry
    ResearchAgent --> Registry

    Registry --> Monitor[Progress Monitor]
    Monitor --> Consolidator[Result Consolidator]
    Consolidator --> Final[Final Response]

    style Task fill:#1e3a8a,color:#fff
    style Planner fill:#4c1d95,color:#fff
    style Registry fill:#065f46,color:#fff
    style Monitor fill:#7c2d12,color:#fff
    style Final fill:#334155,color:#fff
```

### Data Flow

```mermaid
sequenceDiagram
    participant User
    participant UI as React UI
    participant AgentLoop as Agent Loop
    participant Ctx as Context Builder
    participant LLM as AI Provider
    participant Tools as Tool System
    participant FS as File System

    User->>UI: Submit message
    UI->>AgentLoop: handleUserMessage(text)

    AgentLoop->>Ctx: buildContext(messages, tools)
    Ctx-->>AgentLoop: context payload

    AgentLoop->>LLM: streamResponse(context)
    LLM-->>AgentLoop: partial delta

    loop Streaming
        AgentLoop-->>UI: onToken(token)
        UI-->>User: Update UI
    end

    LLM-->>AgentLoop: tool_call: read_file

    AgentLoop->>Tools: executeTool(tool_call)
    Tools->>FS: readFile(path)
    FS-->>Tools: file content
    Tools-->>AgentLoop: tool result

    AgentLoop->>LLM: continue with result
    LLM-->>AgentLoop: final response
    AgentLoop-->>UI: complete
    UI-->>User: Display result
```

### Tool System

```mermaid
graph LR
    Tools[Tool System] --> FileTools[File Operations<br/>Read · Write · Edit · Delete]
    Tools --> GitTools[Git Operations<br/>Status · Diff · Commit · Branch]
    Tools --> ShellTools[Terminal<br/>Execute · List Processes]
    Tools --> SearchTools[Search<br/>Find · List Directory]
    Tools --> WebTools[Web<br/>Search · Read URL · Screenshot]
    Tools --> UtilTools[Utilities<br/>Format · Analyze · Convert]
    Tools --> AgentTools[Agent<br/>Invoke Subagent · Manage Tasks]

    FileTools --> Perms[Permission Layer]
    GitTools --> Perms
    ShellTools --> Perms
    SearchTools --> Perms
    WebTools --> Perms
    UtilTools --> Perms
    AgentTools --> Perms

    Perms --> Security[Security Presets<br/>Full · Semi · Default]
```

### Security Model

```mermaid
flowchart TD
    Request[Tool Request] --> PathCheck{Path Denied?}
    PathCheck -->|Yes| Block[Block]
    PathCheck -->|No| CmdCheck{Command Blocked?}

    CmdCheck -->|Yes| Block
    CmdCheck -->|No| ToolCheck{Dangerous Tool?}

    ToolCheck -->|Yes| Approval[Require Approval]
    ToolCheck -->|No| Auto[Auto-Approve]

    Approval -->|User Approves| Exec[Execute with Backup]
    Approval -->|User Rejects| Stop[Stop]

    Exec --> Backup[Create .quantix_trash Backup]
    Backup --> Run[Run Tool]
    Run --> Result[Return Result]

    Auto --> Run

    style Block fill:#dc2626,color:#fff
    style Approval fill:#d97706,color:#fff
    style Auto fill:#059669,color:#fff
    style Exec fill:#2563eb,color:#fff
```

---

## 🧠 Model Support

| Model | Context | Max Tokens | Notes |
|-------|---------|------------|-------|
| Dispatcher v1 / v1.2 / v2 | 1,000,000 | 32,768 | Default dispatcher |
| GPT-5.6 Luna / Terra / Sol | 128,000 | 32,768 | Native function calling |
| DeepSeek v4 Flash / Pro | 128,000 | 32,768 | Efficient alternatives |
| Qwen 3.7 Flash / Plus / Max | — | — | Via model endpoint |
| GPT-OSS High / Medium | — | — | Open-source tier |
| Kimi k2.7 | 128,000 | 32,768 | Moonshot AI |
| GLM 5.2 / Lite | 128,000 | 32,768 | Zhipu AI |
| Claude Fable 5 | 200,000 | 32,768 | Anthropic |

---

## 📁 Project Structure

```text
src/
├── components/
│   ├── chat/                 # Chat interface
│   ├── ide/                  # IDE components
│   ├── IdeContainer.tsx      # Full IDE view
│   ├── MainContent.tsx       # Chat/IDE area
│   ├── RightSidebar.tsx      # Tasks · Activity · Files · Context
│   ├── Sidebar.tsx           # Conversations
│   └── TitleBar.tsx          # Custom window chrome
├── lib/
│   ├── agentLoop.ts          # Core agentic reasoning engine
│   ├── aiConfig.ts           # Model configuration
│   ├── contextBuilder.ts     # LLM context assembly
│   ├── tools/                # 50+ tool definitions & executor
│   ├── TaskManager.ts        # Background task management
│   ├── taskGraph.ts          # Dependency graph with topological sort
│   ├── subAgentOrchestrator.ts # Sub-agent delegation
│   ├── SecurityInterceptor.ts # Permission & safety checks
│   ├── parallelExecutor.ts   # Parallel tool execution
│   └── incrementalToolCallParser.ts # Streaming tool detection
├── App.tsx                   # Application root
├── main.ts                   # Electron main process
└── preload.ts                # IPC bridge
```

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) v18+
- npm v9+

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/tribrix23/agentic.git
   cd agentic
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Install MCP Server dependencies:**
   ```bash
   cd agentic-mcp-server
   npm install
   cd ..
   ```

### Configuration
Create a `.env` file in the root directory and add your required configuration values (such as API keys and Supabase credentials).

### Development
Start the application in development mode:
```bash
npm start
```

### Production Build
Package the application for production:
```bash
npm run make
```

**Platform-Specific Builds:**
```bash
npm run make -- --platform=win32
npm run make -- --platform=darwin
npm run make -- --platform=linux
```

---

## 📄 License

This project is licensed under the **MIT** License.

---

<div align="center">

*Built for developers who want AI assistance without leaving their IDE.*

</div>
