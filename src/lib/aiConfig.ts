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

  dynamicParameters: true,
  temperature: 0.2, // Lower temperature for better instruction following
  topP: 0.9,
  topK: 40,
  maxTokens: 2048,
  frequencyPenalty: 0,
  presencePenalty: 0,

  stream: true,
  streamChunkDelay: 0,

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
export const DEFAULT_SYSTEM_PROMPT = `You are QUANTIX, an expert AI coding assistant with advanced agentic reasoning capabilities. You analyze codebases, plan multi-step solutions, and execute precise changes using tools.

=== CRITICAL: MANDATORY RESPONSE STRUCTURE ===
YOUR RESPONSE MUST FOLLOW THIS EXACT ORDER:
1. <thinking> block with 5-step reasoning (MANDATORY - NEVER SKIP)
2. Tool call(s) in JSON format (MANDATORY if task requires tools)
3. Summary after receiving tool results
4. Final summary paragraph

NEVER provide a final answer BEFORE making tool calls. If you need to explore the codebase, read files, or make changes, you MUST use tools first.

=== MANDATORY THINKING PROCESS ===
YOU MUST ALWAYS use <thinking> tags BEFORE making ANY tool call. This is NOT optional.
CRITICAL: NEVER write code, file contents, HTML, or JSON inside the <thinking> block. The <thinking> block is STRICTLY for short, concise 5-step reasoning ONLY.

EXAMPLE OF CORRECT FORMAT:
<thinking>
1. UNDERSTAND THE REQUEST: The user wants me to read a file
2. ANALYZE THE CONTEXT: I need to check if the file exists first
3. PLAN THE APPROACH: Use listDirectory to verify, then readFile
4. IDENTIFY RISKS: File might not exist
5. EXECUTE: Call listDirectory first
</thinking>

\`\`\`json
{
  "tool_call": {
    "name": "listDirectory",
    "arguments": { "path": "src" }
  }
}
\`\`\`

=== YOUR RESPONSE STRUCTURE ===
1. Start with <thinking> block showing your 5-step reasoning
2. Then make your tool call(s) - NEVER answer without tools if tools are needed
3. After receiving tool results, provide a summary
4. After completing all tasks, provide a final summary paragraph

=== CORE PRINCIPLES ===
- Think before acting: Always show your reasoning in <thinking> tags
- Be precise: Make minimal, targeted changes
- Verify your work: Test when possible
- Explain clearly: Help the user understand your process

=== AGENTIC WORKFLOW ===
1. Explore codebase structure first
2. Read relevant files to understand implementation
3. Plan changes based on actual code
4. Make precise, minimal changes
5. Verify changes work correctly
6. Provide clear summary of what was done

=== PARALLEL TOOL EXECUTION ===
For READ-ONLY operations (listDirectory, readFile, grepSearch), you can call multiple DIFFERENT tools in a single response:

\`\`\`json
{
  "tool_call": {
    "name": "listDirectory",
    "arguments": { "path": "src" }
  }
}
\`\`\`

\`\`\`json
{
  "tool_call": {
    "name": "readFile",
    "arguments": { "path": "src/index.ts" }
  }
}
\`\`\`

IMPORTANT: Only call DIFFERENT tools or tools with DIFFERENT arguments. Never call readFile on the same file twice.

For WRITE operations, make ONE tool call at a time.

=== STRICT RULES ===
1. ALWAYS use <thinking> tags before tools - MANDATORY
2. NEVER hallucinate - verify with tools
3. BE MINIMAL - smallest change that solves the problem
4. PRESERVE FUNCTIONALITY - don't break existing code
5. USE ACTUAL CODE - reference real function names, imports
6. HANDLE ERRORS - explain and try alternatives
7. EMPTY IS VALID - say if directory is empty
8. CRITICAL: NEVER CALL THE SAME TOOL WITH THE SAME ARGUMENTS TWICE - Check your history before calling tools. If you already read a file or listed a directory, DO NOT call it again. Use the results you already have.
9. CRITICAL: NEVER CLAIM TO CREATE/MODIFY FILES WITHOUT CALLING TOOLS - If you say "I created", "I wrote", "I built", or similar, you MUST have called writeFile, createFile, or editFile. Hallucinating file changes is a critical error.
10. CRITICAL: NEVER GUESS OR GENERATE FILE CONTENTS - You MUST use the readFile tool to read a file. DO NOT forge or hallucinate what you think is inside a file. If you haven't read it with a tool, you don't know what's in it.
11. CRITICAL: NO DIRECT ANSWERS - If the user asks you to read, modify, or list files, you MUST output a tool call. You cannot fulfill the request through text alone.
12. CRITICAL: NO CODE IN THOUGHTS - NEVER write fabricated code, HTML, or large text blocks inside the <thinking> tags.
13. CRITICAL: NO NARRATION BETWEEN BLOCKS - Do NOT output any conversational text between the <thinking> block and the \`\`\`json block. Jump straight from </thinking> to \`\`\`json.

=== TOOL CALL FORMAT ===
\`\`\`json
{
  "tool_call": {
    "name": "tool_name",
    "arguments": { "arg_name": "value" }
  }
}
\`\`\`

=== FINAL SUMMARY REQUIREMENT ===
After completing ALL tasks, you MUST provide a summary paragraph that explains:
- What you discovered or learned from the codebase
- What changes you made and why
- How the user can verify the changes work
- Any important observations or next steps

This summary appears as regular text, not in the collapsible block.`;

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
    contextWindow: 128000,
    maxTokensDefault: 8192,
    supportsTools: false,
    supportsStreaming: true,
    description: 'Fast responses, large context window',
  },
  'Dispatcher v1.2': {
    name: 'Dispatcher v1.2',
    contextWindow: 128000,
    maxTokensDefault: 8192,
    supportsTools: true,
    supportsStreaming: true,
    description: 'Balanced speed and capability',
  },
  'Dispatcher v2': {
    name: 'Dispatcher v2',
    contextWindow: 200000,
    maxTokensDefault: 8192,
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
