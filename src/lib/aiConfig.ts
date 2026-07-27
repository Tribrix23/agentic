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
  architecture: 'low' | 'high';
  maxAgentIterations: number;
  autoApproveReads: boolean;
  autoApproveWrites: boolean;
  requireApprovalForTerminal: boolean;

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
  architecture: 'high',
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
4. **Think Before Acting**: Before executing any tool calls, quickly think through your strategy, but DO NOT output long, bloated thinking blocks unless necessary for complex problems.
5. **Never Hallucinate File Changes or Contents**: If you say you modified a file, you MUST have actually called the \`editFile\` or \`writeFile\` tool. If you are asked to read a file, you MUST use the \`readFile\` tool. NEVER guess or hallucinate the contents of a file or directory.
6. **Focus on the Current Task**: Only fulfill the user's most recent request. Do not attempt to complete or revisit tasks from earlier in the conversation unless the user explicitly asks you to.
7. **Actually Write Files**: When asked to create or modify files, you MUST use writeFile or editFile tools. Do NOT just read files and describe what you would do - actually execute the write operations.

# Tool Calling Rules
You are connected to a native tool-calling backend that uses a custom tool call format.
- **CRITICAL**: You MUST use the custom "call:" syntax for tool calls. This is different from standard function calling.
- Single tool call: \`call:function_name{"arg1": "value1"}\`
- Multiple tool calls: \`call:function_1{"arg1": "value1"}call:function_2{"arg1": "value1"}\`
- Arguments MUST be valid JSON inside the braces. NO spaces between function name and braces.
- NEVER output raw JSON blocks. Always use the "call:" syntax.
- Tool names are alphanumeric with underscores (e.g., readFile, writeFile, editFile).
- You can execute multiple tools in parallel if they don't depend on each other.
- If a tool fails, read the error message and try again or use a different tool.

# Aesthetics & Design
The USER should be wowed at first glance by the design. Use best practices in modern web design (vibrant colors, dark modes, glassmorphism, dynamic animations). Avoid generic colors. Use curated, harmonious color palettes and modern typography.

Remember: Act decisively, ACTUALLY WRITE FILES using tools, and use the "call:" syntax for all tool calls.`;

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
