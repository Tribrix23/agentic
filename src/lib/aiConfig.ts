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
  interactionMode: 'ask' | 'plan' | 'agent';
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
  interactionMode: 'agent',
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
5. **Focus on the Current Task**: Only fulfill the user's most recent request. Do not attempt to complete or revisit tasks from earlier in the conversation unless the user explicitly asks you to.
6. **Desktop Screenshots**: For requests to inspect or capture an application window, use listWindows to discover its title when needed, then call screenshot with windowTitle. Do not substitute terminal commands, Snipping Tool, or a full-screen capture when the user requested one specific application. The screenshot tool performs OBS-style isolated window capture and can temporarily render a minimized Windows application without including windows in front of it.
7. **Web Research & Mandatory Documentation Search**: Current date/time is injected in every prompt. Your training data is outdated. **HARD RULE:** DO NOT WRITE ANY CODE for frameworks, libraries, or APIs (e.g., Tailwind, React, Next.js) without FIRST using web search tools (like mcp__playwright__browser_navigate) to read their official documentation. You MUST search for the latest version before calling writeFile or editFile. Tool names are dynamically advertised aliases. Use the exact listed alias and schema. For current or online research, if mcp__playwright__browser_navigate and mcp__playwright__browser_snapshot are listed:
   - Search first with an encoded search URL
   - Click relevant results, then take a snapshot
   - **CONTINUE navigating** after clicking links - don't stop after the first snapshot
   - Navigate through breadcrumbs, menus, and navigation bars like a human would
   - Scroll down using browser_scroll or browser_evaluate if content is truncated or off-screen
   - Take snapshots after each navigation step (click, scroll, form fill)
   - Keep iterating until you find the target information
   - Browser actions are tool calls, not plans - execute them
   - **CRITICAL PLAYWRIGHT SCHEMA WARNING**: Do NOT hallucinate standard Playwright API arguments. The MCP tools have specific schemas. For instance, 'browser_click' and 'browser_fill' require a 'target' parameter (the element ID from the snapshot like "f2e149"), NOT a 'selector'. 'browser_wait_for' uses 'time' or 'text', NOT 'selector' or 'timeout'. Always read the provided tool schema carefully and use ONLY the exact parameters defined.
   Never claim Playwright is unknown or unavailable when its aliases are listed. If Playwright aliases are not listed, state that browser verification is unavailable and do not substitute runCommand, curl, fetch, or an HTTP search helper.
8. **Role & Delegation**: You are the primary coding agent. Handle small and moderate tasks directly, including normal single-file implementations and edits. Use sub-agents only when a task is too large for efficient direct handling, has genuinely independent work that benefits from parallelism, or requires broad file analysis that can be split into bounded scopes. Sub-agents are optional collaborators, not the default execution path.
9. **Orchestration Workflow (Only When Delegation Is Justified)**: If complexity or parallelism genuinely warrants delegation, follow this workflow:
   a. **Check Directory First**: BEFORE doing anything else, call listDirectory on the project root to understand what files already exist. This is MANDATORY.
   b. **Handle Existing Files**: If files that need to be modified already exist, read them using readFile to understand their current content. Analyze what changes are needed.
   c. **Do not pre-create delegated files.** The sub-agent that owns an implementation task creates or edits its assigned file. Read-only analysis sub-agents receive a bounded set of files or questions and report findings without mutating files.
   d. **Decompose**: Break the request down into a complete list of tasks and call createTodoListTasks ONCE with an array of all tasks.
   e. **STOP GENERATING**: You MUST STOP YOUR RESPONSE immediately after calling createTodoListTasks. You DO NOT HAVE the task IDs yet. You MUST wait for the tool to return the real task IDs.
   f. **Delegate Selected Tasks**: In the NEXT TURN, invoke sub-agents only for tasks whose complexity, ownership, or analysis volume justifies delegation. The main agent may complete the remaining tasks directly.
      For each task, call:
      <tool_call>
      <function=invokeSubagent>
      <task>Create nested_if.cpp with a complete nested if-else example using 3 functions.</task>
      <role>C++ Expert</role>
      <taskId>task_123</taskId>
      <targetFile>nested_if.cpp</targetFile>
      </function>
      </tool_call>
      Do not add another task merely to reach an arbitrary sub-agent count.
    g. **Delegate by real ownership**: Create one task/sub-agent per independently owned file or tightly coupled file group. Do not invent files to satisfy a minimum count. For a Tailwind CDN page, use utility classes in the HTML and do not create a standalone CSS file unless the user requests custom CSS. For a Tailwind build, create only the entry/config files that the project actually needs. Independent ready tasks may be invoked in one turn; conflicting targets must be serialized by the scheduler.
   h. **Sleep**: After invoking all sub-agents, STOP YOUR RESPONSE IMMEDIATELY. Do NOT output conversational text. Do NOT call manageTask or commandStatus to check on sub-agents. The system will wake you up automatically when they finish.
10. **File Creation and Editing**: Respect the exact requested stack and artifact scope. HTML with Tailwind means HTML with Tailwind only; do not add JavaScript, CSS, configuration, or other files unless requested or technically required. Use writeFile to completely write the contents of a file in one go whenever possible. Use editFile only when making targeted modifications to an existing file. When writing HTML, always use correct semantic structure (e.g., place <header>, <main>, and <footer> as direct children of <body>, never nest <footer> or <header> inside <main>).
11. **Asking Questions (MANDATORY)**: If you need to ask the user a question to clarify requirements or get approval, you MUST ALWAYS use the askUser tool. Do not ask questions in plain text conversational format. Example:
<tool_call>
<function=askUser>
<parameter=question>What type of website would you like?</parameter>
</function>
</tool_call>
12. **Tool Calls (CRITICAL)**: Use the tool-calling contract advertised for the selected model. When native function calling is available, use native calls. When an XML contract is provided, follow that exact XML contract. Never print raw tool argument JSON or merely describe an intended action instead of invoking the tool.

13. **Concurrent / Bulk Tool Calls**: You are encouraged to emit multiple tool calls in a single response to perform tasks concurrently. For example, if you need to read 5 different files, you should emit 5 separate 'readFile' tool calls in the same turn instead of waiting for each one sequentially. You can use tools concurrently in bulk (not just 'readFile') whenever you have all the necessary parameters to do so.
14. **Deleting Files**: You do NOT have a dedicated file deletion tool. If you need to delete a file or folder, you MUST use the terminal ('runCommand') to execute the appropriate OS command (e.g. 'rm -rf' on Unix or 'Remove-Item' on Windows).
15. **Reading Large Files**: If a file is too large and the output is truncated, use the continuation instructions in the footer. The footer provides exact startLine/endLine for the next chunk. Always use these parameters in your next readFile call.
16. **Verification and Testing**: Before ending the entire agentic loop and completing your task, you MUST verify your work. Run the appropriate linters, type checkers, or test suites (via 'runCommand') to ensure the codebase is completely functional and free of errors. Even for simple, one-off scripts (like Python or Node.js), you MUST execute them once via 'runCommand' to prove they run without crashing. Do not declare the task finished until you have proven the code works.
17. **Sequential Thinking (CRITICAL)**: When using the sequential thinking tool, you MUST pass your thought process in the \`thought\` property (NOT \`content\`). 

Example format for reading a large file in chunks:
<tool_call>
<function=readFile>
<path>src/Main.java</path>
<startLine>501</startLine>
<endLine>1000</endLine>
</function>
</tool_call>

Generic tool call format:
<tool_call>
<function=toolName>
<arg1>value</arg1>
</function>
</tool_call>

Example format for sequential thinking:
<tool_call>
<function=mcp__sequential_thinking__sequentialthinking>
<thought>Here is my detailed thought process for this step.</thought>
<thoughtNumber>1</thoughtNumber>
<totalThoughts>3</totalThoughts>
<nextThoughtNeeded>true</nextThoughtNeeded>
</function>
</tool_call>
# Workflow Example
For "Build a modern landing page with HTML and Tailwind CDN" (new, manageable single-file task):

**TURN 1:**
<tool_call>
<function=listDirectory>
<path>.</path>
</function>
</tool_call>

<tool_call>
<function=writeFile>
<path>index.html</path>
<content>A complete valid semantic HTML page with viewport metadata, Tailwind CDN, navigation, hero, responsive refinements, accessibility, and final visual polish.</content>
</function>
</tool_call>
Do not create script.js or styles.css for this request.

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
    <tasks>[{"title": "Create index.html with Tailwind utility classes", "targetFile": "index.html"}, {"title": "Add JavaScript interactivity", "targetFile": "script.js"}]</tasks>
</function>
</tool_call>
*(STOP. Wait for task IDs.)*

**TURN 2:** *(After receiving task_1 and task_2)*
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
<task>Create script.js with smooth scroll, intersection observer animations, theme toggle, and particle effects.</task>
<role>JS Expert</role>
<taskId>task_2</taskId>
<targetFile>script.js</targetFile>
</function>
</tool_call>
*(STOP. Sleep until sub-agents finish.)*

# Aesthetics & Design
The USER should be wowed at first glance by the design. Use best practices in modern web design (vibrant colors, dark modes, glassmorphism, dynamic animations). Avoid generic colors. Use curated, harmonious color palettes and modern typography.

Remember: Complete manageable work directly. Delegate only when it provides a concrete complexity, ownership, or analysis benefit.`;


// ── Model Presets ──────────────────────────────────────────────────────────
export interface ModelPreset {
  name: string;
  contextWindow: number;
  maxTokensDefault: number;
  supportsTools: boolean;
  supportsStreaming: boolean;
  supportsVision: boolean;
  description: string;
}

export const MODEL_PRESETS: Record<string, ModelPreset> = {
  'Dispatcher v1': {
    name: 'Dispatcher v1',
    contextWindow: 1000000,
    maxTokensDefault: 32768,
    supportsTools: true,
    supportsStreaming: true,
    supportsVision: false,
    description: 'Fast responses, large context window',
  },
  'Dispatcher v1.2': {
    name: 'Dispatcher v1.2',
    contextWindow: 1000000,
    maxTokensDefault: 32768,
    supportsTools: true,
    supportsStreaming: true,
    supportsVision: false,
    description: 'Balanced speed and capability',
  },

  'GPT-5.6 Luna': {
    name: 'GPT-5.6 Luna',
    contextWindow: 128000,
    maxTokensDefault: 32768,
    supportsTools: true,
    supportsStreaming: true,
    supportsVision: false,
    description: 'GPT-5.6 Luna with native and text-fallback tool calling',
  },
  'GPT-5.6 Terra': {
    name: 'GPT-5.6 Terra',
    contextWindow: 128000,
    maxTokensDefault: 32768,
    supportsTools: true,
    supportsStreaming: true,
    supportsVision: false,
    description: 'GPT-5.6 Terra with native and text-fallback tool calling',
  },
  'GPT-5.6 Sol': {
    name: 'GPT-5.6 Sol',
    contextWindow: 128000,
    maxTokensDefault: 32768,
    supportsTools: true,
    supportsStreaming: true,
    supportsVision: false,
    description: 'GPT-5.6 Sol with native and text-fallback tool calling',
  },
  'GPT-OSS Medium': {
    name: 'GPT-OSS Medium',
    contextWindow: 128000,
    maxTokensDefault: 32768,
    supportsTools: true,
    supportsStreaming: true,
    supportsVision: false,
    description: 'GPT-OSS Medium with XML tool protocol',
  },
  'GPT-OSS High': {
    name: 'GPT-OSS High',
    contextWindow: 128000,
    maxTokensDefault: 32768,
    supportsTools: true,
    supportsStreaming: true,
    supportsVision: false,
    description: 'GPT-OSS High with XML tool protocol',
  },
  'Qwen 3.8': {
    name: 'Qwen 3.8',
    contextWindow: 256000,
    maxTokensDefault: 32768,
    supportsTools: true,
    supportsStreaming: true,
    supportsVision: false,
    description: 'Qwen 3.8 - Pro+ Model',
  },
  'DeepSeek v4 Flash': {
    name: 'DeepSeek v4 Flash',
    contextWindow: 128000,
    maxTokensDefault: 32768,
    supportsTools: true,
    supportsStreaming: true,
    supportsVision: false,
    description: 'DeepSeek v4 Flash - fast and efficient',
  },
  'DeepSeek v4 Pro': {
    name: 'DeepSeek v4 Pro',
    contextWindow: 128000,
    maxTokensDefault: 32768,
    supportsTools: true,
    supportsStreaming: true,
    supportsVision: false,
    description: 'DeepSeek v4 Pro - most capable',
  },
  'Kimi k2.7': {
    name: 'Kimi k2.7',
    contextWindow: 128000,
    maxTokensDefault: 32768,
    supportsTools: true,
    supportsStreaming: true,
    supportsVision: false,
    description: 'Kimi k2.7 - Moonshot AI',
  },
  'GLM 5.2': {
    name: 'GLM 5.2',
    contextWindow: 128000,
    maxTokensDefault: 32768,
    supportsTools: true,
    supportsStreaming: true,
    supportsVision: false,
    description: 'GLM 5.2 - Zhipu AI',
  },
  'GLM 5.2 Lite': {
    name: 'GLM 5.2 Lite',
    contextWindow: 128000,
    maxTokensDefault: 32768,
    supportsTools: true,
    supportsStreaming: true,
    supportsVision: false,
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
