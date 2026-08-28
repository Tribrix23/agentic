import { ToolCall } from './messageTypes';

export class SecurityInterceptor {
  private static READ_ONLY_TOOLS = new Set([
    'read_file', 'view_file', 'list_dir', 'listDirectory', 'readFile', 'grepSearch', 'grep_search', 'findByName'
  ]);

  /**
   * Evaluates a tool call to determine if it requires explicit user approval
   * before execution can proceed.
   */
  static requiresApproval(toolCall: ToolCall, toolDefinitions: any[] = []): boolean {
    const definition = toolDefinitions.find(item => (item?.function?.name ?? item?.name) === toolCall.name);
    if (definition?.requiresApproval === true || definition?.function?.requiresApproval === true) return true;
    // Only block truly dangerous operations that should always require approval
    // writeFile and editFile are handled by the permissions system and tool definitions
    const dangerousTools = ['renameFile', 'runCommand'];
    if (dangerousTools.includes(toolCall.name)) return true;
    
    // Also block MCP-based terminal/shell commands which might have a prefix
    if (toolCall.name.includes('runCommand') || toolCall.name.includes('execute_command')) {
      return true;
    }
    
    // Block literal commands explicitly
    if (toolCall.arguments && (toolCall.arguments.literal === true || toolCall.arguments.literal === 'true')) {
      return true;
    }

    return false;
  }
}
