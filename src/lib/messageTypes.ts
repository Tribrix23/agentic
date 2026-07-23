// ============================================================================
// Message Types — Extended message model for agentic conversations
// ============================================================================

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
  type: 'file_change' | 'file_create' | 'file_delete' | 'terminal_output' | 'diff';
  path?: string;
  content?: string;
  diff?: string;
  language?: string;
}

/** Result of a tool execution */
export interface ToolResult {
  success: boolean;
  output: string;
  data?: any;
  artifacts?: Artifact[];
  truncated?: boolean;
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

  // ── Tool message extensions ──
  toolCallId?: string;
  toolName?: string;

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

export function agenticMessageToChatMessage(msg: AgenticMessage): ChatMessage {
  const chatMsg: ChatMessage = {
    role: msg.role,
    content: msg.content || '',
  };

  if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
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
  return {
    id: generateId(),
    role: 'tool',
    content: result.output,
    timestamp: Date.now(),
    toolCallId,
    toolName,
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
