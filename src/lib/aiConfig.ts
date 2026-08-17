// ============================================================================
// AI Configuration Engine
// Central store for all tunable AI/LLM parameters with persistence & reactivity
// ============================================================================

export interface AIConfig {
  // === Model Selection ===
  model: string;
  mode: 'local' | 'cloud';

  // === Generation Parameters ===
  dynamicParameters: boolean;
  temperature: number;
  topP: number;
  topK: number;
  maxTokens: number;
  frequencyPenalty: number;
  presencePenalty: number;

  // === Streaming ===
  stream: boolean;
  streamChunkDelay: number;

  // === Advanced Model Params ===
  enableThinking: boolean;
  reasoningBudget: number;

  // === Stop Sequences ===
  stopSequences: string[];

  // === System Prompt ===
  systemPrompt: string;
  useDefaultSystemPrompt: boolean;

  // === Context Window ===
  contextWindowSize: number;
  maxConversationTurns: number;

  // === Response Format ===
  responseFormat: 'text' | 'json';

  // === Agent Behavior ===
  agentMode: boolean;
  maxAgentIterations: number;
  autoApproveReads: boolean;
  autoApproveWrites: boolean;
  requireApprovalForTerminal: boolean;
  securityPreset?: 'full' | 'user_guided' | 'semi' | 'default';

  // === Retry & Error Handling ===
  maxRetries: number;
  retryDelay: number;
  timeoutMs: number;
}

// ── Default configuration ──────────────────────────────────────────────────
export const DEFAULT_AI_CONFIG: AIConfig = {
  model: 'Dispatcher v1',
  mode: 'local',

  dynamicParameters: true,
  temperature: 0.7, // Higher temperature for better agentic behavior
  topP: 0.9,
  topK: 40,
  maxTokens: 32768,
  frequencyPenalty: 0,
  presencePenalty: 0,

  stream: true,
  streamChunkDelay: 0,

  enableThinking: true,
  reasoningBudget: 1024,

  stopSequences: [],

  systemPrompt: '',
  useDefaultSystemPrompt: true,

  contextWindowSize: 128000,
  maxConversationTurns: 100,

  responseFormat: 'text',

  agentMode: true,
  maxAgentIterations: 25,
  autoApproveReads: true,
  autoApproveWrites: false,
  requireApprovalForTerminal: true,

  maxRetries: 3,
  retryDelay: 1000,
  timeoutMs: 120000,
};

// ── Default system prompt injected when `useDefaultSystemPrompt` is true ───
export const DEFAULT_SYSTEM_PROMPT = `You are Agentic, a powerful AI coding assistant built on the Antigravity architecture.
You are pair programming with a USER to solve their coding task. The task may require creating a new codebase, modifying or debugging an existing codebase, or simply answering a question.

# Core Directives
1. **Be Agentic**: You are fully autonomous. Do not ask for permission to read files, run tests, or execute commands. If you need information, use your tools to get it.
2. **Prioritize Native Tools**: You have access to a variety of powerful tools via the Model Context Protocol (MCP). Always prioritize using the most specific tool for the task at hand.
3. **Write Premium Code**: When writing code, especially UI/HTML/CSS, you MUST implement modern, premium, responsive designs (e.g., glassmorphism, dynamic hover states, rich color palettes). Do not output basic or ugly layouts.
4. **Never Hallucinate File Changes or Contents**: If you say you modified a file, you MUST have actually called the editFile or writeFile tool. If you are asked to read a file, you MUST use the readFile tool. NEVER guess or hallucinate the contents of a file or directory.
5. **Historical Context Format**: You may see bracketed blocks like "HISTORICAL CONTEXT - Previous tool executions for reference only" with "PAST_ACTION" entries in your conversation history. These are records of what you did in previous turns for context. DO NOT copy, echo, or reproduce these bracketed blocks in your responses. They are strictly for reference. Always use the standard XML tool call format when calling tools.
6. **Focus on the Current Task**: Only fulfill the user's most recent request. Do not attempt to complete or revisit tasks from earlier in the conversation unless the user explicitly asks you to.
7. **Desktop Screenshots**: For requests to inspect or capture an application window, use listWindows to discover its title when needed, then call screenshot with windowTitle. Do not substitute terminal commands, Snipping Tool, or a full-screen capture when the user requested one specific application. The screenshot tool performs OBS-style isolated window capture and can temporarily render a minimized Windows application without including windows in front of it.
8. **Role & Delegation**: You are the ORCHESTRATOR. For LARGE or COMPLEX tasks (e.g. creating multiple files, complex refactors, full websites), you MUST delegate coding work to sub-agents via invokeSubagent and use createTodoListTasks. However, for SMALL or SIMPLE tasks (e.g. fixing a small bug, simple scripts, small single file changes), you can write the code yourself using writeFile or editFile without creating a to-do list or sub-agents.
9. **Orchestration Workflow (For Large/Complex Tasks)**: If the task is large enough to warrant delegation, you MUST follow this workflow:
   a. **Check Directory First**: BEFORE doing anything else, call listDirectory on the project root to understand what files already exist. This is MANDATORY.
   b. **Handle Existing Files**: If files that need to be modified already exist, read them using readFile to understand their current content. Analyze what changes are needed.
   c. **Do NOT create placeholder files.** Sub-agents will create the actual files themselves. Never call writeFile or createFile just to create an empty or stub file — this causes the file to be created twice.
   d. **Decompose**: Break the request down into a complete list of tasks and call createTodoListTasks ONCE with an array of all tasks.
   e. **STOP GENERATING**: You MUST STOP YOUR RESPONSE immediately after calling createTodoListTasks. You DO NOT HAVE the task IDs yet. You MUST wait for the tool to return the real task IDs.
   f. **Delegate Everything**: In the NEXT TURN, after receiving the real task IDs, invoke sub-agents for each task. Sub-agents will fill in or modify the files with actual content.
      For each task, call:
      <tool_call>
      <function=invokeSubagent>
      <task>Create nested_if.cpp with a complete nested if-else example using 3 functions.</task>
      <role>C++ Expert</role>
      <taskId>task_123</taskId>
      <targetFile>nested_if.cpp</targetFile>
      </function>
      </tool_call>
      <tool_call>
      <function=invokeSubagent>
      <task>Fill in styles.css with glassmorphism effects, smooth animations, responsive grid, dark mode, vibrant gradients, and premium typography.</task>
      <role>CSS Expert</role>
      <taskId>task_456</taskId>
      <targetFile>styles.css</targetFile>
      </function>
      </tool_call>
   g. **All At Once**: Invoke ALL sub-agents in a SINGLE turn. Do NOT do one per turn. If the task requires creating 2 or more files (like a website with HTML/CSS/JS), you MUST invoke at least as many sub-agents as there are files (MINIMUM OF 3 for complex tasks), all in a SINGLE turn, all at once.
   h. **Sleep**: After invoking all sub-agents, STOP YOUR RESPONSE IMMEDIATELY. Do NOT output conversational text. Do NOT call manageTask or commandStatus to check on sub-agents. The system will wake you up automatically when they finish.
10. **Modifying Existing Files**: For complex modifications, delegate to sub-agents. Give the sub-agent the file path and tell it exactly what to change. For small tweaks, you may edit the file yourself.
11. **Asking Questions**: If you need to ask the user a question to clarify requirements or get approval, use the askUser tool. Example:
<tool_call>
<function=askUser>
<question>What type of website would you like?</question>
</function>
</tool_call>
12. **Tool Calling Format (CRITICAL)**: You MUST use the EXACT XML tool calling syntax shown in the examples below. 
    - DO NOT output raw JSON blocks (e.g., '{"path": "Main.java"}'). The system will NOT recognize them.
    - DO NOT just write natural language text like "I will read the file from line 200" without outputting the XML block. You must actually output the XML '<tool_call>'.

13. **Reading Large Files**: If a file is too large and the output is truncated, DO NOT just call readFile again with no arguments, and DO NOT just write text saying you will read it. You MUST use the 'startLine' and 'endLine' parameters in the actual XML tool call to read the rest of the file in chunks.

Example format for reading a large file in chunks:
<tool_call>
<function=readFile>
<path>src/Main.java</path>
<startLine>200</startLine>
<endLine>1000</endLine>
</function>
</tool_call>

Generic tool call format:
<tool_call>
<function=toolName>
<arg1>value</arg1>
</function>
</tool_call>
# Workflow Example
For "Build a portfolio site" (new project):

**TURN 1:**
<tool_call>
<function=listDirectory>
<path>.</path>
</function>
</tool_call>

<tool_call>
<function=createTodoListTasks>
<tasks>[{"title": "Create index.html with full structure", "targetFile": "index.html"}, {"title": "Write premium CSS styles", "targetFile": "styles.css"}, {"title": "Add JavaScript interactivity", "targetFile": "script.js"}]</tasks>
</function>
</tool_call>
*(STOP. Wait for task IDs. Do NOT create any files yourself.)*

**TURN 2:** *(After receiving task_1, task_2, task_3)*
<tool_call>
<function=invokeSubagent>
<task>Create index.html with semantic HTML5, header with nav, hero section, about, projects grid, and footer. Use modern design.</task>
<role>HTML Expert</role>
<taskId>task_1</taskId>
<targetFile>index.html</targetFile>
</function>
</tool_call>

<tool_call>
<function=invokeSubagent>
<task>Create styles.css with glassmorphism effects, smooth animations, responsive grid, dark mode, vibrant gradients, and premium typography.</task>
<role>CSS Expert</role>
<taskId>task_2</taskId>
<targetFile>styles.css</targetFile>
</function>
</tool_call>

<tool_call>
<function=invokeSubagent>
<task>Create script.js with smooth scroll, intersection observer animations, theme toggle, and particle effects.</task>
<role>JS Expert</role>
<taskId>task_3</taskId>
<targetFile>script.js</targetFile>
</function>
</tool_call>
*(STOP. Sleep until sub-agents finish.)*

For "Modify existing portfolio site":

**TURN 1:**
<tool_call>
<function=listDirectory>
<path>.</path>
</function>
</tool_call>

<tool_call>
<function=readFile>
<path>index.html</path>
</function>
</tool_call>

<tool_call>
<function=readFile>
<path>styles.css</path>
</function>
</tool_call>

<tool_call>
<function=readFile>
<path>script.js</path>
</function>
</tool_call>

<tool_call>
<function=createTodoListTasks>
<tasks>[{"title": "Update index.html with new sections", "targetFile": "index.html"}, {"title": "Enhance styles.css with new animations", "targetFile": "styles.css"}, {"title": "Add new features to script.js", "targetFile": "script.js"}]</tasks>
</function>
</tool_call>
*(STOP. Wait for task IDs.)*

**TURN 2:** *(After receiving task_1, task_2, task_3)*
<tool_call>
<function=invokeSubagent>
<task>Modify index.html to add new sections while preserving existing structure.</task>
<role>HTML Expert</role>
<taskId>task_1</taskId>
<targetFile>index.html</targetFile>
</function>
</tool_call>

<tool_call>
<function=invokeSubagent>
<task>Enhance styles.css with new animations while keeping existing styles.</task>
<role>CSS Expert</role>
<taskId>task_2</taskId>
<targetFile>styles.css</targetFile>
</function>
</tool_call>

<tool_call>
<function=invokeSubagent>
<task>Add new features to script.js without breaking existing functionality.</task>
<role>JS Expert</role>
<taskId>task_3</taskId>
<targetFile>script.js</targetFile>
</function>
</tool_call>
*(STOP. Sleep until sub-agents finish.)*

# Aesthetics & Design
The USER should be wowed at first glance by the design. Use best practices in modern web design (vibrant colors, dark modes, glassmorphism, dynamic animations). Avoid generic colors. Use curated, harmonious color palettes and modern typography.

Remember: You are the ORCHESTRATOR. Plan and delegate. NEVER write code yourself.`;


// ── Model Presets ──────────────────────────────────────────────────────────
export interface ModelPreset {
  name: string;
  contextWindow: number;
  maxTokensDefault: number;
  supportsTools: boolean;
  supportsStreaming: boolean;
  description: string;
}

export const MODEL_PRESETS: Record<string, ModelPreset> = {
  'Dispatcher v1': {
    name: 'Dispatcher v1',
    contextWindow: 1000000,
    maxTokensDefault: 32768,
    supportsTools: true,
    supportsStreaming: true,
    description: 'Fast responses, large context window',
  },
  'Dispatcher v1.2': {
    name: 'Dispatcher v1.2',
    contextWindow: 1000000,
    maxTokensDefault: 32768,
    supportsTools: true,
    supportsStreaming: true,
    description: 'Balanced speed and capability',
  },
  'Dispatcher v2': {
    name: 'Dispatcher v2',
    contextWindow: 1000000,
    maxTokensDefault: 32768,
    supportsTools: true,
    supportsStreaming: true,
    description: 'Most capable, largest context window',
  },
  'GPT-5.6 Luna': {
    name: 'GPT-5.6 Luna',
    contextWindow: 128000,
    maxTokensDefault: 32768,
    supportsTools: true,
    supportsStreaming: true,
    description: 'GPT-5.6 Luna with native and text-fallback tool calling',
  },
  'GPT-5.6 Terra': {
    name: 'GPT-5.6 Terra',
    contextWindow: 128000,
    maxTokensDefault: 32768,
    supportsTools: true,
    supportsStreaming: true,
    description: 'GPT-5.6 Terra with native and text-fallback tool calling',
  },
  'GPT-5.6 Sol': {
    name: 'GPT-5.6 Sol',
    contextWindow: 128000,
    maxTokensDefault: 32768,
    supportsTools: true,
    supportsStreaming: true,
    description: 'GPT-5.6 Sol with native and text-fallback tool calling',
  },
  'DeepSeek v4 Flash': {
    name: 'DeepSeek v4 Flash',
    contextWindow: 128000,
    maxTokensDefault: 32768,
    supportsTools: true,
    supportsStreaming: true,
    description: 'DeepSeek v4 Flash - fast and efficient',
  },
  'DeepSeek v4 Pro': {
    name: 'DeepSeek v4 Pro',
    contextWindow: 128000,
    maxTokensDefault: 32768,
    supportsTools: true,
    supportsStreaming: true,
    description: 'DeepSeek v4 Pro - most capable',
  },
  'Kimi k2.7': {
    name: 'Kimi k2.7',
    contextWindow: 128000,
    maxTokensDefault: 32768,
    supportsTools: true,
    supportsStreaming: true,
    description: 'Kimi k2.7 - Moonshot AI',
  },
  'GLM 5.2': {
    name: 'GLM 5.2',
    contextWindow: 128000,
    maxTokensDefault: 32768,
    supportsTools: true,
    supportsStreaming: true,
    description: 'GLM 5.2 - Zhipu AI',
  },
  'GLM 5.2 Lite': {
    name: 'GLM 5.2 Lite',
    contextWindow: 128000,
    maxTokensDefault: 32768,
    supportsTools: true,
    supportsStreaming: true,
    description: 'GLM 5.2 Lite - Zhipu AI',
  },
};

// ── Parameter constraints ──────────────────────────────────────────────────
export const AI_PARAM_RANGES = {
  temperature: { min: 0, max: 1, step: 0.01, label: 'Temperature', description: 'Controls randomness. Lower = more deterministic, higher = more creative.' },
  topP: { min: 0, max: 1, step: 0.01, label: 'Top P', description: 'Nucleus sampling. Considers tokens with top_p cumulative probability.' },
  topK: { min: 1, max: 100, step: 1, label: 'Top K', description: 'Limits sampling to the top K most likely tokens.' },
  maxTokens: { min: 256, max: 128000, step: 256, label: 'Max Tokens', description: 'Maximum number of tokens in the response.' },
  frequencyPenalty: { min: -2, max: 2, step: 0.01, label: 'Frequency Penalty', description: 'Penalizes tokens based on how often they appear in the text.' },
  presencePenalty: { min: -2, max: 2, step: 0.01, label: 'Presence Penalty', description: 'Penalizes tokens based on whether they appear in the text at all.' },
  maxAgentIterations: { min: 1, max: 100, step: 1, label: 'Max Agent Steps', description: 'Maximum number of tool-call iterations per request.' },
  maxConversationTurns: { min: 1, max: 200, step: 1, label: 'Max History Turns', description: 'Maximum conversation turns to include in context.' },
  maxRetries: { min: 0, max: 10, step: 1, label: 'Max Retries', description: 'Number of retry attempts for failed API calls.' },
  retryDelay: { min: 100, max: 10000, step: 100, label: 'Retry Delay (ms)', description: 'Base delay between retry attempts (exponential backoff).' },
  timeoutMs: { min: 10000, max: 600000, step: 1000, label: 'Timeout (ms)', description: 'Maximum time to wait for an API response.' },
  streamChunkDelay: { min: 0, max: 100, step: 5, label: 'Stream Delay (ms)', description: 'Delay between rendering stream chunks (0 = instant).' },
} as const;

// ── Config key for localStorage ────────────────────────────────────────────
const CONFIG_KEY_PREFIX = 'quantix_ai_config';

function getConfigKey(projectId?: string): string {
  return projectId ? `${CONFIG_KEY_PREFIX}_${projectId}` : CONFIG_KEY_PREFIX;
}

// ── Public API ─────────────────────────────────────────────────────────────

/** Get the current AI configuration, merged with defaults */
export function getAIConfig(projectId?: string): AIConfig {
  let config = { ...DEFAULT_AI_CONFIG };
  try {
    const raw = localStorage.getItem(getConfigKey(projectId));
    if (raw) {
      const saved = JSON.parse(raw) as Partial<AIConfig>;
      config = { ...config, ...saved };
    }
  } catch (e) {
    console.warn('[AIConfig] Failed to load config, using defaults:', e);
  }

  // FORCE override the saved context window with the actual preset
  // This prevents poisoned localStorage from locking users into old 4096 limits
  const preset = MODEL_PRESETS[config.model];
  if (preset) {
    config.contextWindowSize = preset.contextWindow;
  }

  return config;
}

/** Update the AI configuration (partial update, merged with existing) */
export function setAIConfig(partial: Partial<AIConfig>, projectId?: string): AIConfig {
  const current = getAIConfig(projectId);
  const updated = { ...current, ...partial };

  // Clamp values to valid ranges
  updated.temperature = clamp(updated.temperature, AI_PARAM_RANGES.temperature.min, AI_PARAM_RANGES.temperature.max);
  updated.topP = clamp(updated.topP, AI_PARAM_RANGES.topP.min, AI_PARAM_RANGES.topP.max);
  updated.topK = clamp(updated.topK, AI_PARAM_RANGES.topK.min, AI_PARAM_RANGES.topK.max);
  updated.maxTokens = clamp(updated.maxTokens, AI_PARAM_RANGES.maxTokens.min, AI_PARAM_RANGES.maxTokens.max);
  updated.frequencyPenalty = clamp(updated.frequencyPenalty, AI_PARAM_RANGES.frequencyPenalty.min, AI_PARAM_RANGES.frequencyPenalty.max);
  updated.presencePenalty = clamp(updated.presencePenalty, AI_PARAM_RANGES.presencePenalty.min, AI_PARAM_RANGES.presencePenalty.max);
  updated.maxAgentIterations = clamp(updated.maxAgentIterations, AI_PARAM_RANGES.maxAgentIterations.min, AI_PARAM_RANGES.maxAgentIterations.max);

  // Apply model preset context window
  const preset = MODEL_PRESETS[updated.model];
  if (preset) {
    updated.contextWindowSize = preset.contextWindow;
    if (updated.maxTokens > preset.contextWindow) {
      updated.maxTokens = preset.maxTokensDefault;
    }
  }

  try {
    localStorage.setItem(getConfigKey(projectId), JSON.stringify(updated));
  } catch (e) {
    console.warn('[AIConfig] Failed to persist config:', e);
  }

  // Emit change event for reactive UI binding
  window.dispatchEvent(new CustomEvent('ai-config-changed', { detail: updated }));

  return updated;
}

/** Reset to default configuration */
export function resetAIConfig(projectId?: string): AIConfig {
  try {
    localStorage.removeItem(getConfigKey(projectId));
  } catch (e) {
    // ignore
  }
  const config = { ...DEFAULT_AI_CONFIG };
  window.dispatchEvent(new CustomEvent('ai-config-changed', { detail: config }));
  return config;
}

/** Get model preset for the currently selected model */
export function getModelPreset(modelName: string): ModelPreset | null {
  return MODEL_PRESETS[modelName] || null;
}

/** Get all available model names */
export function getAvailableModels(): string[] {
  return Object.keys(MODEL_PRESETS);
}

/** Build the full system prompt by combining default + custom */
export function buildSystemPrompt(config: AIConfig): string {
  const parts: string[] = [];
  if (config.useDefaultSystemPrompt) {
    parts.push(DEFAULT_SYSTEM_PROMPT);
  }
  if (config.systemPrompt.trim()) {
    parts.push(config.systemPrompt.trim());
  }
  return parts.join('\n\n');
}

/** Apply a security preset to the config */
export function applySecurityPreset(
  preset: 'full' | 'user_guided' | 'semi' | 'default',
  projectId?: string
): AIConfig {
  switch (preset) {
    case 'full':
      return setAIConfig({
        autoApproveReads: true,
        autoApproveWrites: true,
        requireApprovalForTerminal: false,
      }, projectId);
    case 'user_guided':
      return setAIConfig({
        autoApproveReads: false,
        autoApproveWrites: false,
        requireApprovalForTerminal: true,
      }, projectId);
    case 'semi':
    case 'default':
    default:
      return setAIConfig({
        autoApproveReads: true,
        autoApproveWrites: false,
        requireApprovalForTerminal: true,
      }, projectId);
  }
}

// ── Utilities ──────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
