# QUANTIX CODE

<div align="center">

![QUANTIX CODE Logo](public/icon.png)

**AI-Powered Desktop Coding Assistant**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Electron](https://img.shields.io/badge/Electron-43.1.1-4281F3?logo=electron)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19.2.7-61DAFB?logo=react)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-4.5.4-3178C6?logo=typescript)](https://www.typescriptlang.org/)

*A sophisticated AI pair programming environment with agentic tool execution, multi-model support, and premium IDE features.*

[Features](#-features) • [Installation](#-installation) • [Architecture](#-architecture) • [Usage](#-usage) • [Configuration](#-configuration) • [Contributing](#-contributing)

</div>

---

## 🌟 Features

### 🤖 Advanced AI Capabilities
- **Multi-Model Support**: Dispatcher v1/v1.2/v2, GPT-5.6 (Luna, Terra, Sol), DeepSeek v4, Kimi k2.7, GLM 5.2
- **Agentic Reasoning**: ReAct-style agent loop with sophisticated state management
- **Tool Calling**: Native and text-fallback tool execution with permission controls
- **Streaming Responses**: Real-time text streaming with configurable delays
- **Context Management**: Smart token budgeting with automatic summarization

### 💻 IDE Features
- **File Management**: Project navigation, file operations, and Git integration
- **Terminal Integration**: Full terminal emulation with xterm and node-pty
- **Code Editor**: Monaco Editor integration with syntax highlighting
- **Live Preview**: Built-in live server for web development
- **Git Operations**: Status, commit, diff, and branch management

### 🎨 Premium UI
- **Modern Design**: Glassmorphism effects, animated backgrounds, smooth transitions
- **Three-Pane Layout**: Conversations, chat/IDE, and activity monitoring
- **Real-time Feedback**: Agent activity tracking, file change monitoring, progress indicators
- **Responsive Interface**: Collapsible sidebars, custom title bar, splash screen

### 🔒 Security & Safety
- **Permission System**: Configurable read/write approvals
- **Security Presets**: Full, user-guided, semi, and default modes
- **Backup System**: Automatic backup before destructive operations
- **Error Recovery**: Retry logic with exponential backoff

---

## 🚀 Installation

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **Git**: For version control features

### Clone Repository
```bash
git clone https://github.com/tribrix23/agentic.git
cd agentic
```

### Install Dependencies
```bash
npm install
cd agentic-mcp-server
npm install
cd ..
```

### Environment Setup
Create a `.env` file in the root directory:
```env
VITE_QUANTIX_API_KEY=your_api_key_here
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_SERVICE_KEY=your_supabase_service_key
```

### Development Mode
```bash
npm start
```

### Build for Production
```bash
npm run make
```

### Build Specific Platforms
```bash
# Windows
npm run make -- --platform=win32

# macOS
npm run make -- --platform=darwin

# Linux
npm run make -- --platform=linux
```

---

## 🏗️ Architecture

### System Overview

```svg
<svg width="800" height="400" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="800" height="400" fill="#0f172a" rx="10"/>
  
  <!-- Main Process -->
  <rect x="50" y="50" width="200" height="300" fill="#1e293b" rx="8" stroke="#3b82f6" stroke-width="2"/>
  <text x="150" y="80" fill="#3b82f6" font-family="Arial" font-size="14" font-weight="bold" text-anchor="middle">Main Process</text>
  <text x="70" y="110" fill="#94a3b8" font-family="Arial" font-size="11">Window Management</text>
  <text x="70" y="130" fill="#94a3b8" font-family="Arial" font-size="11">IPC Handlers</text>
  <text x="70" y="150" fill="#94a3b8" font-family="Arial" font-size="11">File System</text>
  <text x="70" y="170" fill="#94a3b8" font-family="Arial" font-size="11">Terminal (PTY)</text>
  <text x="70" y="190" fill="#94a3b8" font-family="Arial" font-size="11">Git Operations</text>
  <text x="70" y="210" fill="#94a3b8" font-family="Arial" font-size="11">Task Manager</text>
  <text x="70" y="230" fill="#94a3b8" font-family="Arial" font-size="11">Deep Link Auth</text>
  
  <!-- Renderer Process -->
  <rect x="300" y="50" width="200" height="300" fill="#1e293b" rx="8" stroke="#8b5cf6" stroke-width="2"/>
  <text x="400" y="80" fill="#8b5cf6" font-family="Arial" font-size="14" font-weight="bold" text-anchor="middle">Renderer Process</text>
  <text x="320" y="110" fill="#94a3b8" font-family="Arial" font-size="11">React UI</text>
  <text x="320" y="130" fill="#94a3b8" font-family="Arial" font-size="11">Agent Loop</text>
  <text x="320" y="150" fill="#94a3b8" font-family="Arial" font-size="11">Tool System</text>
  <text x="320" y="170" fill="#94a3b8" font-family="Arial" font-size="11">Context Builder</text>
  <text x="320" y="190" fill="#94a3b8" font-family="Arial" font-size="11">Chat Interface</text>
  <text x="320" y="210" fill="#94a3b8" font-family="Arial" font-size="11">File Explorer</text>
  <text x="320" y="230" fill="#94a3b8" font-family="Arial" font-size="11">Activity Monitor</text>
  
  <!-- External Services -->
  <rect x="550" y="50" width="200" height="300" fill="#1e293b" rx="8" stroke="#10b981" stroke-width="2"/>
  <text x="650" y="80" fill="#10b981" font-family="Arial" font-size="14" font-weight="bold" text-anchor="middle">External Services</text>
  <text x="570" y="110" fill="#94a3b8" font-family="Arial" font-size="11">AI API</text>
  <text x="570" y="130" fill="#94a3b8" font-family="Arial" font-size="11">Supabase</text>
  <text x="570" y="150" fill="#94a3b8" font-family="Arial" font-size="11">MCP Server</text>
  <text x="570" y="170" fill="#94a3b8" font-family="Arial" font-size="11">Git Repositories</text>
  <text x="570" y="190" fill="#94a3b8" font-family="Arial" font-size="11">File System</text>
  
  <!-- Arrows -->
  <path d="M 250 200 L 300 200" stroke="#64748b" stroke-width="2" marker-end="url(#arrowhead)"/>
  <path d="M 500 200 L 550 200" stroke="#64748b" stroke-width="2" marker-end="url(#arrowhead)"/>
  
  <!-- Arrow Marker -->
  <defs>
    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#64748b"/>
    </marker>
  </defs>
</svg>
```

### Agent Loop Architecture

```svg
<svg width="800" height="500" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="800" height="500" fill="#0f172a" rx="10"/>
  
  <!-- Title -->
  <text x="400" y="40" fill="#f8fafc" font-family="Arial" font-size="18" font-weight="bold" text-anchor="middle">Agent Loop - ReAct Architecture</text>
  
  <!-- Steps -->
  <!-- Step 1 -->
  <rect x="50" y="80" width="150" height="60" fill="#3b82f6" rx="8"/>
  <text x="125" y="115" fill="white" font-family="Arial" font-size="12" font-weight="bold" text-anchor="middle">1. User Message</text>
  
  <!-- Arrow 1-2 -->
  <path d="M 200 110 L 250 110" stroke="#64748b" stroke-width="2" marker-end="url(#arrowhead)"/>
  
  <!-- Step 2 -->
  <rect x="250" y="80" width="150" height="60" fill="#8b5cf6" rx="8"/>
  <text x="325" y="105" fill="white" font-family="Arial" font-size="12" font-weight="bold" text-anchor="middle">2. Build Context</text>
  <text x="325" y="125" fill="#e0e7ff" font-family="Arial" font-size="10" text-anchor="middle">System + History + Tools</text>
  
  <!-- Arrow 2-3 -->
  <path d="M 400 110 L 450 110" stroke="#64748b" stroke-width="2" marker-end="url(#arrowhead)"/>
  
  <!-- Step 3 -->
  <rect x="450" y="80" width="150" height="60" fill="#10b981" rx="8"/>
  <text x="525" y="105" fill="white" font-family="Arial" font-size="12" font-weight="bold" text-anchor="middle">3. Call LLM</text>
  <text x="525" y="125" fill="#d1fae5" font-family="Arial" font-size="10" text-anchor="middle">Stream Response</text>
  
  <!-- Arrow 3-4 -->
  <path d="M 600 110 L 625 110 L 625 180" stroke="#64748b" stroke-width="2" marker-end="url(#arrowhead)"/>
  
  <!-- Step 4 -->
  <rect x="550" y="180" width="150" height="80" fill="#f59e0b" rx="8"/>
  <text x="625" y="205" fill="white" font-family="Arial" font-size="12" font-weight="bold" text-anchor="middle">4. Parse Response</text>
  <text x="625" y="225" fill="#fef3c7" font-family="Arial" font-size="10" text-anchor="middle">Text → Display</text>
  <text x="625" y="245" fill="#fef3c7" font-family="Arial" font-size="10" text-anchor="middle">Tool Call → Execute</text>
  
  <!-- Arrow 4-5 -->
  <path d="M 550 220 L 450 220" stroke="#64748b" stroke-width="2" marker-end="url(#arrowhead)"/>
  
  <!-- Step 5 -->
  <rect x="250" y="180" width="200" height="80" fill="#ef4444" rx="8"/>
  <text x="350" y="205" fill="white" font-family="Arial" font-size="12" font-weight="bold" text-anchor="middle">5. Tool Execution</text>
  <text x="350" y="225" fill="#fee2e2" font-family="Arial" font-size="10" text-anchor="middle">Check Permissions</text>
  <text x="350" y="245" fill="#fee2e2" font-family="Arial" font-size="10" text-anchor="middle">Execute & Format Result</text>
  
  <!-- Arrow 5-6 -->
  <path d="M 250 220 L 200 220 L 200 300" stroke="#64748b" stroke-width="2" marker-end="url(#arrowhead)"/>
  
  <!-- Step 6 -->
  <rect x="100" y="300" width="200" height="60" fill="#06b6d4" rx="8"/>
  <text x="200" y="325" fill="white" font-family="Arial" font-size="12" font-weight="bold" text-anchor="middle">6. Append to Messages</text>
  <text x="200" y="345" fill="#cffafe" font-family="Arial" font-size="10" text-anchor="middle">Add tool result to context</text>
  
  <!-- Loop back arrow -->
  <path d="M 100 330 L 50 330 L 50 110 L 50 110" stroke="#64748b" stroke-width="2" stroke-dasharray="5,5" marker-end="url(#arrowhead)"/>
  
  <!-- Safety check -->
  <rect x="350" y="350" width="150" height="60" fill="#6366f1" rx="8"/>
  <text x="425" y="375" fill="white" font-family="Arial" font-size="12" font-weight="bold" text-anchor="middle">Safety Check</text>
  <text x="425" y="395" fill="#e0e7ff" font-family="Arial" font-size="10" text-anchor="middle">Max Iterations</text>
  
  <!-- Arrow from step 5 to safety -->
  <path d="M 350 260 L 425 350" stroke="#64748b" stroke-width="2" marker-end="url(#arrowhead)"/>
  
  <!-- Legend -->
  <rect x="600" y="350" width="150" height="100" fill="#1e293b" rx="8"/>
  <text x="675" y="375" fill="#f8fafc" font-family="Arial" font-size="12" font-weight="bold" text-anchor="middle">Legend</text>
  <circle cx="620" cy="395" r="5" fill="#3b82f6"/>
  <text x="635" y="400" fill="#94a3b8" font-family="Arial" font-size="10">User Input</text>
  <circle cx="620" cy="415" r="5" fill="#10b981"/>
  <text x="635" y="420" fill="#94a3b8" font-family="Arial" font-size="10">AI Processing</text>
  <circle cx="620" cy="435" r="5" fill="#ef4444"/>
  <text x="635" y="440" fill="#94a3b8" font-family="Arial" font-size="10">Tool Execution</text>
</svg>
```

### Component Structure

```
src/
├── components/
│   ├── chat/              # Chat interface components
│   │   ├── AgentProgressCard.tsx
│   │   ├── MessageBubble.tsx
│   │   ├── PromptInput.tsx
│   │   ├── ToolApprovalCard.tsx
│   │   └── ...
│   ├── ide/               # IDE-specific components
│   ├── IdeContainer.tsx   # Full IDE view
│   ├── MainContent.tsx    # Main chat/IDE area
│   ├── RightSidebar.tsx   # Activity & tasks
│   ├── Sidebar.tsx        # Conversation list
│   └── TitleBar.tsx       # Custom window title bar
├── lib/
│   ├── agentLoop.ts       # Core agentic reasoning engine
│   ├── aiConfig.ts        # AI configuration management
│   ├── contextBuilder.ts  # Context construction for LLM
│   ├── tools/             # Tool definitions and execution
│   ├── TaskManager.ts     # Background task management
│   └── ...
├── api.ts                 # API layer for LLM communication
├── App.tsx                # Main application component
└── main.ts                # Electron main process
```

---

## 📖 Usage

### Getting Started

1. **Launch the Application**
   ```bash
   npm start
   ```

2. **Authenticate**
   - Click "Log In" to authenticate via deep link
   - The app will open `quantix.devctr.com` for authentication
   - After successful auth, you'll be redirected back to the app

3. **Select a Project**
   - Click "Open Project" in the sidebar
   - Navigate to your project directory
   - The app will detect Git branch and load project structure

### Basic Chat

**Send a Message**: Type your request in the prompt input and press Enter

**Example Prompts**:
- "Create a React component for a user profile card"
- "Debug this function - it's not returning the expected result"
- "Refactor this code to use modern JavaScript patterns"
- "Add unit tests for the authentication module"

### AI Agent Features

**Tool Execution**: The AI can automatically:
- Read and analyze files
- Write and edit code
- Run terminal commands
- Execute Git operations
- Search within files

**Sub-agent Delegation**: For complex tasks, the AI will:
1. Break down the task into smaller sub-tasks
2. Create a todo list with task IDs
3. Delegate each sub-task to specialized sub-agents
4. Monitor progress and consolidate results

**Example Complex Request**:
```
"Build a complete portfolio website with:
- Responsive design using TailwindCSS
- Dark mode toggle
- Project gallery with filtering
- Contact form with validation
- Smooth animations"
```

### IDE Features

**File Operations**:
- Double-click files to open them in Monaco Editor
- Right-click for context menu (rename, delete, show in folder)
- Drag and drop files to reorganize

**Terminal**:
- Click the terminal icon to open the integrated terminal
- Commands run in your project directory
- Supports all standard shell commands

**Git Integration**:
- View Git status in the sidebar
- Stage files with one click
- Commit with custom messages
- View diff before committing

### Configuration

**AI Settings** (Settings → AI Configuration):
- Model selection (Dispatcher, GPT-5.6, DeepSeek, etc.)
- Temperature, Top P, Top K parameters
- Max tokens and context window
- Streaming preferences
- Security presets

**Security Presets**:
- **Full**: Auto-approve all operations
- **User-guided**: Require approval for reads and writes
- **Semi**: Auto-approve reads, require write approval
- **Default**: Balanced approach

---

## 🔧 Configuration

### AI Models

Available models and their capabilities:

| Model | Context Window | Max Tokens | Tools | Streaming | Description |
|-------|---------------|------------|-------|-----------|-------------|
| Dispatcher v1 | 1,000,000 | 32,768 | ✅ | ✅ | Fast responses, large context |
| Dispatcher v1.2 | 1,000,000 | 32,768 | ✅ | ✅ | Balanced speed and capability |
| Dispatcher v2 | 1,000,000 | 32,768 | ✅ | ✅ | Most capable, largest context |
| GPT-5.6 Luna | 128,000 | 32,768 | ✅ | ✅ | GPT-5.6 Luna variant |
| GPT-5.6 Terra | 128,000 | 32,768 | ✅ | ✅ | GPT-5.6 Terra variant |
| GPT-5.6 Sol | 128,000 | 32,768 | ✅ | ✅ | GPT-5.6 Sol variant |
| DeepSeek v4 Flash | 128,000 | 32,768 | ✅ | ✅ | Fast and efficient |
| DeepSeek v4 Pro | 128,000 | 32,768 | ✅ | ✅ | Most capable |
| Kimi k2.7 | 128,000 | 32,768 | ✅ | ✅ | Moonshot AI model |
| GLM 5.2 | 128,000 | 32,768 | ✅ | ✅ | Zhipu AI model |

### Environment Variables

```env
# Required
VITE_QUANTIX_API_KEY=your_api_key_here

# Optional - for Supabase features
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_SERVICE_KEY=your_supabase_service_key
```

### Advanced Configuration

**Custom System Prompt**:
```typescript
// In Settings → AI Configuration
const customPrompt = `You are a specialized expert in [your domain].
Focus on [specific goals].
Use [specific frameworks/patterns].`;
```

**Tool Permissions**:
```typescript
// Configure in aiConfig.ts
const config = {
  autoApproveReads: true,
  autoApproveWrites: false,
  requireApprovalForTerminal: true,
  securityPreset: 'semi'
};
```

---

## 🛠️ Development

### Project Structure

**Main Process** (`src/main.ts`):
- Electron main process entry point
- IPC handlers for file system, terminal, Git
- Window management and deep link handling

**Renderer Process** (`src/App.tsx`):
- React application root
- State management for UI components
- Event handling for agent activities

**Agent Loop** (`src/lib/agentLoop.ts`):
- Core agentic reasoning engine
- Tool execution and permission handling
- Context management and summarization

**Tool System** (`src/lib/tools/`):
- File system tools
- Terminal tools
- Git tools
- Custom tool definitions

### Adding Custom Tools

1. **Define Tool Schema**:
```typescript
// src/lib/tools/definitions/myTool.ts
export const myToolDefinition = {
  name: 'myTool',
  description: 'Description of what the tool does',
  parameters: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: 'Parameter description' }
    },
    required: ['param1']
  }
};
```

2. **Implement Tool Handler**:
```typescript
// src/lib/tools/executor.ts
export async function executeMyTool(params: any) {
  // Tool implementation
  return { success: true, data: 'result' };
}
```

3. **Register Tool**:
```typescript
// src/lib/tools/index.ts
export const toolRegistry = {
  myTool: {
    definition: myToolDefinition,
    executor: executeMyTool
  }
};
```

### Testing

```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Run with coverage
npm run test:coverage
```

### Building

```bash
# Development build
npm run build

# Production build
npm run make

# Platform-specific builds
npm run make -- --platform=win32 --arch=x64
npm run make -- --platform=darwin --arch=x64
npm run make -- --platform=linux --arch=x64
```

---

## 🤝 Contributing

We welcome contributions! Please follow these guidelines:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Commit your changes**: `git commit -m 'Add amazing feature'`
4. **Push to the branch**: `git push origin feature/amazing-feature`
5. **Open a Pull Request**

### Code Style

- Use TypeScript for all new code
- Follow existing code formatting
- Add comments for complex logic
- Update documentation as needed

### Commit Messages

Use conventional commits:
- `feat: Add new feature`
- `fix: Fix bug`
- `docs: Update documentation`
- `refactor: Refactor code`
- `test: Add tests`

---

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

---

## 🙏 Acknowledgments

- **Electron Team** - For the amazing desktop framework
- **React Community** - For the excellent UI library
- **Monaco Editor** - For the powerful code editor
- **Supabase** - For the backend services
- **AI Providers** - For the powerful language models

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/tribrix23/agentic/issues)
- **Discussions**: [GitHub Discussions](https://github.com/tribrix23/agentic/discussions)
- **Email**: tribrix23@gmail.com

---

## 🗺️ Roadmap

### Upcoming Features

- [ ] Multi-language support
- [ ] Collaborative editing
- [ ] Advanced debugging tools
- [ ] Plugin system
- [ ] Cloud sync for conversations
- [ ] Mobile companion app
- [ ] Voice input/output
- [ ] Advanced code analysis
- [ ] Performance profiling
- [ ] Custom theme editor

### Version History

**v1.0.0** (Current)
- Initial release
- Multi-model AI support
- Agentic tool execution
- IDE features
- Terminal integration
- Git operations
- Premium UI

---

<div align="center">

**Built with ❤️ by [John David L. Perez](https://github.com/tribrix23)**

[⬆ Back to Top](#quantix-code)

</div>
