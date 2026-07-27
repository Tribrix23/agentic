import { ToolCall } from './messageTypes';

export class SecurityInterceptor {
  private static READ_ONLY_TOOLS = new Set([
    'read_file', 'view_file', 'list_dir', 'listDirectory', 'readFile', 'grepSearch', 'grep_search', 'findByName', 'search_web', 'read_url'
  ]);

  /**
   * Evaluates a tool call to determine if it requires explicit user approval
   * before execution can proceed.
   */
  static requiresApproval(toolCall: ToolCall): boolean {
    const dangerousTools = ['deleteFile', 'renameFile', 'runCommand', 'editFile', 'writeFile'];
    return dangerousTools.includes(toolCall.name);
  }
}
