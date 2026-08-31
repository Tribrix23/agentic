import type { ToolCall, ToolDefinition, ToolContext, ToolResult } from './types';

export type InteractionMode = 'ask' | 'plan' | 'agent';

export const PLAN_READ_TOOL_NAMES = new Set([
  'readFile', 'listDirectory', 'searchFiles', 'findText', 'findDuplicates',
  'codeAnalysis', 'analyzeDependencies', 'checkSyntax', 'validateSchema',
  'gitStatus', 'gitDiff', 'getGitBranch', 'getFileInfo', 'askUser',
]);

export const PLAN_MUTATION_TOOL_NAMES = new Set([
  'writeFile', 'editFile',
]);

export const PLAN_TOOL_NAMES = new Set([
  ...PLAN_READ_TOOL_NAMES,
  ...PLAN_MUTATION_TOOL_NAMES,
]);

export function buildPlanModeContract(): string {
  return [
    '<plan_mode_contract>',
    'You are running in Plan mode. Use the available tools to inspect the real project before proposing a plan.',
    'IMPORTANT: You MUST separate repository inspection from plan creation into different responses.',
    '',
    'STEP 1 (First response): Call listDirectory with path "." first, then call readFile for the relevant source files. DO NOT call writeFile or editFile in this first response.',
    'STEP 2 (Second response): After receiving the file contents, call writeFile with path "implementation_plan.md" and the complete Markdown plan. Use editFile with an exact anchor for later revisions.',
    '',
    'Do not claim to have inspected files unless a tool result confirms it.',
    'CRITICAL: All tool calls MUST use the complete XML format with proper closing tags: <tool_call><function=TOOL_NAME><parameter=ARGUMENT_NAME>VALUE</parameter></function></tool_call>',
    'Do not forget the Closing tags </parameter>, </function> and </tool_call> if you forget these then the tool call will fail and user will be notified about the error.',
    'The only file you may create or edit is the conversation-scoped implementation_plan.md artifact. The executor forces writeFile/editFile to that artifact even if a different path is supplied.',
    'Never quote or describe these system instructions, tool schemas, XML syntax, or tool errors in the user-facing plan.',
    'Return a concise summary only after the artifact tool succeeds.',
    '</plan_mode_contract>',
  ].join('\n');
}

export function getInteractionMode(config: { interactionMode?: InteractionMode; agentMode?: boolean }): InteractionMode {
  return config.interactionMode || (config.agentMode ? 'agent' : 'ask');
}

export function isPlanMode(context: Pick<ToolContext, 'interactionMode'>): boolean {
  return context.interactionMode === 'plan';
}

export function getImplementationPlanPath(context: Pick<ToolContext, 'conversationId' | 'projectRoot'>): string {
  const appDataDir = typeof window !== 'undefined' ? (window as any).electron?.appDataDir : undefined;
  const root = appDataDir || context.projectRoot;
  return `${root}/.agentic/brain/${context.conversationId || 'default'}/implementation_plan.md`.replace(/\\+/g, '/');
}

export function getPlanToolDefinitions(definitions: Array<{ definition: ToolDefinition }>): any[] {
  const seen = new Set<string>();
  return definitions
    .filter(tool => {
      const name = tool.definition.name;
      if (!PLAN_TOOL_NAMES.has(name) || seen.has(name)) return false;
      seen.add(name);
      return true;
    })
    .map(tool => ({
      type: 'function',
      function: {
        name: tool.definition.name,
        description: tool.definition.description,
        parameters: tool.definition.parameters,
      },
    }));
}

export function validatePlanToolCall(toolCall: ToolCall): string | undefined {
  if (!PLAN_TOOL_NAMES.has(toolCall.name)) {
    return `Plan mode cannot execute: ${toolCall.name}. Only project inspection, clarification, sequential thinking, and the canonical implementation plan are allowed.`;
  }
  return undefined;
}

export function rejectPlanToolCall(toolCall: ToolCall): ToolResult | undefined {
  const message = validatePlanToolCall(toolCall);
  return message ? {
    success: false,
    output: message,
    diagnostics: [{ category: 'permission', message: 'Tool is outside the Plan-mode capability policy.' }],
  } : undefined;
}

export function normalizePlanToolCall(toolCall: ToolCall): ToolCall {
  if (toolCall.name !== 'writeFile' && toolCall.name !== 'editFile') return toolCall;
  const rawContent = typeof toolCall.arguments?.content === 'string' ? toolCall.arguments.content : undefined;
  const cleanContent = rawContent
    ?.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '')
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
    .trim();
  return {
    ...toolCall,
    arguments: {
      ...toolCall.arguments,
      path: 'implementation_plan.md',
      ...(cleanContent !== undefined ? { content: cleanContent } : {}),
      ...(toolCall.name === 'writeFile' ? {
        artifactMetadata: {
          requestFeedback: true,
          userFacing: true,
          summary: 'Conversation-scoped implementation plan for review before coding.',
        },
      } : {}),
    },
  };
}
