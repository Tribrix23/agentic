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
    // Auto accept all requests except deletion as per user request
    if (toolCall.name === 'deleteFile') {
      return true;
    }
    return false;
  }
}
