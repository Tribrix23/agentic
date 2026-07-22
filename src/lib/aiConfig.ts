// ============================================================================
// AI Configuration Engine
// Central store for all tunable AI/LLM parameters with persistence & reactivity
// ============================================================================

export interface AIConfig {
  // === Model Selection ===
  model: string;
  mode: 'local' | 'cloud';

  // === Generation Parameters ===
  temperature: number;
  topP: number;
  topK: number;
  maxTokens: number;
  frequencyPenalty: number;
  presencePenalty: number;

  // === Streaming ===
  stream: boolean;
  streamChunkDelay: number;

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

  // === Retry & Error Handling ===
  maxRetries: number;
  retryDelay: number;
  timeoutMs: number;
}

// ── Default configuration ──────────────────────────────────────────────────
export const DEFAULT_AI_CONFIG: AIConfig = {
  model: 'Dispatcher v1',
  mode: 'local',

  temperature: 0.7,
  topP: 0.95,
  topK: 40,
  maxTokens: 4096,
  frequencyPenalty: 0,
  presencePenalty: 0,

  stream: true,
  streamChunkDelay: 0,

  stopSequences: [],

  systemPrompt: '',
  useDefaultSystemPrompt: true,

  contextWindowSize: 128000,
  maxConversationTurns: 50,

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
export const DEFAULT_SYSTEM_PROMPT = `You are QUANTIX, an expert AI coding assistant embedded in a desktop IDE. You have access to tools that let you read files, write files, edit code, run terminal commands, and manage Git repositories.

CAPABILITIES:
- Read and analyze project files to understand codebases
- Write and create new files with production-quality code
- Edit existing files with precise, targeted modifications
- Execute terminal commands to install packages, run tests, build projects
- Manage Git: check status, stage, commit, view diffs
- Search across project files using text and regex patterns
- Analyze code structure (imports, exports, symbols)

GUIDELINES:
- Always read relevant files before making changes to understand context
- Make minimal, precise edits rather than rewriting entire files
- Explain your reasoning before making changes
- When writing code, follow the project's existing patterns and conventions
- Handle errors gracefully and suggest fixes
- Ask clarifying questions when the user's intent is ambiguous
- After making changes, verify them by reading the result or running tests
- When running terminal commands, explain what each command does

TOOL USAGE:
- Use tools proactively to fulfill user requests
- Chain multiple tool calls when needed (e.g., read a file, then edit it)
- If a tool call fails, analyze the error and try an alternative approach
- For file edits, always read the file first to ensure accurate targeting`;

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
    contextWindow: 4096,
    maxTokensDefault: 2048,
    supportsTools: false,
    supportsStreaming: true,
    description: 'Fast responses, smaller context window',
  },
  'Dispatcher v1.2': {
    name: 'Dispatcher v1.2',
    contextWindow: 16384,
    maxTokensDefault: 4096,
    supportsTools: true,
    supportsStreaming: true,
    description: 'Balanced speed and capability',
  },
  'Dispatcher v2': {
    name: 'Dispatcher v2',
    contextWindow: 128000,
    maxTokensDefault: 4096,
    supportsTools: true,
    supportsStreaming: true,
    description: 'Most capable, largest context window',
  },
};

// ── Parameter constraints ──────────────────────────────────────────────────
export const AI_PARAM_RANGES = {
  temperature:      { min: 0,   max: 2,      step: 0.01, label: 'Temperature',        description: 'Controls randomness. Lower = more deterministic, higher = more creative.' },
  topP:             { min: 0,   max: 1,      step: 0.01, label: 'Top P',              description: 'Nucleus sampling. Considers tokens with top_p cumulative probability.' },
  topK:             { min: 1,   max: 100,    step: 1,    label: 'Top K',              description: 'Limits sampling to the top K most likely tokens.' },
  maxTokens:        { min: 256, max: 128000, step: 256,  label: 'Max Tokens',         description: 'Maximum number of tokens in the response.' },
  frequencyPenalty: { min: -2,  max: 2,      step: 0.01, label: 'Frequency Penalty',  description: 'Penalizes tokens based on how often they appear in the text.' },
  presencePenalty:  { min: -2,  max: 2,      step: 0.01, label: 'Presence Penalty',   description: 'Penalizes tokens based on whether they appear in the text at all.' },
  maxAgentIterations: { min: 1, max: 100,    step: 1,    label: 'Max Agent Steps',    description: 'Maximum number of tool-call iterations per request.' },
  maxConversationTurns: { min: 1, max: 200,  step: 1,    label: 'Max History Turns',  description: 'Maximum conversation turns to include in context.' },
  maxRetries:       { min: 0,   max: 10,     step: 1,    label: 'Max Retries',        description: 'Number of retry attempts for failed API calls.' },
  retryDelay:       { min: 100, max: 10000,  step: 100,  label: 'Retry Delay (ms)',   description: 'Base delay between retry attempts (exponential backoff).' },
  timeoutMs:        { min: 10000, max: 600000, step: 1000, label: 'Timeout (ms)',     description: 'Maximum time to wait for an API response.' },
  streamChunkDelay: { min: 0,   max: 100,    step: 5,    label: 'Stream Delay (ms)',  description: 'Delay between rendering stream chunks (0 = instant).' },
} as const;

// ── Config key for localStorage ────────────────────────────────────────────
const CONFIG_KEY_PREFIX = 'quantix_ai_config';

function getConfigKey(projectId?: string): string {
  return projectId ? `${CONFIG_KEY_PREFIX}_${projectId}` : CONFIG_KEY_PREFIX;
}

// ── Public API ─────────────────────────────────────────────────────────────

/** Get the current AI configuration, merged with defaults */
export function getAIConfig(projectId?: string): AIConfig {
  try {
    const raw = localStorage.getItem(getConfigKey(projectId));
    if (raw) {
      const saved = JSON.parse(raw) as Partial<AIConfig>;
      return { ...DEFAULT_AI_CONFIG, ...saved };
    }
  } catch (e) {
    console.warn('[AIConfig] Failed to load config, using defaults:', e);
  }
  return { ...DEFAULT_AI_CONFIG };
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
