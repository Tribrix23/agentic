// ============================================================================
// Message Types — Extended message model for agentic conversations
// ============================================================================

import { escapeXmlText } from './agent/xmlCodec';

/** File attachment on a user message */
export interface FileAttachment {
  name: string;
  path: string;
  content?: string;
  language?: string;
  sizeBytes?: number;
}

/** Artifact produced by a tool call (file change, diff, terminal output) */
export interface Artifact {
  type: 'file_change' | 'file_create' | 'file_delete' | 'terminal_output' | 'diff' | 'artifact_created';
  path?: string;
  content?: string;
  diff?: string;
  original?: string;   // original file content before edit, used for undo
  language?: string;
  metadata?: any;
  added?: number;      // lines added in file change
  removed?: number;    // lines removed in file change
}

/** Result of a tool execution */
export interface ToolResult {
  success: boolean;
  output: string;
  data?: any;
  artifacts?: Artifact[];
  attachments?: FileAttachment[];
  truncated?: boolean;
  summary?: string;
  diagnostics?: Array<{ category: string; message: string; details?: unknown }>;
  artifactRef?: { id: string; mediaType: string; byteLength: number; createdAt: number; label?: string };
  truncation?: { truncated: boolean; originalBytes: number; includedBytes: number; continuation?: string };
}

/** A single tool invocation within an assistant message */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
  status: 'pending' | 'approved' | 'rejected' | 'running' | 'completed' | 'error';
  result?: ToolResult;
  timestamp: number;
  durationMs?: number;
  agentKind?: 'main' | 'subagent';
  agentRole?: string;
}

/** The full agentic message model — extends the simple ChatMessage */
export interface AgenticMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;

  // ── User message extensions ──
  attachments?: FileAttachment[];
  mentionedFiles?: string[];

  // ── Assistant message extensions ──
  toolCalls?: ToolCall[];
  thinkingContent?: string;
  isStreaming?: boolean;
  agentIteration?: number;
  isHidden?: boolean;
  name?: string;  // Agent name (e.g., 'Subagent-1', 'Cascade')

  // ── Tool message extensions ──
  toolCallId?: string;
  toolName?: string;
  wasConsumed?: boolean; // Token optimization: mark tool results as consumed after LLM processes them

  // ── Metadata ──
  model?: string;
  tokensUsed?: number;
  durationMs?: number;
}

// ── Backward compatibility with existing ChatMessage ──────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: {
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }[];
  attachments?: Array<{ content: string }>;
}

/** Convert a ChatMessage to an AgenticMessage */
export function chatMessageToAgenticMessage(msg: ChatMessage, index: number): AgenticMessage {
  return {
    id: `legacy_${index}_${Date.now()}`,
    role: msg.role,
    content: msg.content,
    timestamp: Date.now(),
  };
}

export function agenticMessageToChatMessage(msg: AgenticMessage, toolProtocol: 'native' | 'xml' = 'native'): ChatMessage {
  const chatMsg: ChatMessage = {
    role: msg.role,
    content: msg.content || '',
  };

  if (toolProtocol !== 'xml' && msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
    chatMsg.tool_calls = msg.toolCalls.map(tc => ({
      id: tc.id,
      type: 'function',
      function: {
        name: tc.name,
        arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments),
      }
    }));
  }

  if (msg.role === 'tool') {
    chatMsg.tool_call_id = msg.toolCallId;
    chatMsg.name = msg.toolName;
  }

  if (msg.attachments && msg.attachments.length > 0) {
    chatMsg.attachments = msg.attachments
      .filter(att => att.content && att.content.startsWith('data:'))
      .map(att => ({ content: att.content! }));
  }

  return chatMsg;
}

/** Create a new user message */
export function createUserMessage(
  content: string,
  options?: {
    attachments?: FileAttachment[];
    mentionedFiles?: string[];
  }
): AgenticMessage {
  return {
    id: generateId(),
    role: 'user',
    content,
    timestamp: Date.now(),
    attachments: options?.attachments,
    mentionedFiles: options?.mentionedFiles,
  };
}

/** Create a new assistant message (initially empty, filled by streaming) */
export function createAssistantMessage(model?: string): AgenticMessage {
  return {
    id: generateId(),
    role: 'assistant',
    content: '',
    timestamp: Date.now(),
    isStreaming: true,
    toolCalls: [],
    model,
  };
}

/** Create a new system message */
export function createSystemMessage(content: string): AgenticMessage {
  return {
    id: generateId(),
    role: 'system',
    content,
    timestamp: Date.now(),
  };
}

/** Create a tool result message */
export function createToolMessage(
  toolCallId: string,
  toolName: string,
  result: ToolResult
): AgenticMessage {
  // Sanitize specific known patterns that trip Zhipu GLM's aggressive language/content filters
  let safeOutput = result.output;
  if (typeof safeOutput === 'string') {
    // 0. Remove all non-ASCII characters to comply with language filter (only CN/EN/FR/DE/RU allowed)
    safeOutput = safeOutput.replace(/[^\x00-\x7F]/g, '');
    // 1. Strip raw unix permissions from `ls -l` (e.g. "-rw-rw-r--", "drwxrwxr-x")
    safeOutput = safeOutput.replace(/^[d\-l][rwx\-]{9,10}\+?\s+/gm, (match) => {
      if (match.startsWith('d')) return '[DIR]  ';
      if (match.startsWith('l')) return '[LINK] ';
      return '[FILE] ';
    });
    // 2. Strip the "total" summary line from ls output
    safeOutput = safeOutput.replace(/^total\s+\d+\s*$/gm, '');
    // 3. Strip usernames, groups, file sizes, and dates from ls -l output in one pass
    // Pattern: [DIR/FILE] followed by number, username, group, size, date/time - strip all but type and filename
    safeOutput = safeOutput.replace(/^(\[DIR\]  |\[FILE\] |\[LINK] )\s*\d+\s+[A-Za-z0-9_\-]+\s+[A-Za-z0-9_\-]+\s+\d+\s+[A-Za-z]{3}\s+\d+\s+[\d:]+\s+/gm, '$1');
    // 4. Strip long numeric sequences from filenames (e.g., screenshot_1788729987988.png -> screenshot_[NUM].png)
    safeOutput = safeOutput.replace(/_\d{8,}/g, '_[NUM]');
    // 5. Strip large contiguous hex/base64 strings if they are ridiculously long to prevent similar filter issues
    safeOutput = safeOutput.replace(/[A-Za-z0-9+/=]{1000,}/g, '[BASE64_DATA_REMOVED]');
    // 6. Playwright DOM snapshots generate huge amounts of YAML structural noise that triggers language filters
    if (toolName && toolName.includes('snapshot')) {
      safeOutput = safeOutput
        .replace(/\s*\[cursor=pointer\]/g, '') // Remove cursor pointers
        .replace(/- generic /g, '- ')          // Remove generic tags
        .replace(/^\s*- generic:\s*\n/gm, '')  // Remove empty generic parents
        .replace(/\[ref=([^\]]+)\]/g, '($1)')  // Convert [ref=x] to (x) for smoother prose parsing
        .replace(/\/url: https:\/\/www\.google\.com\/url\?q=([^&\s]+)[^\n]*/g, '/url: $1') // Clean google redirect URLs
        .replace(/\/url: \/goto\?url=([^&\s]+)[^\n]*/g, '/url: [REDIRECT]') // Clean google redirect URLs
        .replace(/(https?:\/\/[^\s]{60})[^\s]+/g, '$1...'); // Truncate very long URLs to 60 chars

      // Hard limit snapshot size to prevent Zhipu length/density blocks
      if (safeOutput.length > 8000) {
        safeOutput = safeOutput.substring(0, 8000) + '\n... [SNAPSHOT TRUNCATED DUE TO SIZE]';
      }
    }
  }

  return {
    id: generateId(),
    role: 'tool',
    content: safeOutput,
    timestamp: Date.now(),
    toolCallId,
    toolName,
    attachments: result.attachments,
  };
}

/** Create a pending tool call */
export function createToolCall(
  name: string,
  args: Record<string, any>,
  id?: string
): ToolCall {
  return {
    id: id || generateId(),
    name,
    arguments: args,
    status: 'running',
    timestamp: Date.now(),
  };
}

// ── Conversation metadata ──────────────────────────────────────────────────

export interface ConversationMeta {
  id: string;
  title: string;
  projectId: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  totalTokensUsed: number;
  toolCallsCount: number;
  filesChanged: string[];
}

/** Get conversation statistics from a message array */
export function getConversationStats(messages: AgenticMessage[]): {
  totalTokens: number;
  toolCalls: number;
  filesChanged: string[];
} {
  let totalTokens = 0;
  let toolCalls = 0;
  const filesChanged = new Set<string>();

  for (const msg of messages) {
    if (msg.tokensUsed) totalTokens += msg.tokensUsed;
    if (msg.toolCalls) {
      toolCalls += msg.toolCalls.length;
      for (const tc of msg.toolCalls) {
        if (tc.result?.artifacts) {
          for (const a of tc.result.artifacts) {
            if (a.path) filesChanged.add(a.path);
          }
        }
      }
    }
  }

  return {
    totalTokens,
    toolCalls,
    filesChanged: Array.from(filesChanged),
  };
}

// ── Utilities ──────────────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}
