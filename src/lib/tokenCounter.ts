// ============================================================================
// Token Counter — Approximate tokenization for context window management
// ============================================================================

/**
 * Approximate token count using character-ratio heuristic.
 * For English text and code, ~4 characters ≈ 1 token (cl100k_base).
 * This is intentionally conservative (slightly over-counts) to prevent overflow.
 */
const CHARS_PER_TOKEN = 3.5;

/** Estimate token count for a string */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Estimate token count for a message array */
export function estimateMessagesTokens(
  messages: Array<{ role: string; content: string; name?: string }>
): number {
  let total = 0;
  for (const msg of messages) {
    // Each message has ~4 tokens of overhead (role, content markers, etc.)
    total += 4;
    total += estimateTokens(msg.content);
    if (msg.name) total += estimateTokens(msg.name);
  }
  // Every reply is primed with <|start|>assistant<|message|> (~3 tokens)
  total += 3;
  return total;
}

/** Estimate token count for tool definitions (JSON schema overhead) */
export function estimateToolsTokens(
  tools: Array<{ name: string; description: string; parameters: any }>
): number {
  let total = 0;
  for (const tool of tools) {
    // Each tool definition adds roughly its JSON representation in tokens
    const json = JSON.stringify(tool);
    total += estimateTokens(json);
    // Plus ~10 tokens of schema overhead per tool
    total += 10;
  }
  return total;
}

/** Token budget breakdown for context window planning */
export interface TokenBudget {
  total: number;
  systemPrompt: number;
  tools: number;
  projectContext: number;
  conversationHistory: number;
  responseReserved: number;
  available: number;
  utilizationPercent: number;
}

/** Calculate token budget allocation */
export function calculateTokenBudget(params: {
  contextWindowSize: number;
  maxTokens: number;
  systemPromptTokens: number;
  toolsTokens: number;
  projectContextTokens: number;
  historyTokens: number;
}): TokenBudget {
  const {
    contextWindowSize,
    maxTokens,
    systemPromptTokens,
    toolsTokens,
    projectContextTokens,
    historyTokens,
  } = params;

  const responseReserved = maxTokens;
  const used = systemPromptTokens + toolsTokens + projectContextTokens + historyTokens;
  const available = Math.max(0, contextWindowSize - responseReserved - used);
  const utilizationPercent = Math.min(100, ((used + responseReserved) / contextWindowSize) * 100);

  return {
    total: contextWindowSize,
    systemPrompt: systemPromptTokens,
    tools: toolsTokens,
    projectContext: projectContextTokens,
    conversationHistory: historyTokens,
    responseReserved,
    available,
    utilizationPercent,
  };
}

/**
 * Trim messages to fit within a token budget.
 * Removes the oldest messages (after any system messages) first.
 * Always preserves the system message(s) and the most recent user message.
 */
export function fitMessagesToTokenBudget(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number
): Array<{ role: string; content: string }> {
  if (estimateMessagesTokens(messages) <= maxTokens) {
    return messages;
  }

  // Separate system messages (always kept) from conversation messages
  const systemMsgs = messages.filter((m) => m.role === 'system');
  const convMsgs = messages.filter((m) => m.role !== 'system');

  const systemTokens = estimateMessagesTokens(systemMsgs);
  const budgetForConv = maxTokens - systemTokens;

  if (budgetForConv <= 0) {
    // Even system messages exceed budget — truncate system prompt
    return [{ role: 'system', content: systemMsgs.map((m) => m.content).join('\n').slice(0, maxTokens * 3) }];
  }

  // Keep messages from the end (most recent), trimming from the start
  const keptMsgs: Array<{ role: string; content: string }> = [];
  let usedTokens = 0;

  for (let i = convMsgs.length - 1; i >= 0; i--) {
    const msgTokens = estimateTokens(convMsgs[i].content) + 4;
    if (usedTokens + msgTokens > budgetForConv) {
      break;
    }
    usedTokens += msgTokens;
    keptMsgs.unshift(convMsgs[i]);
  }

  return [...systemMsgs, ...keptMsgs];
}

/**
 * Truncate a string to approximately the given number of tokens.
 * Appends a truncation notice.
 */
export function truncateToTokens(text: string, maxTokens: number): string {
  const maxChars = Math.floor(maxTokens * CHARS_PER_TOKEN);
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '\n\n[... truncated, showing first ~' + maxTokens + ' tokens]';
}

/** Format a token count for display (e.g., "2,847") */
export function formatTokenCount(count: number): string {
  return count.toLocaleString('en-US');
}

/** Format a token budget as a percentage string (e.g., "69.5%") */
export function formatUtilization(percent: number): string {
  return percent.toFixed(1) + '%';
}
