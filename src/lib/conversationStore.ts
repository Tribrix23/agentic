// ============================================================================
// Conversation Store — Persistence manager for agentic conversations
// ============================================================================

import {
  AgenticMessage,
  ConversationMeta,
  getConversationStats,
  ChatMessage,
  chatMessageToAgenticMessage,
} from './messageTypes';

const CONVERSATIONS_KEY = 'quantix_conversations';
const MESSAGES_KEY_PREFIX = 'quantix_messages_';

// ── Conversation List ──────────────────────────────────────────────────────

/** Get all conversation metadata */
export function getConversations(): ConversationMeta[] {
  try {
    const raw = localStorage.getItem(CONVERSATIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Get conversations for a specific project */
export function getProjectConversations(projectId: string): ConversationMeta[] {
  return getConversations().filter((c) => c.projectId === projectId);
}

/** Save the conversation list */
function saveConversationList(conversations: ConversationMeta[]): void {
  try {
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
  } catch (e) {
    console.warn('[ConversationStore] Failed to save conversation list:', e);
  }
}

/** Create or update conversation metadata */
export function upsertConversationMeta(
  id: string,
  updates: Partial<ConversationMeta>
): ConversationMeta {
  const conversations = getConversations();
  const existingIndex = conversations.findIndex((c) => c.id === id);

  if (existingIndex >= 0) {
    conversations[existingIndex] = { ...conversations[existingIndex], ...updates, updatedAt: Date.now() };
    saveConversationList(conversations);
    return conversations[existingIndex];
  }

  const newMeta: ConversationMeta = {
    id,
    title: updates.title || 'New Conversation',
    projectId: updates.projectId || '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messageCount: updates.messageCount || 0,
    totalTokensUsed: updates.totalTokensUsed || 0,
    toolCallsCount: updates.toolCallsCount || 0,
    filesChanged: updates.filesChanged || [],
    ...updates,
  };

  conversations.unshift(newMeta);
  saveConversationList(conversations);
  return newMeta;
}

// ── Message Storage ────────────────────────────────────────────────────────

function getMessagesKey(conversationId: string): string {
  return `${MESSAGES_KEY_PREFIX}${conversationId}`;
}

/** Load messages for a conversation, with legacy format migration */
export function loadMessages(conversationId: string): AgenticMessage[] {
  try {
    const raw = localStorage.getItem(getMessagesKey(conversationId));
    if (!raw) return [];

    const parsed = JSON.parse(raw);

    // Check if this is legacy ChatMessage[] format (no 'id' field on first message)
    if (Array.isArray(parsed) && parsed.length > 0 && !parsed[0].id) {
      // Migrate from ChatMessage[] to AgenticMessage[]
      const migrated = (parsed as ChatMessage[]).map((msg, i) =>
        chatMessageToAgenticMessage(msg, i)
      );
      // Save migrated format
      saveMessages(conversationId, migrated);
      return migrated;
    }

    return parsed as AgenticMessage[];
  } catch (e) {
    console.warn('[ConversationStore] Failed to load messages:', e);
    return [];
  }
}

/** Save messages for a conversation and update metadata */
export function saveMessages(
  conversationId: string,
  messages: AgenticMessage[]
): void {
  try {
    localStorage.setItem(getMessagesKey(conversationId), JSON.stringify(messages));

    // Update conversation metadata with stats
    const stats = getConversationStats(messages);
    upsertConversationMeta(conversationId, {
      messageCount: messages.length,
      totalTokensUsed: stats.totalTokens,
      toolCallsCount: stats.toolCalls,
      filesChanged: stats.filesChanged,
    });
  } catch (e) {
    console.warn('[ConversationStore] Failed to save messages:', e);
  }
}

/** Append a single message to a conversation */
export function appendMessage(
  conversationId: string,
  message: AgenticMessage
): AgenticMessage[] {
  const messages = loadMessages(conversationId);
  messages.push(message);
  saveMessages(conversationId, messages);
  return messages;
}

/** Update a specific message by ID */
export function updateMessage(
  conversationId: string,
  messageId: string,
  updates: Partial<AgenticMessage>
): AgenticMessage[] {
  const messages = loadMessages(conversationId);
  const index = messages.findIndex((m) => m.id === messageId);
  if (index >= 0) {
    messages[index] = { ...messages[index], ...updates };
    saveMessages(conversationId, messages);
  }
  return messages;
}

// ── Conversation Management ────────────────────────────────────────────────

/** Delete a conversation and its messages */
export function deleteConversation(conversationId: string): void {
  try {
    localStorage.removeItem(getMessagesKey(conversationId));
    const conversations = getConversations().filter((c) => c.id !== conversationId);
    saveConversationList(conversations);
  } catch (e) {
    console.warn('[ConversationStore] Failed to delete conversation:', e);
  }
}

/** Delete all conversations for a project */
export function deleteProjectConversations(projectId: string): void {
  const conversations = getConversations();
  const toDelete = conversations.filter((c) => c.projectId === projectId);
  for (const conv of toDelete) {
    localStorage.removeItem(getMessagesKey(conv.id));
  }
  saveConversationList(conversations.filter((c) => c.projectId !== projectId));
}

// ── Export ──────────────────────────────────────────────────────────────────

/** Export a conversation to JSON */
export function exportConversationJSON(conversationId: string): string {
  const meta = getConversations().find((c) => c.id === conversationId);
  const messages = loadMessages(conversationId);
  return JSON.stringify({ meta, messages }, null, 2);
}

/** Export a conversation to Markdown */
export function exportConversationMarkdown(conversationId: string): string {
  const meta = getConversations().find((c) => c.id === conversationId);
  const messages = loadMessages(conversationId);

  const lines: string[] = [];
  lines.push(`# ${meta?.title || 'Conversation'}`);
  lines.push(`> Exported on ${new Date().toLocaleString()}`);
  lines.push('');

  for (const msg of messages) {
    const time = new Date(msg.timestamp).toLocaleTimeString();
    const roleLabel = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);

    lines.push(`## ${roleLabel} (${time})`);
    lines.push('');

    if (msg.content) {
      lines.push(msg.content);
      lines.push('');
    }

    if (msg.toolCalls && msg.toolCalls.length > 0) {
      for (const tc of msg.toolCalls) {
        lines.push(`### 🔧 Tool: ${tc.name} [${tc.status}]`);
        lines.push('```json');
        lines.push(JSON.stringify(tc.arguments, null, 2));
        lines.push('```');
        if (tc.result) {
          lines.push(`**Result** (${tc.result.success ? '✅' : '❌'}):`);
          lines.push('```');
          lines.push(tc.result.output.slice(0, 2000));
          lines.push('```');
        }
        lines.push('');
      }
    }

    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}
