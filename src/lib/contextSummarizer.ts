// ============================================================================
// Context Summarizer — Auto-summarizes old conversation history to save tokens
// ============================================================================

import { AIConfig } from './aiConfig';
import { AgenticMessage, ChatMessage, createSystemMessage } from './messageTypes';
import { estimateMessagesTokens, estimateTokens } from './tokenCounter';

const SUMMARY_PROMPT = `Summarize the following conversation history concisely. Include:
- Key decisions made
- Code changes discussed or implemented
- Files mentioned or modified
- Any unresolved issues or pending tasks
- Important context that would be needed to continue the conversation

Be concise but preserve critical technical details. Format as a bullet list.`;

/**
 * Check if conversation history needs summarization.
 * Returns true if the history exceeds the available token budget.
 */
export function needsSummarization(
  messages: AgenticMessage[],
  maxHistoryTokens: number
): boolean {
  const chatMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }));
  return estimateMessagesTokens(chatMessages) > maxHistoryTokens;
}

/**
 * Split messages into those to summarize and those to keep.
 * Keeps the most recent `keepRecentTurns` user+assistant pairs intact.
 */
export function splitForSummarization(
  messages: AgenticMessage[],
  keepRecentTurns: number = 6
): { toSummarize: AgenticMessage[]; toKeep: AgenticMessage[] } {
  // Separate system messages
  const systemMsgs = messages.filter((m) => m.role === 'system');
  const convMsgs = messages.filter((m) => m.role !== 'system');

  if (convMsgs.length <= keepRecentTurns * 2) {
    // Not enough messages to warrant summarization
    return { toSummarize: [], toKeep: messages };
  }

  // Count backwards to find the split point (keep last N turns)
  let turnsFound = 0;
  let splitIndex = convMsgs.length;

  for (let i = convMsgs.length - 1; i >= 0; i--) {
    if (convMsgs[i].role === 'user') {
      turnsFound++;
      if (turnsFound >= keepRecentTurns) {
        splitIndex = i;
        break;
      }
    }
  }

  const toSummarize = convMsgs.slice(0, splitIndex);
  const toKeep = [...systemMsgs, ...convMsgs.slice(splitIndex)];

  return { toSummarize, toKeep };
}

/**
 * Build the summary prompt from messages to summarize.
 * This prompt will be sent to the LLM to generate a summary.
 */
export function buildSummaryRequest(
  messagesToSummarize: AgenticMessage[]
): ChatMessage[] {
  const historyText = messagesToSummarize
    .map((m) => {
      let text = `[${m.role.toUpperCase()}]: ${m.content}`;
      if (m.toolCalls && m.toolCalls.length > 0) {
        const toolDescs = m.toolCalls
          .map(
            (tc) =>
              `  [Tool: ${tc.name}] Args: ${JSON.stringify(tc.arguments).slice(0, 100)} → ${tc.result?.success ? 'Success' : 'Error'}`
          )
          .join('\n');
        text += '\n' + toolDescs;
      }
      return text;
    })
    .join('\n\n');

  return [
    { role: 'system' as const, content: SUMMARY_PROMPT },
    { role: 'user' as const, content: historyText },
  ];
}

/**
 * Create a system message containing the conversation summary.
 * This replaces the summarized messages in the conversation.
 */
export function createSummaryMessage(summaryText: string): AgenticMessage {
  return createSystemMessage(
    `<conversation_summary>\nThe following is a summary of the earlier conversation:\n\n${summaryText}\n</conversation_summary>`
  );
}

/**
 * Apply summarization to a message array.
 * Replaces old messages with a summary message + recent messages.
 */
export function applySummarization(
  allMessages: AgenticMessage[],
  summaryText: string,
  keepRecentTurns: number = 6
): AgenticMessage[] {
  const { toKeep } = splitForSummarization(allMessages, keepRecentTurns);
  const summaryMsg = createSummaryMessage(summaryText);

  // Insert summary after system messages but before conversation
  const systemMsgs = toKeep.filter((m) => m.role === 'system');
  const convMsgs = toKeep.filter((m) => m.role !== 'system');

  return [...systemMsgs, summaryMsg, ...convMsgs];
}

/**
 * Estimate how many tokens would be saved by summarizing.
 */
export function estimateSavings(
  messages: AgenticMessage[],
  keepRecentTurns: number = 6
): { currentTokens: number; estimatedAfter: number; saved: number } {
  const currentTokens = estimateMessagesTokens(
    messages.map((m) => ({ role: m.role, content: m.content }))
  );

  const { toSummarize, toKeep } = splitForSummarization(messages, keepRecentTurns);

  // Estimate summary will be ~200 tokens
  const summaryEstimate = 200;
  const keptTokens = estimateMessagesTokens(
    toKeep.map((m) => ({ role: m.role, content: m.content }))
  );
  const estimatedAfter = keptTokens + summaryEstimate;

  return {
    currentTokens,
    estimatedAfter,
    saved: Math.max(0, currentTokens - estimatedAfter),
  };
}
